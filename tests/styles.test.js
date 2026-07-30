import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

describe("package view responsive styles", () => {
  it("centers the default Cards view and lets Table view use the available settings width", () => {
    expect(css).toMatch(/#spme-root\s*\{[\s\S]*width:\s*min\(1180px,\s*var\(--spme-available-width/);
    expect(css).toMatch(/#spme-root\[data-view-mode="table"\][\s\S]*width:\s*var\(--spme-available-width/);
    expect(css).toMatch(/left:\s*50%[\s\S]*translateX\(-50%\)/);
  });

  it("gives inactive and active subtabs distinct surfaces with space before the separator", () => {
    expect(css).toMatch(/\.spme-tabs\s*\{[\s\S]*padding-bottom:\s*\.8(?:rem|5rem)/);
    expect(css).toMatch(/#spme-root \.spme-tabs button\s*\{[\s\S]*background:\s*var\(--spme-panel-2\)[\s\S]*border:\s*1px solid var\(--spme-border\)/);
    expect(css).toMatch(/#spme-root \.spme-tabs button\.active\s*\{[\s\S]*background:\s*var\(--spme-accent\)/);
  });

  it("left-aligns table status and action content with their headers", () => {
    expect(css).toMatch(/\.spme-package-table \.spme-badges,\s*\.spme-package-table \.spme-table-actions\s*\{\s*justify-content:\s*flex-start/);
  });

  it("content-sizes the Browse Actions column and gives reclaimed width to Description", () => {
    expect(css).toMatch(/\.spme-columns-browse \.spme-col-description\s*\{\s*width:\s*auto/);
    expect(css).toMatch(/\.spme-columns-browse \.spme-col-actions\s*\{\s*width:\s*11\.2rem/);
    expect(css).toMatch(/data-active-tab="browse"[\s\S]*\.spme-table-actions\s*\{[\s\S]*flex-wrap:\s*nowrap/);
  });

  it("turns Table rows into labeled stacked cards on narrow windows", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 1100px)"));
    expect(mobile).toMatch(/\.spme-package-table thead\s*\{\s*display:\s*none/);
    expect(mobile).toMatch(/\.spme-package-table tr\s*\{[\s\S]*display:\s*grid/);
    expect(mobile).toMatch(/\.spme-package-table td::before[\s\S]*content:\s*attr\(data-label\)/);
  });
});
