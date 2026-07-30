// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { PluginPageController } from "../src/controller.js";

describe("PluginPageController", () => {
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
});
