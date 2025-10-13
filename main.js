// main.js
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// один общий прелоад для всех окон, ОБРАТИ ВНИМАНИЕ: preload.cjs
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

let mainWin;
const childWins = new Map(); // kind -> BrowserWindow

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 760,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });
  console.log('[main] using preload:', PRELOAD_PATH);
  mainWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[main] did-fail-load', { code, desc, url });
  });
  mainWin.loadFile('main.html');
}

function createChild(kind, { width = 1100, height = 720 } = {}) {
  const existing = childWins.get(kind);
  if (existing && !existing.isDestroyed()) { existing.focus(); return existing; }

  const win = new BrowserWindow({
    width, height,
    title: `WANT – ${kind.toUpperCase()}`,
    webContents: null,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[${kind}] did-fail-load`, { code, desc, url });
  });
  win.loadFile(`${kind}.html`);
  win.on('closed', () => childWins.delete(kind));
  childWins.set(kind, win);
  return win;
}

// ВАЖНО: НИЧЕГО НЕ ВОЗВРАЩАЕМ, кроме простого значения (окно клонировать нельзя)
ipcMain.handle('open-window', (_evt, kind) => {
  createChild(kind);
  return true;
});

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
