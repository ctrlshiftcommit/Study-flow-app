import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import { exec } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { marked } from 'marked';
import { getDb, defaultSettings } from './db';
import { sendNotification, setNotificationsEnabled } from './notifications';
import { setAutoLaunch } from './autolaunch';
import { updateTray } from './tray';
import { runBackup } from './backup';
import { getBrowserBridgeStatus, notifyBrowserSettingsChanged, respondToBrowserConflict, setBrowserManualState } from './browserBridge';
import type { Settings } from '../shared/types';

const execAsync = promisify(exec);
const tables = ['subjects', 'tasks', 'sessions', 'goals', 'checklist_items', 'notes', 'flashcards', 'achievements', 'goal_hits', 'settings'];
let runtimeSettings: Settings = defaultSettings() as Settings;

export function registerIpc(mainWindow: BrowserWindow): void {
  runtimeSettings = readSettings();
  applyRuntimeSettings(runtimeSettings, mainWindow);

  ipcMain.handle('db:query', (_event, { sql, params = [] }) => getDb().prepare(sql).all(params));
  ipcMain.handle('db:get', (_event, { sql, params = [] }) => getDb().prepare(sql).get(params));
  ipcMain.handle('db:run', (_event, { sql, params = [] }) => {
    const info = getDb().prepare(sql).run(params);
    return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
  });
  ipcMain.handle('tray:update', (_event, status) => updateTray(status, mainWindow));
  ipcMain.handle('notification:send', (_event, { title, body }) => sendNotification(title, body));
  ipcMain.handle('export:csv', async () => exportCsv());
  ipcMain.handle('export:json', async () => exportJson());
  ipcMain.handle('import:json', async (_event, { mode }) => importJson(mode));
  ipcMain.handle('autolaunch:set', (_event, { enabled }) => setAutoLaunch(Boolean(enabled)));
  ipcMain.handle('focusmode:set', (_event, { enabled }) => {
    mainWindow.setFullScreen(Boolean(enabled));
    return true;
  });
  ipcMain.handle('window:minimize', () => mainWindow.minimize());
  ipcMain.handle('window:maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  ipcMain.handle('window:close', () => mainWindow.close());
  ipcMain.handle('appblocker:scan', async (_event, { blocklist }) => scanBlocklist(Array.isArray(blocklist) && blocklist.length ? blocklist : runtimeSettings.blocklist));
  ipcMain.handle('appblocker:kill', async (_event, { processes }) => killProcesses(processes));
  ipcMain.handle('get-settings', () => readSettings());
  ipcMain.handle('save-settings', (_event, { settings }) => {
    runtimeSettings = saveSettings(settings as Settings);
    notifyBrowserSettingsChanged();
    applyRuntimeSettings(runtimeSettings, mainWindow);
    mainWindow.webContents.send('settings:updated', runtimeSettings);
    return runtimeSettings;
  });
  ipcMain.handle('browser-bridge:status', () => getBrowserBridgeStatus());
  ipcMain.handle('browser-bridge:manual-state', (_event, { active }) => setBrowserManualState(Boolean(active)));
  ipcMain.handle('browser-bridge:conflict-response', (_event, { merge }) => respondToBrowserConflict(Boolean(merge)));

  ipcMain.handle('get-checklist-items', (_event, { isTemplate }) => {
    return getDb().prepare('SELECT * FROM checklist_items WHERE is_template=? ORDER BY position ASC, id ASC').all(isTemplate ? 1 : 0);
  });
  ipcMain.handle('add-checklist-item', (_event, { text, isTemplate }) => {
    const db = getDb();
    const clean = String(text || '').trim();
    if (!clean) throw new Error('Checklist item text is required.');
    const max = db.prepare('SELECT COALESCE(MAX(position), -1) as position FROM checklist_items WHERE is_template=?').get(isTemplate ? 1 : 0) as { position: number };
    const info = db.prepare('INSERT INTO checklist_items(text,checked,position,is_template) VALUES (?,?,?,?)').run(clean, 0, max.position + 1, isTemplate ? 1 : 0);
    return db.prepare('SELECT * FROM checklist_items WHERE id=?').get(info.lastInsertRowid);
  });
  ipcMain.handle('update-checklist-item', (_event, { id, fields }) => {
    const allowed = ['text', 'checked', 'position'];
    const entries = Object.entries(fields || {}).filter(([key]) => allowed.includes(key));
    if (entries.length) {
      const sets = entries.map(([key]) => `${key}=?`).join(', ');
      getDb().prepare(`UPDATE checklist_items SET ${sets} WHERE id=?`).run([...entries.map(([, value]) => value), id]);
    }
    return getDb().prepare('SELECT * FROM checklist_items WHERE id=?').get(id);
  });
  ipcMain.handle('delete-checklist-item', (_event, { id }) => {
    getDb().prepare('DELETE FROM checklist_items WHERE id=?').run(id);
    return true;
  });
  ipcMain.handle('reset-checklist-checked', () => {
    getDb().prepare('UPDATE checklist_items SET checked=0 WHERE is_template=1').run();
    return true;
  });

  ipcMain.handle('get-notes-dir', () => notesDir());
  ipcMain.handle('set-notes-dir', (_event, { path }) => setSetting('notes_dir', String(path || '')));
  ipcMain.handle('choose-directory', async () => chooseDirectory());
  ipcMain.handle('get-notes', (_event, { subjectId }) => {
    if (subjectId) return getDb().prepare('SELECT id,title,subject_id,updated_at,filename FROM notes WHERE subject_id=? ORDER BY updated_at DESC').all(subjectId);
    return getDb().prepare('SELECT id,title,subject_id,updated_at,filename FROM notes ORDER BY updated_at DESC').all();
  });
  ipcMain.handle('get-note', (_event, { id }) => {
    const meta = getDb().prepare('SELECT * FROM notes WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!meta) return undefined;
    const content = readNoteContent(meta);
    return { meta, content };
  });
  ipcMain.handle('save-note', (_event, { id, title, content, subjectId }) => saveNote(id, title, content, subjectId));
  ipcMain.handle('delete-note', (_event, { id }) => deleteNote(id));
  ipcMain.handle('export-note', async (_event, { id, format }) => exportNote(id, format));
  ipcMain.handle('run-backup', () => {
    const result = runBackup(notesDir(), backupDir());
    setSetting('lastBackupAt', result.completedAt);
    return result;
  });
}

export function readSettings(): Settings {
  const db = getDb();
  const defaults = defaultSettings() as Settings;
  const rows = db.prepare('SELECT key,value FROM settings').all() as { key: string; value: string | null }[];
  const values = Object.fromEntries(rows.map((row) => {
    try {
      return [row.key, JSON.parse(row.value ?? 'null')];
    } catch {
      return [row.key, row.value];
    }
  }));
  const normalized = normalizeSettings(withDefaultDirs({ ...defaults, ...values }), defaults);
  persistNormalizedBrowserSettings(db, values, normalized);
  return normalized;
}

export function saveSettings(settings: Settings): Settings {
  const defaults = defaultSettings() as Settings;
  const merged = normalizeSettings(withDefaultDirs({ ...defaults, ...settings }), defaults);
  const db = getDb();
  const stmt = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(merged)) {
      if (key === 'checklist') continue;
      stmt.run(key, JSON.stringify(value));
    }
  });
  tx();
  runtimeSettings = merged;
  return merged;
}

function normalizeSettings(settings: Settings, defaults: Settings): Settings {
  const existingDistractions = normalizeDistractionRules(settings.browserDistractionRules || []);
  const defaultDistractions = normalizeDistractionRules(defaults.browserDistractionRules || []);
  const browserDistractionRules = [...existingDistractions];
  for (const rule of defaultDistractions) {
    if (!browserDistractionRules.some((item) => browserPatternKey(item.pattern) === browserPatternKey(rule.pattern))) {
      browserDistractionRules.push(rule);
    }
  }
  return {
    ...settings,
    browserClassRules: normalizeClassRules(settings.browserClassRules || []),
    browserDistractionRules,
    browserDistractionRemindersEnabled: settings.browserDistractionRemindersEnabled ?? defaults.browserDistractionRemindersEnabled,
    browserDistractionCooldownMinutes: settings.browserDistractionCooldownMinutes || defaults.browserDistractionCooldownMinutes,
    browserDistractionMessage: settings.browserDistractionMessage || defaults.browserDistractionMessage
  };
}

function persistNormalizedBrowserSettings(db: ReturnType<typeof getDb>, values: Record<string, unknown>, normalized: Settings): void {
  const stmt = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const key of ['browserClassRules', 'browserDistractionRules'] as const) {
    if (JSON.stringify(values[key] || []) !== JSON.stringify(normalized[key])) {
      stmt.run(key, JSON.stringify(normalized[key]));
    }
  }
}

function normalizeClassRules(rules: Settings['browserClassRules']): Settings['browserClassRules'] {
  const seen = new Set<string>();
  const normalized: Settings['browserClassRules'] = [];
  for (const rule of rules) {
    const pattern = normalizeBrowserPattern(rule.pattern);
    const key = browserPatternKey(pattern);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    normalized.push({ ...rule, pattern });
  }
  return normalized;
}

function normalizeDistractionRules(rules: Settings['browserDistractionRules']): Settings['browserDistractionRules'] {
  const seen = new Set<string>();
  const normalized: Settings['browserDistractionRules'] = [];
  for (const rule of rules) {
    const pattern = normalizeBrowserPattern(rule.pattern);
    const key = browserPatternKey(pattern);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    normalized.push({ ...rule, pattern, label: rule.label || browserLabelFromPattern(pattern) });
  }
  return normalized;
}

function normalizeBrowserPattern(value: string): string {
  let raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  raw = raw.replace(/^(https?):\/*(?!\/)/i, '$1://');
  raw = raw.replace(/\/{2,}$/g, '/');
  if (raw.includes('*')) return raw.replace(/^https:\/\/www\./i, 'https://').replace(/^http:\/\/www\./i, 'http://');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return value.trim();
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/g, '') : '';
    return `${parsed.protocol}//${host}${path || ''}/*`;
  } catch {
    return value.trim();
  }
}

function browserPatternKey(pattern: string): string {
  return pattern.trim().toLowerCase().replace(/^https?:\/\/www\./, 'https://').replace(/^http:\/\//, 'https://');
}

function browserLabelFromPattern(pattern: string): string {
  try {
    const parsed = new URL(pattern.replace('*', ''));
    return parsed.hostname.replace(/^www\./, '') || 'Website';
  } catch {
    return 'Website';
  }
}

function setSetting(key: keyof Settings, value: unknown): Settings {
  const next = { ...readSettings(), [key]: value } as Settings;
  runtimeSettings = saveSettings(next);
  return runtimeSettings;
}

function withDefaultDirs(settings: Settings): Settings {
  const documents = app.getPath('documents');
  return {
    ...settings,
    notes_dir: settings.notes_dir || join(documents, 'StudyFlow', 'Notes'),
    backup_dir: settings.backup_dir || join(documents, 'StudyFlow', 'Backups')
  };
}

function notesDir(): string {
  const dir = readSettings().notes_dir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function backupDir(): string {
  const dir = readSettings().backup_dir;
  mkdirSync(dir, { recursive: true });
  return dir;
}

function saveNote(id: number | null, title: string, content: string, subjectId?: number | null): { id: number; filename: string } {
  const db = getDb();
  const cleanTitle = title?.trim() || 'Untitled';
  const cleanContent = content || '';
  const hasContentColumn = tableHasColumn('notes', 'content');
  const timestamp = Date.now();
  let noteId = id;
  let previousFilename: string | null = null;
  if (!noteId) {
    const columns = ['title', 'subject_id', 'created_at', 'updated_at'];
    const values: unknown[] = [cleanTitle, subjectId || null, timestamp, timestamp];
    if (hasContentColumn) {
      columns.push('content');
      values.push(cleanContent);
    }
    const marks = columns.map(() => '?').join(',');
    const info = db.prepare(`INSERT INTO notes(${columns.join(',')}) VALUES (${marks})`).run(values);
    noteId = Number(info.lastInsertRowid);
  } else {
    const existing = db.prepare('SELECT filename FROM notes WHERE id=?').get(noteId) as { filename?: string | null } | undefined;
    if (!existing) {
      const columns = ['id', 'title', 'subject_id', 'created_at', 'updated_at'];
      const values: unknown[] = [noteId, cleanTitle, subjectId || null, timestamp, timestamp];
      if (hasContentColumn) {
        columns.push('content');
        values.push(cleanContent);
      }
      const marks = columns.map(() => '?').join(',');
      db.prepare(`INSERT INTO notes(${columns.join(',')}) VALUES (${marks})`).run(values);
    }
    previousFilename = existing?.filename || null;
  }
  const filename = `${noteId}-${slug(cleanTitle)}.md`;
  const updateContent = hasContentColumn ? ', content=?' : '';
  const params = hasContentColumn
    ? [cleanTitle, filename, subjectId || null, timestamp, cleanContent, noteId]
    : [cleanTitle, filename, subjectId || null, timestamp, noteId];
  db.prepare(`UPDATE notes SET title=?, filename=?, subject_id=?, updated_at=?${updateContent} WHERE id=?`).run(params);
  mkdirSync(notesDir(), { recursive: true });
  writeFileSync(join(notesDir(), filename), cleanContent, 'utf8');
  if (previousFilename && previousFilename !== filename) {
    try {
      unlinkSync(join(notesDir(), previousFilename));
    } catch {
      // Old title-derived files may already be gone.
    }
  }
  return { id: noteId, filename };
}

function tableHasColumn(table: string, column: string): boolean {
  return (getDb().prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((item) => item.name === column);
}

function deleteNote(id: number): boolean {
  const row = getDb().prepare('SELECT filename FROM notes WHERE id=?').get(id) as { filename?: string } | undefined;
  if (row?.filename) {
    try {
      unlinkSync(join(notesDir(), row.filename));
    } catch {
      // Missing note files are ignored; SQLite metadata still needs removal.
    }
  }
  getDb().prepare('DELETE FROM notes WHERE id=?').run(id);
  return true;
}

async function exportNote(id: number, format: 'md' | 'html'): Promise<string | null> {
  const note = getDb().prepare('SELECT * FROM notes WHERE id=?').get(id) as { title: string; filename?: string | null; content?: string | null } | undefined;
  if (!note) return null;
  const source = note.filename ? join(notesDir(), note.filename) : '';
  const result = await dialog.showSaveDialog({
    title: 'Export note',
    defaultPath: `${slug(note.title)}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  });
  if (result.canceled || !result.filePath) return null;
  const content = source && existsSync(source) ? readFileSync(source, 'utf8') : String(note.content || '');
  if (format === 'md') writeFileSync(result.filePath, content, 'utf8');
  else {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(note.title)}</title></head><body>${marked.parse(content)}</body></html>`;
    writeFileSync(result.filePath, html, 'utf8');
  }
  return result.filePath;
}

function readNoteContent(meta: Record<string, unknown>): string {
  const filename = typeof meta.filename === 'string' ? meta.filename.trim() : '';
  if (filename) {
    const file = join(notesDir(), filename);
    try {
      if (existsSync(file) && statSync(file).isFile()) return readFileSync(file, 'utf8');
    } catch {
      // Fall through to legacy SQLite content when a note file cannot be read.
    }
  }
  return String(meta.content || '');
}

async function chooseDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0] || null;
}

function applyRuntimeSettings(settings: Settings, mainWindow: BrowserWindow): void {
  setNotificationsEnabled(Object.values(settings.notifications || {}).some(Boolean));
  setAutoLaunch(Boolean(settings.autoLaunch)).catch(() => undefined);
  mainWindow.webContents.send('timer:settings', {
    pomodoroFocus: settings.pomodoroFocus,
    shortBreak: settings.shortBreak,
    longBreak: settings.longBreak
  });
}

async function exportCsv(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const outDir = join(result.filePaths[0], `studyflow-csv-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  const db = getDb();
  for (const table of tables) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    writeFileSync(join(outDir, `${table}.csv`), toCsv(rows), 'utf8');
  }
  return outDir;
}

async function exportJson(): Promise<string | null> {
  const result = await dialog.showSaveDialog({ title: 'Export StudyFlow backup', defaultPath: 'studyflow_backup.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return null;
  const db = getDb();
  const backup: Record<string, unknown> = {};
  for (const table of tables) backup[table] = db.prepare(`SELECT * FROM ${table}`).all();
  backup.exported_at = Date.now();
  writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf8');
  return result.filePath;
}

async function importJson(mode: 'merge' | 'overwrite'): Promise<boolean> {
  const result = await dialog.showOpenDialog({ title: 'Import StudyFlow backup', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (result.canceled || !result.filePaths[0] || !existsSync(result.filePaths[0])) return false;
  const backup = JSON.parse(readFileSync(result.filePaths[0], 'utf8')) as Record<string, Record<string, unknown>[]>;
  const db = getDb();
  const tx = db.transaction(() => {
    if (mode === 'overwrite') for (const table of [...tables].reverse()) db.prepare(`DELETE FROM ${table}`).run();
    for (const table of tables) {
      const rows = Array.isArray(backup[table]) ? backup[table] : [];
      for (const row of rows) {
        const keys = Object.keys(row);
        if (!keys.length) continue;
        const columns = keys.map((key) => `"${key}"`).join(',');
        const marks = keys.map(() => '?').join(',');
        const updates = keys.filter((key) => key !== 'id').map((key) => `"${key}"=excluded."${key}"`).join(',');
        db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${marks}) ON CONFLICT(id) DO UPDATE SET ${updates || 'id=id'}`).run(keys.map((key) => row[key]));
      }
    }
  });
  tx();
  return true;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))].join('\n');
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replaceAll('"', '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

async function scanBlocklist(blocklist: string[]): Promise<string[]> {
  const names = blocklist.map((item) => basename(String(item).trim()).toLowerCase()).filter(Boolean);
  if (!names.length) return [];
  const { stdout } = await execAsync('tasklist /FO CSV /NH');
  const running = stdout.split(/\r?\n/).map((line) => line.split('","')[0]?.replace(/^"|"$/g, '').toLowerCase()).filter(Boolean);
  return [...new Set(running.filter((name) => names.includes(name)))];
}

async function killProcesses(processes: string[]): Promise<boolean> {
  for (const processName of processes) await execAsync(`taskkill /F /IM "${processName.replaceAll('"', '')}"`).catch(() => undefined);
  return true;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'untitled';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}
