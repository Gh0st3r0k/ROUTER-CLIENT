const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createWindowManager } = require("../windows.cjs");

class FakeWindow {
  constructor(options) {
    this.options = options;
    this.events = {};
    this.webContents = { on() {} };
    this.focused = false;
    this.destroyed = false;
  }
  on(event, callback) {
    this.events[event] = callback;
  }
  loadFile(file) {
    this.file = file;
  }
  isDestroyed() {
    return this.destroyed;
  }
  focus() {
    this.focused = true;
  }
}

for (const page of ["main", "ports", "arp", "rip", "dhcp"]) {
  test(`${page} loads its local HTML with the shared isolated bridge`, () => {
    const windows = createWindowManager(FakeWindow, "/app");
    const window = windows.open(page);
    assert.equal(window.file, `/app/${page}.html`);
    assert.deepEqual(window.options.webPreferences, {
      preload: "/app/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    });
    assert.equal(windows.open(page), window);
    assert.equal(window.focused, true);
    window.events.closed();
    assert.notEqual(windows.open(page), window);
  });
}

test("unknown pages cannot be opened through the window manager", () => {
  const windows = createWindowManager(FakeWindow, "/app");
  for (const page of ["../secret", "toString", "__proto__", "", undefined]) {
    assert.throws(() => windows.open(page), /Unknown window/);
  }
});
