import {
  capabilitySummary,
  deriveGithubUrl,
  packageStatus,
  sourceTrust,
} from "./core.js";

const INSTALLED_QUERY = `
  query EnhancedPluginManagerInstalled($checkUpdates: Boolean!) {
    installedPackages(type: Plugin) {
      package_id name version date sourceURL metadata
      source_package @include(if: $checkUpdates) {
        package_id name version date sourceURL metadata
      }
    }
    plugins {
      id name description url version enabled
      hooks { name description hooks }
      tasks { name description }
      settings { name display_name description type }
      paths { javascript css }
    }
    configuration {
      general { pluginPackageSources { name url local_path } }
      plugins
    }
  }
`;

const AVAILABLE_QUERY = `
  query EnhancedPluginManagerAvailable($source: String!) {
    availablePackages(type: Plugin, source: $source) {
      package_id name version date sourceURL metadata
      requires { package_id name version }
    }
  }
`;

const PACKAGE_MUTATIONS = {
  install: `mutation EnhancedInstall($packages: [PackageSpecInput!]!) {
    installPackages(type: Plugin, packages: $packages)
  }`,
  update: `mutation EnhancedUpdate($packages: [PackageSpecInput!]) {
    updatePackages(type: Plugin, packages: $packages)
  }`,
  uninstall: `mutation EnhancedUninstall($packages: [PackageSpecInput!]!) {
    uninstallPackages(type: Plugin, packages: $packages)
  }`,
};

const ENABLE_MUTATION = `mutation EnhancedEnable($enabledMap: BoolMap!) {
  setPluginsEnabled(enabledMap: $enabledMap)
}`;

const SOURCES_MUTATION = `mutation EnhancedSources($sources: [PackageSourceInput!]) {
  configureGeneral(input: { pluginPackageSources: $sources }) {
    pluginPackageSources { name url local_path }
  }
}`;

const CONFIGURE_PLUGIN_MUTATION = `mutation EnhancedConfigurePlugin($pluginID: ID!, $input: Map!) {
  configurePlugin(plugin_id: $pluginID, input: $input)
}`;

const RELOAD_MUTATION = `mutation EnhancedReload { reloadPlugins }`;

const JOB_QUERY = `query EnhancedJob($id: ID!) {
  findJob(input: { id: $id }) { id status progress error }
}`;

function sourceNameFor(sourceURL, sources) {
  return sources.find((source) => source.url === sourceURL)?.name ?? sourceURL;
}

function mergeInstalled(pkg, runtime, sources) {
  const plugin = runtime.get(pkg.package_id);
  return {
    ...pkg,
    plugin,
    enabled: plugin?.enabled ?? false,
    installed: true,
    status: packageStatus(pkg),
    sourceName: sourceNameFor(pkg.sourceURL, sources),
    trust: sourceTrust(pkg.sourceURL),
    githubUrl: deriveGithubUrl({
      pluginUrl: plugin?.url,
      metadata: pkg.metadata,
      sourceUrl: pkg.sourceURL,
      packageId: pkg.package_id,
    }),
    capabilities: plugin ? capabilitySummary(plugin) : [],
  };
}

function mergeRuntimeOnly(plugin) {
  return {
    package_id: plugin.id,
    name: plugin.name || plugin.id,
    version: plugin.version,
    metadata: { description: plugin.description },
    plugin,
    enabled: plugin.enabled ?? false,
    installed: true,
    runtimeOnly: true,
    status: "runtime-only",
    sourceName: "Runtime-only",
    trust: sourceTrust(),
    githubUrl: deriveGithubUrl({ pluginUrl: plugin.url }),
    capabilities: capabilitySummary(plugin),
  };
}

export class PluginManagerService {
  constructor(
    client,
    storage = globalThis.localStorage,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {
    this.client = client;
    this.storage = storage;
    this.sleep = sleep;
  }

  async loadInstalled({ checkUpdates = false } = {}) {
    const data = await this.client.request(INSTALLED_QUERY, { checkUpdates });
    const sources = data.configuration.general.pluginPackageSources ?? [];
    const runtime = new Map((data.plugins ?? []).map((plugin) => [plugin.id, plugin]));
    const managedPackages = (data.installedPackages ?? []).map((pkg) =>
      mergeInstalled(pkg, runtime, sources)
    );
    const managedIDs = new Set(managedPackages.map((pkg) => pkg.package_id));
    const runtimeOnlyPackages = (data.plugins ?? [])
      .filter((plugin) => !managedIDs.has(plugin.id))
      .map(mergeRuntimeOnly);
    const packages = [...managedPackages, ...runtimeOnlyPackages];
    return {
      packages,
      plugins: data.plugins ?? [],
      sources,
      pluginConfig: data.configuration.plugins ?? {},
      checkedUpdates: checkUpdates,
    };
  }

  async loadAvailable(sources, installedIDs) {
    const settled = await Promise.all(
      sources.map(async (source) => {
        try {
          const data = await this.client.request(AVAILABLE_QUERY, {
            source: source.url,
          });
          const packages = data.availablePackages ?? [];
          this.storage?.setItem?.(
            `spme-source-check:${source.url}`,
            new Date().toISOString()
          );
          return {
            source,
            ok: true,
            packageCount: packages.length,
            packages,
            checkedAt: this.storage?.getItem?.(`spme-source-check:${source.url}`),
          };
        } catch (error) {
          return {
            source,
            ok: false,
            packageCount: 0,
            packages: [],
            error: error instanceof Error ? error.message : String(error),
            checkedAt: this.storage?.getItem?.(`spme-source-check:${source.url}`),
          };
        }
      })
    );

    const packages = settled.flatMap((entry) =>
      entry.packages
        .filter((pkg) => !installedIDs.has(pkg.package_id))
        .map((pkg) => ({
          ...pkg,
          installed: false,
          enabled: false,
          status: "available",
          sourceName: entry.source.name || entry.source.url,
          trust: sourceTrust(entry.source.url),
          githubUrl: deriveGithubUrl({
            metadata: pkg.metadata,
            sourceUrl: entry.source.url,
            packageId: pkg.package_id,
          }),
        }))
    );

    return {
      packages,
      health: settled.map(({ packages: _packages, ...health }) => health),
    };
  }

  packageSpecs(packages) {
    return packages.map((pkg) => ({ id: pkg.package_id, sourceURL: pkg.sourceURL }));
  }

  async packageOperation(operation, packages) {
    const data = await this.client.request(PACKAGE_MUTATIONS[operation], {
      packages: this.packageSpecs(packages),
    });
    return data[`${operation}Packages`];
  }

  install(packages) {
    return this.packageOperation("install", packages);
  }

  update(packages) {
    return this.packageOperation("update", packages);
  }

  uninstall(packages) {
    return this.packageOperation("uninstall", packages);
  }

  async waitForJob(jobID, { maxAttempts = 120, interval = 500 } = {}) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const data = await this.client.request(JOB_QUERY, { id: jobID });
      const job = data.findJob;
      if (!job || job.status === "FINISHED") {
        return job ?? { id: jobID, status: "FINISHED", progress: 1, error: null };
      }
      if (job.status === "FAILED" || job.status === "CANCELLED") {
        throw new Error(job.error || `Plugin job ${job.status.toLowerCase()}`);
      }
      await this.sleep(interval);
    }
    throw new Error("Plugin operation did not finish before the timeout");
  }

  async setEnabled(pluginID, enabled) {
    const data = await this.client.request(ENABLE_MUTATION, {
      enabledMap: { [pluginID]: enabled },
    });
    return data.setPluginsEnabled;
  }

  async saveSources(sources) {
    const data = await this.client.request(SOURCES_MUTATION, { sources });
    return data.configureGeneral.pluginPackageSources;
  }

  async configurePlugin(pluginID, input) {
    const data = await this.client.request(CONFIGURE_PLUGIN_MUTATION, {
      pluginID,
      input,
    });
    return data.configurePlugin;
  }

  async reloadPlugins() {
    const data = await this.client.request(RELOAD_MUTATION);
    return data.reloadPlugins;
  }
}

export const queries = {
  INSTALLED_QUERY,
  AVAILABLE_QUERY,
  PACKAGE_MUTATIONS,
};
