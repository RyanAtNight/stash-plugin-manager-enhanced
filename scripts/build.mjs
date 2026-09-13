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
  banner: {
    js: "/*! Copyright (C) 2026 RyanAtNight. SPDX-License-Identifier: AGPL-3.0-only. See LICENSE. */",
  },
});

await cp("src/styles.css", "dist/stash-plugin-manager-enhanced.css");
await cp("LICENSE", "dist/LICENSE");
await cp("plugin/stash-plugin-manager-enhanced.yml", "dist/stash-plugin-manager-enhanced.yml");
