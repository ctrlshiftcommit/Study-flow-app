# StudyFlow

StudyFlow is an offline-first Windows desktop app for planning study work, running focused sessions, tracking progress, reviewing flashcards, and keeping notes in one private workspace.

The app is built with Electron, React, TypeScript, Tailwind CSS, Zustand, Recharts, Howler, and local SQLite. Runtime data stays on the user's computer, and StudyFlow does not make network calls while the app is running.

## Features

- Dashboard with today's study time, current streak, best streak, due flashcards, daily goals, recent sessions, and quick-start subject buttons.
- Session timer with Pomodoro, custom, and freeform modes.
- Pre-session workflow for setting an intention, checking a reusable checklist, and entering Focus Mode.
- Post-session reflection with mood, energy, notes, and goal completion.
- Subject manager with custom colors, icons, tasks, priorities, per-subject goals, and an Eisenhower matrix view.
- Analytics for study logs, charts, weekly summaries, streaks, goals, and a 365-day study heatmap.
- Flashcards with SM-2 spaced repetition, review ratings, due-card tracking, and break-review support.
- Markdown notes with editing tools, preview, search, subject linking, and Markdown/HTML export.
- Focus Mode with fullscreen support and an optional Windows process blocker for distracting apps.
- Ambient sounds, bell alerts, desktop notifications, and tray timer status.
- Achievement badges for milestones such as study streaks, completed hours, Pomodoros, cards reviewed, and goals reached.
- Settings for timer lengths, sounds, theme, accent color, notifications, auto-launch, notes location, backups, import, export, and data reset.
- JSON and CSV export, JSON import, manual backups, and optional auto-backups.

## Privacy

StudyFlow is local-first by design:

- Study sessions, subjects, tasks, flashcards, achievements, settings, and app data are stored in a local SQLite database.
- Notes are saved as local Markdown files in the configured notes directory.
- Backups are written to the configured local backup directory.
- No runtime data is uploaded by the app.

## Development Setup

Clone the private repository and install dependencies:

```powershell
git clone <repo-url>
cd <repo-folder>
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
