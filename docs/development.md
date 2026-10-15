# Client development and API contracts

## Process responsibilities

- `main.js` owns Electron lifecycle and the `open-window` IPC handler. It returns the serializable boolean `true`, not a `BrowserWindow` object.
- `windows.cjs` owns the main/ports/arp/rip/dhcp allowlist, common preload preferences, window reuse, load-error reporting, and cleanup on close. Page and preload paths resolve relative to the application directory.
- `preload.cjs` exposes `window.api` with explicit interface, route, ARP, Proxy ARP, RIP, and DHCP operations. Endpoint paths and request property names remain compatible with the server.
- `http-client.cjs` centralizes fetch methods, JSON request bodies, HTTP status errors, and successful empty mutation responses. Reads require valid JSON; writes accept an empty 200/204 response. Network failures propagate to the caller.
- Each HTML page contains its own styles and renderer logic. Selected views accept both current camelCase and legacy PascalCase response properties.

## API groups

| Preload methods | Server paths |
| --- | --- |
| `getInterfaces`, `setIfaceAddress`, `setIfaceDisplayName` | `/api/interface` and per-GUID address/display-name resources |
| `getRoutes`, `addRouteDirect`, `addRouteVia`, `deleteRoute`, `addConnected` | `/api/routes` and route-addition actions |
| `getArpCache`, `flushArpCache`, `getArpTtl`, `setArpTtl`, `sendArp` | `/api/arp/cache`, `/api/arp/cache/ttl`, `/api/arp/request` |
| `getProxyArpStates`, `setProxyArp` | `/api/proxy-arp` |
| `getRipInterfaces`, `ripEnable`, `ripDisable`, `getRipTimers`, `setRipTimers` | `/api/rip/interfaces`, `/enable`, `/disable`, `/timers` |
| `getDhcpSettings`, `setDhcpSettings` | `/api/dhcp/settings` |
| Pool, reservation, and lease methods | `/api/dhcp/pools`, per-pool reservations/leases, `/api/dhcp/leases` |
| `openWindow` | Electron IPC only; no HTTP request |

See the server's [API reference](https://github.com/Gh0st3r0k/Router-Server/blob/main/docs/api.md) for full payloads and response details. The API base is `http://localhost:5104`; there is no remote connection configuration screen.

## Units and defaults

RIP timer and global DHCP setting endpoints use **seconds**. The DHCP form's dynamic lease input uses seconds throughout. A pool's `dynamicLeaseTimeOverride` uses a `TimeSpan` string, e.g. `00:05:00`. The ARP control applies the selected number to both its client-side refresh interval and the server's new-entry TTL; these are separate mechanisms despite sharing the current UI control.

Proxy ARP defaults to enabled when no explicit interface state exists. RIP defaults to disabled. Automatic DHCP allocation takes precedence over dynamic allocation when both flags are enabled, so disable automatic mode when testing expiring leases.

## Validation

`npm test` uses injected fetch/window doubles and a VM-loaded preload bridge to verify contracts without importing Electron in Node. These tests catch wrong HTTP verbs, URLs, bodies, status handling, and window lifetime behavior; they do not exercise a graphical renderer.

`npm run test:smoke` launches the real Electron binary and uses its local DevTools protocol to call `window.api`, validate server state round trips, and inspect all loaded pages. Use a disposable backend, since global timings are temporarily modified. The test attempts to restore every changed setting and remove temporary resources even when another check fails.

Electron and REST checks do not establish that Npcap capture/injection, physical adapter detection, forwarding, ARP, RIP convergence, or DHCP exchanges work. Those require a Windows lab with real interfaces and packet captures. The backend's xUnit suite separately exercises in-memory routing, ARP frame bytes, and synthetic RIPv2 input.
