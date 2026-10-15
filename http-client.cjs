/** Shared fetch adapter used by the preload bridge. */
function createHttpClient(fetchImpl = globalThis.fetch) {
  async function request(url, method, body) {
    const options = { method };
    if (method !== "GET") {
      options.headers = { "Content-Type": "application/json" };
      options.body = body == null ? null : JSON.stringify(body);
    }

    const response = await fetchImpl(url, options);
    if (!response.ok) {
      throw new Error(`${method} ${url} failed (${response.status})`);
    }

    // Read operations require JSON. Mutations may return 204 or an empty 200.
    if (method === "GET") return response.json();
    return response.json().catch(() => ({}));
  }

  return {
    get: (url) => request(url, "GET"),
    post: (url, body) => request(url, "POST", body),
    put: (url, body) => request(url, "PUT", body),
    delete: (url, body) => request(url, "DELETE", body),
  };
}

module.exports = { createHttpClient };
