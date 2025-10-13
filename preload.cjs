// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

console.log('[preload] loaded');

const BASE = 'http://localhost:5104'; // проверь порт сервера

async function jget(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
async function jpost(u, b) {
  const r = await fetch(u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : null,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json().catch(() => ({}));
}
async function jput(u, b) {
  const r = await fetch(u, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json().catch(() => ({}));
}

const api = {
  // окна
  openWindow: (kind) => ipcRenderer.invoke('open-window', kind),

  // интерфейсы (ровно твои пути)
  getInterfaces: () => jget(`${BASE}/api/interface`),
  setIfaceAddress: (guid, { ip, mask }) =>
    jput(`${BASE}/api/interface/${guid}/address`, { ip, mask }),
  setIfaceDisplayName: (guid, { name }) =>
    jput(`${BASE}/api/interface/${guid}/display-name`, { name }),

  // ARP cache
  getArpCache:   () => jget(`${BASE}/api/arp/cache`),
  flushArpCache: () => jpost(`${BASE}/api/arp/cache/flush`),
  getArpTtl:     () => jget(`${BASE}/api/arp/cache/ttl`),
  setArpTtl:     (seconds) => jput(`${BASE}/api/arp/cache/ttl`, { seconds }),

  // ARP request
  sendArp: (nicId, targetIp, srcIp) =>
    jpost(`${BASE}/api/arp/request`, {
      NicId: nicId,
      TargetIp: targetIp,
      SrcIp: srcIp ?? null,
    }),
};

contextBridge.exposeInMainWorld('api', api);
console.log('[preload] api exposed');
