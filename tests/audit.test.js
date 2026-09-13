// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnhancedPluginManager } from "../src/app.js";

let app;
const source = { name: "Example", url: "https://example.test/index.yml" };
const packageFixture = (id) => ({
  package_id: id, name: id, enabled: true, version: "1", status: "update",
  sourceURL: source.url, sourceName: source.name, metadata: {},
  plugin: { id, name: id, settings: [{ name: "limit", type: "NUMBER" }, { name: "enabled", type: "BOOLEAN" }] },
});

async function setup({ mount = true } = {}) {
  const inventory = { packages: [packageFixture("alpha"), packageFixture("beta")], sources: [source], pluginConfig: { alpha: { limit: 1 }, beta: { limit: 2 } } };
  const catalog = [packageFixture("gamma"), packageFixture("delta")];
  const service = {
    loadInstalled: vi.fn(async () => structuredClone(inventory)),
    loadAvailable: vi.fn(async (_sources, installedIDs) => ({ packages: structuredClone(catalog.filter((pkg) => !installedIDs.has(pkg.package_id))), health: [] })),
    configurePlugin: vi.fn(async (id, input) => { inventory.pluginConfig[id] = structuredClone(input); return input; }),
    saveSources: vi.fn(async (sources) => { inventory.sources = structuredClone(sources); return sources; }),
    update: vi.fn(async () => true), install: vi.fn(async () => true), uninstall: vi.fn(async () => true),
    setEnabled: vi.fn(async () => true), reloadPlugins: vi.fn(async () => true),
  };
  app = new EnhancedPluginManager(service, { confirm: vi.fn(() => true) });
  if (mount) await app.mount();
  return { app, service, inventory, catalog };
}

const click = (action) => app.onClick({ target: document.querySelector(`[data-action="${action}"]`) });

it.each(["cards", "table"])("uses parsed source provenance even for failed and empty catalogs in %s", async (view) => {
  await setup();
  app.viewMode = view;
  app.inventory.sources = [
    { name: "Fake official", url: "https://example.test/stashapp.github.io/CommunityScripts/index.yml" },
    { name: "Fake community", url: "https://github.evil.test/index.yml" },
    { name: "Official", url: "https://stashapp.github.io/CommunityScripts/stable/index.yml" },
  ];
  app.available = { packages: [], health: [] };
  await app.setTab("sources");
  expect(document.querySelectorAll(".spme-trust-official")).toHaveLength(1);
  expect(document.querySelectorAll(".spme-trust-unverified")).toHaveLength(2);
  expect(document.querySelectorAll(".spme-trust-community")).toHaveLength(0);
});

it("preserves first-seen dates and records installs and uninstalls after operations", async () => {
  const { inventory } = await setup();
  const firstSeen = app.inventory.packages[0].installedAt;
  app.now = () => firstSeen + 1000;
  inventory.packages.push(packageFixture("gamma"));
  await app.runOperation("Install", async () => true, { checkUpdatesAfter: false });
  expect(app.packageByID("alpha").installedAt).toBe(firstSeen);
  expect(app.packageByID("gamma").installedAt).toBe(firstSeen + 1000);
  inventory.packages = inventory.packages.filter((pkg) => pkg.package_id !== "gamma");
  await app.runOperation("Uninstall", async () => true, { checkUpdatesAfter: false });
  expect(app.installDates.gamma).toBeUndefined();
  inventory.packages.push(packageFixture("gamma"));
  app.now = () => firstSeen + 2000;
  await app.runOperation("Reinstall", async () => true, { checkUpdatesAfter: false });
  expect(app.packageByID("gamma").installedAt).toBe(firstSeen + 2000);
});

it("does not promote a failed configuration save into confirmed state", async () => {
  const { service } = await setup();
  await app.setTab("configuration");
  document.querySelector('[data-plugin="alpha"][data-setting="limit"]').value = "17";
  service.configurePlugin.mockRejectedValueOnce(new Error("offline"));
  await app.savePluginConfig("alpha");
  expect(app.message.type).toBe("error");
  expect(app.inventory.pluginConfig.alpha.limit).toBe(1);
  document.querySelector('[data-plugin="alpha"][data-setting="limit"]').value = "19";
  await app.savePluginConfig("alpha");
  expect(app.inventory.pluginConfig.alpha.limit).toBe(19);
});

it("keeps sources and catalog on failed deletion and uses refreshed sources on success", async () => {
  const { service, inventory } = await setup();
  await app.setTab("sources");
  const available = app.available;
  service.saveSources.mockRejectedValueOnce(new Error("offline"));
  await click("delete-source");
  expect(app.message.type).toBe("error");
  expect(app.inventory.sources).toEqual([source]);
  expect(app.available).toBe(available);
  service.saveSources.mockImplementationOnce(async () => {
    inventory.sources = [{ name: "Concurrent addition", url: "https://other.test/index.yml" }];
    return inventory.sources;
  });
  await click("delete-source");
  expect(app.inventory.sources).toEqual(inventory.sources);
  expect(document.querySelector(".spme-source-card").textContent).toContain("Concurrent addition");
});

beforeEach(() => {
  window.history.replaceState({}, "", "/settings?tab=plugins");
  window.localStorage.clear();
  document.body.innerHTML = ["Installed Plugins", "Available Plugins", "Plugins"]
    .map((title) => `<section class="setting-section"><h1>${title}</h1></section>`).join("");
});
afterEach(() => { app?.unmount(); vi.useRealTimers(); });

it.each(["cards", "table"])("limits bulk mutations to matching selections in %s", async (view) => {
  const { service } = await setup();
  app.viewMode = view;
  app.selectedInstalled = new Set(["alpha", "beta"]);
  app.filters.installed.query = "alpha";
  app.render();
  expect(document.querySelector('[data-action="update-selected"]').textContent).toBe("Update selected (1)");
  expect(document.querySelector(".spme-selected-count").textContent).toContain("1 selection hidden by filters");
  await click("update-selected");
  expect(service.update.mock.calls[0][0].map((pkg) => pkg.package_id)).toEqual(["alpha"]);
  await click("uninstall-selected");
  expect(service.uninstall.mock.calls[0][0].map((pkg) => pkg.package_id)).toEqual(["alpha"]);
  expect(app.confirm.mock.calls[0][0]).not.toContain("beta");
  await app.setTab("browse");
  app.selectedAvailable = new Set(app.available.packages.map((pkg) => `${pkg.sourceURL}|${pkg.package_id}`));
  app.filters.browse.query = "gamma";
  app.render();
  await click("install-selected");
  expect(service.install.mock.calls[0][0].map((pkg) => pkg.package_id)).toEqual(["gamma"]);
  app.filters.browse.query = "missing";
  app.render();
  await click("install-selected");
  expect(service.install).toHaveBeenCalledTimes(1);
});
