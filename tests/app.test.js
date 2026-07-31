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

async function mountApp() {
  pageFixture();
  const service = serviceFixture();
  const app = new EnhancedPluginManager(service, { confirm: () => true });
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
    expect(document.querySelector('[data-package-id="alpha"] time[data-last-commit]')?.dateTime).toBe("2025-03-01T00:00:00.000Z");

    let sort = document.querySelector('[data-filter-select="installed-sort"]');
    sort.value = "last-commit";
    sort.dispatchEvent(new Event("change", { bubbles: true }));
    expect(cardOrder()).toEqual(["zulu", "alpha"]);
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    expect(rowOrder()).toEqual(["zulu", "alpha"]);
    expect(document.querySelector('[data-package-id="alpha"] [data-label="Last commit"] time[data-last-commit]')).not.toBeNull();
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
    expect(document.querySelector('[data-package-id="beta"] time[data-last-commit]')?.dateTime).toBe("2025-02-01T00:00:00.000Z");

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

  it("dismisses alert messages from an accessible close button", async () => {
    const { app } = await mountApp();
    app.message = { type: "success", text: "Plugin operation completed." };
    app.render();

    const alert = document.querySelector(".spme-alert");
    const dismiss = alert?.querySelector('[data-action="dismiss-message"]');
    expect(alert?.querySelector(".spme-alert-content")?.textContent).toBe("Plugin operation completed.");
    expect(dismiss?.getAttribute("aria-label")).toBe("Dismiss notification");

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
    expect(enabledPlugin.querySelector(".spme-enabled")?.textContent).toBe("Enabled");
    expect(enabledPlugin.querySelector('[data-action="toggle-enabled"]')?.classList.contains("spme-disable-action")).toBe(true);
    let plugin = document.querySelector('[data-package-id="dev-helper"]');
    expect(plugin.querySelector(".spme-runtime-only")?.textContent).toBe("Runtime-only");
    expect(plugin.querySelector('[data-select-package="installed"]').disabled).toBe(true);
    expect(plugin.querySelector('[data-action="toggle-enabled"]')?.textContent).toBe("Enable");
    expect(plugin.querySelector('[data-action="toggle-enabled"]')?.classList.contains("spme-enable-action")).toBe(true);
    expect(plugin.querySelector(".spme-disabled")?.textContent).toBe("Disabled");
    expect(plugin.querySelector('[data-action="update-one"]')).toBeNull();
    expect(plugin.querySelector('[data-action="uninstall-one"]')).toBeNull();

    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    plugin = document.querySelector('.spme-package-table [data-package-id="dev-helper"]');
    expect(plugin.querySelector(".spme-runtime-only")).not.toBeNull();
    expect(plugin.querySelector('[data-select-package="installed"]').disabled).toBe(true);
    expect(plugin.querySelector('[data-action="update-one"]')).toBeNull();
    expect(plugin.querySelector('[data-action="uninstall-one"]')).toBeNull();
    expect(plugin.querySelector('[data-action="toggle-enabled"]')?.classList.contains("spme-enable-action")).toBe(true);

    plugin.querySelector('[data-action="toggle-enabled"]').click();
    await vi.waitFor(() => expect(service.setEnabled).toHaveBeenCalledWith("dev-helper", true));
  });

  it("opens installed and available GitHub repositories in a new tab", async () => {
    const { app } = await mountApp();

    const expectGitHubButton = (link) => {
      expect(link?.querySelector("svg.spme-github-icon")?.getAttribute("aria-hidden")).toBe("true");
      expect(link?.querySelector(".spme-github-label")?.textContent).toBe("GitHub");
      expect(link?.querySelector(".spme-external-icon")?.textContent).toBe("↗");
    };

    let link = document.querySelector('a[aria-label="Open Alpha Tool GitHub repository"]');
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");
    expectGitHubButton(link);

    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    link = document.querySelector('a[aria-label="Open Alpha Tool GitHub repository"]');
    expectGitHubButton(link);

    await app.setTab("browse");
    link = document.querySelector('a[aria-label="Open Beta Helper GitHub repository"]');
    expect(link?.href).toContain("github.com");
    expect(link?.target).toBe("_blank");
    expectGitHubButton(link);

    document.querySelector('[data-action="set-view"][data-view-mode="cards"]').click();
    link = document.querySelector('a[aria-label="Open Beta Helper GitHub repository"]');
    expectGitHubButton(link);
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

    expect(document.querySelector('[data-package-id="alpha"] [data-action="open-configuration"]')).not.toBeNull();
    expect(document.querySelector('[data-package-id="plain"] [data-action="open-configuration"]')).toBeNull();
    document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
    const configure = document.querySelector('[data-package-id="alpha"] [data-action="open-configuration"]');
    expect(configure?.textContent).toBe("Configure");
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
    expect(document.body.textContent).toContain("Official Stash source");
    expect(document.body.textContent).toContain("2 packages");
    expect(document.querySelector('a[href$="index.yml"]')).not.toBeNull();
    const repository = document.querySelector('a[aria-label="Open Community (stable) GitHub repository"]');
    expect(repository?.querySelector("svg.spme-github-icon")?.getAttribute("aria-hidden")).toBe("true");
    expect(repository?.querySelector(".spme-github-label")?.textContent).toBe("GitHub");
    expect(repository?.querySelector(".spme-external-icon")?.textContent).toBe("↗");
    expect(repository?.href).toBe("https://github.com/stashapp/CommunityScripts");
    expect(repository?.target).toBe("_blank");
    expect(repository?.rel).toContain("noopener");
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
