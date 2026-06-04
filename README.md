# StudyFlow

StudyFlow is an offline-first Windows desktop app for planning study work, running focused sessions, tracking progress, reviewing flashcards, and keeping notes in one private workspace.

The app is built with Electron, React, TypeScript, Tailwind CSS, Zustand, Recharts, Howler, and local SQLite. Runtime data stays on the user's computer, and StudyFlow does not make network calls while the app is running.

## Features

- Dashboard with today's study time, current streak, best streak, due flashcards, daily goals, recent sessions, and quick-start subject buttons.
- Session timer with Pomodoro, custom, and freeform modes, plus state-aware start, pause, resume, skip, and stop controls.
- Pre-session workflow for setting an intention, checking a reusable checklist, and entering Focus Mode.
- Before-and-after mood and energy reflection, post-session notes, and goal completion review.
- Subject manager with custom colors, icons, tasks, priorities, selectable and removable per-subject goals, and an Eisenhower matrix view. Goal progress is calculated from existing study sessions for the active day or week.
- Analytics tabs for overview metrics, subject rankings, time patterns, and session history.
- Week, month, year, and lifetime statistics with streaks, records, time-of-day insights, session-type breakdowns, charts, goals, weekly summaries, and a 365-day study heatmap.
- Flashcards with SM-2 spaced repetition, review ratings, due-card tracking, and break-review support.
- Markdown notes with editing tools, preview, search, subject linking, and Markdown/HTML export.
- Focus Mode with fullscreen support and an optional Windows process blocker for distracting apps.
- Optional Brave/Chromium browser extension that logs approved audible class playback into StudyFlow through a localhost-only bridge.
- Ambient sounds, bell alerts, desktop notifications, tray timer status, and tray actions for starting, pausing, resuming, and skipping intervals.
- Achievement badges for milestones such as study streaks, completed hours, Pomodoros, cards reviewed, and goals reached.
- Settings for timer lengths, sounds, theme, accent color, notifications, auto-launch, notes location, backups, import, export, and data reset.
- JSON and CSV export, JSON import, manual backups, and optional auto-backups.

## Privacy

StudyFlow is local-first by design:

- Study sessions, subjects, tasks, flashcards, achievements, settings, and app data are stored in a local SQLite database.
- Notes are saved as local Markdown files in the configured notes directory.
- Backups are written to the configured local backup directory.
- Browser class logging is opt-in and uses a pairing token against `http://127.0.0.1:17384`; approved URL rules and class sessions stay local.
- No runtime data is uploaded by the app.

## Development Setup

Clone the private repository and install dependencies:

```powershell
git clone https://github.com/ctrlshiftcommit/Study-flow-app.git
cd Study-flow-app
npm install
```

Start the app in development mode:

```powershell
npm run dev
```

Run TypeScript checks:

```powershell
npm run typecheck
```

## Build

Compile the Electron/Vite app:

```powershell
npm run build
```

Create the Windows installer:

```powershell
npm run dist
```

The NSIS setup executable is written to:

```text
dist-installer/StudyFlow Setup 1.0.0.exe
```

The installer creates StudyFlow desktop and Start Menu shortcuts.

## Browser Class Logging Extension

StudyFlow includes an optional unpacked Manifest V3 browser extension in `browser-extension/`. It is intended for Brave and Chromium-based browsers and privately records study time when an approved class page is the active tab, playing video, and producing audible audio.

How it works:

- The desktop app runs a localhost bridge at `http://127.0.0.1:17384` when browser class logging is enabled.
- The extension stores the StudyFlow pairing token in browser-local extension storage.
- Approved class URL patterns are managed in StudyFlow Settings, not in the extension.
- The extension sends `class-active`, `heartbeat`, `class-paused`, and `class-ended` events to the local desktop app.
- StudyFlow creates browser-sourced sessions, or can merge browser metadata into an active manual session after confirmation.

Set it up:

1. Start StudyFlow.
2. Open **Settings** and enable **Browser Class Logging**.
3. Copy the pairing token shown in that settings panel.
4. Open `brave://extensions` or `chrome://extensions`.
5. Enable **Developer mode**.
6. Choose **Load unpacked** and select the repository's `browser-extension/` folder.
7. Open the extension options page, paste the pairing token, and choose **Save and test connection**.
8. Back in StudyFlow Settings, add approved class URL patterns such as `https://classes.example.com/*` and assign a subject when useful.
9. Open an approved class URL, make sure the tab is active, play the video, and confirm the tab is audible.

Troubleshooting:

- If the extension says the bridge is offline, make sure StudyFlow is open and browser class logging is enabled.
- If the token is rejected, copy the current token again from StudyFlow Settings or rotate it and save the new value in the extension.
- If time is not logged, confirm the URL matches an approved pattern and the video is both playing and audible in the active tab.
- If using Chrome instead of Brave, the setup flow is the same through `chrome://extensions`.

## Private GitHub Distribution

Recommended private sharing flow:

1. Keep the GitHub repository private.
2. Commit only source code, assets, package files, and project configuration.
3. Do not commit generated folders such as `node_modules/`, `out/`, `dist/`, `dist-installer/`, or `release/`.
4. Build locally with `npm run dist`.
5. Upload `dist-installer/StudyFlow Setup 1.0.0.exe` to a private GitHub Release.
6. Share access only with trusted users who should be able to download the app.

## Project Scripts

- `npm run dev` starts the Electron app in development mode.
- `npm run build` compiles the main, preload, and renderer code.
- `npm run dist` builds the app and creates the Windows installer.
- `npm run build:dir` creates an unpacked app directory for local testing.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run lint` currently runs the same TypeScript check.

## Feedback

Send bugs, ideas, and feedback to:

```text
imakecoolappsforfun@gmail.com
```
