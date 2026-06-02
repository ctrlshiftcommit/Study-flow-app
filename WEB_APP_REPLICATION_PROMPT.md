# StudyFlow Web App Replication Prompt

Copy the prompt below into Codex while the existing Electron project is available in the workspace.

---

You are a senior React and TypeScript engineer. Convert the existing **StudyFlow** Windows Electron desktop application in this repository into a polished, installable, offline-first web application while preserving the current product identity, workflows, calculations, and visible feature set as faithfully as browser security permits.

Do not make a generic study dashboard inspired by the desktop app. Treat the current Electron app as the source of truth. Reuse its domain logic, copy, visual system, assets, and interaction patterns wherever possible. The result should feel like the same StudyFlow product running in a browser.

## 1. Read The Existing App Before Editing

Inspect these source files first:

- `README.md`
- `package.json`
- `src/shared/types.ts`
- `src/main/db.ts`
- `src/main/ipc.ts`
- `src/main/backup.ts`
- `src/main/index.ts`
- `src/main/tray.ts`
- `src/main/notifications.ts`
- `src/main/autolaunch.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `src/renderer/src/store/useStudyStore.ts`
- `src/renderer/src/utils/achievements.ts`
- `src/renderer/src/utils/sm2.ts`
- `src/renderer/src/utils/time.ts`
- `src/renderer/src/utils/quotes.ts`
- `src/renderer/src/components/GoalModal.tsx`
- `src/renderer/src/components/Modal.tsx`
- `src/renderer/src/components/PageHeader.tsx`
- `assets/icons/tray.png`
- `assets/sounds/*.flac`

Before implementation, produce a short migration inventory listing:

1. Features that can be reproduced exactly in a browser.
2. Desktop-only features that require a browser substitute.
3. Existing reusable renderer code and utilities.
4. The new browser storage and backup design.

Do not remove the Electron application unless explicitly asked. Prefer creating a new web app directory such as `web/` so the original desktop build remains intact for comparison.

## 2. Product Goal

Build an installable StudyFlow Progressive Web App using:

- React
- TypeScript
- Vite
- CSS with the existing visual language preserved
- Zustand for client state
- Dexie with IndexedDB for offline-first persistence
- Recharts for analytics
- `marked` for Markdown preview
- Lucide React for icons
- Howler or browser audio APIs for ambient playback and alerts
- `vite-plugin-pwa` for installability, cached static assets, and offline loading
- Vitest and React Testing Library for focused unit and integration tests
- Playwright for browser workflow verification if available

Keep this primarily client-side and local-first. The application must work without an account and without an internet connection after the initial load.

## 3. Preserve The Existing Visual Identity

Match the current StudyFlow desktop appearance closely:

- Dark full-screen gradient background: deep navy and purple base with subtle cyan, green, pink, violet, and blue blurred glow areas.
- Glassmorphism panels with translucent white surfaces, thin semi-transparent borders, backdrop blur, subtle internal highlight lines, and restrained shadows.
- Left sidebar with the StudyFlow tray icon, product name, navigation buttons, and a small "Today" study-time metric at the bottom.
- Pages: Dashboard, Timer, Subjects, Analytics, Flashcards, Notes, and Settings.
- White and translucent text hierarchy, muted labels, compact control typography, rounded inputs, compact buttons, subtle hover lift, and visible keyboard focus.
- Accent color setting that updates the CSS variables used by progress bars, selected states, timer ring, chart fills, and checkboxes.
- Reuse `assets/icons/tray.png` as the app mark and reuse the ambient audio assets.
- Preserve the existing empty states, modals, toast style, hover transitions, route fade-in, timer-ring animation, flashcard flip animation, heatmap styling, and achievement cards.

Use the current `src/renderer/src/styles.css` as a visual reference. Port it carefully, then improve responsiveness without changing the recognizable desktop layout.

### Responsive Requirements

- At desktop widths, preserve the original two-column shell with a `216px` sidebar and centered content.
- At tablet widths, collapse the sidebar to an icon rail similar to the current `@media (max-width: 980px)` behavior.
- At small mobile widths, use an accessible bottom navigation bar or a compact collapsible navigation drawer. Do not force the current `900px` minimum width on web users.
- Ensure timer controls wrap cleanly, analytics charts remain readable, settings panels become one column, and the notes editor switches from side-by-side panes to a practical mobile layout.
- Do not ship horizontal overflow on common mobile widths such as `375px`.

## 4. Browser Architecture

The desktop renderer currently calls `window.studyflow.*` IPC methods and sometimes passes SQL strings. Replace that with a typed browser service layer. Do not expose raw SQL in the web UI.

Create an API such as:

```ts
interface StudyFlowWebApi {
  subjects: SubjectRepository;
  tasks: TaskRepository;
  sessions: SessionRepository;
  goals: GoalRepository;
  checklist: ChecklistRepository;
  notes: NotesRepository;
  flashcards: FlashcardRepository;
  achievements: AchievementRepository;
  settings: SettingsRepository;
  backups: BackupRepository;
}
```

Use Dexie tables and repository methods for reads and writes. Keep React components focused on UI behavior. Move persistence, validation, merge rules, and backup serialization out of components.

Split the current monolithic renderer into feature modules while preserving behavior:

```text
web/src/
  app/
    App.tsx
    navigation.ts
  components/
    Modal.tsx
    PageHeader.tsx
    Metric.tsx
    EmptyState.tsx
    Toast.tsx
  features/
    dashboard/
    timer/
    subjects/
    analytics/
    flashcards/
    notes/
    settings/
  data/
    db.ts
    schema.ts
    repositories/
    backup/
  store/
    useStudyStore.ts
  utils/
    achievements.ts
    sm2.ts
    time.ts
    quotes.ts
  styles/
    index.css
```

Keep the app maintainable: `App.tsx` should compose pages and shell elements, not contain the full implementation.

## 5. IndexedDB Data Model

Preserve the existing logical schema. Store notes content directly in IndexedDB because a web application cannot silently maintain arbitrary Markdown files on disk.

Implement Dexie tables equivalent to:

```ts
interface Subject {
  id?: number;
  name: string;
  color: string;
  icon?: string | null;
  created_at: number;
}

interface Task {
  id?: number;
  subject_id: number | null;
  title: string;
  completed: number;
  priority: 'urgent' | 'important' | 'normal' | 'low';
  due_date?: number | null;
  created_at: number;
  sort_order?: number;
}

interface Session {
  id?: number;
  subject_id: number | null;
  started_at: number;
  ended_at?: number | null;
  duration_seconds?: number | null;
  session_type: 'pomodoro' | 'custom' | 'freeform';
  mood_before?: number | null;
  mood_after?: number | null;
  energy_before?: number | null;
  energy_after?: number | null;
  note?: string | null;
  intention?: string | null;
  goal?: string | null;
  goal_achieved?: 'yes' | 'partial' | 'no' | null;
}

interface Goal {
  id?: number;
  subject_id: number | null;
  period: 'daily' | 'weekly';
  target_minutes: number;
  created_at: number;
}

interface ChecklistItem {
  id?: number;
  text: string;
  checked: number;
  position: number;
  is_template: number;
  created_at?: string;
}

interface Note {
  id?: number;
  subject_id: number | null;
  title: string;
  content: string;
  created_at: number | string;
  updated_at: number | string;
}

interface Flashcard {
  id?: number;
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

interface Achievement {
  id?: number;
  key: string;
  unlocked_at: number | null;
}

interface GoalHit {
  id?: number;
  subject_id: number | null;
  hit_date: string;
  created_at: number;
}

interface WeeklyReport {
  id?: number;
  week_start: number;
  summary: string;
  created_at: number;
}
```

Also add a `backupSnapshots` table for local rolling snapshots and an `appMetadata` table for schema version and migration state.

Preserve settings equivalent to:

```ts
interface Settings {
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
  theme: 'dark' | 'light' | 'system';
  accent: string;
  autoLaunch: boolean;
  notes_dir: string;
  backup_dir: string;
  autoBackupEnabled: boolean;
  lastBackupAt: string;
}
```

For desktop-only settings such as `autoLaunch`, `notes_dir`, `backup_dir`, and process `blocklist`, preserve import compatibility but display web-appropriate settings and explanations instead of pretending the browser can perform those operations.

## 6. Exact Pages And Workflows

### Dashboard

Recreate:

- Page heading and rotating motivational quote.
- Quick-start subject buttons that open Timer with the selected subject and immediately begin the pre-session intention flow.
- Metric cards for today's study time, active streak, due flashcards, and best streak.
- Daily goals panel with per-subject progress bars, current minutes, target minutes, percentage, and remaining minutes.
- Recent sessions panel with subject, timestamp, mood, and duration.
- Achievements panel showing unlocked and locked badges.
- Empty state prompting users to create a subject when none exists.

### Timer

Recreate the complete session workflow:

1. Choose subject.
2. Choose mode: Pomodoro, custom, or freeform.
3. Set custom focus duration where relevant.
4. Record mood before and energy before using the existing `1-5` rating UI.
5. Enter or skip a session intention with a maximum length of `280` characters.
6. Show the reusable pre-session checklist modal. Allow add, edit, delete, check, uncheck, reorder up, and reorder down.
7. Start the timer only after the checklist flow.
8. Display the circular SVG timer ring, formatted countdown, subject or break label, session intention, and session streak.
9. Provide Start, Pause, Resume, Skip, and Stop controls.
10. Use a danger ring color in the final minute and a warning ring color after `80%` progress.
11. After a focus interval, show the post-session reflection modal with mood after, energy after, goal-achievement result, note, save, and skip-reflection actions.
12. Store the completed session and recalculate achievements and daily goal hits.
13. Move into short break or long break. Every fourth completed Pomodoro should lead to a long break.
14. During breaks, show break-review flashcards queued by the user.
15. Respect auto-start focus and auto-start break settings while the app is open.

Use timestamps to derive elapsed time so the timer recovers correctly after tab suspension, navigation, refresh, or a temporary device sleep. Do not rely only on decrementing React state once per second.

### Subjects And Tasks

Recreate:

- Empty state for a first subject.
- Subject creation with name, color, and optional icon text.
- Subject selection.
- Subject editing for name and icon.
- Subject deletion with a clear confirmation. Delete its tasks and detach sessions, goals, notes, flashcards, and goal hits from the removed subject rather than silently deleting historical study records.
- Task creation with title, priority, optional due date, creation timestamp, and sort order.
- Task completion toggle, delete, and move up/down controls.
- Four-cell Eisenhower matrix using the app's existing priority mapping:
  - Urgent + Important: `urgent`
  - Not Urgent + Important: `important`
  - Urgent + Not Important: `normal`
  - Neither: `low`
- Daily and weekly subject goals with progress bars.

### Analytics

Preserve all analytics controls and calculations:

- Period selector: Week, Month, Year, Lifetime.
- Tabs: Overview, Subjects, Time Patterns, Sessions.
- Overview metrics: total study time, sessions completed, average session, longest session, current streak, best streak, days studied, and average per active day.
- Overview insight cards: most studied subject, most active time, most active weekday, best study day, best week, and best month.
- Trend chart appropriate to selected period:
  - Week: daily buckets
  - Month: daily buckets
  - Year: monthly buckets
  - Lifetime: monthly buckets up to `18` months, then yearly buckets
- Subjects tab:
  - study-time bar chart by subject
  - distribution pie chart
  - subject leaderboard with rank, color, duration, session count, average session, percentage, and progress bar
- Time Patterns tab:
  - study time by hour
  - study time by weekday
  - Pomodoro/custom/freeform session-type pie chart
  - records panel
- Sessions tab:
  - `365`-day heatmap
  - mood and energy line chart
  - recent-period trend line chart
  - subject-filtered session log
  - goal progress
- Weekly report modal with this-week total, last-week total, most-studied subject, and goal completion.
- Proper empty states when there is no session data.

Reuse and port the current analytics functions instead of rewriting the calculations from scratch unless there is a proven bug.

### Flashcards

Recreate:

- Card creation with optional subject, front, and back.
- Review Due and All views.
- Card list with due date and interval.
- Add-to-break and remove-from-break actions.
- Break Review embedded in the Timer page during breaks.
- Review modal with card-flip animation.
- Reveal action followed by rating actions: Again, Hard, Good, Easy.
- Existing SM-2 spaced-repetition behavior from `src/renderer/src/utils/sm2.ts`.
- Deck stats per subject: total, due, and mastered where mastered means interval greater than `21` days.

### Notes

Recreate:

- Notes header and New Note action.
- Notes list panel with search, relative update time, selected state, delete action, and total notes count.
- Empty states for no notes and no selected note.
- Note editor with title, optional subject link, export, and delete.
- Markdown toolbar actions:
  - bold
  - italic
  - inline code
  - heading
  - link
  - unordered list
  - ordered list
  - quote
- Edit, split, and preview modes.
- Autosave after approximately `800ms` of inactivity plus save on blur.
- Visible save-state label: Saving, Saved, or Unsaved changes.
- Word and character counts.
- Markdown preview styling equivalent to the desktop app.
- Export selected note as `.md`.
- Also provide export as `.html`, preserving the desktop capability even if the current visible desktop button only exports Markdown.

On the web, store note content in IndexedDB. Do not claim arbitrary local filesystem writes occur automatically. Where the File System Access API is supported, optionally allow the user to explicitly export notes or select a backup directory after granting permission.

### Settings

Recreate and adapt:

- Timer lengths: focus, short break, long break.
- Auto-start breaks.
- Auto-start focus.
- Checklist template editor.
- Ambient selection: Silence, Lo-fi, Rain, White Noise, Cafe.
- Ambient volume.
- Play ambient during breaks.
- Bell alerts and bell volume.
- Enter browser Focus Mode when a session starts.
- Appearance theme: dark, light, system.
- Accent color.
- Notifications toggle.
- Backup area with backup status, automatic backup setting, Backup Now, export, restore, and snapshot history.
- Data area with CSV export, JSON export, JSON import, and Clear All Data.
- Feedback email and Copy Email action.
- Brief explanations for browser-only constraints.

Maintain the small "Saved" confirmation behavior for settings changes.

## 7. Achievements

Port all existing badges and unlock conditions from `src/renderer/src/utils/achievements.ts`.

The timer save workflow must unlock achievements after a saved session and show a toast plus browser notification where permitted.

Preserve conditions equivalent to:

- first session
- `10`, `50`, and `100` study hours
- `3`, `7`, and `30` day streaks
- `10` Pomodoros
- `50` reviewed flashcards
- `5` reached goals
- night owl
- early bird

## 8. Browser Substitutes For Desktop-Only Features

Browsers cannot reproduce every Electron or Windows feature. Implement honest, polished substitutes. Do not ship fake buttons.

| Desktop capability | Required web behavior |
| --- | --- |
| Frameless Electron window controls | Remove minimize and close controls. Replace maximize with an optional Fullscreen button using the Fullscreen API. Keep the top bar only if it remains visually useful. |
| Windows tray icon and tray timer label | Update `document.title` with timer status. Update favicon or app badge where supported. Keep timer visible in the app shell. |
| Desktop notifications | Use the browser Notifications API after an explicit permission request. Gracefully fall back to in-app toast notifications. |
| Fullscreen Focus Mode | Use `document.documentElement.requestFullscreen()` from a user action. Exit with `document.exitFullscreen()`. Show a clear message if unavailable or rejected. |
| Kill blocked Windows processes | This is not possible from a browser. Replace it with a "Distraction list" setting and a Focus Mode reminder panel. Clearly state that websites cannot close desktop apps. Optionally offer a generated checklist based on the user's distraction list. |
| Auto-launch at Windows sign-in | Replace with PWA installation guidance and explain that OS startup behavior depends on the installed browser and operating system. Do not display a working toggle unless the platform provides a real implementation. |
| Arbitrary local notes directory | Store notes in IndexedDB. Offer explicit Markdown export and optional directory-granted export where File System Access API is supported. |
| Arbitrary local backup directory | Use automatic IndexedDB snapshots, manual download, and optional permission-granted directory backups where supported. |
| Backup on application quit | Browsers do not guarantee async work during tab close. Trigger snapshots after meaningful changes, every four hours while open, on `visibilitychange` when hidden, and on `pagehide` as a best-effort fallback. |

## 9. Backup And Restore: Required Core Feature

Backup is not an afterthought. Implement it as a first-class feature.

### Backup Format

Create a versioned JSON backup format:

```ts
interface StudyFlowBackup {
  format: 'studyflow-web-backup';
  version: 1;
  exported_at: string;
  app_version: string;
  data: {
    subjects: Subject[];
    tasks: Task[];
    sessions: Session[];
    goals: Goal[];
    checklist_items: ChecklistItem[];
    notes: Note[];
    flashcards: Flashcard[];
    achievements: Achievement[];
    goal_hits: GoalHit[];
    weekly_reports: WeeklyReport[];
    settings: Settings;
  };
}
```

Validate imported files before changing user data. Reject invalid or unsupported backup files with a useful message.

### Required Backup Features

- Backup Now button.
- Download a complete `.studyflow-backup.json` file.
- Restore from a selected backup file.
- Restore modes:
  - **Merge**: insert new records and update records with matching IDs.
  - **Overwrite**: create a safety snapshot, clear user data, then restore the selected file.
- Local rolling backup snapshots stored in IndexedDB.
- Snapshot history panel showing created timestamp, reason, size, download, restore, and delete actions.
- Keep at most `30` snapshots and remove snapshots older than `30` days.
- Create automatic snapshots:
  - about `5` seconds after first load if automatic backups are enabled
  - every `4` hours while the app remains open
  - after a successful import
  - before overwrite restore
  - before clearing all data
  - after meaningful mutations using a debounced strategy so ordinary editing does not create excessive snapshots
  - when the tab becomes hidden as a best effort
- Save `lastBackupAt`.
- Display a visible toast for successful backup and restore actions.

### Optional Permission-Granted Folder Backup

When the File System Access API is available:

- Add a "Choose Backup Folder" action.
- Ask the user to explicitly select a directory.
- Persist the directory handle in IndexedDB where possible.
- Re-check permission before writing.
- Save timestamped backup JSON files into the granted folder.
- Fall back to browser download if permission is missing or unsupported.

Do not claim this works silently in every browser.

### Optional Encrypted Cloud Backup

Add this only after the local web app and local backup system work correctly.

Provide an opt-in off-device backup adapter that can be configured later with Supabase Auth and a private Supabase Storage bucket. Keep it disabled when configuration is absent. Encrypt the serialized backup in the browser before upload using Web Crypto AES-GCM and a user-provided passphrase-derived key. Never upload the plaintext backup or persist the passphrase. Clearly label this as optional cloud backup, not live multi-device sync.

Keep the cloud adapter behind a small interface so another provider can replace it later:

```ts
interface CloudBackupAdapter {
  list(): Promise<CloudBackupMetadata[]>;
  upload(encryptedBackup: Blob, metadata: CloudBackupMetadata): Promise<void>;
  download(id: string): Promise<Blob>;
  remove(id: string): Promise<void>;
}
```

## 10. CSV And JSON Data Portability

Recreate the desktop export behavior:

- Export complete JSON backup.
- Import JSON backup.
- Export CSV data as a downloadable ZIP containing one CSV file per logical table.
- Export notes content inside the JSON backup and optionally as Markdown files inside the ZIP.
- Preserve desktop backup import compatibility where practical. If a desktop backup includes note metadata but no note content, restore the metadata and show a clear note-content warning.

## 11. PWA And Offline Behavior

Make the web application installable:

- Add a valid web manifest with product name `StudyFlow`, short name `StudyFlow`, theme colors matching the desktop design, icons derived from the supplied app assets, and standalone display mode.
- Cache the app shell, CSS, icons, and ambient audio files.
- Ensure the application loads offline after the first successful visit.
- Show a compact offline-ready indicator or toast after service-worker activation.
- Avoid caching user backup exports.
- Verify timer and IndexedDB data survive a page reload.

## 12. Notifications, Audio, And Timer Resilience

- Ask for notification permission only after a user action, such as enabling notifications in Settings.
- Use in-app toast notifications regardless of browser permission state.
- Ring the existing short bell alert at interval completion when enabled.
- Loop the selected ambient audio while a timer is running.
- Respect the setting for ambient playback during breaks.
- Pause audio when appropriate.
- Handle browser autoplay restrictions by starting audio only after a user gesture.
- Store active timer state in IndexedDB or local storage:
  - running state
  - phase
  - started timestamp
  - target end timestamp
  - selected subject
  - timer mode
  - custom duration
  - intention
- Recover the correct remaining time after refresh or tab suspension.

## 13. Data Integrity Rules

- Never silently discard data.
- Confirm destructive actions.
- Before Clear All Data, create a safety snapshot.
- Before overwrite restore, create a safety snapshot.
- When deleting a subject, delete its tasks but detach historical records from the subject.
- Keep numeric timestamps consistent.
- Enforce required fields.
- Normalize and validate accent colors.
- Deduplicate goal hits by subject and day.
- Deduplicate achievements by key.
- Sanitize rendered Markdown HTML before inserting it into the DOM. Use a library such as DOMPurify with `marked`.
- Add Dexie schema migrations for future evolution.

## 14. Accessibility

- Use semantic buttons, labels, headings, and form controls.
- Preserve keyboard-visible focus.
- Add `aria-label` text for icon-only actions.
- Ensure modal focus is trapped and restored when closed.
- Support Escape to close dismissible modals.
- Respect `prefers-reduced-motion`.
- Ensure text remains readable against glass surfaces.
- Do not rely on color alone for selected, warning, or success states.

## 15. Testing Requirements

Add focused tests for:

- SM-2 flashcard scheduling for Again, Hard, Good, and Easy.
- Streak calculation.
- Daily and weekly goal progress.
- Analytics period filtering and trend buckets.
- Achievement unlocking.
- Backup serialization.
- Backup validation.
- Merge restore.
- Overwrite restore and pre-restore safety snapshot.
- Snapshot retention: maximum `30` snapshots and maximum age `30` days.
- Subject deletion detaches historical records.
- Active timer recovery after simulated reload.
- Notes autosave.

Run typechecking, tests, and a production build.

Use browser verification to test:

1. Create a subject.
2. Add a task and goal.
3. Start a focus session through intention and checklist.
4. Complete or skip the timer and save a reflection.
5. Verify dashboard metrics and analytics update.
6. Create a flashcard and review it.
7. Create a Markdown note and verify preview plus autosave.
8. Create a manual backup, clear data, restore from backup, and verify the records return.
9. Reload the browser and verify IndexedDB persistence.
10. Verify desktop, tablet, and mobile layouts.

## 16. Completion Criteria

The work is complete only when:

- The web application runs independently of Electron.
- The recognizable desktop StudyFlow design has been faithfully preserved.
- All seven main pages work.
- The timer workflow, reflection flow, goals, achievements, analytics, flashcards, notes, settings, notifications fallback, audio, and data portability work.
- Browser limitations are handled honestly with useful substitutes.
- Data is persisted offline in IndexedDB.
- Backup Now, automatic rolling snapshots, download, merge restore, overwrite restore, and safety snapshots work.
- The PWA installs and reloads offline after the first successful load.
- Typechecking, tests, production build, and the browser workflow verification pass.

## 17. Working Style

- Start by reading the existing implementation and writing the migration inventory.
- Reuse proven logic from the Electron app.
- Implement in vertical slices.
- Keep the original Electron app intact for side-by-side comparison.
- Use the existing desktop app as the visual and behavioral reference.
- Do not stop at scaffolding, placeholder components, or mocked interactions.
- Do not add unrelated features or redesign the product.
- When browser security prevents an exact desktop behavior, document the limitation and implement the closest honest web experience.
- After each major slice, run the app and verify the rendered UI in a browser.

---

