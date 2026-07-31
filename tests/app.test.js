// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnhancedPluginManager } from "../src/app.js";
import { configurationAnchorID, installedAnchorID, sourceAnchorID } from "../src/core.js";

function pageFixture() {
  document.body.innerHTML = `
    <main id="settings-container">
      <section class="setting-section"><h1>Installed Plugins</h1><div>core installed</div></section>
      <section class="setting-section"><h1>Available Plugins</h1><div>core available</div></section>
      <section class="setting-section"><h1>Plugins</h1><div>core configuration</div></section>
    </main>`;
}

function serviceFixture() {
  return {
    loadInstalled: vi.fn().mockResolvedValue({
      packages: [
        {
          package_id: "alpha",
          name: "Alpha Tool",
          version: "1.0.0",
          date: "2025-01-01T00:00:00Z",
          sourceURL: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
          sourceName: "Community (stable)",
          status: "update",
          enabled: true,
          githubUrl: "https://github.com/stashapp/CommunityScripts/tree/stable/plugins/alpha",
          trust: { level: "official", label: "Official Stash source" },
          capabilities: ["1 hook", "UI JavaScript"],
          metadata: { description: "Improves things" },
          source_package: { version: "1.1.0", date: "2025-03-01T00:00:00Z" },
          plugin: {
            id: "alpha",
            name: "Alpha Tool",
            enabled: true,
            description: "Improves things",
            hooks: [{ name: "Update hook", description: "Runs on update", hooks: ["Scene.Update.Post"] }],
            tasks: [],
            settings: [
              { name: "dryRun", display_name: "Dry run", description: "Do not write", type: "BOOLEAN" },
              { name: "resultLimit", display_name: "Result limit", description: "Default 40", type: "NUMBER" },
            ],
          },
        },
      ],
      plugins: [],
      sources: [
        {
          name: "Community (stable)",
          url: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
          local_path: "stable",
        },
      ],
      pluginConfig: { alpha: { dryRun: true, resultLimit: 0 } },
      checkedUpdates: false,
    }),
    loadAvailable: vi.fn().mockResolvedValue({
      packages: [
        {
          package_id: "beta",
          name: "Beta Helper",
          version: "2.0.0",
          date: "2025-02-01T00:00:00Z",
          sourceURL: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
          sourceName: "Community (stable)",
          githubUrl: "https://github.com/stashapp/CommunityScripts/tree/stable/plugins/beta",
          trust: { level: "official", label: "Official Stash source" },
          metadata: { description: "Adds controls" },
          requires: [],
        },
      ],
      health: [
        {
          source: {
            name: "Community (stable)",
            url: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
          },
          ok: true,
          packageCount: 2,
          checkedAt: "2026-01-01T00:00:00Z",
        },
      ],
    }),
    update: vi.fn().mockResolvedValue("1"),
    install: vi.fn().mockResolvedValue("2"),
    uninstall: vi.fn().mockResolvedValue("3"),
    setEnabled: vi.fn().mockResolvedValue(true),
    saveSources: vi.fn().mockResolvedValue([]),
    configurePlugin: vi.fn().mockResolvedValue({}),
    reloadPlugins: vi.fn().mockResolvedValue(true),
  };
}

async function mountApp(options = {}) {
  pageFixture();
  const service = serviceFixture();
  const app = new EnhancedPluginManager(service, { confirm: options.confirm ?? (() => true), now: options.now });
  await app.mount();
  return { app, service };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/settings?tab=plugins");
  window.localStorage.clear();
  pageFixture();
});

describe("EnhancedPluginManager", () => {
  it("identifies the page as Plugin Manager Enhanced", async () => {
    await mountApp();
    expect(document.querySelector("#spme-root h1")?.textContent).toBe("Plugin Manager Enhanced");
  });

  it("replaces the three core sections with four focused tabs", async () => {
    await mountApp();

    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect([...document.querySelectorAll('[role="tab"]')].map((node) => node.textContent)).toEqual([
      "Installed",
      "Browse",
      "Sources",
      "Configuration",
    ]);
    expect(document.querySelectorAll(".spme-tabs button span")).toHaveLength(0);
    expect(document.querySelectorAll(".spme-core-hidden")).toHaveLength(3);
  });

  it("defaults to Cards view and persists the user's Table view choice", async () => {
    let { app } = await mountApp();
    expect(document.querySelector("#spme-root").dataset.viewMode).toBe("cards");
    expect(document.querySelector('[data-action="set-view"][data-view-mode="cards"]').getAttribute("aria-pressed")).toBe("true");

    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    expect(document.querySelector("#spme-root").dataset.viewMode).toBe("table");
    expect(window.localStorage.getItem("spme.viewMode")).toBe("table");

    app.unmount();
    ({ app } = await mountApp());
    expect(app.viewMode).toBe("table");
    expect(document.querySelector('[data-action="set-view"][data-view-mode="table"]').getAttribute("aria-pressed")).toBe("true");
  });

  it("restores and persists the Installed Status and Sort preferences", async () => {
    window.localStorage.setItem("spme.installedStatus", "false");
    window.localStorage.setItem("spme.installedSort", "last-commit-oldest");
    let { app } = await mountApp();

    expect(app.filters.installed.enabled).toBe(false);
    expect(app.filters.installed.sort).toBe("last-commit-oldest");
    expect(document.querySelector('[data-filter-select="installed-enabled"]').value).toBe("false");
    expect(document.querySelector('[data-filter-select="installed-sort"]').value).toBe("last-commit-oldest");

    const status = document.querySelector('[data-filter-select="installed-enabled"]');
    status.value = "true";
    status.dispatchEvent(new Event("change", { bubbles: true }));
    const sort = document.querySelector('[data-filter-select="installed-sort"]');
    sort.value = "last-commit";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(window.localStorage.getItem("spme.installedStatus")).toBe("true");
    expect(window.localStorage.getItem("spme.installedSort")).toBe("last-commit");

    app.unmount();
    ({ app } = await mountApp());
    expect(app.filters.installed.enabled).toBe(true);
    expect(app.filters.installed.sort).toBe("last-commit");
  });

  it("ignores obsolete Installed Status and Sort preferences", async () => {
    window.localStorage.setItem("spme.installedStatus", "broken");
    window.localStorage.setItem("spme.installedSort", "broken");

    const { app } = await mountApp();

    expect(app.filters.installed.enabled).toBeUndefined();
    expect(app.filters.installed.sort).toBe("name");
  });

  it("renders installed plugins as a semantic table when Table view is selected", async () => {
    await mountApp();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();

    const table = document.querySelector(".spme-package-table");
    expect(table).not.toBeNull();
    expect([...table.querySelectorAll("th")].map((cell) => cell.textContent.trim())).toEqual([
      "Select",
      "Plugin",
      "Description",
      "Version",
      "Last commit",
      "Source",
      "Status",
      "Actions",
    ]);
    expect(table.querySelector('[data-package-id="alpha"]')).not.toBeNull();
    expect(table.querySelector('[data-package-id="alpha"] [data-label="Plugin"] > .spme-table-plugin')).not.toBeNull();
    expect(table.querySelector('a[aria-label="Open Alpha Tool GitHub repository"]')).not.toBeNull();
    expect(document.querySelectorAll(".spme-package-card")).toHaveLength(0);
  });

  it("shows per-plugin Update actions only when an update is known", async () => {
    const { app } = await mountApp();
    const template = app.inventory.packages[0];
    app.inventory.packages.push(
      {
        ...template,
        package_id: "current-plugin",
        name: "Current Plugin",
        status: "current",
        plugin: { ...template.plugin, id: "current-plugin", name: "Current Plugin" },
      },
      {
        ...template,
        package_id: "unchecked-plugin",
        name: "Unchecked Plugin",
        status: "unchecked",
        source_package: undefined,
        plugin: { ...template.plugin, id: "unchecked-plugin", name: "Unchecked Plugin" },
      }
    );
    app.render();

    const assertUpdateActions = () => {
      const update = document.querySelector('[data-package-id="alpha"] [data-action="update-one"]');
      expect(update).not.toBeNull();
      expect(update.disabled).toBe(false);
      expect(document.querySelector('[data-package-id="current-plugin"] [data-action="update-one"]')).toBeNull();
      expect(document.querySelector('[data-package-id="unchecked-plugin"] [data-action="update-one"]')).toBeNull();
      const uninstall = document.querySelector('[data-package-id="current-plugin"] [data-action="uninstall-one"]');
      expect(uninstall?.textContent.trim()).toBe("");
      const trashIcon = uninstall?.querySelector("svg.spme-trash-icon");
      expect(trashIcon?.getAttribute("aria-hidden")).toBe("true");
      expect(trashIcon?.getAttribute("width")).toBe("19");
      expect(trashIcon?.getAttribute("height")).toBe("19");
      expect(trashIcon?.getAttribute("viewBox")).toBe("3 3 18 18");
      expect(uninstall?.getAttribute("aria-label")).toBe("Uninstall Current Plugin");
      expect(uninstall?.getAttribute("title")).toBe("Uninstall Current Plugin");
      expect(uninstall?.classList.contains("spme-uninstall-action")).toBe(true);
      expect(uninstall?.classList.contains("subtle")).toBe(false);

      const actionOrder = (packageID) => [...document.querySelector(`[data-package-id="${packageID}"] .spme-card-actions, [data-package-id="${packageID}"] .spme-table-actions`).children]
        .map((action) => action.dataset.action || (action.querySelector(".spme-github-icon") ? "github" : "unknown"));
      const expected = app.viewMode === "cards"
        ? {
            current: ["open-configuration", "uninstall-one", "github", "toggle-enabled"],
            update: ["open-configuration", "uninstall-one", "update-one", "github", "toggle-enabled"],
          }
        : {
            current: ["toggle-enabled", "github", "uninstall-one", "open-configuration"],
            update: ["toggle-enabled", "github", "update-one", "uninstall-one", "open-configuration"],
          };
      expect(actionOrder("current-plugin")).toEqual(expected.current);
      expect(actionOrder("alpha")).toEqual(expected.update);
    };
    assertUpdateActions();

    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    assertUpdateActions();
  });

  it("uses Table view for available packages while retaining install controls", async () => {
    const { app } = await mountApp();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    await app.setTab("browse");

    const row = document.querySelector('.spme-package-table [data-package-id="beta"]');
    expect(row).not.toBeNull();
    expect([...document.querySelectorAll(".spme-columns-browse col")].map((col) => col.className)).toEqual([
      "spme-col-select",
      "spme-col-plugin",
      "spme-col-description",
      "spme-col-version",
      "spme-col-last-commit",
      "spme-col-source",
      "spme-col-status",
      "spme-col-actions",
    ]);
    expect(row.querySelector('[data-action="install-one"]')).not.toBeNull();
    expect(row.querySelector('a[aria-label="Open Beta Helper GitHub repository"]')).not.toBeNull();
  });

  it("omits the redundant Available status from Browse Cards and Table", async () => {
    const { app } = await mountApp();
    await app.setTab("browse");

    expect(document.querySelector(".spme-status-available")).toBeNull();

    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    expect(document.querySelector(".spme-status-available")).toBeNull();
  });

  it("marks freshly installed plugin versions Current without checking for updates", async () => {
    pageFixture();
    const service = serviceFixture();
    const initial = await service.loadInstalled();
    const installed = {
      ...initial,
      packages: [
        ...initial.packages,
        {
          package_id: "beta",
          name: "Beta Helper",
          version: "2.0.0",
          date: "2025-02-01T00:00:00Z",
          sourceURL: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
          sourceName: "Community (stable)",
          status: "unchecked",
          enabled: true,
          trust: { level: "official", label: "Official Stash source" },
          metadata: { description: "Adds controls" },
          plugin: { id: "beta", name: "Beta Helper", enabled: true, settings: [] },
        },
      ],
      checkedUpdates: false,
    };
    service.loadInstalled.mockReset().mockResolvedValueOnce(initial).mockResolvedValue(installed);
    const app = new EnhancedPluginManager(service, { confirm: () => true });
    await app.mount();
    await app.setTab("browse");

    document.querySelector('[data-action="install-one"]').click();
    await vi.waitFor(() => expect(app.inventory.packages.some((pkg) => pkg.package_id === "beta")).toBe(true));

    expect(service.loadInstalled).toHaveBeenLastCalledWith({ checkUpdates: false });
    expect(app.packageByID("beta").status).toBe("current");
    expect(JSON.parse(window.localStorage.getItem("spme.currentInstalls"))).toEqual({ beta: "2.0.0" });

    app.unmount();
    pageFixture();
    const reopened = new EnhancedPluginManager(service, { confirm: () => true });
    await reopened.mount();
    expect(reopened.packageByID("beta").status).toBe("current");

    service.loadInstalled.mockImplementation(async ({ checkUpdates = false } = {}) => ({
      ...installed,
      checkedUpdates: checkUpdates,
    }));
    await reopened.refresh({ checkUpdates: true });
    expect(window.localStorage.getItem("spme.currentInstalls")).toBeNull();
  });

  it("shows and sorts last commit dates in Installed and Browse Cards and Table views", async () => {
    const { app } = await mountApp();
    const installedTemplate = app.inventory.packages[0];
    app.inventory.packages.push({
      ...installedTemplate,
      package_id: "zulu",
      name: "Zulu Plugin",
      date: "2026-01-01T00:00:00Z",
      source_package: undefined,
      plugin: { ...installedTemplate.plugin, id: "zulu", name: "Zulu Plugin" },
    });
    app.render();

    const cardOrder = () => [...document.querySelectorAll(".spme-package-card")].map((card) => card.dataset.packageId);
    const rowOrder = () => [...document.querySelectorAll(".spme-package-table tbody tr")].map((row) => row.dataset.packageId);
    expect(cardOrder()).toEqual(["alpha", "zulu"]);
    const installedCommit = new Date("2025-03-01T00:00:00Z");
    let commitTime = document.querySelector('[data-package-id="alpha"] time[data-last-commit]');
    expect(commitTime?.dateTime).toBe("2025-03-01T00:00:00.000Z");
    expect(commitTime?.textContent).toBe(installedCommit.toLocaleDateString());
    expect(commitTime?.title).toBe(installedCommit.toLocaleString());

    let sort = document.querySelector('[data-filter-select="installed-sort"]');
    sort.value = "last-commit";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cardOrder()).toEqual(["zulu", "alpha"]);
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    expect(rowOrder()).toEqual(["zulu", "alpha"]);
    commitTime = document.querySelector('[data-package-id="alpha"] [data-label="Last commit"] time[data-last-commit]');
    expect(commitTime?.textContent).toBe(installedCommit.toLocaleDateString());
    expect(commitTime?.title).toBe(installedCommit.toLocaleString());
    sort = document.querySelector('[data-filter-select="installed-sort"]');
    expect([...sort.options].map((option) => option.value)).toContain("last-commit-oldest");
    sort.value = "last-commit-oldest";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(rowOrder()).toEqual(["alpha", "zulu"]);

    await app.setTab("browse");
    const availableTemplate = app.available.packages[0];
    app.available.packages.push({
      ...availableTemplate,
      package_id: "aardvark",
      name: "Aardvark Plugin",
      date: "2024-01-01T00:00:00Z",
    });
    app.viewMode = "cards";
    app.render();
    expect(cardOrder()).toEqual(["beta", "aardvark"]);
    const availableCommit = new Date("2025-02-01T00:00:00Z");
    commitTime = document.querySelector('[data-package-id="beta"] time[data-last-commit]');
    expect(commitTime?.dateTime).toBe("2025-02-01T00:00:00.000Z");
    expect(commitTime?.textContent).toBe(availableCommit.toLocaleDateString());
    expect(commitTime?.title).toBe(availableCommit.toLocaleString());

    sort = document.querySelector('[data-filter-select="browse-sort"]');
    expect(sort.value).toBe("last-commit");
    sort.value = "name";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cardOrder()).toEqual(["aardvark", "beta"]);
    sort = document.querySelector('[data-filter-select="browse-sort"]');
    expect([...sort.options].map((option) => option.value)).toContain("last-commit-oldest");
    sort.value = "last-commit-oldest";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cardOrder()).toEqual(["aardvark", "beta"]);
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    expect(rowOrder()).toEqual(["aardvark", "beta"]);
    expect(document.querySelector('[data-package-id="beta"] [data-label="Last commit"] time[data-last-commit]')).not.toBeNull();
  });

  it("keeps non-package tabs on the centered layout after Table view is selected", async () => {
    const { app } = await mountApp();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    await app.setTab("configuration");

    expect(document.querySelector("#spme-root").dataset.activeTab).toBe("configuration");
    expect(document.querySelector(".spme-view-toggle")).toBeNull();
  });

  it("persists the selected plugin-manager subtab in the URL and restores it on mount", async () => {
    window.history.replaceState({}, "", "/settings?tab=plugins&pluginManagerTab=configuration");
    const { app } = await mountApp();
    expect(app.activeTab).toBe("configuration");
    expect(document.querySelector('[data-tab="configuration"]').getAttribute("aria-selected")).toBe("true");

    document.querySelector('[data-tab="sources"]').click();
    expect(new URL(window.location.href).searchParams.get("pluginManagerTab")).toBe("sources");
  });

  it("renders contextual search, result counts, statuses, and an accessible selection control", async () => {
    await mountApp();

    expect(document.querySelector('input[aria-label="Search installed plugins"]')).not.toBeNull();
    expect(document.body.textContent).toContain("1 installed");
    expect(document.body.textContent).toContain("Update available");
    expect(document.querySelector('input[aria-label="Select Alpha Tool"]')).not.toBeNull();
  });

  it("keeps filters together, places their result count next, and right-aligns Sort", async () => {
    const { app } = await mountApp();
    const controlOrder = () => [...document.querySelector(".spme-toolbar").children].map((element) => {
      if (element.matches(".spme-result-count")) return "results";
      if (element.querySelector?.('[data-filter-select="installed-dependency"]')) return "dependency";
      if (element.querySelector?.('[data-filter-select="installed-enabled"]')) return "status";
      if (element.matches(".spme-check")) return "updates";
      if (element.querySelector?.('[data-filter-select$="-sort"]')) return "sort";
      if (element.matches(".spme-search")) return "search";
      if (element.querySelector?.('[data-filter-select="browse-source"]')) return "source";
      return "other";
    });

    expect(controlOrder()).toEqual(["search", "dependency", "status", "updates", "results", "sort"]);

    await app.setTab("browse");
    expect(controlOrder()).toEqual(["search", "source", "results", "sort"]);
  });

  it("dismisses alert messages from an accessible close button", async () => {
    const { app } = await mountApp();
    app.message = { type: "success", text: "Plugin operation completed." };
    app.render();

    const alert = document.querySelector(".spme-alert");
    const dismiss = alert?.querySelector('[data-action="dismiss-message"]');
    expect(alert?.querySelector(".spme-alert-content")?.textContent).toBe("Plugin operation completed.");
    expect(dismiss?.getAttribute("aria-label")).toBe("Dismiss notification");
    expect(dismiss?.getAttribute("title")).toBe("Dismiss");

    dismiss.click();
    expect(app.message).toBeUndefined();
    expect(document.querySelector(".spme-alert")).toBeNull();
  });

  it("shows runtime-only plugins only when present and limits them to enable or disable", async () => {
    const { app, service } = await mountApp();
    expect(document.querySelector(".spme-runtime-only")).toBeNull();
    app.inventory.packages.push({
      package_id: "dev-helper",
      name: "Dev Helper",
      version: "0.2.0",
      sourceName: "Runtime-only",
      status: "runtime-only",
      enabled: false,
      installed: true,
      runtimeOnly: true,
      githubUrl: "https://github.com/example/dev-helper",
      trust: { level: "unverified", label: "Unverified source" },
      capabilities: ["UI JavaScript"],
      metadata: { description: "Loaded directly from the plugins directory" },
      plugin: { id: "dev-helper", name: "Dev Helper", description: "Loaded directly from the plugins directory", enabled: false },
    });
    app.render();

    const enabledPlugin = document.querySelector('[data-package-id="alpha"]');
    expect(enabledPlugin.querySelector(".spme-enabled, .spme-disabled")).toBeNull();
    expect(enabledPlugin.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(enabledPlugin.querySelector('[role="switch"]')?.textContent.trim()).toBe("");
    expect(enabledPlugin.querySelector('[role="switch"] .spme-enable-toggle-label')).toBeNull();
    let plugin = document.querySelector('[data-package-id="dev-helper"]');
    expect(plugin.querySelector(".spme-runtime-only")?.textContent).toBe("Runtime-only");
    expect(plugin.querySelector('[data-select-package="installed"]').disabled).toBe(true);
    expect(plugin.querySelector('[data-action="toggle-enabled"]')?.textContent.trim()).toBe("");
    expect(plugin.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(plugin.querySelector(".spme-enabled, .spme-disabled")).toBeNull();
    expect(plugin.querySelector('[data-action="update-one"]')).toBeNull();
    expect(plugin.querySelector('[data-action="uninstall-one"]')).toBeNull();

    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    plugin = document.querySelector('.spme-package-table [data-package-id="dev-helper"]');
    expect(plugin.querySelector(".spme-runtime-only")).not.toBeNull();
    expect(plugin.querySelector('[data-select-package="installed"]').disabled).toBe(true);
    expect(plugin.querySelector('[data-action="update-one"]')).toBeNull();
    expect(plugin.querySelector('[data-action="uninstall-one"]')).toBeNull();
    expect(plugin.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
    expect(plugin.querySelector(".spme-enabled, .spme-disabled")).toBeNull();

    plugin.querySelector('[data-action="toggle-enabled"]').click();
    await vi.waitFor(() => expect(service.setEnabled).toHaveBeenCalledWith("dev-helper", true));
  });

  it("warns before disabling a plugin required by an enabled plugin", async () => {
    const confirm = vi.fn(() => false);
    const { app, service } = await mountApp({ confirm });
    const template = app.inventory.packages[0];
    const library = { ...template, package_id: "library", name: "Shared Library", enabled: true, requires: [], plugin: { ...template.plugin, id: "library", name: "Shared Library", enabled: true } };
    const consumer = { ...template, package_id: "consumer", name: "Enabled Consumer", enabled: true, requires: ["library"], plugin: { ...template.plugin, id: "consumer", name: "Enabled Consumer", enabled: true, requires: ["library"] } };
    app.inventory.packages = [library, consumer];
    app.render();

    document.querySelector('[data-package-id="library"] [data-action="toggle-enabled"]').click();

    await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Enabled Consumer")));
    expect(confirm.mock.calls[0][0]).toContain("required by the following enabled plugin");
    expect(service.setEnabled).not.toHaveBeenCalled();
  });

  it("prompts and enables disabled dependencies before enabling a plugin", async () => {
    const confirm = vi.fn(() => true);
    const { app, service } = await mountApp({ confirm });
    const template = app.inventory.packages[0];
    let packages = [
      { ...template, package_id: "library", name: "Shared Library", enabled: false, requires: [], plugin: { ...template.plugin, id: "library", name: "Shared Library", enabled: false, requires: [] } },
      { ...template, package_id: "consumer", name: "Consumer", enabled: false, requires: ["library"], plugin: { ...template.plugin, id: "consumer", name: "Consumer", enabled: false, requires: ["library"] } },
    ];
    app.inventory = { ...app.inventory, packages };
    service.setEnabled.mockImplementation(async (id, enabled) => {
      packages = packages.map((pkg) => pkg.package_id === id
        ? { ...pkg, enabled, plugin: { ...pkg.plugin, enabled } }
        : pkg);
      return true;
    });
    service.loadInstalled.mockImplementation(async () => ({ ...app.inventory, packages }));
    app.render();

    document.querySelector('[data-package-id="consumer"] [data-action="toggle-enabled"]').click();

    await vi.waitFor(() => expect(service.setEnabled).toHaveBeenCalledTimes(2));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Shared Library is installed but disabled"));
    expect(confirm.mock.calls[0][0]).toContain("Install and enable all required dependencies and continue?");
    expect(service.setEnabled.mock.calls.map(([id, enabled]) => [id, enabled])).toEqual([
      ["library", true],
      ["consumer", true],
    ]);
  });

  it("installs and enables missing dependencies in transitive prerequisite order", async () => {
    const confirm = vi.fn(() => true);
    const { app, service } = await mountApp({ confirm });
    await app.setTab("browse");
    await app.setTab("installed");
    const template = app.inventory.packages[0];
    const library = { ...template, package_id: "library", name: "Shared Library", enabled: false, requires: [], plugin: { ...template.plugin, id: "library", name: "Shared Library", enabled: false, requires: [] } };
    const consumer = { ...template, package_id: "consumer", name: "Consumer", enabled: false, requires: ["helper"], plugin: { ...template.plugin, id: "consumer", name: "Consumer", enabled: false, requires: ["helper"] } };
    const helper = {
      ...app.available.packages[0],
      package_id: "helper",
      name: "Missing Helper",
      requires: ["library"],
    };
    let packages = [library, consumer];
    app.inventory = { ...app.inventory, packages };
    app.available = { ...app.available, packages: [helper] };
    service.install.mockImplementation(async ([candidate]) => {
      packages = [...packages, {
        ...candidate,
        installed: true,
        enabled: false,
        plugin: { id: candidate.package_id, name: candidate.name, enabled: false, requires: candidate.requires },
      }];
      return true;
    });
    service.setEnabled.mockImplementation(async (id, enabled) => {
      packages = packages.map((pkg) => pkg.package_id === id
        ? { ...pkg, enabled, plugin: { ...pkg.plugin, enabled } }
        : pkg);
      return true;
    });
    service.loadInstalled.mockImplementation(async () => ({ ...app.inventory, packages }));
    app.render();

    document.querySelector('[data-package-id="consumer"] [data-action="toggle-enabled"]').click();

    await vi.waitFor(() => expect(service.setEnabled).toHaveBeenCalledWith("consumer", true));
    expect(confirm.mock.calls[0][0]).toContain("Shared Library is installed but disabled");
    expect(confirm.mock.calls[0][0]).toContain("Missing Helper is not installed");
    expect(service.install).toHaveBeenCalledWith([helper]);
    expect(service.setEnabled.mock.calls.map(([id, enabled]) => [id, enabled])).toEqual([
      ["library", true],
      ["helper", true],
      ["consumer", true],
    ]);
  });

  it("loads the available catalog when an installed dependency has a missing dependency", async () => {
    const { app, service } = await mountApp();
    const template = app.inventory.packages[0];
    const availableHelper = {
      package_id: "helper",
      name: "Nested Helper",
      sourceURL: template.sourceURL,
      sourceName: template.sourceName,
      requires: [],
      metadata: {},
    };
    let packages = [
      { ...template, package_id: "middle", name: "Middle", enabled: true, requires: ["helper"], plugin: { ...template.plugin, id: "middle", name: "Middle", enabled: true, requires: ["helper"] } },
      { ...template, package_id: "consumer", name: "Consumer", enabled: false, requires: ["middle"], plugin: { ...template.plugin, id: "consumer", name: "Consumer", enabled: false, requires: ["middle"] } },
    ];
    app.inventory = { ...app.inventory, packages };
    app.available = undefined;
    service.loadAvailable.mockResolvedValue({ packages: [availableHelper], health: [] });
    service.install.mockImplementation(async ([candidate]) => {
      packages = [...packages, { ...candidate, installed: true, enabled: false, plugin: { id: candidate.package_id, name: candidate.name, enabled: false, requires: [] } }];
      return true;
    });
    service.setEnabled.mockImplementation(async (id, enabled) => {
      packages = packages.map((pkg) => pkg.package_id === id ? { ...pkg, enabled, plugin: { ...pkg.plugin, enabled } } : pkg);
      return true;
    });
    service.loadInstalled.mockImplementation(async () => ({ ...app.inventory, packages }));
    app.render();

    document.querySelector('[data-package-id="consumer"] [data-action="toggle-enabled"]').click();

    await vi.waitFor(() => expect(service.setEnabled).toHaveBeenCalledWith("consumer", true));
    expect(service.loadAvailable).toHaveBeenCalled();
    expect(service.install).toHaveBeenCalledWith([availableHelper]);
  });

  it("labels dependency plugins and lists every installed dependent in a tooltip", async () => {
    const { app } = await mountApp();
    const template = app.inventory.packages[0];
    const make = (id, name, requires = [], enabled = true) => ({ ...template, package_id: id, name, enabled, requires, plugin: { ...template.plugin, id, name, enabled, requires } });
    const library = make("library", "Shared Library");
    const enabledConsumer = make("enabled-consumer", "Enabled Consumer", ["library"]);
    const disabledConsumer = make("disabled-consumer", "Disabled <Consumer>", ["library"], false);
    app.inventory.packages = [library, enabledConsumer, disabledConsumer];
    app.render();

    const assertDependencyBadge = () => {
      const badge = document.querySelector('[data-package-id="library"] .spme-status-dependency');
      expect(badge?.textContent).toBe("Dependency");
      expect(badge?.getAttribute("title")).toBe("Required by: Enabled Consumer (enabled), Disabled <Consumer> (disabled)");
      expect(badge?.getAttribute("aria-label")).toBe("Filter Installed to plugins requiring Shared Library. Required by: Enabled Consumer (enabled), Disabled <Consumer> (disabled)");
      expect(document.querySelector('[data-package-id="enabled-consumer"] .spme-status-dependency')).toBeNull();
      expect(document.querySelector('[data-package-id="disabled-consumer"] .spme-status-dependency')).toBeNull();
      expect(document.querySelector("script")).toBeNull();
    };

    assertDependencyBadge();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    assertDependencyBadge();
  });

  it("uses concise trust pill labels while preserving full source tooltips", async () => {
    const { app } = await mountApp();
    const official = document.querySelector(".spme-trust-official");
    expect(official?.textContent).toBe("Official");
    expect(official?.getAttribute("title")).toBe("Official Stash source");

    app.inventory.packages[0].trust = { level: "community", label: "Community GitHub source" };
    app.render();
    const community = document.querySelector(".spme-trust-community");
    expect(community?.textContent).toBe("Community");
    expect(community?.getAttribute("title")).toBe("Community GitHub source");
  });

  it("shows a page-level never-checked status instead of per-plugin unchecked pills", async () => {
    const { app } = await mountApp();
    app.inventory.packages[0].status = "unchecked";
    app.render();

    expect(document.querySelector(".spme-update-check-status")?.textContent).toBe("Updates never checked");
    expect(document.body.textContent).not.toContain("Updates not checked");
    expect(document.querySelector('[data-package-id="alpha"] .spme-status-current')).toBeNull();
  });

  it("restores the last successful update check as relative page-level time", async () => {
    const now = Date.UTC(2026, 6, 30, 20, 0, 0);
    const checkedAt = now - 2 * 60 * 60_000;
    window.localStorage.setItem("spme.lastUpdateCheck", String(checkedAt));

    await mountApp({ now: () => now });

    const status = document.querySelector(".spme-update-check-status");
    const time = status?.querySelector("time");
    expect(status?.textContent).toBe("2 hours ago");
    expect(time?.textContent).toBe("2 hours ago");
    expect(time?.getAttribute("datetime")).toBe(new Date(checkedAt).toISOString());
  });

  it("ignores an out-of-range stored update check timestamp", async () => {
    window.localStorage.setItem("spme.lastUpdateCheck", "9e15");

    await mountApp();

    expect(document.querySelector(".spme-update-check-status")?.textContent).toBe("Updates never checked");
  });

  it("records a successful explicit update check and shows it immediately", async () => {
    const now = Date.UTC(2026, 6, 30, 20, 0, 0);
    const { service } = await mountApp({ now: () => now });

    document.querySelector('[data-action="check-updates"]').click();

    await vi.waitFor(() => expect(service.loadInstalled).toHaveBeenLastCalledWith({ checkUpdates: true }));
    await vi.waitFor(() => expect(document.querySelector(".spme-update-check-status")?.textContent).toBe("just now"));
    expect(window.localStorage.getItem("spme.lastUpdateCheck")).toBe(String(now));
  });

  it("records a successful post-operation update check", async () => {
    const now = Date.UTC(2026, 6, 30, 20, 0, 0);
    const { service } = await mountApp({ now: () => now });

    document.querySelector('[data-action="update-one"]').click();

    await vi.waitFor(() => expect(service.update).toHaveBeenCalled());
    await vi.waitFor(() => expect(service.loadInstalled).toHaveBeenLastCalledWith({ checkUpdates: true }));
    expect(window.localStorage.getItem("spme.lastUpdateCheck")).toBe(String(now));
  });

  it("populates the Installed dependency filter with known dependency plugins", async () => {
    const { app } = await mountApp();
    const template = app.inventory.packages[0];
    const make = (id, name, requires = []) => ({ ...template, package_id: id, name, requires, plugin: { ...template.plugin, id, name, requires } });
    app.inventory.packages = [
      make("library", "Shared Library"),
      make("framework", "Base Framework"),
      make("consumer-a", "Consumer A", ["library"]),
      make("consumer-b", "Consumer B", ["framework"]),
      make("ordinary", "Ordinary Plugin"),
    ];
    app.render();

    const options = [...document.querySelectorAll('[data-filter-select="installed-dependency"] option')]
      .map((option) => [option.value, option.textContent]);
    expect(options).toEqual([
      ["", "All plugins"],
      ["framework", "Base Framework"],
      ["library", "Shared Library"],
    ]);
  });

  it("filters Installed to enabled and disabled consumers selected from the dependency dropdown", async () => {
    const { app } = await mountApp();
    const template = app.inventory.packages[0];
    const make = (id, name, requires = [], enabled = true) => ({ ...template, package_id: id, name, enabled, requires, plugin: { ...template.plugin, id, name, enabled, requires } });
    app.inventory.packages = [
      make("library", "Shared Library"),
      make("enabled-consumer", "Enabled Consumer", ["library"]),
      make("disabled-consumer", "Disabled Consumer", ["library"], false),
      make("ordinary", "Ordinary Plugin"),
    ];
    app.filters.installed.enabled = true;
    app.render();

    const select = document.querySelector('[data-filter-select="installed-dependency"]');
    select.value = "library";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(app.filters.installed.dependency).toBe("library");
    expect(app.filters.installed.enabled).toBeUndefined();
    expect(document.querySelector('[data-filter-select="installed-enabled"]').value).toBe("");
    expect([...document.querySelectorAll(".spme-package-card")].map((card) => card.dataset.packageId)).toEqual([
      "disabled-consumer",
      "enabled-consumer",
    ]);
    expect(document.querySelector('[data-filter-select="installed-dependency"]').value).toBe("library");
  });

  it("resets a dependency filter that is no longer known after inventory changes", async () => {
    const { app } = await mountApp();
    const template = app.inventory.packages[0];
    const library = { ...template, package_id: "library", name: "Shared Library", requires: [], plugin: { ...template.plugin, id: "library", name: "Shared Library", requires: [] } };
    const consumer = { ...template, package_id: "consumer", name: "Consumer", requires: ["library"], plugin: { ...template.plugin, id: "consumer", name: "Consumer", requires: ["library"] } };
    app.inventory.packages = [library, consumer];
    app.filters.installed.dependency = "library";

    app.inventory.packages = [{ ...consumer, requires: [], plugin: { ...consumer.plugin, requires: [] } }];
    app.render();

    expect(app.filters.installed.dependency).toBe("");
    expect(document.querySelector('[data-filter-select="installed-dependency"]').value).toBe("");
    expect(document.querySelector('[data-package-id="consumer"]')).not.toBeNull();
  });

  it("selects the Installed dependency filter when its Dependency pill is clicked", async () => {
    const { app } = await mountApp();
    const template = app.inventory.packages[0];
    const make = (id, name, requires = [], enabled = true) => ({ ...template, package_id: id, name, enabled, requires, plugin: { ...template.plugin, id, name, enabled, requires } });
    app.inventory.packages = [
      make("library", "Shared Library", [], false),
      make("enabled-consumer", "Enabled Consumer", ["library"]),
      make("disabled-consumer", "Disabled Consumer", ["library"], false),
      make("ordinary", "Ordinary Plugin"),
    ];
    app.filters.installed.enabled = false;
    app.render();

    const pill = document.querySelector('[data-package-id="library"] .spme-status-dependency');
    expect(pill?.tagName).toBe("BUTTON");
    pill.click();

    expect(app.filters.installed.dependency).toBe("library");
    expect(app.filters.installed.enabled).toBeUndefined();
    expect(document.querySelector('[data-filter-select="installed-dependency"]').value).toBe("library");
    expect([...document.querySelectorAll(".spme-package-card")].map((card) => card.dataset.packageId)).toEqual([
      "disabled-consumer",
      "enabled-consumer",
    ]);
  });

  it("allows disabling a dependency without warning when only disabled plugins require it", async () => {
    const confirm = vi.fn(() => false);
    const { app, service } = await mountApp({ confirm });
    const template = app.inventory.packages[0];
    const library = { ...template, package_id: "library", name: "Shared Library", enabled: true, requires: [], plugin: { ...template.plugin, id: "library", name: "Shared Library", enabled: true } };
    const consumer = { ...template, package_id: "consumer", name: "Disabled Consumer", enabled: false, requires: ["library"], plugin: { ...template.plugin, id: "consumer", name: "Disabled Consumer", enabled: false, requires: ["library"] } };
    app.inventory.packages = [library, consumer];
    app.render();
    service.loadInstalled.mockResolvedValueOnce({ ...app.inventory, packages: [{ ...library, enabled: false }, consumer] });

    document.querySelector('[data-package-id="library"] [data-action="toggle-enabled"]').click();

    await vi.waitFor(() => expect(service.setEnabled).toHaveBeenCalledWith("library", false));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("warns before uninstalling a dependency required by a disabled installed plugin", async () => {
    const confirm = vi.fn(() => false);
    const { app, service } = await mountApp({ confirm });
    const template = app.inventory.packages[0];
    const library = { ...template, package_id: "library", name: "Shared Library", enabled: true, requires: [], plugin: { ...template.plugin, id: "library", name: "Shared Library", enabled: true } };
    const consumer = { ...template, package_id: "consumer", name: "Disabled Consumer", enabled: false, requires: ["library"], plugin: { ...template.plugin, id: "consumer", name: "Disabled Consumer", enabled: false, requires: ["library"] } };
    app.inventory.packages = [library, consumer];
    app.render();

    document.querySelector('[data-package-id="library"] [data-action="uninstall-one"]').click();

    await vi.waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Disabled Consumer (disabled)")));
    expect(service.uninstall).not.toHaveBeenCalled();
  });

  it("recursively offers to disable dependencies that become unused", async () => {
    const confirm = vi.fn(() => true);
    const { app, service } = await mountApp({ confirm });
    const template = app.inventory.packages[0];
    const make = (id, name, requires = [], enabled = true) => ({ ...template, package_id: id, name, enabled, requires, plugin: { ...template.plugin, id, name, enabled, requires } });
    const consumer = make("consumer", "Consumer", ["library"]);
    const library = make("library", "Shared Library", ["foundation"]);
    const foundation = make("foundation", "Foundation");
    app.inventory.packages = [consumer, library, foundation];
    app.render();
    service.loadInstalled
      .mockResolvedValueOnce({ ...app.inventory, packages: [{ ...consumer, enabled: false }, library, foundation] })
      .mockResolvedValueOnce({ ...app.inventory, packages: [{ ...consumer, enabled: false }, { ...library, enabled: false }, foundation] })
      .mockResolvedValueOnce({ ...app.inventory, packages: [{ ...consumer, enabled: false }, { ...library, enabled: false }, { ...foundation, enabled: false }] });

    document.querySelector('[data-package-id="consumer"] [data-action="toggle-enabled"]').click();

    await vi.waitFor(() => expect(service.setEnabled.mock.calls).toEqual([
      ["consumer", false],
      ["library", false],
      ["foundation", false],
    ]));
    expect(confirm.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining("Shared Library is no longer required by any enabled plugin"),
      expect.stringContaining("Foundation is no longer required by any enabled plugin"),
    ]);
  });

  it("keeps a dependency installed when another disabled plugin still requires it", async () => {
    const confirm = vi.fn(() => true);
    const { app, service } = await mountApp({ confirm });
    const template = app.inventory.packages[0];
    const make = (id, name, requires = [], enabled = true) => ({ ...template, package_id: id, name, enabled, requires, plugin: { ...template.plugin, id, name, enabled, requires } });
    const consumer = make("consumer", "Consumer", ["library"]);
    const library = make("library", "Shared Library");
    const disabledConsumer = make("disabled-consumer", "Disabled Consumer", ["library"], false);
    app.inventory.packages = [consumer, library, disabledConsumer];
    app.render();
    service.loadInstalled.mockResolvedValueOnce({ ...app.inventory, packages: [library, disabledConsumer] });

    document.querySelector('[data-package-id="consumer"] [data-action="uninstall-one"]').click();

    await vi.waitFor(() => expect(service.uninstall).toHaveBeenCalledTimes(1));
    expect(service.uninstall).toHaveBeenCalledWith([consumer]);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("recursively offers to uninstall dependencies that become unused", async () => {
    const confirm = vi.fn(() => true);
    const { app, service } = await mountApp({ confirm });
    const template = app.inventory.packages[0];
    const make = (id, name, requires = []) => ({ ...template, package_id: id, name, enabled: true, requires, plugin: { ...template.plugin, id, name, enabled: true, requires } });
    const consumer = make("consumer", "Consumer", ["library"]);
    const library = make("library", "Shared Library", ["foundation"]);
    const foundation = make("foundation", "Foundation");
    app.inventory.packages = [consumer, library, foundation];
    app.render();
    service.loadInstalled
      .mockResolvedValueOnce({ ...app.inventory, packages: [library, foundation] })
      .mockResolvedValueOnce({ ...app.inventory, packages: [foundation] })
      .mockResolvedValueOnce({ ...app.inventory, packages: [] });

    document.querySelector('[data-package-id="consumer"] [data-action="uninstall-one"]').click();

    await vi.waitFor(() => expect(service.uninstall.mock.calls).toEqual([
      [[consumer]],
      [[library]],
      [[foundation]],
    ]));
    expect(confirm.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining("Uninstall Consumer"),
      expect.stringContaining("Shared Library is no longer required by any installed plugin"),
      expect.stringContaining("Foundation is no longer required by any installed plugin"),
    ]);
  });

  it("opens installed and available GitHub repositories in a new tab", async () => {
    const { app } = await mountApp();

    const expectGitHubButton = (link, name) => {
      const icon = link?.querySelector("svg.spme-github-icon");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.getAttribute("width")).toBe("19");
      expect(icon?.getAttribute("height")).toBe("19");
      expect(link?.textContent.trim()).toBe("");
      expect(link?.getAttribute("aria-label")).toBe(`Open ${name} GitHub repository`);
      expect(link?.getAttribute("title")).toBe(`Open ${name} GitHub repository`);
    };

    let link = document.querySelector('a[aria-label="Open Alpha Tool GitHub repository"]');
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");
    expectGitHubButton(link, "Alpha Tool");

    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    link = document.querySelector('a[aria-label="Open Alpha Tool GitHub repository"]');
    expectGitHubButton(link, "Alpha Tool");

    await app.setTab("browse");
    link = document.querySelector('a[aria-label="Open Beta Helper GitHub repository"]');
    expect(link?.href).toContain("github.com");
    expect(link?.target).toBe("_blank");
    expectGitHubButton(link, "Beta Helper");

    document.querySelector('[data-action="set-view"][data-view-mode="cards"]').click();
    link = document.querySelector('a[aria-label="Open Beta Helper GitHub repository"]');
    expectGitHubButton(link, "Beta Helper");

    await app.setTab("installed");
    const alpha = app.inventory.packages.find((pkg) => pkg.package_id === "alpha");
    alpha.githubUrl = undefined;
    app.render();
    const actions = document.querySelector('[data-package-id="alpha"] .spme-card-actions');
    expect(actions?.querySelector(".spme-repo-link")).toBeNull();
    expect(actions?.textContent).not.toContain("Repository unavailable");
  });

  it("links configurable Installed plugins to their expanded Configuration panel", async () => {
    const { app } = await mountApp();
    app.inventory.packages.push({
      ...app.inventory.packages[0],
      package_id: "plain",
      name: "Plain Plugin",
      plugin: { id: "plain", name: "Plain Plugin", settings: [] },
    });
    app.render();

    const cardConfigure = document.querySelector('[data-package-id="alpha"] [data-action="open-configuration"]');
    expect(cardConfigure).not.toBeNull();
    expect(cardConfigure?.textContent.trim()).toBe("");
    const configureIcon = cardConfigure?.querySelector("svg.spme-configure-icon");
    expect(configureIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(configureIcon?.getAttribute("width")).toBe("19");
    expect(configureIcon?.getAttribute("height")).toBe("19");
    expect(configureIcon?.getAttribute("viewBox")).toBe("3 3 18 18");
    expect(cardConfigure?.querySelector("svg.spme-gear-icon")).toBeNull();
    expect(cardConfigure?.getAttribute("aria-label")).toBe("Configure Alpha Tool");
    expect(cardConfigure?.getAttribute("title")).toBe("Configure Alpha Tool");
    expect(document.querySelector('[data-package-id="plain"] [data-action="open-configuration"]')).toBeNull();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    const configure = document.querySelector('[data-package-id="alpha"] [data-action="open-configuration"]');
    expect(configure?.textContent.trim()).toBe("");
    expect(configure?.querySelector("svg.spme-configure-icon")).not.toBeNull();
    expect(configure?.getAttribute("title")).toBe("Configure Alpha Tool");
    expect(configure?.getAttribute("href")).toContain(`pluginManagerTab=configuration#${configurationAnchorID("alpha")}`);
    configure.click();

    await vi.waitFor(() => expect(app.activeTab).toBe("configuration"));
    const panel = document.getElementById(configurationAnchorID("alpha"));
    expect(panel?.open).toBe(true);
    expect(document.activeElement).toBe(panel);
    expect(window.location.hash).toBe(`#${configurationAnchorID("alpha")}`);
  });

  it("restores and opens a configuration anchor on direct navigation", async () => {
    const anchorID = configurationAnchorID("alpha");
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState({}, "", `/settings?tab=plugins&pluginManagerTab=configuration#${anchorID}`);

    const { app } = await mountApp();
    const panel = document.getElementById(anchorID);
    expect(app.activeTab).toBe("configuration");
    expect(panel?.open).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(panel);
  });

  it("links every Configuration panel back to its highlighted Installed item", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { app } = await mountApp();
    await app.setTab("configuration");
    const panels = [...document.querySelectorAll(".spme-plugin-config")];
    expect(panels.length).toBeGreaterThan(0);
    expect(panels.every((panel) => panel.querySelector('[data-action="open-installed"]'))).toBe(true);
    const manage = panels[0].querySelector('[data-action="open-installed"]');
    expect(manage.textContent).toBe("Manage");
    expect(manage.getAttribute("href")).toContain(`pluginManagerTab=installed#${installedAnchorID("alpha")}`);

    manage.click();

    await vi.waitFor(() => expect(app.activeTab).toBe("installed"));
    const target = document.getElementById(installedAnchorID("alpha"));
    expect(target).not.toBeNull();
    expect(document.activeElement).toBe(target);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("restores an Installed plugin anchor in Table view on direct navigation", async () => {
    const anchorID = installedAnchorID("alpha");
    window.localStorage.setItem("spme.viewMode", "table");
    window.history.replaceState({}, "", `/settings?tab=plugins&pluginManagerTab=installed#${anchorID}`);

    const { app } = await mountApp();
    const target = document.getElementById(anchorID);
    expect(app.activeTab).toBe("installed");
    expect(app.viewMode).toBe("table");
    expect(target?.tagName).toBe("TR");
    expect(document.activeElement).toBe(target);
  });

  it("clears a dependency filter when revealing an Installed deep link outside its results", async () => {
    const { app } = await mountApp();
    const template = app.inventory.packages[0];
    const library = { ...template, package_id: "library", name: "Shared Library", requires: [], plugin: { ...template.plugin, id: "library", name: "Shared Library", requires: [] } };
    const consumer = { ...template, package_id: "consumer", name: "Consumer", requires: ["library"], plugin: { ...template.plugin, id: "consumer", name: "Consumer", requires: ["library"] } };
    const ordinary = { ...template, package_id: "ordinary", name: "Ordinary Plugin", requires: [], plugin: { ...template.plugin, id: "ordinary", name: "Ordinary Plugin", requires: [] } };
    app.inventory.packages = [library, consumer, ordinary];
    app.filters.installed.dependency = "library";
    app.render();
    const anchorID = installedAnchorID("ordinary");
    window.history.replaceState({}, "", `/settings?tab=plugins&pluginManagerTab=installed#${anchorID}`);

    expect(document.getElementById(anchorID)).toBeNull();
    expect(app.scrollToInstalledFromURL({ behavior: "auto" })).toBe(true);
    expect(app.filters.installed.dependency).toBe("");
    expect(document.getElementById(anchorID)).not.toBeNull();
  });

  it("links Installed and Browse source labels to stable source anchors in Cards and Table views", async () => {
    const { app } = await mountApp();
    const sourceURL = "https://stashapp.github.io/CommunityScripts/stable/index.yml";
    const expectedHash = `#${sourceAnchorID(sourceURL)}`;
    const expectSourceLink = () => {
      const link = document.querySelector('.spme-source-link[data-action="open-source"]');
      expect(link?.textContent).toBe("Community (stable)");
      expect(new URL(link.href).searchParams.get("pluginManagerTab")).toBe("sources");
      expect(new URL(link.href).hash).toBe(expectedHash);
    };

    expectSourceLink();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    expectSourceLink();
    document.querySelector('[data-action="set-view"][data-view-mode="cards"]').click();
    await app.setTab("browse");
    expectSourceLink();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    expectSourceLink();
  });

  it("opens a linked source in the Sources subtab and targets its card", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { app } = await mountApp();
    const sourceURL = "https://stashapp.github.io/CommunityScripts/stable/index.yml";
    const anchorID = sourceAnchorID(sourceURL);
    app.inventory.sources.push({
      name: "Second source",
      url: "https://example.github.io/plugins/main/index.yml",
      local_path: null,
    });

    document.querySelector('.spme-source-link[data-action="open-source"]').click();

    await vi.waitFor(() => expect(document.getElementById(anchorID)).not.toBeNull());
    const target = document.getElementById(anchorID);
    expect(window.location.hash).toBe(`#${anchorID}`);
    expect(target?.getAttribute("tabindex")).toBe("-1");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(target);

    scrollIntoView.mockClear();
    document.querySelector('[data-action="edit-source"][data-index="1"]').click();
    expect(window.location.hash).toBe("");
    expect(document.querySelector('.spme-source-card-editing[data-source-index="1"]')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.spme-source-card-editing [name="name"]'));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("restores and targets a source anchor on direct navigation", async () => {
    const sourceURL = "https://stashapp.github.io/CommunityScripts/stable/index.yml";
    const anchorID = sourceAnchorID(sourceURL);
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    window.history.replaceState({}, "", `/settings?tab=plugins&pluginManagerTab=sources#${anchorID}`);

    const { app } = await mountApp();

    expect(app.activeTab).toBe("sources");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(document.getElementById(anchorID));

    document.querySelector('[data-tab="installed"]').click();
    expect(window.location.hash).toBe("");
  });

  it("renders source health, trust, URL, and package count separately from browsing", async () => {
    const { app } = await mountApp();
    await app.setTab("sources");

    expect(document.body.textContent).toContain("Healthy");
    const trust = document.querySelector(".spme-source-card .spme-trust-official");
    expect(trust?.textContent).toBe("Official");
    expect(trust?.title).toBe("Official Stash source");
    expect(document.body.textContent).toContain("2 packages");
    expect(document.querySelector('a[href$="index.yml"]')).not.toBeNull();
    const repository = document.querySelector('a[aria-label="Open Community (stable) GitHub repository"]');
    expect(repository?.querySelector("svg.spme-github-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(repository?.textContent.trim()).toBe("");
    expect(repository?.title).toBe("Open Community (stable) GitHub repository");
    expect(repository?.href).toBe("https://github.com/stashapp/CommunityScripts");
    expect(repository?.target).toBe("_blank");
    expect(repository?.rel).toContain("noopener");
  });

  it("uses the Installed trash action for deleting Sources in Cards and Table", async () => {
    const { app } = await mountApp();
    await app.setTab("sources");

    const assertDeleteAction = (selector) => {
      const button = document.querySelector(`${selector} [data-action="delete-source"]`);
      expect(button?.textContent.trim()).toBe("");
      expect(button?.classList.contains("danger")).toBe(true);
      expect(button?.classList.contains("spme-icon-action")).toBe(true);
      expect(button?.classList.contains("spme-uninstall-action")).toBe(true);
      expect(button?.classList.contains("spme-source-delete-action")).toBe(true);
      expect(button?.getAttribute("aria-label")).toBe("Delete Community (stable) source");
      expect(button?.title).toBe("Delete Community (stable) source");
      const icon = button?.querySelector("svg.spme-trash-icon");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.getAttribute("viewBox")).toBe("3 3 18 18");
    };

    assertDeleteAction(".spme-source-card");
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    assertDeleteAction(".spme-source-row");
  });

  it("opens Browse filtered to the selected source from Sources Cards and Table", async () => {
    const { app } = await mountApp();
    const sourceURL = app.inventory.sources[0].url;
    await app.setTab("sources");

    const browseCard = document.querySelector('.spme-source-card [data-action="browse-source"]');
    expect(browseCard?.textContent).toBe("Browse");
    expect(browseCard?.dataset.sourceUrl).toBe(sourceURL);
    browseCard.click();

    expect(app.activeTab).toBe("browse");
    expect(app.filters.browse.source).toBe(sourceURL);
    expect(document.querySelector('[data-filter-select="browse-source"]')?.value).toBe(sourceURL);
    expect(new URL(window.location.href).searchParams.get("pluginManagerTab")).toBe("browse");

    await app.setTab("sources");
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    const browseTable = document.querySelector('.spme-source-row [data-action="browse-source"]');
    expect(browseTable?.dataset.sourceUrl).toBe(sourceURL);
    browseTable.click();

    expect(app.activeTab).toBe("browse");
    expect(app.filters.browse.source).toBe(sourceURL);
  });

  it("shows installed and enabled plugin counts for each source", async () => {
    const { app } = await mountApp();
    app.inventory.packages.push({
      ...app.inventory.packages[0],
      package_id: "disabled-from-source",
      name: "Disabled Source Plugin",
      enabled: false,
    });
    await app.setTab("sources");
    app.render();

    const values = Object.fromEntries(
      [...document.querySelectorAll('.spme-source-card[data-source-index="0"] dl > div')].map((item) => [
        item.querySelector("dt")?.textContent,
        item.querySelector("dd")?.textContent,
      ])
    );
    expect(values.Installed).toBe("2 plugins");
    expect(values.Enabled).toBe("1 plugin");
  });

  it("sorts Sources by name, package, installed, and enabled counts in both directions", async () => {
    const { app } = await mountApp();
    await app.setTab("sources");
    app.inventory.sources = [
      { name: "Zulu", url: "https://example.com/z.yml" },
      { name: "Alpha", url: "https://example.com/a.yml" },
      { name: "Mid", url: "https://example.com/m.yml" },
    ];
    app.inventory.packages = [
      { package_id: "z1", sourceURL: "https://example.com/z.yml", enabled: true },
      { package_id: "z2", sourceURL: "https://example.com/z.yml", enabled: false },
      { package_id: "a1", sourceURL: "https://example.com/a.yml", enabled: true },
    ];
    app.available.health = [
      { source: app.inventory.sources[0], ok: true, packageCount: 1 },
      { source: app.inventory.sources[1], ok: true, packageCount: 5 },
      { source: app.inventory.sources[2], ok: true, packageCount: 3 },
    ];
    const expectations = {
      name: ["Alpha", "Mid", "Zulu"],
      "name-desc": ["Zulu", "Mid", "Alpha"],
      packages: ["Zulu", "Mid", "Alpha"],
      "packages-desc": ["Alpha", "Mid", "Zulu"],
      installed: ["Mid", "Alpha", "Zulu"],
      "installed-desc": ["Zulu", "Alpha", "Mid"],
      enabled: ["Mid", "Alpha", "Zulu"],
      "enabled-desc": ["Alpha", "Zulu", "Mid"],
    };

    app.render();
    expect(document.querySelector('[data-filter-select="sources-sort"]').value).toBe("packages-desc");
    expect([...document.querySelectorAll(".spme-source-card h2")].map((heading) => heading.textContent)).toEqual(expectations["packages-desc"]);

    for (const [value, expected] of Object.entries(expectations)) {
      app.filters.sources.sort = value;
      app.render();
      expect([...document.querySelectorAll(".spme-source-card h2")].map((heading) => heading.textContent)).toEqual(expected);
    }
    expect([...document.querySelectorAll('[data-filter-select="sources-sort"] option')].map((option) => option.value)).toEqual(Object.keys(expectations));
  });

  it("renders Sources as an editable semantic table and switches back to Cards", async () => {
    const { app } = await mountApp();
    await app.setTab("sources");
    app.available.health[0] = { ...app.available.health[0], ok: false, error: "404 Not Found" };
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();

    const table = document.querySelector(".spme-source-table");
    expect([...table.querySelectorAll("th")].map((cell) => cell.textContent.trim())).toEqual([
      "Source", "Packages", "Installed", "Enabled", "Last checked", "Status", "Actions",
    ]);
    const row = table.querySelector(".spme-source-row");
    expect(row?.dataset.sourceIndex).toBe("0");
    expect(row?.id).toBe(sourceAnchorID(app.inventory.sources[0].url));
    expect(row?.querySelector('[data-label="Packages"]')?.textContent).toContain("2");
    expect(row?.querySelector(".spme-source-error details")).not.toBeNull();
    expect(document.querySelectorAll(".spme-source-card")).toHaveLength(0);

    row.querySelector('[data-action="edit-source"]').click();
    const editor = document.querySelector('.spme-source-edit-row [data-source-form]');
    expect(editor?.closest("td")?.colSpan).toBe(7);
    expect(document.activeElement).toBe(editor?.elements.name);

    document.querySelector('[data-action="set-view"][data-view-mode="cards"]').click();
    expect(document.querySelector(".spme-source-table")).toBeNull();
    expect(document.querySelector(".spme-source-card")).not.toBeNull();
  });

  it("presents source failures as compact callouts with human and technical details", async () => {
    const { app } = await mountApp();
    await app.setTab("sources");
    const diagnostic = 'listing remote packages: failed to get remote file: 404 Not Found <script>alert("x")</script>';
    app.available.health[0] = { ...app.available.health[0], ok: false, error: diagnostic };
    app.render();

    const callout = document.querySelector(".spme-source-error");
    expect(callout?.getAttribute("aria-label")).toBe("Source unavailable");
    expect(callout?.querySelector("strong")?.textContent).toBe("Source unavailable");
    expect(callout?.querySelector("p")?.textContent).toBe("Package index returned 404 Not Found.");
    expect(callout?.querySelector("details summary")?.textContent).toBe("Technical details");
    expect(callout?.querySelector("code")?.textContent).toBe(diagnostic);
    expect(callout?.querySelector("script")).toBeNull();
  });

  it("creates a temporary add-source card above the source grid", async () => {
    const { app } = await mountApp();
    await app.setTab("sources");
    expect(document.querySelector("[data-source-form]")).toBeNull();

    document.querySelector('[data-action="add-source"]').click();

    const card = document.querySelector(".spme-source-card-adding");
    const grid = document.querySelector(".spme-source-grid");
    const form = card?.querySelector("[data-source-form]");
    expect(card).not.toBeNull();
    expect(card?.nextElementSibling).toBe(grid);
    expect(form?.querySelector("h2").textContent).toBe("Add plugin source");
    expect(form?.querySelector(".spme-source-form-actions")).not.toBeNull();
    expect(document.activeElement).toBe(form?.elements.name);
    expect(document.querySelector('[data-action="add-source"]').disabled).toBe(true);

    form.querySelector('[data-action="cancel-source"]').click();
    expect(document.querySelector(".spme-source-card-adding")).toBeNull();
    expect(document.querySelector("[data-source-form]")).toBeNull();
  });

  it("expands the selected source card into an inline editor without scrolling", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { app } = await mountApp();
    await app.setTab("sources");

    document.querySelector('[data-action="edit-source"]').click();

    const card = document.querySelector('.spme-source-card-editing[data-source-index="0"]');
    const form = card?.querySelector(".spme-source-form-inline");
    expect(card).not.toBeNull();
    expect(form?.querySelector("h2").textContent).toBe("Edit plugin source");
    expect(form?.elements.name.value).toBe("Community (stable)");
    expect(document.querySelector('.spme-source-grid + .spme-source-form')).toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(form?.elements.name);

    form.querySelector('[data-action="cancel-source"]').click();
    expect(document.querySelector(".spme-source-card-editing")).toBeNull();
    expect(document.querySelector("[data-source-form]")).toBeNull();
    expect(document.querySelector('[data-action="add-source"]')).not.toBeNull();
  });

  it("saves an edited source from its expanded card without adding a duplicate", async () => {
    const { app, service } = await mountApp();
    await app.setTab("sources");
    document.querySelector('[data-action="edit-source"]').click();
    const form = document.querySelector(".spme-source-form-inline");
    form.elements.name.value = "Community edited";

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(service.saveSources).toHaveBeenCalled());
    expect(service.saveSources.mock.calls[0][0]).toHaveLength(1);
    expect(service.saveSources.mock.calls[0][0][0]).toEqual(expect.objectContaining({ name: "Community edited" }));
  });

  it("collapses configuration by plugin and shows hooks and settings on demand", async () => {
    const { app } = await mountApp();
    app.inventory.packages.push({
      ...app.inventory.packages[0],
      package_id: "disabled-config",
      name: "Disabled Config",
      enabled: false,
      plugin: {
        ...app.inventory.packages[0].plugin,
        id: "disabled-config",
        name: "Disabled Config",
      },
    });
    await app.setTab("configuration");

    expect(document.querySelector('[data-filter-select="configuration-enabled"]').value).toBe("true");
    expect(document.querySelector('[data-plugin-id="disabled-config"]')).toBeNull();
    const details = document.querySelector("details.spme-plugin-config");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain("Scene.Update.Post");
    expect(details?.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it("reveals a disabled plugin when its Configure link targets the filtered Configuration page", async () => {
    const { app } = await mountApp();
    app.inventory.packages.push({
      ...app.inventory.packages[0],
      package_id: "disabled-config",
      name: "Disabled Config",
      enabled: false,
      plugin: {
        ...app.inventory.packages[0].plugin,
        id: "disabled-config",
        name: "Disabled Config",
      },
    });
    app.render();

    document.querySelector('[data-package-id="disabled-config"] [data-action="open-configuration"]').click();

    await vi.waitFor(() => expect(app.activeTab).toBe("configuration"));
    expect(document.querySelector('[data-filter-select="configuration-enabled"]').value).toBe("false");
    const panel = document.getElementById(configurationAnchorID("disabled-config"));
    expect(panel?.open).toBe(true);
    expect(document.activeElement).toBe(panel);
  });

  it("removes a blank numeric setting instead of coercing it to zero", async () => {
    const { app, service } = await mountApp();
    await app.setTab("configuration");
    const input = document.querySelector('[data-setting="resultLimit"]');
    expect(input.value).toBe("0");
    input.value = "";

    await app.savePluginConfig("alpha");

    expect(service.configurePlugin).toHaveBeenCalledWith("alpha", { dryRun: true });
  });

  it("adds a unique source from the temporary source card and closes it after saving", async () => {
    const { app, service } = await mountApp();
    await app.setTab("sources");
    expect(document.querySelector("[data-source-form]")).toBeNull();
    document.querySelector('[data-action="add-source"]').click();
    const form = document.querySelector("[data-source-form]");
    form.elements.name.value = "Example";
    form.elements.url.value = "https://example.github.io/plugins/main/index.yml";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(service.saveSources).toHaveBeenCalled());
    expect(service.saveSources.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Example", url: "https://example.github.io/plugins/main/index.yml" }),
      ])
    );
    await vi.waitFor(() => expect(document.querySelector(".spme-source-card-adding")).toBeNull());
    expect(document.querySelector("[data-source-form]")).toBeNull();
  });

  it("keeps the temporary source card open when saving fails", async () => {
    const { app, service } = await mountApp();
    service.saveSources.mockRejectedValueOnce(new Error("Source save failed"));
    await app.setTab("sources");
    document.querySelector('[data-action="add-source"]').click();
    const form = document.querySelector("[data-source-form]");
    form.elements.name.value = "Example";
    form.elements.url.value = "https://example.github.io/plugins/main/index.yml";

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Source save failed"));
    expect(document.querySelector(".spme-source-card-adding")).not.toBeNull();
  });

  it("limits the initial Browse render and progressively loads more packages", async () => {
    const { app } = await mountApp();
    app.available = {
      health: [],
      packages: Array.from({ length: 60 }, (_, index) => ({
        package_id: `pkg-${index}`,
        name: `Package ${index}`,
        version: "1.0.0",
        sourceURL: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
        sourceName: "Community",
        trust: { level: "official", label: "Official Stash source" },
        metadata: {},
      })),
    };
    await app.setTab("browse");
    expect(document.querySelectorAll(".spme-package-card")).toHaveLength(50);
    document.querySelector('[data-action="load-more"]').click();
    expect(document.querySelectorAll(".spme-package-card")).toHaveLength(60);
  });

  it("uses the horizontal space remaining beside the settings navigation", async () => {
    const { app } = await mountApp();
    document.querySelector("#settings-container").getBoundingClientRect = () => ({ left: 240 });
    document.querySelector("#spme-root").getBoundingClientRect = () => ({ left: 700 });

    app.updateLayoutWidth();

    expect(document.querySelector("#spme-root").style.getPropertyValue("--spme-available-width")).toBe(
      `${window.innerWidth - 240 - 16}px`
    );
  });

  it("restores the untouched core page when unmounted", async () => {
    const { app } = await mountApp();
    app.unmount();

    expect(document.querySelector("#spme-root")).toBeNull();
    expect(document.querySelectorAll(".spme-core-hidden")).toHaveLength(0);
  });
});
