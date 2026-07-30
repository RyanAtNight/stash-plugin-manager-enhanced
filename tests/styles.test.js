import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

describe("package view responsive styles", () => {
  it("centers the default Cards view and lets Table view use the available settings width", () => {
    expect(css).toMatch(/#spme-root\s*\{[\s\S]*width:\s*min\(1180px,\s*var\(--spme-available-width/);
    expect(css).toMatch(/#spme-root\[data-view-mode="table"\][\s\S]*width:\s*var\(--spme-available-width/);
    expect(css).toMatch(/left:\s*50%[\s\S]*translateX\(-50%\)/);
  });

  it("turns Table rows into labeled stacked cards on narrow windows", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 1100px)"));
    expect(mobile).toMatch(/\.spme-package-table thead\s*\{\s*display:\s*none/);
    expect(mobile).toMatch(/\.spme-package-table tr\s*\{[\s\S]*display:\s*grid/);
    expect(mobile).toMatch(/\.spme-package-table td::before[\s\S]*content:\s*attr\(data-label\)/);
  });
});
