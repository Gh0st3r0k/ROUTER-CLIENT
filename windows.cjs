const path = require("node:path");

const PAGE_OPTIONS = {
  main: { width: 1200, height: 760 },
  ports: { width: 1100, height: 720 },
  arp: { width: 1100, height: 720 },
  rip: { width: 1100, height: 720 },
  dhcp: { width: 1100, height: 720 },
};

/** Keeps one window per local page and shares the same isolated preload bridge. */
function createWindowManager(BrowserWindow, directory) {
  const windows = new Map();

  function open(kind) {
    if (!Object.hasOwn(PAGE_OPTIONS, kind)) {
      throw new Error(`Unknown window: ${kind}`);
    }
    const existing = windows.get(kind);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }

    const window = new BrowserWindow({
      ...PAGE_OPTIONS[kind],
      ...(kind === "main" ? {} : { title: `WANT – ${kind.toUpperCase()}` }),
      webPreferences: {
        preload: path.join(directory, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        // The CommonJS preload imports the shared HTTP adapter.
        sandbox: false,
      },
    });
    window.webContents.on("did-fail-load", (_event, code, description, url) => {
      console.error(`[${kind}] did-fail-load`, { code, description, url });
    });
    window.on("closed", () => windows.delete(kind));
    windows.set(kind, window);
    window.loadFile(path.join(directory, `${kind}.html`));
    return window;
  }

  return { open };
}

module.exports = { createWindowManager };
