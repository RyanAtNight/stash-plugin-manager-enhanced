import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await build({
  entryPoints: ["src/index.js"],
  outfile: "dist/stash-plugin-manager-enhanced.js",
  bundle: true,
  format: "iife",
  target: ["chrome110", "firefox110"],
  minify: false,
  sourcemap: true,
  legalComments: "none",
});

await cp("src/styles.css", "dist/stash-plugin-manager-enhanced.css");
await cp("plugin/stash-plugin-manager-enhanced.yml", "dist/stash-plugin-manager-enhanced.yml");
