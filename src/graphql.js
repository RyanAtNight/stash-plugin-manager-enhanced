export class GraphQLClient {
  constructor(fetchImpl = window.fetch.bind(window)) {
    this.fetchImpl = fetchImpl;
  }

  async request(query, variables = {}) {
    const response = await this.fetchImpl("/graphql", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`GraphQL request failed (${response.status})`);
    }
    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }
    return payload.data;
  }
}
