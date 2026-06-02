import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import { join } from 'node:path';
import type { TrayTimerStatus } from '../shared/types';

let tray: Tray | null = null;
let status: TrayTimerStatus = { label: 'IDLE', state: 'idle', canSkip: false };

export function createTray(mainWindow: BrowserWindow): Tray {
  const iconPath = join(__dirname, '../../assets/icons/tray.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('StudyFlow');
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  updateTray(status, mainWindow);
  return tray;
}

export function updateTray(nextStatus: TrayTimerStatus, mainWindow?: BrowserWindow): void {
  status = nextStatus;
  if (!tray) return;
  tray.setToolTip(`StudyFlow - ${status.label}`);
  const isIdle = status.state === 'idle';
  const isRunning = status.state === 'running';
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Status: ${status.label}`, enabled: false },
      { type: 'separator' },
      { label: 'Start Session', enabled: isIdle, click: () => mainWindow?.webContents.send('timer:command', 'start') },
      { label: isRunning ? 'Pause' : 'Resume', enabled: !isIdle, click: () => mainWindow?.webContents.send('timer:command', isRunning ? 'pause' : 'resume') },
      { label: 'Skip Interval', enabled: status.canSkip, click: () => mainWindow?.webContents.send('timer:command', 'skip') },
      { type: 'separator' },
      { label: 'Open App', click: () => mainWindow?.show() },
      { label: 'Quit', click: () => app.quit() }
    ])
  );
}
