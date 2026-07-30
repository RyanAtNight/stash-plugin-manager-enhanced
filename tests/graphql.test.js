import { describe, expect, it, vi } from "vitest";
import { GraphQLClient } from "../src/graphql.js";

describe("GraphQLClient", () => {
  it("sends same-origin authenticated GraphQL requests", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { plugins: [] } }),
    });
    const client = new GraphQLClient(fetchImpl);

    await client.request("query Test { plugins { id } }", { value: 1 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/graphql",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      query: "query Test { plugins { id } }",
      variables: { value: 1 },
    });
  });

  it("surfaces GraphQL errors", async () => {
    const client = new GraphQLClient(async () => ({
      ok: true,
      json: async () => ({ errors: [{ message: "not allowed" }] }),
    }));

    await expect(client.request("query Test { plugins { id } }")).rejects.toThrow(
      "not allowed"
    );
  });
});
