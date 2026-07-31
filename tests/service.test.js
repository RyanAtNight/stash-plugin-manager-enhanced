import { describe, expect, it, vi } from "vitest";
import { PluginManagerService } from "../src/service.js";

describe("PluginManagerService", () => {
  it("loads and merges installed package, runtime plugin, and source information", async () => {
    const client = {
      request: vi.fn().mockResolvedValue({
        installedPackages: [
          {
            package_id: "alpha",
            name: "Alpha",
            version: "1.0.0",
            date: "2025-01-01T00:00:00Z",
            sourceURL: "https://example.github.io/plugins/main/index.yml",
            metadata: {},
            source_package: {
              version: "1.1.0",
              date: "2025-02-01T00:00:00Z",
              metadata: {},
            },
          },
        ],
        plugins: [
          {
            id: "alpha",
            name: "Alpha",
            enabled: true,
            requires: ["helper-library"],
            url: "https://github.com/example/alpha",
            hooks: [],
            tasks: [],
            settings: [],
            paths: { javascript: [], css: [] },
          },
          {
            id: "dev-helper",
            name: "Dev Helper",
            description: "Loaded directly from disk",
            enabled: false,
            version: "0.2.0",
            url: "https://github.com/example/dev-helper",
            hooks: [],
            tasks: [],
            settings: [],
            paths: { javascript: ["dev-helper.js"], css: [] },
          },
        ],
        configuration: {
          general: {
            pluginPackageSources: [
              {
                name: "Example",
                url: "https://example.github.io/plugins/main/index.yml",
                local_path: "example",
              },
            ],
          },
          plugins: { alpha: { dryRun: true } },
        },
      }),
    };

    const service = new PluginManagerService(client);
    const result = await service.loadInstalled({ checkUpdates: true });

    expect(result.packages[0]).toMatchObject({
      package_id: "alpha",
      enabled: true,
      status: "update",
      sourceName: "Example",
      githubUrl: "https://github.com/example/alpha",
      requires: ["helper-library"],
    });
    expect(client.request.mock.calls[0][0]).toContain("id name description url version enabled requires");
    expect(result.packages[1]).toMatchObject({
      package_id: "dev-helper",
      name: "Dev Helper",
      enabled: false,
      installed: true,
      runtimeOnly: true,
      status: "runtime-only",
      sourceName: "Runtime-only",
      githubUrl: "https://github.com/example/dev-helper",
    });
    expect(result.sources).toHaveLength(1);
    expect(result.pluginConfig.alpha).toEqual({ dryRun: true });
  });

  it("loads available packages from every source and excludes installed IDs", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          availablePackages: [
            {
              package_id: "alpha",
              name: "Alpha",
              sourceURL: "https://one.github.io/repo/main/index.yml",
              metadata: {},
              requires: [],
            },
            {
              package_id: "beta",
              name: "Beta",
              sourceURL: "https://one.github.io/repo/main/index.yml",
              metadata: { description: "A helper" },
              requires: [],
            },
          ],
        })
        .mockResolvedValueOnce({ availablePackages: [] }),
    };
    const service = new PluginManagerService(client);
    const sources = [
      { name: "One", url: "https://one.github.io/repo/main/index.yml" },
      { name: "Two", url: "https://two.github.io/repo/main/index.yml" },
    ];

    const result = await service.loadAvailable(sources, new Set(["alpha"]));

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]).toMatchObject({
      package_id: "beta",
      sourceName: "One",
      githubUrl: "https://github.com/one/repo/tree/main/plugins/beta",
    });
    expect(result.health).toEqual([
      expect.objectContaining({ source: sources[0], ok: true, packageCount: 2 }),
      expect.objectContaining({ source: sources[1], ok: true, packageCount: 0 }),
    ]);
  });

  it("keeps healthy sources usable when another source fails", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ availablePackages: [] })
        .mockRejectedValueOnce(new Error("offline")),
    };
    const sources = [
      { name: "Good", url: "https://good.example/index.yml" },
      { name: "Bad", url: "https://bad.example/index.yml" },
    ];

    const result = await new PluginManagerService(client).loadAvailable(
      sources,
      new Set()
    );

    expect(result.packages).toEqual([]);
    expect(result.health[1]).toMatchObject({ ok: false, error: "offline" });
  });

  it("runs package operations using Plugin package specs", async () => {
    const client = { request: vi.fn().mockResolvedValue({ updatePackages: "42" }) };
    const service = new PluginManagerService(client);
    const packages = [{ package_id: "alpha", sourceURL: "source" }];

    const jobID = await service.update(packages);

    expect(jobID).toBe("42");
    expect(client.request.mock.calls[0][1]).toEqual({
      packages: [{ id: "alpha", sourceURL: "source" }],
    });
    expect(client.request.mock.calls[0][0]).toContain("updatePackages");
  });

  it("polls package jobs until completion and surfaces failures", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ findJob: { id: "42", status: "RUNNING", error: null } })
        .mockResolvedValueOnce({ findJob: { id: "42", status: "FINISHED", error: null } }),
    };
    const service = new PluginManagerService(client, undefined, async () => {});

    await expect(service.waitForJob("42")).resolves.toMatchObject({ status: "FINISHED" });
    expect(client.request).toHaveBeenCalledTimes(2);

    client.request.mockReset().mockResolvedValue({
      findJob: { id: "43", status: "FAILED", error: "package failed" },
    });
    await expect(service.waitForJob("43")).rejects.toThrow("package failed");
  });

  it("updates enabled state and saves the complete source list", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ setPluginsEnabled: true })
        .mockResolvedValueOnce({
          configureGeneral: { pluginPackageSources: [] },
        }),
    };
    const service = new PluginManagerService(client);

    await service.setEnabled("alpha", false);
    await service.saveSources([
      { name: "Example", url: "https://example.test/index.yml", local_path: null },
    ]);

    expect(client.request.mock.calls[0][1]).toEqual({ enabledMap: { alpha: false } });
    expect(client.request.mock.calls[1][1]).toEqual({
      sources: [
        { name: "Example", url: "https://example.test/index.yml", local_path: null },
      ],
    });
  });
});
