import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import electron from "electron";

// Run against a disposable local server: state mutations are reverted on success
// or failure, but this test must never be pointed at a shared router lab session.
const port = Number(process.env.ROUTER_DEBUG_PORT || 9223);
const args = [
  ".",
  `--remote-debugging-port=${port}`,
  "--remote-debugging-address=127.0.0.1",
];
if (process.env.ROUTER_ELECTRON_NO_SANDBOX === "1") args.push("--no-sandbox");
const child = spawn(electron, args, {
  cwd: new URL("..", import.meta.url),
  stdio: ["ignore", "ignore", "pipe"],
});
let diagnostics = "";
child.stderr.on("data", (data) => {
  diagnostics = (diagnostics + data).slice(-12000);
});
let socket;
const pending = new Map();
let nextId = 0;

async function pages() {
  return (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
}

async function evaluate(expression) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Renderer evaluation timed out"));
    }, 15000);
    pending.set(id, {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    });
    socket.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
      }),
    );
  });
}

try {
  let main;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null || child.signalCode)
      throw new Error(`Electron exited early: ${diagnostics}`);
    try {
      main = (await pages()).find((page) => page.url.endsWith("/main.html"));
    } catch {}
    if (main) break;
    await delay(250);
  }
  assert.ok(main, `Electron main window did not start: ${diagnostics}`);
  socket = new WebSocket(main.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const response = JSON.parse(event.data);
    const promise = pending.get(response.id);
    if (!promise) return;
    pending.delete(response.id);
    if (response.error || response.result.exceptionDetails)
      promise.reject(new Error(JSON.stringify(response)));
    else promise.resolve(response.result.result.value);
  };

  let rendererReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    rendererReady = await evaluate(
      "document.readyState === 'complete' && typeof window.api === 'object'",
    );
    if (rendererReady) break;
    await delay(250);
  }
  assert.ok(
    rendererReady,
    `Renderer/preload did not become ready: ${diagnostics}`,
  );

  const result = await evaluate(`(async () => {
    if (document.readyState !== 'complete' || !window.api) throw new Error('Renderer/preload not ready');
    const api = window.api;
    const reads = await Promise.all([
      api.getInterfaces(), api.getRoutes(), api.getArpCache(), api.getProxyArpStates(),
      api.getRipInterfaces(), api.getDhcpPools(), api.getDhcpLeases()
    ]);
    if (!reads.every(Array.isArray)) throw new Error('Expected array responses');
    const previous = { dhcp: await api.getDhcpSettings(), rip: await api.getRipTimers(), arp: await api.getArpTtl() };
    const network = '198.18.' + Math.floor(Math.random() * 255) + '.' + Math.floor(Math.random() * 255);
    if (reads[1].some(route => route.destination === network + '/32')) throw new Error('Temporary route conflict');
    let routeAdded = false;
    let pool;
    try {
      await api.addRouteDirect({ network, prefixLength: 32, outInterfaceName: 'SMOKE', administrativeDistance: 1 });
      routeAdded = true;
      if (!(await api.getRoutes()).some(route => route.destination === network + '/32')) throw new Error('Route creation failed');
      pool = await api.createDhcpPool({ name: 'smoke-' + Date.now(), interfaceId: 'SMOKE', automaticEnabled: false, enabled: false });
      await api.addDhcpReservation(pool.id, { mac: '020000000099', ip: '10.0.0.99' });
      const updated = await api.getDhcpPool(pool.id);
      if (updated.manualReservations['020000000099'] !== '10.0.0.99') throw new Error('Reservation round trip failed');
      await api.deleteDhcpReservation(pool.id, '020000000099');
      if (Object.keys((await api.getDhcpPool(pool.id)).manualReservations).length) throw new Error('Reservation deletion failed');
      await api.setDhcpSettings(600, 10);
      if ((await api.getDhcpSettings()).dynamicLeaseSeconds !== 600) throw new Error('DHCP settings failed');
      await api.setRipTimers({ updateSeconds: 31, invalidSeconds: 181, holddownSeconds: 181, flushSeconds: 241 });
      if ((await api.getRipTimers()).updateSeconds !== 31) throw new Error('RIP settings failed');
      await api.setArpTtl(180);
      if ((await api.getArpTtl()).ttlSeconds !== 180) throw new Error('ARP TTL failed');
    } finally {
      // Attempt every cleanup even if one request fails.
      const cleanup = await Promise.allSettled([
        api.setDhcpSettings(previous.dhcp.dynamicLeaseSeconds, previous.dhcp.cleanupIntervalSeconds),
        api.setRipTimers(previous.rip), api.setArpTtl(previous.arp.ttlSeconds),
        ...(pool ? [api.deleteDhcpPool(pool.id)] : []),
        ...(routeAdded ? [api.deleteRoute({ network, prefixLength: 32, outInterfaceName: 'SMOKE' })] : [])
      ]);
      if (cleanup.some(result => result.status === 'rejected')) throw new Error('Smoke state cleanup failed');
    }
    for (const kind of ['ports', 'arp', 'rip', 'dhcp']) {
      if (await api.openWindow(kind) !== true) throw new Error('Window IPC failed: ' + kind);
    }
    let rejected = false;
    try { await api.openWindow('../unknown'); } catch { rejected = true; }
    if (!rejected) throw new Error('Unknown window was accepted');
    return { title: document.title, apiReadGroups: reads.length, mutations: 'passed and reverted' };
  })()`);
  console.log("Renderer/API integration:", result);

  for (let attempt = 0; attempt < 40; attempt++) {
    const loaded = await pages();
    if (loaded.length === 5) {
      let complete = true;
      for (const page of loaded) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = reject;
        });
        const state = await new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Window readiness timeout")),
            5000,
          );
          ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.id === 1) {
              clearTimeout(timer);
              resolve(message.result?.result?.value);
            }
          };
          ws.send(
            JSON.stringify({
              id: 1,
              method: "Runtime.evaluate",
              params: {
                expression: `document.readyState === 'complete' && typeof window.api === 'object'`,
                returnByValue: true,
              },
            }),
          );
        });
        ws.close();
        complete &&= state === true;
      }
      if (complete) {
        console.log("All five windows loaded with the preload API.");
        break;
      }
    }
    if (attempt === 39) throw new Error("Not all child windows became ready");
    await delay(250);
  }
} finally {
  socket?.close();
  child.kill("SIGTERM");
}
