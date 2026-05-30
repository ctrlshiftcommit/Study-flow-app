import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb } from './db';

export interface BackupResult {
  path: string;
  files: number;
  message: string;
  completedAt: string;
}

const tables = ['subjects', 'tasks', 'sessions', 'goals', 'checklist_items', 'notes', 'flashcards', 'achievements', 'goal_hits', 'settings'];

export function runBackup(notesDir: string, backupDir: string): BackupResult {
  mkdirSync(backupDir, { recursive: true });
  const stamp = timestamp();
  const outDir = join(backupDir, stamp);
  mkdirSync(outDir, { recursive: true });
  const notesOutDir = join(outDir, 'notes');
  mkdirSync(notesOutDir, { recursive: true });

  let files = 0;
  const database = getDb();
  const notes = database.prepare('SELECT * FROM notes ORDER BY id ASC').all() as Record<string, unknown>[];
  for (const note of notes) {
    const title = String(note.title || 'Untitled');
    const filename = note.filename ? String(note.filename) : `${note.id}-${slug(title)}.md`;
    const source = notesDir && note.filename ? join(notesDir, String(note.filename)) : '';
    const content = source && existsSync(source) && statSync(source).isFile() ? readFileSync(source, 'utf8') : String(note.content || '');
    writeFileSync(join(notesOutDir, filename), content, 'utf8');
    files += 1;
  }

  const data: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const table of tables) data[table] = database.prepare(`SELECT * FROM ${table}`).all();
  writeFileSync(join(outDir, 'studyflow.json'), JSON.stringify(data, null, 2), 'utf8');
  files += 1;

  cleanupBackups(backupDir);
  const message = `Backup completed: ${files} files -> ${outDir}`;
  console.log(message);
  return { path: outDir, files, message, completedAt: new Date().toISOString() };
}

function cleanupBackups(backupDir: string): void {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const dirs = readdirSync(backupDir)
    .map((name) => ({ name, path: join(backupDir, name), stat: statSync(join(backupDir, name)) }))
    .filter((entry) => entry.stat.isDirectory())
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  for (const entry of dirs) {
    const stale = entry.stat.mtimeMs < cutoff;
    const overLimit = dirs.indexOf(entry) >= 30;
    if (stale || overLimit) rmSync(entry.path, { recursive: true, force: true });
  }
}

function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'untitled';
}
