import { describe, expect, it } from "vitest";
import {
  capabilitySummary,
  deriveGithubUrl,
  filterPackages,
  isPluginsSettingsRoute,
  pluginManagerTabFromURL,
  packageStatus,
  safeExternalUrl,
  sourceAnchorHref,
  sourceAnchorID,
  withoutPluginManagerSourceAnchor,
  sourceTrust,
  withPluginManagerTab,
} from "../src/core.js";

describe("isPluginsSettingsRoute", () => {
  it("matches the core plugins settings route regardless of query order", () => {
    expect(isPluginsSettingsRoute("/settings?tab=plugins")).toBe(true);
    expect(isPluginsSettingsRoute("/settings?foo=1&tab=plugins&bar=2")).toBe(true);
  });

  it("does not match other Stash pages", () => {
    expect(isPluginsSettingsRoute("/settings?tab=tools")).toBe(false);
    expect(isPluginsSettingsRoute("/plugins/example")).toBe(false);
  });
});

describe("plugin manager subtab URLs", () => {
  it("reads a valid subtab and falls back to installed", () => {
    expect(pluginManagerTabFromURL("/settings?tab=plugins&pluginManagerTab=sources")).toBe("sources");
    expect(pluginManagerTabFromURL("/settings?tab=plugins&pluginManagerTab=invalid")).toBe("installed");
  });

  it("adds the subtab while preserving existing query parameters", () => {
    expect(withPluginManagerTab("/settings?foo=1&tab=plugins", "configuration")).toBe(
      "/settings?foo=1&tab=plugins&pluginManagerTab=configuration"
    );
  });
});

describe("source anchors", () => {
  const sourceURL = "https://stashapp.github.io/CommunityScripts/stable/index.yml";

  it("derives stable URL-safe IDs without exposing the source URL", () => {
    const id = sourceAnchorID(sourceURL);
    expect(id).toMatch(/^spme-source-[0-9a-f]{8}$/);
    expect(sourceAnchorID(sourceURL)).toBe(id);
    expect(sourceAnchorID("https://example.test/index.yml")).not.toBe(id);
    expect(id).not.toContain("stashapp");
  });

  it("builds a Sources-subtab URL while preserving other parameters", () => {
    expect(sourceAnchorHref("/settings?foo=1&tab=plugins&pluginManagerTab=browse", sourceURL)).toBe(
      `/settings?foo=1&tab=plugins&pluginManagerTab=sources#${sourceAnchorID(sourceURL)}`
    );
  });

  it("removes only plugin-owned source anchors", () => {
    expect(withoutPluginManagerSourceAnchor(`/settings?tab=plugins&pluginManagerTab=sources#${sourceAnchorID(sourceURL)}`)).toBe(
      "/settings?tab=plugins&pluginManagerTab=sources"
    );
    expect(withoutPluginManagerSourceAnchor("/settings?tab=plugins#other-anchor")).toBe(
      "/settings?tab=plugins#other-anchor"
    );
  });
});

describe("deriveGithubUrl", () => {
  it("prefers an explicit GitHub repository URL from a loaded plugin", () => {
    expect(
      deriveGithubUrl({
        pluginUrl: "https://github.com/example/plugin",
        metadata: { repository: "https://github.com/wrong/repo" },
      })
    ).toBe("https://github.com/example/plugin");
  });

  it("accepts common GitHub metadata keys for an available package", () => {
    expect(
      deriveGithubUrl({
        metadata: { homepage: "https://github.com/example/plugin#readme" },
      })
    ).toBe("https://github.com/example/plugin");
  });

  it("derives a CommunityScripts package directory from its GitHub Pages index", () => {
    expect(
      deriveGithubUrl({
        packageId: "VideoScrollWheel",
        sourceUrl: "https://stashapp.github.io/CommunityScripts/stable/index.yml",
      })
    ).toBe(
      "https://github.com/stashapp/CommunityScripts/tree/stable/plugins/VideoScrollWheel"
    );
  });

  it("derives a third-party package directory from a conventional GitHub Pages index", () => {
    expect(
      deriveGithubUrl({
        packageId: "renamerOnUpdate",
        sourceUrl: "https://f4bio.github.io/stash-plugins/main/index.yml",
      })
    ).toBe(
      "https://github.com/f4bio/stash-plugins/tree/main/plugins/renamerOnUpdate"
    );
  });

  it("returns no misleading link for non-GitHub sources", () => {
    expect(
      deriveGithubUrl({
        packageId: "local-plugin",
        sourceUrl: "http://localhost:9999/local/index.yml",
      })
    ).toBeUndefined();
  });
});

describe("safeExternalUrl", () => {
  it("allows only HTTP and HTTPS links", () => {
    expect(safeExternalUrl("https://example.test/index.yml")).toBe("https://example.test/index.yml");
    expect(safeExternalUrl("http://localhost:9999/index.yml")).toBe("http://localhost:9999/index.yml");
    expect(safeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeExternalUrl("file:///plugins/index.yml")).toBeUndefined();
  });
});

describe("sourceTrust", () => {
  it("marks official Stash sources as official", () => {
    expect(
      sourceTrust("https://stashapp.github.io/CommunityScripts/stable/index.yml")
    ).toEqual({ level: "official", label: "Official Stash source" });
  });

  it("marks other GitHub-hosted sources as community", () => {
    expect(
      sourceTrust("https://f4bio.github.io/stash-plugins/main/index.yml")
    ).toEqual({ level: "community", label: "Community GitHub source" });
  });

  it("marks local and unknown sources as unverified", () => {
    expect(sourceTrust("file:///plugins/index.yml").level).toBe("unverified");
  });
});

describe("packageStatus", () => {
  it("reports an update only when the available package is newer", () => {
    expect(
      packageStatus({
        date: "2025-01-01T00:00:00Z",
        source_package: { date: "2025-02-01T00:00:00Z" },
      })
    ).toBe("update");
    expect(
      packageStatus({
        date: "2025-02-01T00:00:00Z",
        source_package: { date: "2025-01-01T00:00:00Z" },
      })
    ).toBe("current");
  });

  it("reports unchecked when remote status has not been loaded", () => {
    expect(packageStatus({ date: "2025-01-01T00:00:00Z" })).toBe("unchecked");
  });
});

describe("filterPackages", () => {
  const packages = [
    {
      package_id: "alpha",
      name: "Alpha Tool",
      metadata: { description: "Find duplicate media" },
      sourceName: "Community",
      enabled: true,
      status: "current",
    },
    {
      package_id: "beta",
      name: "Beta Helper",
      metadata: { description: "Adds player controls" },
      sourceName: "Local",
      enabled: false,
      status: "update",
    },
  ];

  it("searches names, IDs, descriptions, and source names", () => {
    expect(filterPackages(packages, { query: "duplicate" })).toHaveLength(1);
    expect(filterPackages(packages, { query: "local" })[0].package_id).toBe("beta");
  });

  it("combines enabled and update filters", () => {
    expect(
      filterPackages(packages, { enabled: false, updatesOnly: true })
    ).toEqual([packages[1]]);
  });
});

describe("capabilitySummary", () => {
  it("reports declared hooks, tasks, UI assets, and settings without claiming undeclared permissions", () => {
    expect(
      capabilitySummary({
        hooks: [{ name: "On update" }],
        tasks: [{ name: "Scan" }],
        settings: [{ name: "dryRun" }],
        paths: { javascript: ["/plugin/x/javascript"], css: [] },
      })
    ).toEqual([
      "1 hook",
      "1 task",
      "UI JavaScript",
      "1 setting",
      "Filesystem/network permissions are not declared by Stash",
    ]);
  });
});
