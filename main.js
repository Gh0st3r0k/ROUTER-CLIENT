import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import windowManager from "./windows.cjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const windows = windowManager.createWindowManager(BrowserWindow, directory);

ipcMain.handle("open-window", (_event, kind) => {
  // The IPC result must be serializable; BrowserWindow instances cannot cross it.
  windows.open(kind);
  return true;
});

app.whenReady().then(() => {
  windows.open("main");
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) windows.open("main");
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
