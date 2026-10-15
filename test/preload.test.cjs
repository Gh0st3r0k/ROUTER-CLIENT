const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

function loadBridge() {
  let bridge;
  const calls = [];
  const fakeClient = Object.fromEntries(
    ["get", "post", "put", "delete"].map((method) => [
      method,
      (...args) => {
        calls.push([method, ...args]);
        return Promise.resolve({});
      },
    ]),
  );
  const context = {
    require(name) {
      if (name === "./http-client.cjs")
        return { createHttpClient: () => fakeClient };
      if (name === "electron")
        return {
          contextBridge: {
            exposeInMainWorld(name, api) {
              assert.equal(name, "api");
              bridge = api;
            },
          },
          ipcRenderer: {
            invoke: (...args) => {
              calls.push(["ipc", ...args]);
              return Promise.resolve(true);
            },
          },
        };
      throw new Error(`Unexpected module ${name}`);
    },
  };
  vm.runInNewContext(
    readFileSync(require.resolve("../preload.cjs"), "utf8"),
    context,
  );
  return { bridge, calls };
}

const operations = [
  ["getInterfaces", [], "get", "/api/interface"],
  [
    "setIfaceAddress",
    ["ABC", { ip: "10.0.0.1", mask: "255.255.255.0" }],
    "put",
    "/api/interface/ABC/address",
    { ip: "10.0.0.1", mask: "255.255.255.0" },
  ],
  [
    "setIfaceDisplayName",
    ["ABC", { name: "LAN" }],
    "put",
    "/api/interface/ABC/display-name",
    { name: "LAN" },
  ],
  ["getArpCache", [], "get", "/api/arp/cache"],
  ["flushArpCache", [], "post", "/api/arp/cache/flush"],
  ["getArpTtl", [], "get", "/api/arp/cache/ttl"],
  ["setArpTtl", [120], "put", "/api/arp/cache/ttl", { seconds: 120 }],
  [
    "sendArp",
    ["ABC", "10.0.0.2"],
    "post",
    "/api/arp/request",
    { NicId: "ABC", TargetIp: "10.0.0.2", SrcIp: null },
  ],
  ["getRoutes", [], "get", "/api/routes"],
  [
    "addRouteDirect",
    [{ network: "10.0.0.0" }],
    "post",
    "/api/routes/add-direct",
    { network: "10.0.0.0" },
  ],
  [
    "addRouteVia",
    [{ nextHop: "10.0.0.1" }],
    "post",
    "/api/routes/add-via",
    { nextHop: "10.0.0.1" },
  ],
  [
    "deleteRoute",
    [{ network: "10.0.0.0", prefixLength: 24, outInterfaceName: "ABC" }],
    "delete",
    "/api/routes",
    { network: "10.0.0.0", prefixLength: 24, outInterfaceName: "ABC" },
  ],
  ["addConnected", [], "post", "/api/routes/add-connected-from-interfaces"],
  ["getProxyArpStates", [], "get", "/api/proxy-arp"],
  [
    "setProxyArp",
    ["ABC", false],
    "post",
    "/api/proxy-arp/ABC",
    { enabled: false },
  ],
  ["getRipInterfaces", [], "get", "/api/rip/interfaces"],
  ["ripEnable", ["ABC"], "post", "/api/rip/enable", { interfaceId: "ABC" }],
  ["ripDisable", ["ABC"], "post", "/api/rip/disable", { interfaceId: "ABC" }],
  ["getRipTimers", [], "get", "/api/rip/timers"],
  [
    "setRipTimers",
    [{ updateSeconds: 30 }],
    "put",
    "/api/rip/timers",
    { updateSeconds: 30 },
  ],
  ["getDhcpSettings", [], "get", "/api/dhcp/settings"],
  [
    "setDhcpSettings",
    [300, 5],
    "put",
    "/api/dhcp/settings",
    { dynamicLeaseSeconds: 300, cleanupIntervalSeconds: 5 },
  ],
  ["getDhcpPools", [], "get", "/api/dhcp/pools"],
  ["getDhcpPool", ["pool"], "get", "/api/dhcp/pools/pool"],
  [
    "createDhcpPool",
    [{ name: "LAN" }],
    "post",
    "/api/dhcp/pools",
    { name: "LAN" },
  ],
  [
    "updateDhcpPool",
    ["pool", { name: "LAN" }],
    "put",
    "/api/dhcp/pools/pool",
    { name: "LAN" },
  ],
  ["deleteDhcpPool", ["pool"], "delete", "/api/dhcp/pools/pool"],
  [
    "addDhcpReservation",
    ["pool", { mac: "020000000001", ip: "10.0.0.50" }],
    "post",
    "/api/dhcp/pools/pool/reservations",
    { mac: "020000000001", ip: "10.0.0.50" },
  ],
  [
    "deleteDhcpReservation",
    ["pool", "020000000001"],
    "delete",
    "/api/dhcp/pools/pool/reservations/020000000001",
  ],
  ["getDhcpLeases", [], "get", "/api/dhcp/leases"],
  ["getDhcpPoolLeases", ["pool"], "get", "/api/dhcp/pools/pool/leases"],
];

for (const [name, args, method, path, body] of operations) {
  test(`preload preserves ${name} API contract`, async () => {
    const { bridge, calls } = loadBridge();
    await bridge[name](...args);
    const expected = [method, `http://localhost:5104${path}`];
    if (body !== undefined) expected.push(body);
    // Normalize objects created in the separate VM realm.
    assert.deepEqual(JSON.parse(JSON.stringify(calls)), [expected]);
  });
}

test("openWindow returns a serializable IPC result", async () => {
  const { bridge, calls } = loadBridge();
  assert.equal(await bridge.openWindow("dhcp"), true);
  assert.deepEqual(calls, [["ipc", "open-window", "dhcp"]]);
});
