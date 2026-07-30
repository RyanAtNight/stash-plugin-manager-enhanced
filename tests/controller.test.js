// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PluginPageController } from "../src/controller.js";

describe("PluginPageController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("mounts only on Settings > Plugins and unmounts when leaving", async () => {
    let href = "http://stash.local/settings?tab=plugins";
    const app = { mount: vi.fn().mockResolvedValue(true), unmount: vi.fn() };
    const controller = new PluginPageController({
      createApp: () => app,
      getHref: () => href,
      document,
      observe: false,
    });

    await controller.sync();
    expect(app.mount).toHaveBeenCalledOnce();

    href = "http://stash.local/settings?tab=tools";
    await controller.sync();
    expect(app.unmount).toHaveBeenCalledOnce();
  });

  it("retries mounting when the SPA has not rendered the core sections yet", async () => {
    const app = {
      mount: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      unmount: vi.fn(),
    };
    const controller = new PluginPageController({
      createApp: () => app,
      getHref: () => "http://stash.local/settings?tab=plugins",
      document,
      observe: false,
    });

    await controller.sync();
    await controller.sync();

    expect(app.mount).toHaveBeenCalledTimes(2);
  });

  it("injects a persisted enhancement switch directly below the Plugins navigation item", async () => {
    document.body.innerHTML = `<div id="settings-menu-container"><div class="nav"><div id="plugins-nav" class="nav-item"><a href="/settings?tab=plugins">Plugins</a></div><div class="nav-item">Logs</div></div></div>`;
    const app = { mount: vi.fn().mockResolvedValue(true), unmount: vi.fn() };
    const controller = new PluginPageController({
      createApp: () => app,
      getHref: () => "http://stash.local/settings?tab=plugins",
      document,
      eventTarget: window,
      storage: window.localStorage,
      observe: false,
    });

    await controller.sync();

    const control = document.querySelector("#spme-enhancement-control");
    const input = control?.querySelector("#spme-enhancement-enabled");
    expect(control?.previousElementSibling?.id).toBe("plugins-nav");
    expect(input?.checked).toBe(true);
    expect(input?.classList.contains("custom-control-input")).toBe(true);
    expect(control?.querySelector(".custom-control.custom-switch")).not.toBeNull();
    expect(control?.querySelector('label.custom-control-label[for="spme-enhancement-enabled"]')).not.toBeNull();
    expect(control?.textContent).toContain("Enhanced Plugins UI");
    expect(app.mount).toHaveBeenCalledOnce();
  });

  it("restores stock UI immediately and persists the sidebar kill switch", async () => {
    document.body.innerHTML = `<div id="settings-menu-container"><div class="nav"><div id="plugins-nav" class="nav-item"><a href="/settings?tab=plugins">Plugins</a></div></div></div>`;
    const app = { mount: vi.fn().mockResolvedValue(true), unmount: vi.fn() };
    const controller = new PluginPageController({
      createApp: () => app,
      getHref: () => "http://stash.local/settings?tab=plugins",
      document,
      eventTarget: window,
      storage: window.localStorage,
      observe: false,
    });
    await controller.sync();
    const input = document.querySelector("#spme-enhancement-enabled");

    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(app.unmount).toHaveBeenCalled());
    expect(window.localStorage.getItem("spme.enhancementEnabled")).toBe("false");
    await controller.sync();
    expect(app.mount).toHaveBeenCalledOnce();

    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(app.mount).toHaveBeenCalledTimes(2));
    expect(window.localStorage.getItem("spme.enhancementEnabled")).toBe("true");
  });

  it("keeps the kill switch usable when enhancement mounting fails", async () => {
    document.body.innerHTML = `<div id="settings-menu-container"><div class="nav"><div class="nav-item"><a href="/settings?tab=plugins">Plugins</a></div></div></div>`;
    const app = { mount: vi.fn().mockRejectedValue(new Error("Stash UI changed")), unmount: vi.fn() };
    const controller = new PluginPageController({
      createApp: () => app,
      getHref: () => "http://stash.local/settings?tab=plugins",
      document,
      storage: window.localStorage,
      observe: false,
    });

    await expect(controller.sync()).resolves.toBeUndefined();

    expect(controller.lastError?.message).toBe("Stash UI changed");
    expect(app.unmount).toHaveBeenCalled();
    expect(document.querySelector("#spme-enhancement-enabled")).not.toBeNull();
  });

  it("honors a persisted disabled state without mounting the enhancement", async () => {
    document.body.innerHTML = `<div id="settings-menu-container"><div class="nav"><div class="nav-item"><a href="/settings?tab=plugins">Plugins</a></div></div></div>`;
    window.localStorage.setItem("spme.enhancementEnabled", "false");
    const createApp = vi.fn();
    const controller = new PluginPageController({
      createApp,
      getHref: () => "http://stash.local/settings?tab=plugins",
      document,
      storage: window.localStorage,
      observe: false,
    });

    await controller.sync();

    expect(createApp).not.toHaveBeenCalled();
    expect(document.querySelector("#spme-enhancement-enabled")?.checked).toBe(false);
  });
});
