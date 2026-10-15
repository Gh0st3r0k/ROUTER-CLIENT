const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHttpClient } = require("../http-client.cjs");

for (const method of ["get", "post", "put", "delete"]) {
  test(`${method} serializes requests and returns JSON`, async () => {
    let received;
    const client = createHttpClient(async (...args) => {
      received = args;
      return new Response('{"ok":true}', { status: 200 });
    });
    assert.deepEqual(await client[method]("/api/test", { value: 42 }), {
      ok: true,
    });
    assert.equal(received[0], "/api/test");
    assert.equal(received[1].method, method.toUpperCase());
    if (method === "get") {
      assert.equal(received[1].body, undefined);
    } else {
      assert.equal(received[1].body, '{"value":42}');
      assert.equal(received[1].headers["Content-Type"], "application/json");
    }
  });

  test(`${method} rejects unsuccessful HTTP responses with useful context`, async () => {
    const client = createHttpClient(
      async () => new Response("Not found", { status: 404 }),
    );
    await assert.rejects(
      client[method]("/missing"),
      /\/missing failed \(404\)/,
    );
  });
}

for (const method of ["post", "put", "delete"]) {
  for (const status of [200, 204]) {
    test(`${method} accepts empty HTTP ${status} responses`, async () => {
      const client = createHttpClient(
        async () => new Response(null, { status }),
      );
      assert.deepEqual(await client[method]("/empty"), {});
    });
  }
}

test("GET rejects malformed JSON instead of hiding the error", async () => {
  const client = createHttpClient(async () => new Response("invalid"));
  await assert.rejects(client.get("/bad-json"), SyntaxError);
});

test("network errors propagate to the renderer", async () => {
  const error = new Error("Connection refused");
  const client = createHttpClient(async () => {
    throw error;
  });
  await assert.rejects(client.get("/offline"), error);
});
