import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { StudyFlowApi } from '../shared/types';

const api: StudyFlowApi = {
  query: (sql, params = []) => ipcRenderer.invoke('db:query', { sql, params }),
  get: (sql, params = []) => ipcRenderer.invoke('db:get', { sql, params }),
  run: (sql, params = []) => ipcRenderer.invoke('db:run', { sql, params }),
  trayUpdate: (status) => ipcRenderer.invoke('tray:update', status),
  notify: (title, body) => ipcRenderer.invoke('notification:send', { title, body }),
  exportCsv: () => ipcRenderer.invoke('export:csv'),
  exportJson: () => ipcRenderer.invoke('export:json'),
  importJson: (mode) => ipcRenderer.invoke('import:json', { mode }),
  autoLaunchSet: (enabled) => ipcRenderer.invoke('autolaunch:set', { enabled }),
  focusModeSet: (enabled) => ipcRenderer.invoke('focusmode:set', { enabled }),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  appBlockerScan: (blocklist) => ipcRenderer.invoke('appblocker:scan', { blocklist }),
  appBlockerKill: (processes) => ipcRenderer.invoke('appblocker:kill', { processes }),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', { settings }),
  getChecklistItems: (isTemplate) => ipcRenderer.invoke('get-checklist-items', { isTemplate }),
  addChecklistItem: (text, isTemplate) => ipcRenderer.invoke('add-checklist-item', { text, isTemplate }),
  updateChecklistItem: (id, fields) => ipcRenderer.invoke('update-checklist-item', { id, fields }),
  deleteChecklistItem: (id) => ipcRenderer.invoke('delete-checklist-item', { id }),
  resetChecklistChecked: () => ipcRenderer.invoke('reset-checklist-checked'),
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  getNotesDir: () => ipcRenderer.invoke('get-notes-dir'),
  setNotesDir: (path) => ipcRenderer.invoke('set-notes-dir', { path }),
  getNotes: (subjectId) => ipcRenderer.invoke('get-notes', { subjectId }),
  getNote: (id) => ipcRenderer.invoke('get-note', { id }),
  saveNote: (payload) => ipcRenderer.invoke('save-note', payload),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', { id }),
  exportNote: (id, format) => ipcRenderer.invoke('export-note', { id, format }),
  runBackup: () => ipcRenderer.invoke('run-backup'),
  getBrowserBridgeStatus: () => ipcRenderer.invoke('browser-bridge:status'),
  setBrowserManualState: (state) => ipcRenderer.invoke('browser-bridge:manual-state', state),
  respondToBrowserConflict: (merge) => ipcRenderer.invoke('browser-bridge:conflict-response', { merge }),
  onTimerSettings: (callback) => {
    const listener = (_event: IpcRendererEvent, settings: Parameters<typeof callback>[0]) => callback(settings);
    ipcRenderer.on('timer:settings', listener);
    return () => ipcRenderer.removeListener('timer:settings', listener);
  },
  onTimerCommand: (callback) => {
    const listener = (_event: IpcRendererEvent, command: Parameters<typeof callback>[0]) => callback(command);
    ipcRenderer.on('timer:command', listener);
    return () => ipcRenderer.removeListener('timer:command', listener);
  },
  onBrowserConflict: (callback) => {
    const listener = (_event: IpcRendererEvent, event: Parameters<typeof callback>[0]) => callback(event);
    ipcRenderer.on('browser:conflict', listener);
    return () => ipcRenderer.removeListener('browser:conflict', listener);
  },
  onBrowserMerged: (callback) => {
    const listener = (_event: IpcRendererEvent, event: Parameters<typeof callback>[0]) => callback(event);
    ipcRenderer.on('browser:merged', listener);
    return () => ipcRenderer.removeListener('browser:merged', listener);
  },
  onBrowserSessionsUpdated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('browser:sessions-updated', listener);
    return () => ipcRenderer.removeListener('browser:sessions-updated', listener);
  },
  onSettingsUpdated: (callback) => {
    const listener = (_event: IpcRendererEvent, settings: Parameters<typeof callback>[0]) => callback(settings);
    ipcRenderer.on('settings:updated', listener);
    return () => ipcRenderer.removeListener('settings:updated', listener);
  }
};

contextBridge.exposeInMainWorld('studyflow', api);
