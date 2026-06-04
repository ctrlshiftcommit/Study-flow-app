import { app, BrowserWindow, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTray } from './tray';
import { registerIpc } from './ipc';
import { runBackup } from './backup';
import { readSettings, saveSettings } from './ipc';
import { startBrowserBridge, stopBrowserBridge } from './browserBridge';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
if (process.platform === 'win32') app.setAppUserModelId('com.studyflow.app');

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();

interface SavedWindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function windowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState(): SavedWindowState | null {
  try {
    const path = windowStatePath();
    if (!existsSync(path)) return null;
    const state = JSON.parse(readFileSync(path, 'utf8')) as Partial<SavedWindowState>;
    if (typeof state.width !== 'number' || typeof state.height !== 'number') return null;
    return {
      x: typeof state.x === 'number' ? state.x : undefined,
      y: typeof state.y === 'number' ? state.y : undefined,
      width: state.width,
      height: state.height,
      isMaximized: state.isMaximized === true
    };
  } catch {
    return null;
  }
}

function saveWindowState(win: BrowserWindow): void {
  const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
  const state: SavedWindowState = { ...bounds, isMaximized: win.isMaximized() };
  writeFileSync(windowStatePath(), JSON.stringify(state));
}

function createWindow(): BrowserWindow {
  const state = loadWindowState();
  const appIconPath = join(__dirname, '../../assets/icons/icon.ico');
  const win = new BrowserWindow({
    ...(state ? { x: state.x, y: state.y, width: state.width, height: state.height } : { width: 1280, height: 800, center: true }),
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: true,
    titleBarStyle: 'hidden',
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'StudyFlow',
    icon: appIconPath,
    backgroundColor: '#00000000',
    vibrancy: 'fullscreen-ui',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  if (process.platform === 'win32') {
    win.setAppDetails({ appId: 'com.studyflow.app', appIconPath, appIconIndex: 0 });
  }
  win.removeMenu();
  win.once('ready-to-show', () => {
    if (state?.isMaximized) win.maximize();
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.on('close', (event) => {
    saveWindowState(win);
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  registerIpc(win);
  startBrowserBridge(win, readSettings, saveSettings);
  createTray(win);
  scheduleBackups();
  return win;
}

let backupTimer: NodeJS.Timeout | null = null;

function scheduleBackups(): void {
  if (backupTimer) return;
  const run = () => {
    const settings = readSettings();
    if (!settings.autoBackupEnabled) return;
    runBackup(settings.notes_dir, settings.backup_dir);
  };
  setTimeout(run, 5000);
  backupTimer = setInterval(run, 4 * 60 * 60 * 1000);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  mainWindow = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    else mainWindow?.show();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBrowserBridge();
  const settings = readSettings();
  if (settings.autoBackupEnabled) runBackup(settings.notes_dir, settings.backup_dir);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
