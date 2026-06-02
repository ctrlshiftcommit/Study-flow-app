import Database from 'better-sqlite3';
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dir = join(app.getPath('userData'), 'data');
    mkdirSync(dir, { recursive: true });
    db = new Database(join(dir, 'studyflow.sqlite'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)');
    ensureSchema();
    seedSettingsOnly();
  }
  return db;
}

export function getDbPath(): string {
  getDb();
  return db.name;
}

function ensureSchema(): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'normal',
  due_date INTEGER,
  created_at INTEGER NOT NULL,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER,
  session_type TEXT DEFAULT 'pomodoro',
  mood_before INTEGER,
  mood_after INTEGER,
  energy_before INTEGER,
  energy_after INTEGER,
  note TEXT,
  intention TEXT,
  goal TEXT DEFAULT '',
  goal_achieved TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  tags TEXT DEFAULT '["manual"]',
  source_url TEXT,
  source_title TEXT
);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  period TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT 'Untitled',
  filename TEXT,
  subject_id INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS flashcards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  interval_days REAL DEFAULT 1,
  ease_factor REAL DEFAULT 2.5,
  repetitions INTEGER DEFAULT 0,
  next_review INTEGER,
  created_at INTEGER NOT NULL,
  break_review INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  unlocked_at INTEGER
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  is_template INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS goal_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER,
  hit_date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(subject_id, hit_date)
);
CREATE TABLE IF NOT EXISTS weekly_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start INTEGER NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  created_at INTEGER NOT NULL
);`);

  addColumnIfMissing('sessions', 'goal', "TEXT DEFAULT ''");
  addColumnIfMissing('sessions', 'goal_achieved', "TEXT DEFAULT ''");
  addColumnIfMissing('sessions', 'source', "TEXT DEFAULT 'manual'");
  addColumnIfMissing('sessions', 'tags', "TEXT DEFAULT '[\"manual\"]'");
  addColumnIfMissing('sessions', 'source_url', 'TEXT');
  addColumnIfMissing('sessions', 'source_title', 'TEXT');
  addColumnIfMissing('checklist_items', 'is_template', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('checklist_items', 'created_at', 'TEXT');
  addColumnIfMissing('notes', 'filename', 'TEXT');
  db.prepare("UPDATE checklist_items SET created_at=datetime('now') WHERE created_at IS NULL OR created_at=''").run();
}

function addColumnIfMissing(table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (error) {
      if (!String(error).toLowerCase().includes('duplicate column')) throw error;
    }
  }
}

function seedSettingsOnly(): void {
  const database = db;
  const settingsRows = (database.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number }).count;
  if (settingsRows === 0) {
    for (const [key, value] of Object.entries(defaultSettings())) {
      database.prepare('INSERT INTO settings(key,value) VALUES (?,?)').run(key, JSON.stringify(value));
    }
  }
}

export function defaultSettings() {
  return {
    pomodoroFocus: 25,
    shortBreak: 5,
    longBreak: 15,
    autoStartBreaks: false,
    autoStartFocus: false,
    focusModeOnStart: false,
    ambientSound: 'silence',
    ambientDuringBreak: false,
    ambientVolume: 35,
    bellEnabled: true,
    bellVolume: 70,
    notifications: {
      intervals: true,
      goals: true,
      badges: true,
      weekly: true
    },
    blocklist: [],
    theme: 'dark',
    accent: '#5b6af0',
    autoLaunch: false,
    notes_dir: '',
    backup_dir: '',
    autoBackupEnabled: true,
    lastBackupAt: '',
    browserLoggingEnabled: false,
    browserPairingToken: randomBytes(18).toString('hex'),
    browserClassRules: []
  };
}
