// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnhancedPluginManager } from "../src/app.js";

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
          source_package: { version: "1.1.0" },
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
  it("replaces the three core sections with four focused tabs", async () => {
    await mountApp();

    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect([...document.querySelectorAll('[role="tab"]')].map((node) => node.textContent)).toEqual([
      expect.stringContaining("Installed"),
      expect.stringContaining("Browse"),
      expect.stringContaining("Sources"),
      expect.stringContaining("Configuration"),
    ]);
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
      "spme-col-source",
      "spme-col-status",
      "spme-col-actions",
    ]);
    expect(row.querySelector('[data-action="install-one"]')).not.toBeNull();
    expect(row.querySelector('a[aria-label="Open Beta Helper GitHub repository"]')).not.toBeNull();
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

  it("opens installed and available GitHub repositories in a new tab", async () => {
    const { app } = await mountApp();

    let link = document.querySelector('a[aria-label="Open Alpha Tool GitHub repository"]');
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toContain("noopener");

    await app.setTab("browse");
    link = document.querySelector('a[aria-label="Open Beta Helper GitHub repository"]');
    expect(link?.href).toContain("github.com");
    expect(link?.target).toBe("_blank");
  });

  it("renders source health, trust, URL, and package count separately from browsing", async () => {
    const { app } = await mountApp();
    await app.setTab("sources");

    expect(document.body.textContent).toContain("Healthy");
    expect(document.body.textContent).toContain("Official Stash source");
    expect(document.body.textContent).toContain("2 packages");
    expect(document.querySelector('a[href$="index.yml"]')).not.toBeNull();
  });

  it("reveals and focuses the populated source form when Edit is clicked", async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { app } = await mountApp();
    await app.setTab("sources");

    document.querySelector('[data-action="edit-source"]').click();

    expect(document.querySelector(".spme-source-form h2").textContent).toBe("Edit plugin source");
    expect(document.querySelector('.spme-source-form [name="name"]').value).toBe("Community (stable)");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(document.activeElement).toBe(document.querySelector('.spme-source-form [name="name"]'));
  });

  it("collapses configuration by plugin and shows hooks and settings on demand", async () => {
    const { app } = await mountApp();
    await app.setTab("configuration");

    const details = document.querySelector("details.spme-plugin-config");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain("Scene.Update.Post");
    expect(details?.querySelector('input[type="checkbox"]')).not.toBeNull();
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

  it("adds a unique source from the dedicated source form", async () => {
    const { app, service } = await mountApp();
    await app.setTab("sources");
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
