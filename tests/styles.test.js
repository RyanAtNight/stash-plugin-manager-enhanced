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

  it("joins Cards and Table into a compact segmented control", () => {
    expect(css).toMatch(/\.spme-view-toggle\s*\{[^}]*gap:\s*0(?:;|\s)/);
    expect(css).toMatch(/#spme-root \.spme-view-toggle button\s*\{[^}]*border-color:\s*transparent/);
    expect(css).toMatch(/#spme-root \.spme-view-toggle button\[aria-pressed="true"\]\s*\{[^}]*border-color:\s*var\(--spme-accent\)/);
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
    expect(css).toMatch(/\.spme-columns-browse \.spme-col-actions\s*\{\s*width:\s*12\.8rem/);
    expect(css).toMatch(/data-active-tab="browse"[\s\S]*\.spme-table-actions\s*\{[\s\S]*flex-wrap:\s*nowrap/);
  });

  it("gives Installed actions a compact fixed width independent of Browse", () => {
    expect(css).toMatch(/#spme-root\[data-active-tab="installed"\] \.spme-package-table th:nth-child\(3\)\s*\{\s*width:\s*auto/);
    expect(css).toMatch(/#spme-root\[data-active-tab="installed"\] \.spme-package-table th:nth-child\(8\)\s*\{\s*width:\s*13\.5rem/);
    expect(css).toMatch(/\.spme-columns-browse \.spme-col-actions\s*\{\s*width:\s*12\.8rem/);
  });

  it("gives toolbar dropdowns the same visible indicator as Stash's Language select", () => {
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*appearance:\s*none/);
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*background-image:\s*url\([^)]*svg[\s\S]*polygon/);
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*background-position:\s*calc\(100%\s*-\s*\.45rem\)\s*50%/);
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*background-size:\s*\.65rem\s+\.9rem/);
    expect(css).toMatch(/\.spme-toolbar select\s*\{[\s\S]*padding-right:\s*1\.8rem/);
  });

  it("styles repository links as icon buttons rather than underlined text links", () => {
    expect(css).toMatch(/#spme-root \.spme-repo-link\s*\{[\s\S]*display:\s*inline-flex[\s\S]*text-decoration:\s*none/);
    expect(css).toMatch(/\.spme-github-icon\s*\{[\s\S]*fill:\s*currentColor/);
    expect(css).toMatch(/#spme-root \.spme-repo-link:hover[\s\S]*text-decoration:\s*none/);
  });

  it("styles Configure links as primary actions and highlights their target panel", () => {
    expect(css).toMatch(/#spme-root \.spme-config-link\s*\{[^}]*text-decoration:\s*none/);
    expect(css).toMatch(/#spme-root \.spme-icon-action\s*\{[^}]*width:\s*2\.15rem[^}]*height:\s*2\.15rem[^}]*padding:\s*0/);
    expect(css).toMatch(/\.spme-configure-icon\s*\{[^}]*stroke:\s*currentColor/);
    expect(css).toMatch(/\.spme-trash-icon\s*\{[^}]*stroke:\s*currentColor/);
    expect(css).toMatch(/#spme-root \.spme-config-link:hover\s*\{[^}]*background:\s*#10659a/);
    expect(css).toMatch(/\.spme-plugin-config:target,[\s\S]*\.spme-plugin-config:focus\s*\{[^}]*border-color:\s*var\(--spme-accent\)/);
  });

  it("highlights Installed cards and rows reached from Manage links", () => {
    expect(css).toMatch(/\.spme-installed-target:target,[\s\S]*\.spme-installed-target:focus\s*\{[^}]*border-color:\s*var\(--spme-accent\)/);
  });

  it("matches Stash primary button hover and mouse-down interaction states", () => {
    expect(css).toMatch(/#spme-root button,[\s\S]*transition:[^;]*0\.15s ease-in-out/);
    expect(css).toMatch(/#spme-root button:not\(:disabled\):hover\s*\{[\s\S]*background:\s*#10659a[\s\S]*border-color:\s*#0e5e8f/);
    expect(css).toMatch(/#spme-root button:not\(:disabled\):active[\s\S]*background:\s*#0e5e8f[\s\S]*box-shadow:\s*0 0 0 \.2rem rgba\(54,144,199,\.5\)/);
    expect(css).toMatch(/#spme-root button\.danger:not\(:disabled\):hover/);
    expect(css).toMatch(/#spme-root button\.subtle:not\(:disabled\):active/);
  });

  it("visually distinguishes enabled and disabled plugin states with a true switch", () => {
    expect(css).toMatch(/#spme-root button\.spme-enable-toggle\s*\{[^}]*min-width:\s*0[^}]*background:\s*transparent[^}]*border-color:\s*transparent/);
    expect(css).toMatch(/\.spme-enable-toggle-track\s*\{[^}]*border-radius:\s*99px[^}]*background:\s*#687985/);
    expect(css).toMatch(/\.spme-enable-toggle-knob\s*\{[^}]*border-radius:\s*50%[^}]*transition:/);
    expect(css).toMatch(/#spme-root button\.spme-enable-toggle\[aria-checked="true"\][\s\S]*\.spme-enable-toggle-track\s*\{[^}]*background:\s*var\(--spme-success\)/);
    expect(css).toMatch(/#spme-root button\.spme-enable-toggle\[aria-checked="true"\][\s\S]*\.spme-enable-toggle-knob\s*\{[^}]*transform:\s*translateX/);
  });

  it("places a compact interactive dismiss button at the far right of alerts", () => {
    expect(css).toMatch(/\.spme-alert\s*\{[\s\S]*display:\s*flex[\s\S]*align-items:\s*center/);
    expect(css).toMatch(/\.spme-alert-content\s*\{[\s\S]*flex:\s*1\s+1\s+auto/);
    expect(css).toMatch(/#spme-root \.spme-alert-dismiss\s*\{[\s\S]*margin-left:\s*auto[\s\S]*background:\s*transparent/);
    expect(css).toMatch(/#spme-root \.spme-alert-dismiss:not\(:disabled\):hover/);
    expect(css).toMatch(/#spme-root \.spme-alert-dismiss:not\(:disabled\):active[\s\S]*box-shadow:/);
  });

  it("styles the sidebar kill switch without a distracting top border", () => {
    const rule = css.match(/#spme-enhancement-control\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("padding:");
    expect(rule).not.toContain("border-top:");
  });

  it("spaces source form action buttons", () => {
    expect(css).toMatch(/\.spme-source-form-actions\s*\{[\s\S]*display:\s*flex[\s\S]*gap:\s*\.5rem/);
  });

  it("contains source diagnostics in a readable full-width callout", () => {
    expect(css).toMatch(/\.spme-source-error\s*\{[\s\S]*grid-column:\s*1\/-1[\s\S]*background:\s*rgba\(220,82,96,\.09\)[\s\S]*border-left:\s*3px solid var\(--spme-danger\)/);
    expect(css).toMatch(/\.spme-source-error code\s*\{[\s\S]*white-space:\s*pre-wrap[\s\S]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/@media \(max-width:\s*800px\)[\s\S]*\.spme-source-card > \.spme-card-actions\s*\{\s*grid-column:\s*1/);
  });

  it("sizes and highlights the Sources table without affecting package tables", () => {
    expect(css).toMatch(/\.spme-columns-sources \.spme-col-source-actions\s*\{\s*width:\s*16\.8rem/);
    expect(css).toMatch(/\.spme-source-row:target,[\s\S]*\.spme-source-row:focus\s*\{[\s\S]*outline:/);
    expect(css).toMatch(/\.spme-source-edit-row \.spme-source-form\s*\{[\s\S]*margin:\s*0/);
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
