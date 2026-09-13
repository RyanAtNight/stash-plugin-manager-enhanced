// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnhancedPluginManager } from "../src/app.js";
import { PluginPageController } from "../src/controller.js";

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

const setting = (id, name = "limit") => document.querySelector(`[data-plugin="${id}"][data-setting="${name}"]`);

it("blocks overlapping mutations and refreshes while leaving tabs and search usable", async () => {
  const { service } = await setup();
  let reject;
  const pending = app.runOperation("First", () => new Promise((_resolve, fail) => { reject = fail; }));
  const second = vi.fn();
  expect(await app.runOperation("Second", second)).toBe(false);
  expect(second).not.toHaveBeenCalled();
  expect(app.busy).toBe(true);
  app.filters.installed.query = "alpha"; app.renderSearchResults("installed");
  expect(document.querySelector('[data-action="uninstall-one"]').disabled).toBe(true);
  expect(document.querySelector('[data-filter="installed"]').disabled).toBe(false);
  await app.refresh();
  expect(service.loadInstalled).toHaveBeenCalledTimes(1);
  await app.setTab("browse");
  expect(document.querySelector('[data-action="install-one"]').disabled).toBe(true);
  await app.setTab("sources");
  expect(document.querySelector('[data-action="delete-source"]').disabled).toBe(true);
  await click("delete-source");
  await app.submitSourceForm({});
  expect(service.saveSources).not.toHaveBeenCalled();
  await app.setTab("configuration");
  expect(document.querySelector('[data-action="save-config"]').disabled).toBe(true);
  await app.savePluginConfig("alpha");
  expect(service.configurePlugin).not.toHaveBeenCalled();
  reject(new Error("failed"));
  expect(await pending).toBe(false);
  expect(app.busy).toBe(false);
  expect(document.querySelector('[data-action="save-config"]').disabled).toBe(false);
  expect(await app.runOperation("Next", async () => true, { checkUpdatesAfter: false })).toBe(true);
});

it("holds the operation lock through dependency discovery, install and enable", async () => {
  const { service, inventory, catalog } = await setup();
  inventory.packages[0].enabled = false;
  inventory.packages[0].requires = ["gamma"];
  app.acceptInventory(structuredClone(inventory)); app.render();
  let finishCatalog;
  service.loadAvailable.mockImplementationOnce(() => new Promise((resolve) => { finishCatalog = () => resolve({ packages: catalog, health: [] }); }));
  service.install.mockImplementation(async (packages) => {
    expect(app.busy).toBe(true);
    expect(await app.runOperation("Unrelated", async () => true)).toBe(false);
    inventory.packages.push(...packages.map((pkg) => ({ ...pkg, enabled: false })));
    return true;
  });
  service.setEnabled.mockImplementation(async (id, enabled) => {
    expect(app.busy).toBe(true);
    inventory.packages.find((pkg) => pkg.package_id === id).enabled = enabled;
    return true;
  });
  const pending = app.enablePlugin(app.packageByID("alpha"));
  expect(app.busy).toBe(true);
  expect(await app.enablePlugin(app.packageByID("alpha"))).toBe(false);
  expect(service.loadAvailable).toHaveBeenCalledTimes(1);
  finishCatalog();
  expect(await pending).toBe(true);
  expect(service.setEnabled.mock.calls).toEqual([["gamma", true], ["alpha", true]]);
  expect(app.busy).toBe(false);
});

it("holds the same lock throughout orphan dependency cleanup", async () => {
  const { service, inventory } = await setup();
  inventory.packages[0].requires = ["beta"];
  app.acceptInventory(structuredClone(inventory)); app.render();
  service.uninstall.mockImplementation(async (packages) => {
    expect(app.busy).toBe(true);
    expect(await app.runOperation("Unrelated", async () => true)).toBe(false);
    inventory.packages = inventory.packages.filter((pkg) => !packages.some((removed) => removed.package_id === pkg.package_id));
    return true;
  });
  await click("uninstall-one");
  expect(service.uninstall.mock.calls.map(([packages]) => packages[0].package_id)).toEqual(["alpha", "beta"]);
  expect(app.busy).toBe(false);
});

it("drops a draft when an edit is reverted before the next redraw", async () => {
  await setup(); await app.setTab("configuration");
  setting("alpha").value = "17";
  setting("alpha").dispatchEvent(new Event("input", { bubbles: true }));
  setting("alpha").value = "1";
  setting("alpha").dispatchEvent(new Event("input", { bubbles: true }));
  app.render();
  expect(setting("alpha").value).toBe("1");
});

it("retains configuration drafts and expanded panels through filtering and navigation", async () => {
  await setup();
  await app.setTab("configuration");
  app.message = { type: "info", text: "Earlier operation" }; app.render();
  document.querySelector('[data-plugin-id="alpha"]').open = true;
  setting("alpha").value = "17";
  setting("alpha", "enabled").checked = true;
  await click("dismiss-message");
  expect(setting("alpha").value).toBe("17");
  expect(setting("alpha", "enabled").checked).toBe(true);
  expect(document.querySelector('[data-plugin-id="alpha"]').open).toBe(true);
  app.filters.configuration.query = "beta";
  app.renderSearchResults("configuration");
  expect(setting("alpha")).toBeNull();
  await app.setTab("installed");
  app.filters.configuration.query = "";
  await app.setTab("configuration");
  expect(setting("alpha").value).toBe("17");
  expect(document.querySelector('[data-plugin-id="alpha"]').open).toBe(true);
});

it("keeps other drafts on save and retains failed drafts until saved or reset", async () => {
  const { service, inventory } = await setup();
  await app.setTab("configuration");
  setting("alpha").value = "17"; setting("beta").value = "23";
  service.configurePlugin.mockRejectedValueOnce(new Error("offline"));
  await app.savePluginConfig("alpha");
  expect(setting("alpha").value).toBe("17");
  expect(app.inventory.pluginConfig.alpha.limit).toBe(1);
  await app.savePluginConfig("alpha");
  expect(setting("beta").value).toBe("23");
  inventory.pluginConfig.alpha.limit = 99;
  await app.refresh({ checkUpdates: false });
  expect(setting("alpha").value).toBe("99");
  expect(setting("beta").value).toBe("23");
  service.configurePlugin.mockRejectedValueOnce(new Error("offline"));
  await app.onClick({ target: document.querySelector('[data-action="reset-config"][data-id="beta"]') });
  expect(setting("beta").value).toBe("23");
  await app.onClick({ target: document.querySelector('[data-action="reset-config"][data-id="beta"]') });
  expect(setting("beta").value).toBe("");
});

it("retains edits made while a configuration save is pending", async () => {
  const { service, inventory } = await setup();
  await app.setTab("configuration");
  let finish;
  service.configurePlugin.mockImplementationOnce((id, value) => new Promise((resolve) => {
    finish = () => { inventory.pluginConfig[id] = value; resolve(value); };
  }));
  setting("alpha").value = "17";
  const saving = app.savePluginConfig("alpha");
  setting("alpha").value = "21";
  setting("alpha").dispatchEvent(new Event("input", { bubbles: true }));
  finish(); await saving;
  expect(app.inventory.pluginConfig.alpha.limit).toBe(17);
  expect(setting("alpha").value).toBe("21");
});

it("remounts and rebinds controls after the host replaces its settings subtree", async () => {
  const { service } = await setup({ mount: false });
  const controller = new PluginPageController({ createApp: () => app, observe: false });
  await controller.sync();
  const oldRoot = app.root;
  document.body.innerHTML = ["Installed Plugins", "Available Plugins", "Plugins"]
    .map((title) => `<section class="setting-section"><h1>${title}</h1></section>`).join("");
  await controller.sync();
  expect(app.root).not.toBe(oldRoot);
  expect(app.root.isConnected).toBe(true);
  expect(document.querySelectorAll(".spme-core-hidden")).toHaveLength(3);
  expect(service.loadInstalled).toHaveBeenCalledTimes(2);
  document.querySelector('[data-action="set-view"][data-view-mode="table"]').click();
  expect(app.viewMode).toBe("table");
  controller.stop();
});

it("does not leave a late mount active after navigation away", async () => {
  const { service, inventory } = await setup({ mount: false });
  let resolve;
  service.loadInstalled.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const controller = new PluginPageController({ createApp: () => app, observe: false });
  const mounting = controller.sync();
  window.history.replaceState({}, "", "/settings?tab=tools");
  await controller.sync();
  resolve(structuredClone(inventory));
  await mounting;
  expect(app.isMounted()).toBe(false);
  expect(controller.mounted).toBe(false);
  controller.stop();
});

it("invalidates Browse after Installed changes and prunes obsolete selections", async () => {
  const { inventory } = await setup();
  await app.setTab("browse");
  app.selectedAvailable.add(`${source.url}|gamma`);
  app.selectedInstalled.add("beta");
  await app.setTab("installed");
  inventory.packages = [packageFixture("alpha"), packageFixture("gamma")];
  await app.runOperation("Install dependency", async () => true, { checkUpdatesAfter: false });
  expect(app.selectedAvailable.size).toBe(0);
  expect(app.selectedInstalled.size).toBe(0);
  await app.setTab("browse");
  expect(app.available.packages.map((pkg) => pkg.package_id)).toEqual(["delta"]);
  app.filters.browse.source = source.url;
  app.selectedAvailable.add(`${source.url}|delta`);
  await app.setTab("installed");
  inventory.sources = [];
  await app.refresh({ checkUpdates: false });
  expect(app.filters.browse.source).toBe("");
  expect(app.selectedAvailable.size).toBe(0);
});

it("discards delayed catalog results after inventory changes", async () => {
  const { service, inventory } = await setup();
  let resolveOld;
  service.loadAvailable.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const oldLoad = app.loadAvailable();
  inventory.packages.push(packageFixture("gamma"));
  await app.refresh({ checkUpdates: false });
  await app.setTab("browse");
  resolveOld({ packages: [packageFixture("gamma")], health: [] });
  await oldLoad;
  expect(app.available.packages.map((pkg) => pkg.package_id)).toEqual(["delta"]);
});

it("retries a rejected initial request and replaces the error shell", async () => {
  const { service } = await setup({ mount: false });
  service.loadInstalled.mockRejectedValueOnce(new Error("offline"));
  expect(await app.mount()).toBe(false);
  expect(document.querySelector('[data-action="retry"]')).not.toBeNull();
  await click("retry");
  expect(service.loadInstalled).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll("#spme-root")).toHaveLength(1);
  expect(document.querySelectorAll(".spme-core-hidden")).toHaveLength(3);
  expect(document.querySelector('[data-action="retry"]')).toBeNull();
  expect(document.querySelector('[data-filter="installed"]')).not.toBeNull();
});

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
