export type Priority = 'urgent' | 'important' | 'normal' | 'low';
export type SessionType = 'pomodoro' | 'custom' | 'freeform';
export type GoalPeriod = 'daily' | 'weekly';
export type ThemeMode = 'dark' | 'light' | 'system';
export type FlashcardRating = 'again' | 'hard' | 'good' | 'easy';
export type TimerCommand = 'start' | 'pause' | 'resume' | 'skip';
export type TrayTimerState = 'idle' | 'running' | 'paused';
export type SessionSource = 'manual' | 'browser' | 'manual_browser';
export type BrowserRecordingState = 'idle' | 'prompting' | 'recording' | 'grace-paused' | 'paused-expired' | 'declined';
export type BrowserClassEventType = 'class-start' | 'class-heartbeat' | 'class-pause-grace' | 'class-ended';

export interface BrowserClassRule {
  id: string;
  pattern: string;
  subjectId: number | null;
}

export interface BrowserDistractionRule {
  id: string;
  pattern: string;
  label: string;
}

export interface BrowserBridgeStatus {
  running: boolean;
  host: string;
  port: number;
  enabled: boolean;
  paired: boolean;
  recording: boolean;
  activeSessionId: number | null;
  recordingState: BrowserRecordingState;
  activeSubjectId: number | null;
  activeUrl: string | null;
}

export interface BrowserConflictEvent {
  url: string;
  title: string;
}

export interface TrayTimerStatus {
  label: string;
  state: TrayTimerState;
  canSkip: boolean;
}

export interface Subject {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
  created_at: number;
}

export interface Task {
  id: number;
  subject_id: number | null;
  title: string;
  completed: number;
  priority: Priority;
  due_date?: number | null;
  created_at: number;
  sort_order?: number;
}

export interface Session {
  id: number;
  subject_id: number | null;
  started_at: number;
  ended_at?: number | null;
  duration_seconds?: number | null;
  session_type: SessionType;
  mood_before?: number | null;
  mood_after?: number | null;
  energy_before?: number | null;
  energy_after?: number | null;
  note?: string | null;
  intention?: string | null;
  goal?: string | null;
  goal_achieved?: string | null;
  source: SessionSource;
  tags: string;
  source_url?: string | null;
  source_title?: string | null;
}

export interface Goal {
  id: number;
  subject_id: number | null;
  period: GoalPeriod;
  target_minutes: number;
  created_at: number;
}

export interface ChecklistTemplate {
  id: number;
  subject_id: number | null;
  items: string;
}

export interface Note {
  id: number;
  subject_id: number | null;
  title?: string | null;
  filename?: string | null;
  created_at: number | string;
  updated_at: number | string;
}

export interface ChecklistItem {
  id: number;
  text: string;
  checked: number;
  position: number;
  is_template: number;
  created_at?: string;
}

export interface NoteSummary {
  id: number;
  title: string;
  subject_id: number | null;
  updated_at: number | string;
  filename?: string | null;
}

export interface NotePayload {
  meta: Note;
  content: string;
}

export interface Flashcard {
  id: number;
  subject_id: number | null;
  front: string;
  back: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  next_review: number | null;
  created_at: number;
  break_review?: number;
  review_count?: number;
}

export interface Achievement {
  id: number;
  key: string;
  unlocked_at: number | null;
}

export interface Settings {
  pomodoroFocus: number;
  shortBreak: number;
  longBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  focusModeOnStart: boolean;
  ambientSound: string;
  ambientDuringBreak: boolean;
  ambientVolume: number;
  bellEnabled: boolean;
  bellVolume: number;
  notifications: Record<string, boolean>;
  blocklist: string[];
  theme: ThemeMode;
  accent: string;
  autoLaunch: boolean;
  notes_dir: string;
  backup_dir: string;
  autoBackupEnabled: boolean;
  lastBackupAt: string;
  streakFreezeCredits: number;
  streakFreezeUsedDates: string[];
  browserLoggingEnabled: boolean;
  browserPairingToken: string;
  browserClassRules: BrowserClassRule[];
  browserDistractionRemindersEnabled: boolean;
  browserDistractionCooldownMinutes: number;
  browserDistractionMessage: string;
  browserDistractionRules: BrowserDistractionRule[];
}

export interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface StudyFlowApi {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<DbRunResult>;
  trayUpdate(status: TrayTimerStatus): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  exportCsv(): Promise<string | null>;
  exportJson(): Promise<string | null>;
  importJson(mode: 'merge' | 'overwrite'): Promise<boolean>;
  autoLaunchSet(enabled: boolean): Promise<boolean>;
  focusModeSet(enabled: boolean): Promise<boolean>;
  windowMinimize(): Promise<void>;
  windowMaximize(): Promise<void>;
  windowClose(): Promise<void>;
  appBlockerScan(blocklist: string[]): Promise<string[]>;
  appBlockerKill(processes: string[]): Promise<boolean>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<Settings>;
  getChecklistItems(isTemplate: boolean): Promise<ChecklistItem[]>;
  addChecklistItem(text: string, isTemplate: boolean): Promise<ChecklistItem>;
  updateChecklistItem(id: number, fields: Partial<Pick<ChecklistItem, 'text' | 'checked' | 'position'>>): Promise<ChecklistItem>;
  deleteChecklistItem(id: number): Promise<boolean>;
  resetChecklistChecked(): Promise<boolean>;
  chooseDirectory(): Promise<string | null>;
  getNotesDir(): Promise<string>;
  setNotesDir(path: string): Promise<Settings>;
  getNotes(subjectId?: number | null): Promise<NoteSummary[]>;
  getNote(id: number): Promise<NotePayload | undefined>;
  saveNote(payload: { id: number | null; title: string; content: string; subjectId: number | null }): Promise<{ id: number; filename: string }>;
  deleteNote(id: number): Promise<boolean>;
  exportNote(id: number, format: 'md' | 'html'): Promise<string | null>;
  runBackup(): Promise<{ path: string; files: number; message: string; completedAt: string }>;
  getBrowserBridgeStatus(): Promise<BrowserBridgeStatus>;
  setBrowserManualState(state: { active: boolean }): Promise<void>;
  respondToBrowserConflict(merge: boolean): Promise<void>;
  onTimerSettings(callback: (settings: Pick<Settings, 'pomodoroFocus' | 'shortBreak' | 'longBreak'>) => void): () => void;
  onTimerCommand(callback: (command: TimerCommand) => void): () => void;
  onBrowserConflict(callback: (event: BrowserConflictEvent) => void): () => void;
  onBrowserMerged(callback: (event: BrowserConflictEvent) => void): () => void;
  onBrowserSessionsUpdated(callback: () => void): () => void;
  onSettingsUpdated(callback: (settings: Settings) => void): () => void;
}

declare global {
  interface Window {
    studyflow: StudyFlowApi;
  }
}
