import { describe, expect, it } from "vitest";
import {
  capabilitySummary,
  configurationAnchorHref,
  configurationAnchorID,
  deriveGithubUrl,
  deriveSourceGithubUrl,
  dependentPlugins,
  filterPackages,
  installedAnchorHref,
  installedAnchorID,
  isPluginsSettingsRoute,
  pluginManagerTabFromURL,
  packageLastCommitDate,
  packageStatus,
  orphanedDependencies,
  relativeTimeAgo,
  requiredPluginIDs,
  safeExternalUrl,
  sourceAnchorHref,
  sourceAnchorID,
  withoutPluginManagerConfigurationAnchor,
  withoutPluginManagerInstalledAnchor,
  withoutPluginManagerSourceAnchor,
  sourceTrust,
  sortPackages,
  withPluginManagerTab,
} from "../src/core.js";

describe("isPluginsSettingsRoute", () => {
  it("matches the core plugins settings route regardless of query order", () => {
    expect(isPluginsSettingsRoute("/settings?tab=plugins")).toBe(true);
    expect(isPluginsSettingsRoute("/settings?foo=1&tab=plugins&bar=2")).toBe(true);
  });

  it("does not match other Stash pages", () => {
    expect(isPluginsSettingsRoute("/settings?tab=tools")).toBe(false);
    expect(isPluginsSettingsRoute("/plugins/example")).toBe(false);
  });
});

describe("plugin manager subtab URLs", () => {
  it("reads a valid subtab and falls back to installed", () => {
    expect(pluginManagerTabFromURL("/settings?tab=plugins&pluginManagerTab=sources")).toBe("sources");
    expect(pluginManagerTabFromURL("/settings?tab=plugins&pluginManagerTab=invalid")).toBe("installed");
  });

  it("adds the subtab while preserving existing query parameters", () => {
    expect(withPluginManagerTab("/settings?foo=1&tab=plugins", "configuration")).toBe(
      "/settings?foo=1&tab=plugins&pluginManagerTab=configuration"
    );
  });
});

describe("source anchors", () => {
  const sourceURL = "https://stashapp.github.io/CommunityScripts/stable/index.yml";

  it("derives stable URL-safe IDs without exposing the source URL", () => {
    const id = sourceAnchorID(sourceURL);
    expect(id).toMatch(/^spme-source-[0-9a-f]{8}$/);
    expect(sourceAnchorID(sourceURL)).toBe(id);
    expect(sourceAnchorID("https://example.test/index.yml")).not.toBe(id);
    expect(id).not.toContain("stashapp");
  });

  it("builds a Sources-subtab URL while preserving other parameters", () => {
    expect(sourceAnchorHref("/settings?foo=1&tab=plugins&pluginManagerTab=browse", sourceURL)).toBe(
      `/settings?foo=1&tab=plugins&pluginManagerTab=sources#${sourceAnchorID(sourceURL)}`
    );
  });

  it("removes only plugin-owned source anchors", () => {
    expect(withoutPluginManagerSourceAnchor(`/settings?tab=plugins&pluginManagerTab=sources#${sourceAnchorID(sourceURL)}`)).toBe(
      "/settings?tab=plugins&pluginManagerTab=sources"
    );
    expect(withoutPluginManagerSourceAnchor("/settings?tab=plugins#other-anchor")).toBe(
      "/settings?tab=plugins#other-anchor"
    );
  });
});

describe("configuration anchors", () => {
  it("derives stable IDs and builds a Configuration-subtab URL", () => {
    expect(configurationAnchorID("alpha")).toMatch(/^spme-config-[0-9a-f]{8}$/);
    expect(configurationAnchorHref("/settings?foo=1&tab=plugins&pluginManagerTab=installed", "alpha")).toBe(
      `/settings?foo=1&tab=plugins&pluginManagerTab=configuration#${configurationAnchorID("alpha")}`
    );
  });

  it("removes only plugin-owned configuration anchors", () => {
    expect(withoutPluginManagerConfigurationAnchor(`/settings?tab=plugins#${configurationAnchorID("alpha")}`)).toBe("/settings?tab=plugins");
    expect(withoutPluginManagerConfigurationAnchor("/settings?tab=plugins#other-anchor")).toBe("/settings?tab=plugins#other-anchor");
  });
});

describe("installed plugin anchors", () => {
  it("derives stable IDs and builds an Installed-subtab URL", () => {
    expect(installedAnchorID("alpha")).toMatch(/^spme-installed-[0-9a-f]{8}$/);
    expect(installedAnchorHref("/settings?foo=1&tab=plugins&pluginManagerTab=configuration", "alpha")).toBe(
      `/settings?foo=1&tab=plugins&pluginManagerTab=installed#${installedAnchorID("alpha")}`
    );
  });

  it("removes only plugin-owned Installed anchors", () => {
    expect(withoutPluginManagerInstalledAnchor(`/settings?tab=plugins#${installedAnchorID("alpha")}`)).toBe("/settings?tab=plugins");
    expect(withoutPluginManagerInstalledAnchor("/settings?tab=plugins#other-anchor")).toBe("/settings?tab=plugins#other-anchor");
  });
});

describe("package commit dates and sorting", () => {
  const packages = [
    { package_id: "zulu", name: "Zulu", date: "2026-01-01T00:00:00Z" },
    { package_id: "alpha", name: "Alpha", date: "2024-01-01T00:00:00Z", source_package: { date: "2025-01-01T00:00:00Z" } },
    { package_id: "unknown", name: "Unknown" },
  ];

  it("uses checked source metadata when it has a newer package commit date", () => {
    expect(packageLastCommitDate(packages[1])).toBe("2025-01-01T00:00:00Z");
  });

  it("sorts by name ascending or last commit descending with unknown dates last", () => {
    expect(sortPackages(packages, "name").map((pkg) => pkg.package_id)).toEqual(["alpha", "unknown", "zulu"]);
    expect(sortPackages(packages, "last-commit").map((pkg) => pkg.package_id)).toEqual(["zulu", "alpha", "unknown"]);
    expect(sortPackages(packages, "last-commit-oldest").map((pkg) => pkg.package_id)).toEqual(["alpha", "zulu", "unknown"]);
  });
});

describe("deriveGithubUrl", () => {
  it("prefers an explicit GitHub repository URL from a loaded plugin", () => {
    expect(
      deriveGithubUrl({
        pluginUrl: "https://github.com/example/plugin",
        metadata: { repository: "https://github.com/wrong/repo" },
      })
    ).toBe("https://github.com/example/plugin");
  });

  it("accepts common GitHub metadata keys for an available package", () => {
    expect(
      deriveGithubUrl({
        metadata: { homepage: "https://github.com/example/plugin#readme" },
      })
    ).toBe("https://github.com/example/plugin");
  });

  it("derives a CommunityScripts package directory from its GitHub Pages index", () => {
    expect(
      deriveGithubUrl({
        packageId: "VideoScrollWheel",
        sourceUrl: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
      })
    ).toBe(
      "https://github.com/stashapp/CommunityScripts/tree/main/plugins/VideoScrollWheel"
    );
  });

  it("derives a third-party package directory from a conventional GitHub Pages index", () => {
    expect(
      deriveGithubUrl({
        packageId: "renamerOnUpdate",
        sourceUrl: "https://f4bio.github.io/stash-plugins/main/index.yml",
      })
    ).toBe(
      "https://github.com/f4bio/stash-plugins/tree/main/plugins/renamerOnUpdate"
    );
  });

  it("returns no misleading link for non-GitHub sources", () => {
    expect(
      deriveGithubUrl({
        packageId: "local-plugin",
        sourceUrl: "http://localhost:9999/local/index.yml",
      })
    ).toBeUndefined();
  });
});

describe("deriveSourceGithubUrl", () => {
  it("derives repository roots from GitHub Pages package indexes", () => {
    expect(deriveSourceGithubUrl("https://stashapp.github.io/CommunityScripts/stable/index.yml")).toBe(
      "https://github.com/stashapp/CommunityScripts"
    );
    expect(deriveSourceGithubUrl("https://f4bio.github.io/stash-plugins/main/index.yml")).toBe(
      "https://github.com/f4bio/stash-plugins"
    );
  });

  it("derives repository roots from raw and direct GitHub URLs", () => {
    expect(deriveSourceGithubUrl("https://raw.githubusercontent.com/example/plugins/refs/heads/main/index.yml")).toBe(
      "https://github.com/example/plugins"
    );
    expect(deriveSourceGithubUrl("https://github.com/example/plugins/raw/main/index.yml")).toBe(
      "https://github.com/example/plugins"
    );
  });

  it("does not invent repositories for local or unrelated sources", () => {
    expect(deriveSourceGithubUrl("file:///C:/plugins/index.yml")).toBeUndefined();
    expect(deriveSourceGithubUrl("https://plugins.example.com/index.yml")).toBeUndefined();
  });
});

describe("plugin dependency graphs", () => {
  const packages = [
    { package_id: "library", name: "Shared Library", enabled: true, requires: [] },
    { package_id: "enabled-consumer", name: "Enabled Consumer", enabled: true, requires: ["library"] },
    { package_id: "disabled-consumer", name: "Disabled Consumer", enabled: false, requires: ["library"] },
    { package_id: "object-requirement", name: "Object Requirement", enabled: true, requires: [{ package_id: "other-library" }] },
    { package_id: "other-library", name: "Other Library", enabled: true, requires: [] },
  ];

  it("normalizes dependency IDs declared by plugin and package records", () => {
    expect(requiredPluginIDs(packages[1])).toEqual(["library"]);
    expect(requiredPluginIDs(packages[3])).toEqual(["other-library"]);
    expect(requiredPluginIDs({ package_id: "consumer", plugin: { requires: ["library", "library", "consumer"] } })).toEqual(["library"]);
  });

  it("finds enabled dependents for disable warnings and all dependents for uninstall warnings", () => {
    expect(dependentPlugins(packages, "library", { enabledOnly: true }).map((pkg) => pkg.package_id)).toEqual(["enabled-consumer"]);
    expect(dependentPlugins(packages, "library").map((pkg) => pkg.package_id)).toEqual(["enabled-consumer", "disabled-consumer"]);
  });

  it("identifies dependencies orphaned among active or installed consumers", () => {
    const afterDisable = packages.map((pkg) => pkg.package_id === "enabled-consumer" ? { ...pkg, enabled: false } : pkg);
    expect(orphanedDependencies(afterDisable, ["library"], { enabledOnly: true }).map((pkg) => pkg.package_id)).toEqual(["library"]);
    expect(orphanedDependencies(afterDisable, ["library"]).map((pkg) => pkg.package_id)).toEqual([]);

    const afterUninstall = afterDisable.filter((pkg) => !["enabled-consumer", "disabled-consumer"].includes(pkg.package_id));
    expect(orphanedDependencies(afterUninstall, ["library"]).map((pkg) => pkg.package_id)).toEqual(["library"]);
  });
});

describe("safeExternalUrl", () => {
  it("allows only HTTP and HTTPS links", () => {
    expect(safeExternalUrl("https://example.test/index.yml")).toBe("https://example.test/index.yml");
    expect(safeExternalUrl("http://localhost:9999/index.yml")).toBe("http://localhost:9999/index.yml");
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("file:///plugins/index.yml")).toBeUndefined();
  });
});

describe("sourceTrust", () => {
  it("marks official Stash sources as official", () => {
    expect(
      sourceTrust("https://stashapp.github.io/CommunityScripts/stable/index.yml")
    ).toEqual({ level: "official", label: "Official Stash source" });
  });

  it("marks other GitHub-hosted sources as community", () => {
    expect(
      sourceTrust("https://f4bio.github.io/stash-plugins/main/index.yml")
    ).toEqual({ level: "community", label: "Community GitHub source" });
  });

  it("marks local and unknown sources as unverified", () => {
    expect(sourceTrust("file:///plugins/index.yml").level).toBe("unverified");
  });
});

describe("packageStatus", () => {
  it("reports an update only when the available package is newer", () => {
    expect(
      packageStatus({
        date: "2025-01-01T00:00:00Z",
        source_package: { date: "2025-02-01T00:00:00Z" },
      })
    ).toBe("update");
    expect(
      packageStatus({
        date: "2025-02-01T00:00:00Z",
        source_package: { date: "2025-01-01T00:00:00Z" },
      })
    ).toBe("current");
  });

  it("reports unchecked when remote status has not been loaded", () => {
    expect(packageStatus({ date: "2025-01-01T00:00:00Z" })).toBe("unchecked");
  });
});

describe("filterPackages", () => {
  const packages = [
    {
      package_id: "alpha",
      name: "Alpha Tool",
      metadata: { description: "Find duplicate media" },
      sourceName: "Community",
      enabled: true,
      status: "current",
    },
    {
      package_id: "beta",
      name: "Beta Helper",
      metadata: { description: "Adds player controls" },
      sourceName: "Local",
      enabled: false,
      status: "update",
    },
  ];

  it("searches names, IDs, descriptions, and source names", () => {
    expect(filterPackages(packages, { query: "duplicate" })).toHaveLength(1);
    expect(filterPackages(packages, { query: "local" })[0].package_id).toBe("beta");
  });

  it("combines enabled and update filters", () => {
    expect(
      filterPackages(packages, { enabled: false, updatesOnly: true })
    ).toEqual([packages[1]]);
  });

  it("filters enabled and disabled consumers by a required dependency", () => {
    const dependencyPackages = [
      { package_id: "library", name: "Shared Library", enabled: true, requires: [] },
      { package_id: "enabled-consumer", name: "Enabled Consumer", enabled: true, requires: ["library"] },
      { package_id: "disabled-consumer", name: "Disabled Consumer", enabled: false, requires: ["library"] },
      { package_id: "other", name: "Other Plugin", enabled: true, requires: [] },
    ];

    expect(filterPackages(dependencyPackages, { dependency: "library" })).toEqual([
      dependencyPackages[1],
      dependencyPackages[2],
    ]);
  });
});

describe("relativeTimeAgo", () => {
  it("describes elapsed update-check time in compact relative words", () => {
    const now = Date.UTC(2026, 6, 30, 20, 0, 0);
    expect(relativeTimeAgo(now - 30_000, now)).toBe("just now");
    expect(relativeTimeAgo(now - 60_000, now)).toBe("1 minute ago");
    expect(relativeTimeAgo(now - 2 * 60 * 60_000, now)).toBe("2 hours ago");
    expect(relativeTimeAgo(now - 3 * 24 * 60 * 60_000, now)).toBe("3 days ago");
    expect(relativeTimeAgo(now - 14 * 24 * 60 * 60_000, now)).toBe("2 weeks ago");
    expect(relativeTimeAgo(now - 90 * 24 * 60 * 60_000, now)).toBe("3 months ago");
    expect(relativeTimeAgo(now - 730 * 24 * 60 * 60_000, now)).toBe("2 years ago");
  });
});

describe("capabilitySummary", () => {
  it("reports declared hooks, tasks, UI assets, and settings without claiming undeclared permissions", () => {
    expect(
      capabilitySummary({
        hooks: [{ name: "On update" }],
        tasks: [{ name: "Scan" }],
        settings: [{ name: "dryRun" }],
        paths: { javascript: ["/plugin/x/javascript"], css: [] },
      })
    ).toEqual([
      "1 hook",
      "1 task",
      "UI JavaScript",
      "1 setting",
      "Filesystem/network permissions are not declared by Stash",
    ]);
  });
});
