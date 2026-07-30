import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packageJSON = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const deployScript = await readFile(new URL("../scripts/deploy-local.mjs", import.meta.url), "utf8");
const notifyScript = await readFile(new URL("../scripts/notify-deploy.ps1", import.meta.url), "utf8");

describe("local deployment workflow", () => {
  it("builds before running the local deployment", () => {
    expect(packageJSON.scripts["deploy:local"]).toBe("npm run build && node scripts/deploy-local.mjs");
  });

  it("reloads Stash successfully before sending the notification", () => {
    const reloadConfirmation = deployScript.indexOf("payload.data?.reloadPlugins !== true");
    const notification = deployScript.indexOf("notify-deploy.ps1");
    expect(reloadConfirmation).toBeGreaterThan(-1);
    expect(notification).toBeGreaterThan(reloadConfirmation);
  });

  it("provides both a visible Windows toast and an explicit system sound", () => {
    expect(notifyScript).toContain("ToastNotificationManager");
    expect(notifyScript).toContain("Notification.Default");
    expect(notifyScript).toContain("SystemSounds");
  });
});
