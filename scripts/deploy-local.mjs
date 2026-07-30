import { cp, mkdir, readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = process.env.STASH_CONFIG_DIR || path.join(process.env.USERPROFILE || "C:/Users/Ryan", "stash-config");
const pluginDir = path.join(configDir, "plugins", "stash-plugin-manager-enhanced");
const stashURL = (process.env.STASH_URL || "http://localhost:9999").replace(/\/$/, "");

const config = await readFile(path.join(configDir, "config.yml"), "utf8");
const apiKey = config.match(/^api_key:\s*(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error(`No api_key found in ${path.join(configDir, "config.yml")}`);

const distDir = path.join(repoRoot, "dist");
const files = (await readdir(distDir)).filter((name) => name.startsWith("stash-plugin-manager-enhanced."));
if (!files.some((name) => name.endsWith(".yml")) || !files.some((name) => name.endsWith(".js")) || !files.some((name) => name.endsWith(".css"))) {
  throw new Error("The dist directory does not contain a complete plugin build.");
}

await mkdir(pluginDir, { recursive: true });
await Promise.all(files.map((name) => cp(path.join(distDir, name), path.join(pluginDir, name))));
console.log(`Deployed ${files.length} files to ${pluginDir}`);

const response = await fetch(`${stashURL}/graphql`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ApiKey: apiKey },
  body: JSON.stringify({ query: "mutation { reloadPlugins }" }),
});
if (!response.ok) throw new Error(`Stash reload request failed with HTTP ${response.status}.`);
const payload = await response.json();
if (payload.errors?.length || payload.data?.reloadPlugins !== true) {
  throw new Error(`Stash did not confirm plugin reload: ${JSON.stringify(payload.errors ?? payload.data)}`);
}
console.log("Stash plugin reload succeeded.");

const notifier = path.join(repoRoot, "scripts", "notify-deploy.ps1");
const notification = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    notifier,
    "-Title",
    "Stash plugin deployed",
    "-Message",
    "Plugin Manager Enhanced was built, copied, and reloaded successfully.",
  ],
  { encoding: "utf8", windowsHide: true }
);
if (notification.status !== 0) {
  throw new Error(`Deployment succeeded, but notification failed: ${(notification.stderr || notification.stdout).trim()}`);
}
process.stdout.write(notification.stdout);
