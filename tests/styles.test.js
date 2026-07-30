import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

describe("package view responsive styles", () => {
  it("keeps every subtab and view at the same available settings width", () => {
    expect(css).toMatch(/#spme-root\s*\{[\s\S]*width:\s*var\(--spme-available-width,\s*100%\)/);
    expect(css).not.toMatch(/#spme-root\[data-view-mode="table"\][\s\S]*width:/);
    expect(css).toMatch(/left:\s*50%[\s\S]*translateX\(-50%\)/);
  });

  it("gives inactive and active subtabs distinct surfaces with space before the separator", () => {
    expect(css).toMatch(/\.spme-tabs\s*\{[\s\S]*padding-bottom:\s*\.8(?:rem|5rem)/);
    expect(css).toMatch(/#spme-root \.spme-tabs button\s*\{[\s\S]*background:\s*var\(--spme-panel-2\)[\s\S]*border:\s*1px solid var\(--spme-border\)/);
    expect(css).toMatch(/#spme-root \.spme-tabs button\.active\s*\{[\s\S]*background:\s*var\(--spme-accent\)/);
  });

  it("wraps table descriptions instead of truncating them", () => {
    const desktop = css.slice(0, css.indexOf("@media (max-width: 1100px)"));
    expect(desktop).toMatch(/\.spme-table-description\s*\{[\s\S]*white-space:\s*normal[\s\S]*overflow:\s*visible[\s\S]*text-overflow:\s*clip/);
  });

  it("left-aligns table status and action content with their headers", () => {
    expect(css).toMatch(/\.spme-package-table \.spme-badges,\s*\.spme-package-table \.spme-table-actions\s*\{\s*justify-content:\s*flex-start/);
  });

  it("content-sizes the Browse Actions column and gives reclaimed width to Description", () => {
    expect(css).toMatch(/\.spme-columns-browse \.spme-col-description\s*\{\s*width:\s*auto/);
    expect(css).toMatch(/\.spme-columns-browse \.spme-col-actions\s*\{\s*width:\s*11\.2rem/);
    expect(css).toMatch(/data-active-tab="browse"[\s\S]*\.spme-table-actions\s*\{[\s\S]*flex-wrap:\s*nowrap/);
  });

  it("gives toolbar dropdowns the same visible indicator as Stash's Language select", () => {
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*appearance:\s*none/);
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*background-image:\s*url\([^)]*svg[\s\S]*polygon/);
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*background-position:\s*calc\(100%\s*-\s*\.45rem\)\s*50%/);
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*padding-right:\s*1\.65rem/);
  });

  it("styles the sidebar kill switch without a distracting top border", () => {
    const rule = css.match(/#spme-enhancement-control\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("padding:");
    expect(rule).not.toContain("border-top:");
  });

  it("spaces source form action buttons", () => {
    expect(css).toMatch(/\.spme-source-form-actions\s*\{[\s\S]*display:\s*flex[\s\S]*gap:\s*\.5rem/);
  });

  it("styles linked source labels and highlights the anchored source card", () => {
    expect(css).toMatch(/\.spme-source-link\s*\{[\s\S]*text-decoration:\s*underline/);
    expect(css).toMatch(/\.spme-source-card:target,[\s\S]*\.spme-source-card:focus\s*\{[\s\S]*border-color:\s*var\(--spme-accent\)/);
    expect(css).toMatch(/\.spme-source-card\s*\{[\s\S]*scroll-margin-top:/);
  });

  it("lays the source editor across its expanded card without a nested panel", () => {
    expect(css).toMatch(/\.spme-source-card-editing\s*\{[\s\S]*border-color:\s*var\(--spme-accent\)/);
    expect(css).toMatch(/\.spme-source-form-inline\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1[\s\S]*background:\s*transparent[\s\S]*border:\s*0/);
  });

  it("turns Table rows into labeled stacked cards on narrow windows", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 1100px)"));
    expect(mobile).toMatch(/\.spme-package-table thead\s*\{\s*display:\s*none/);
    expect(mobile).toMatch(/\.spme-package-table tr\s*\{[\s\S]*display:\s*grid/);
    expect(mobile).toMatch(/\.spme-package-table td::before[\s\S]*content:\s*attr\(data-label\)/);
  });
});
