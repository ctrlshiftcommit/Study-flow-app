import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import { join } from 'node:path';

let tray: Tray | null = null;
let status = 'IDLE';

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

export function updateTray(label: string, mainWindow?: BrowserWindow): void {
  status = label;
  if (!tray) return;
  tray.setToolTip(`StudyFlow - ${label}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Status: ${label}`, enabled: false },
      { type: 'separator' },
      { label: 'Start Session', click: () => mainWindow?.webContents.send('timer:command', 'start') },
      { label: 'Pause', click: () => mainWindow?.webContents.send('timer:command', 'pause') },
      { label: 'Skip Break', click: () => mainWindow?.webContents.send('timer:command', 'skip') },
      { type: 'separator' },
      { label: 'Open App', click: () => mainWindow?.show() },
      { label: 'Quit', click: () => app.quit() }
    ])
  );
}
