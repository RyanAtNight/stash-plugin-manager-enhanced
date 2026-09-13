// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnhancedPluginManager } from "../src/app.js";
import { configurationAnchorID, installedAnchorID } from "../src/core.js";

let app;

async function mountSearch(tab = "installed", viewMode = "cards") {
  const packages = ["alpha", "beta"].map((id) => ({
    package_id: id,
    name: id,
    enabled: true,
    sourceURL: "https://example.test/index.yml",
    metadata: {},
    plugin: { id, name: id, settings: [] },
  }));
  const service = {
    loadInstalled: vi.fn().mockResolvedValue({ packages, sources: [], pluginConfig: {} }),
    loadAvailable: vi.fn().mockResolvedValue({ packages, health: [] }),
  };
  app = new EnhancedPluginManager(service);
  app.viewMode = viewMode;
  await app.mount();
  await app.setTab(tab);
  return document.querySelector(`[data-filter="${tab}"]`);
}

function type(input, value, options = {}) {
  input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, ...options }));
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/settings?tab=plugins");
  window.localStorage.clear();
  document.body.innerHTML = ["Installed Plugins", "Available Plugins", "Plugins"]
    .map((title) => `<section class="setting-section"><h1>${title}</h1></section>`).join("");
});

afterEach(() => {
  app?.unmount();
  vi.useRealTimers();
});

describe("search input", () => {
  it.each([
    ["installed", "cards"], ["installed", "table"],
    ["browse", "cards"], ["browse", "table"], ["configuration", "cards"],
  ])("waits for an idle pause in %s %s without replacing the input", async (tab, viewMode) => {
    const input = await mountSearch(tab, viewMode);
    input.focus();
    type(input, "al");
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".spme-result-count").textContent).toBe("2 results");
    type(input, "alpha");
    input.setSelectionRange(1, 3, "backward");
    vi.advanceTimersByTime(249);
    expect(document.querySelector(".spme-result-count").textContent).toBe("2 results");
    vi.advanceTimersByTime(1);
    expect(document.querySelector(".spme-result-count").textContent).toBe("1 result");
    expect(document.querySelector(`[data-filter="${tab}"]`)).toBe(input);
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([1, 3, "backward"]);
    expect(document.querySelector('[data-package-id="beta"]')).toBeNull();
  });

  it("keeps Backspace repeat on the same connected input through clearing and a new search", async () => {
    const input = await mountSearch();
    input.focus();
    type(input, "alpha");
    vi.advanceTimersByTime(250);
    type(input, "alph", { inputType: "deleteContentBackward" });
    // The initial key-repeat delay can be longer than the debounce delay.
    vi.advanceTimersByTime(500);
    expect(document.activeElement).toBe(input);
    for (const value of ["alp", "al", "a", ""]) {
      type(input, value, { inputType: "deleteContentBackward" });
      vi.advanceTimersByTime(30);
      expect(document.querySelector(".spme-result-count").textContent).toBe("1 result");
    }
    vi.advanceTimersByTime(220);
    expect(document.querySelector(".spme-result-count").textContent).toBe("2 results");
    type(input, "beta");
    vi.advanceTimersByTime(250);
    expect(document.querySelector('[data-package-id="alpha"]')).toBeNull();
    expect(document.querySelector('[data-package-id="beta"]')).not.toBeNull();
  });

  it("waits until text composition has ended", async () => {
    const input = await mountSearch();
    type(input, "a");
    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    type(input, "alpha", { isComposing: true });
    vi.advanceTimersByTime(1000);
    expect(document.querySelector(".spme-result-count").textContent).toBe("2 results");
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    vi.advanceTimersByTime(250);
    expect(document.querySelector(".spme-result-count").textContent).toBe("1 result");
  });

  it("does not steal focus when search finishes after focusing another control", async () => {
    const input = await mountSearch();
    type(input, "alpha");
    const sort = document.querySelector('[data-filter-select="installed-sort"]');
    sort.focus();
    vi.advanceTimersByTime(250);
    expect(document.activeElement).toBe(sort);
  });

  it.each(["installed", "configuration"])("lets a new search replace a %s deep link", async (tab) => {
    const input = await mountSearch(tab);
    const anchor = tab === "installed" ? installedAnchorID("alpha") : configurationAnchorID("alpha");
    window.history.replaceState({}, "", `/settings?tab=plugins&pluginManagerTab=${tab}#${anchor}`);
    app.syncFromURL();
    input.focus();
    type(input, "beta");
    vi.advanceTimersByTime(250);
    app.syncFromURL();
    expect(window.location.hash).toBe("");
    expect(input.value).toBe("beta");
    expect(document.activeElement).toBe(input);
    expect(document.querySelector('[data-package-id="alpha"]')).toBeNull();
  });

  it("cancels pending work on navigation and unmount while retaining the query", async () => {
    const input = await mountSearch();
    type(input, "alpha");
    await app.setTab("configuration");
    const configurationInput = document.querySelector('[data-filter="configuration"]');
    configurationInput.focus();
    vi.advanceTimersByTime(250);
    expect(document.activeElement).toBe(configurationInput);
    expect(document.querySelector(".spme-result-count").textContent).toBe("2 results");
    await app.setTab("installed");
    expect(document.querySelector('[data-filter="installed"]').value).toBe("alpha");
    type(document.querySelector('[data-filter="installed"]'), "beta");
    app.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("updates selection counts and actions along with the filtered results", async () => {
    await mountSearch();
    const checkbox = document.querySelector('[data-key="alpha"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    const input = document.querySelector('[data-filter="installed"]');
    type(input, "beta");
    vi.advanceTimersByTime(250);
    expect(document.querySelector('[data-action="uninstall-selected"]').disabled).toBe(true);
    expect(document.querySelector(".spme-toolbar").textContent).not.toContain("selected plugin");
    type(input, "");
    vi.advanceTimersByTime(250);
    expect(document.querySelector('[data-action="uninstall-selected"]').textContent).toBe("Uninstall selected (1)");
    expect(document.querySelector(".spme-toolbar").textContent).toContain("1 selected plugin");
  });

  it("resets Browse pagination and updates Load more and empty results", async () => {
    await mountSearch("browse", "table");
    app.available.packages = Array.from({ length: 101 }, (_, index) => ({
      package_id: `plugin-${index}`, name: `Plugin ${index}`, sourceURL: "https://example.test/index.yml", metadata: {},
    }));
    app.browseLimit = 100;
    app.render();
    const input = document.querySelector('[data-filter="browse"]');
    type(input, "Plugin");
    vi.advanceTimersByTime(250);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(50);
    expect(document.querySelector('[data-action="load-more"]').textContent).toContain("51 remaining");
    type(input, "no match");
    vi.advanceTimersByTime(250);
    expect(document.querySelector(".spme-empty")).not.toBeNull();
    expect(document.querySelector('[data-action="load-more"]')).toBeNull();
  });
});
