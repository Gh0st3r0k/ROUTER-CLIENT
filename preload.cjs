// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

const BASE = 'http://localhost:5104';

async function jget(u){ const r=await fetch(u); if(!r.ok) throw new Error(); return r.json(); }
async function jpost(u,b){ const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):null}); if(!r.ok) throw new Error(); return r.json().catch(()=>({})); }
async function jput(u,b){ const r=await fetch(u,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); if(!r.ok) throw new Error(); return r.json().catch(()=>({})); }
async function jdel(u,b){ const r=await fetch(u,{method:'DELETE',headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):null}); if(!r.ok) throw new Error(); return r.json().catch(()=>({})); }

const api = {
  openWindow: (kind)=>ipcRenderer.invoke('open-window',kind),

  // интерфейсы
  getInterfaces: ()=> jget(`${BASE}/api/interface`),
  setIfaceAddress: (guid,{ip,mask})=> jput(`${BASE}/api/interface/${guid}/address`,{ip,mask}),
  setIfaceDisplayName:(guid,{name})=> jput(`${BASE}/api/interface/${guid}/display-name`,{name}),

  // ARP
  getArpCache: ()=> jget(`${BASE}/api/arp/cache`),
  flushArpCache: ()=> jpost(`${BASE}/api/arp/cache/flush`),
  getArpTtl: ()=> jget(`${BASE}/api/arp/cache/ttl`),
  setArpTtl: (seconds)=> jput(`${BASE}/api/arp/cache/ttl`,{seconds}),
  sendArp: (nicId,targetIp,srcIp)=> jpost(`${BASE}/api/arp/request`,{NicId:nicId,TargetIp:targetIp,SrcIp:srcIp??null}),

  // ROUTING
  getRoutes: ()=> jget(`${BASE}/api/routes`),

  addRouteDirect: (payload)=> jpost(`${BASE}/api/routes/add-direct`,payload),

  addRouteVia: (payload)=> jpost(`${BASE}/api/routes/add-via`,payload),

  deleteRoute: ({network,prefixLength,outInterfaceName})=>
    jdel(`${BASE}/api/routes`,{network,prefixLength,outInterfaceName}),

  addConnected: ()=> jpost(`${BASE}/api/routes/add-connected-from-interfaces`),

  // 🔥 PROXY ARP
  getProxyArpStates: () => jget(`${BASE}/api/proxy-arp`),
  setProxyArp: (interfaceId, enabled) =>
    jpost(`${BASE}/api/proxy-arp/${interfaceId}`, { enabled }),

  // 🔥 RIP
  getRipInterfaces: () => jget(`${BASE}/api/rip/interfaces`),
  ripEnable: (interfaceId) =>
    jpost(`${BASE}/api/rip/enable`, { interfaceId }),
  ripDisable: (interfaceId) =>
    jpost(`${BASE}/api/rip/disable`, { interfaceId }),


  // RIP TIMER API
  getRipTimers: () => jget(`${BASE}/api/rip/timers`),
  setRipTimers: (dto) => jput(`${BASE}/api/rip/timers`, dto),


    // 🔥 DHCP – глобальные настройки
  getDhcpSettings: () => jget(`${BASE}/api/dhcp/settings`),
  setDhcpSettings: (dynamicLeaseSeconds, cleanupIntervalSeconds) =>
    jput(`${BASE}/api/dhcp/settings`, {
      dynamicLeaseSeconds,
      cleanupIntervalSeconds,
    }),

  // 🔥 DHCP – пулы
  getDhcpPools: () => jget(`${BASE}/api/dhcp/pools`),
  getDhcpPool: (id) => jget(`${BASE}/api/dhcp/pools/${id}`),
  createDhcpPool: (pool) => jpost(`${BASE}/api/dhcp/pools`, pool),
  updateDhcpPool: (id, pool) => jput(`${BASE}/api/dhcp/pools/${id}`, pool),
  deleteDhcpPool: (id) => jdel(`${BASE}/api/dhcp/pools/${id}`),

  // 🔥 DHCP – manual reservations
  addDhcpReservation: (poolId, { mac, ip }) =>
    jpost(`${BASE}/api/dhcp/pools/${poolId}/reservations`, { mac, ip }),
  deleteDhcpReservation: (poolId, mac) =>
    jdel(`${BASE}/api/dhcp/pools/${poolId}/reservations/${mac}`),

  // 🔥 DHCP – leases
  getDhcpLeases: () => jget(`${BASE}/api/dhcp/leases`),
  getDhcpPoolLeases: (poolId) =>
    jget(`${BASE}/api/dhcp/pools/${poolId}/leases`),

};

contextBridge.exposeInMainWorld('api',api);
