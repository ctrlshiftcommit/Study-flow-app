import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Flame,
  Globe2,
  Home,
  ListChecks,
  Mail,
  Maximize2,
  Minus,
  Moon,
  NotebookPen,
  Pause,
  Pencil,
  Play,
  Plus,
  Save,
  Settings as SettingsIcon,
  Shield,
  SkipForward,
  Square,
  Trash2,
  Trophy,
  X
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { marked } from 'marked';
import { Howl } from 'howler';
import clsx from 'clsx';
import { useStudyStore } from './store/useStudyStore';
import { GoalModal } from './components/GoalModal';
import { Modal as SharedModal } from './components/Modal';
import { PageHeader } from './components/PageHeader';
import type { BrowserBridgeStatus, BrowserClassRule, BrowserConflictEvent, BrowserDistractionRule, ChecklistItem, Flashcard, FlashcardRating, Goal, Note, NoteSummary, Priority, Session, SessionType, Settings, Subject, Task, TimerCommand } from '@shared/types';
import { calculateNextReview } from './utils/sm2';
import { badges, calculateDailyStreak } from './utils/achievements';
import { dateKey, dayMs, endOfDay, formatDate, formatDateTime, formatDuration, formatTimer, startOfDay, startOfWeek } from './utils/time';
import { quotes } from './utils/quotes';

type Page = 'dashboard' | 'timer' | 'subjects' | 'analytics' | 'flashcards' | 'notes' | 'browser' | 'settings';
type TimerPhase = 'focus' | 'shortBreak' | 'longBreak';
type StatsPeriod = 'week' | 'month' | 'year' | 'lifetime';
type AnalyticsTab = 'overview' | 'subjects' | 'time' | 'sessions';

const nav: { page: Page; label: string; icon: React.ElementType }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: Home },
  { page: 'timer', label: 'Timer', icon: Clock3 },
  { page: 'subjects', label: 'Subjects', icon: BookOpen },
  { page: 'analytics', label: 'Analytics', icon: BarChart3 },
  { page: 'flashcards', label: 'Flashcards', icon: Brain },
  { page: 'notes', label: 'Notes', icon: NotebookPen },
  { page: 'settings', label: 'Settings', icon: SettingsIcon },
  { page: 'browser', label: 'Browser Extension', icon: Globe2 }
];

const soundUrls: Record<string, string | null> = {
  silence: null,
  lofi: '../../assets/sounds/lofi.flac',
  rain: '../../assets/sounds/rain.flac',
  whitenoise: '../../assets/sounds/whitenoise.flac',
  cafe: '../../assets/sounds/cafe.flac'
};

const tooltipStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-1)'
};

function now() {
  return Date.now();
}

const defaultAccent = '#5b6af0';
const appLogoUrl = new URL('../../../assets/icons/tray.png', import.meta.url).href;
const feedbackEmail = 'imakecoolappsforfun@gmail.com';
const statsPeriods: { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'lifetime', label: 'Lifetime' }
];
const analyticsTabs: { value: AnalyticsTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'subjects', label: 'Subjects' },
  { value: 'time', label: 'Time Patterns' },
  { value: 'sessions', label: 'Sessions' }
];

export default function App() {
  const store = useStudyStore();
  const [page, setPage] = useState<Page>('dashboard');
  const [quickStartSubjectId, setQuickStartSubjectId] = useState<number | null>(null);
  const [browserConflict, setBrowserConflict] = useState<BrowserConflictEvent | null>(null);

  useEffect(() => {
    store.refresh().catch((error) => store.setToast(String(error)));
  }, []);

  useEffect(() => {
    return window.studyflow.onTimerSettings(() => {
      store.refresh().catch((error) => store.setToast(String(error)));
    });
  }, []);

  useEffect(() => window.studyflow.onBrowserConflict(setBrowserConflict), []);

  useEffect(() => {
    return window.studyflow.onBrowserSessionsUpdated(() => {
      store.refresh().catch((error) => store.setToast(String(error)));
    });
  }, []);

  useEffect(() => {
    return window.studyflow.onSettingsUpdated((settings) => {
      useStudyStore.setState({ settings });
      store.refresh().catch((error) => store.setToast(String(error)));
    });
  }, []);

  useEffect(() => {
    if (!store.settings) return;
    const root = document.documentElement;
    const media = matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const mode = store.settings!.theme === 'system' ? (media.matches ? 'light' : 'dark') : store.settings!.theme;
      const accent = normalizeAccent(store.settings!.accent);
      const rgb = hexToRgb(accent);
      root.classList.toggle('light', mode === 'light');
      root.style.setProperty('--accent', accent);
      root.style.setProperty('--accent-hover', lightenHex(accent, 16));
      root.style.setProperty('--accent-dim', `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`);
      root.style.setProperty('--accent-border', `rgba(${rgb.r},${rgb.g},${rgb.b},0.4)`);
      root.style.setProperty('--border-focus', accent);
    };
    apply();
    if (store.settings.theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [store.settings]);

  useEffect(() => {
    if (!store.toast) return;
    const id = window.setTimeout(() => store.setToast(null), 3800);
    return () => window.clearTimeout(id);
  }, [store.toast]);

  const content = (() => {
    if (store.loading || !store.settings) return <div className="panel">Loading StudyFlow...</div>;
    switch (page) {
      case 'dashboard':
        return <Dashboard onStart={(id) => { setQuickStartSubjectId(id); setPage('timer'); }} />;
      case 'timer':
        return null;
      case 'subjects':
        return <SubjectsPage />;
      case 'analytics':
        return <AnalyticsPage />;
      case 'flashcards':
        return <FlashcardsPage mini={false} />;
      case 'notes':
        return <NotesPage />;
      case 'browser':
        return <BrowserPage />;
      case 'settings':
        return <SettingsPage />;
    }
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={appLogoUrl} alt="" />
          <span className="font-bold text-lg">StudyFlow</span>
        </div>
        <nav className="space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.page} className={clsx('nav-button', page === item.page && 'active')} onClick={() => setPage(item.page)} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto panel p-3">
          <div className="small">Today</div>
          <div className="metric mt-1">{formatDuration(todaySeconds(store.sessions))}</div>
        </div>
      </aside>
      <div className="main-region">
        <header className="titlebar">
          <div className="titlebar-title">StudyFlow</div>
          <div className="window-controls">
            <button className="window-button" onClick={() => window.studyflow.windowMinimize()} title="Minimize">
              <Minus size={15} />
            </button>
            <button className="window-button" onClick={() => window.studyflow.windowMaximize()} title="Maximize">
              <Maximize2 size={13} />
            </button>
            <button className="window-button" onClick={() => window.studyflow.windowClose()} title="Close">
              <X size={15} />
            </button>
          </div>
        </header>
        <main className="content">
          {!store.loading && store.settings && (
            <div style={{ display: page === 'timer' ? 'block' : 'none' }}>
              <TimerPage quickStartSubjectId={quickStartSubjectId} onQuickStartConsumed={() => setQuickStartSubjectId(null)} />
            </div>
          )}
          {content}
        </main>
      </div>
      {store.toast && <div className="toast">{store.toast}</div>}
      {browserConflict && (
        <Modal title="Merge browser class tracking?" onClose={() => void resolveBrowserConflict(false)}>
          <p className="text-muted">A playing class was detected while your manual timer is active. Merge its browser metadata into this session?</p>
          <div className="small mt-2">{browserConflict.title || browserConflict.url}</div>
          <div className="modal-actions">
            <button className="button" onClick={() => void resolveBrowserConflict(false)}>Keep manual only</button>
            <button className="button primary" onClick={() => void resolveBrowserConflict(true)}>Merge tracking</button>
          </div>
        </Modal>
      )}
    </div>
  );

  async function resolveBrowserConflict(merge: boolean) {
    await window.studyflow.respondToBrowserConflict(merge);
    setBrowserConflict(null);
    store.setToast(merge ? 'Browser class tracking merged into this session' : 'Browser tracking ignored until this session ends');
  }
}

function Dashboard({ onStart }: { onStart: (subjectId: number) => void }) {
  const { subjects, sessions, goals, flashcards } = useStudyStore();
  const streak = useMemo(() => calculateDailyStreak(sessions), [sessions]);
  const quote = useMemo(() => quotes[Math.floor(Math.random() * quotes.length)], []);
  const recent = sessions.slice(0, 5);
  const dueCount = flashcards.filter((c) => !c.next_review || c.next_review <= endOfDay()).length;

  return (
    <section className="page space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Dashboard</h1>
          <p className="text-muted mt-1">{quote}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {subjects.length === 0 && <EmptyState icon={BookOpen} message="Create a subject to start focused sessions." compact />}
          {subjects.map((subject) => (
            <button key={subject.id} className="button primary" onClick={() => onStart(subject.id)}>
              <Play size={16} /> {subject.icon} {subject.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-auto">
        <Metric icon={Clock3} label="Today" value={formatDuration(todaySeconds(sessions))} />
        <Metric icon={Flame} label="Active streak" value={`${streak.current} days`} />
        <Metric icon={Brain} label="Due flashcards" value={String(dueCount)} />
        <Metric icon={Trophy} label="Best streak" value={`${streak.best} days`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="panel">
          <h2 className="font-bold mb-3">Daily Goals</h2>
          <FixedGoalProgress goals={goals.filter((g) => g.period === 'daily')} />
        </div>
        <div className="panel">
          <h2 className="font-bold mb-3">Recent Sessions</h2>
          <FixedSessionList sessions={recent} />
        </div>
      </div>
      <AchievementsPanel />
    </section>
  );
}

function TimerPage({ quickStartSubjectId, onQuickStartConsumed }: { quickStartSubjectId: number | null; onQuickStartConsumed: () => void }) {
  const store = useStudyStore();
  const [subjectId, setSubjectId] = useState<number | null>(store.selectedSubjectId);
  const [mode, setMode] = useState<SessionType>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(45);
  const [phase, setPhase] = useState<TimerPhase>('focus');
  const [remaining, setRemaining] = useState((store.settings?.pomodoroFocus || 25) * 60);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [intention, setIntention] = useState('');
  const [showChecklist, setShowChecklist] = useState(false);
  const [showGoalPrompt, setShowGoalPrompt] = useState(false);
  const [sessionGoal, setSessionGoal] = useState('');
  const [goalAchieved, setGoalAchieved] = useState<'yes' | 'partial' | 'no' | ''>('');
  const [showPost, setShowPost] = useState(false);
  const [moodBefore, setMoodBefore] = useState(3);
  const [energyBefore, setEnergyBefore] = useState(3);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [post, setPost] = useState({ mood: 3, energy: 3, note: '' });
  const [focusModeActive, setFocusModeActive] = useState(false);
  const [browserMetadata, setBrowserMetadata] = useState<BrowserConflictEvent | null>(null);
  const ambientRef = useRef<Howl | null>(null);
  const totalSeconds = phaseDuration(phase, mode, customMinutes, store.settings!);
  const subject = store.subjects.find((s) => s.id === subjectId) || store.subjects[0];
  const hasActiveInterval = startedAt !== null || phase !== 'focus';
  const paused = hasActiveInterval && !running && !showPost;

  useEffect(() => {
    if (quickStartSubjectId) {
      setSubjectId(quickStartSubjectId);
      setShowGoalPrompt(true);
      onQuickStartConsumed();
    }
  }, [quickStartSubjectId]);

  useEffect(() => {
    if (running) return;
    if (hasActiveInterval) return;
    setRemaining(totalSeconds);
  }, [mode, customMinutes, phase, store.settings?.pomodoroFocus, store.settings?.shortBreak, store.settings?.longBreak, running, hasActiveInterval, totalSeconds]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          void finishInterval();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, phase, startedAt, subjectId, mode, customMinutes, intention, post, pomodoroCount]);

  useEffect(() => {
    const label = running ? (phase === 'focus' ? formatTimer(remaining) : 'BREAK') : paused ? 'PAUSED' : 'IDLE';
    window.studyflow.trayUpdate({ label, state: running ? 'running' : paused ? 'paused' : 'idle', canSkip: hasActiveInterval && !showPost }).catch(() => undefined);
  }, [running, phase, remaining, paused, hasActiveInterval, showPost]);

  useEffect(() => {
    void window.studyflow.setBrowserManualState({ active: phase === 'focus' && startedAt !== null });
    return () => { void window.studyflow.setBrowserManualState({ active: false }); };
  }, [phase, startedAt]);

  useEffect(() => window.studyflow.onBrowserMerged(setBrowserMetadata), []);

  useEffect(() => {
    if (!running || !store.settings) return;
    if (phase !== 'focus' && !store.settings.ambientDuringBreak) {
      ambientRef.current?.pause();
      return;
    }
    playAmbient(store.settings, ambientRef);
    return () => ambientRef.current?.pause();
  }, [running, phase, store.settings?.ambientSound, store.settings?.ambientVolume]);

  async function beginFromChecklist() {
    setShowChecklist(false);
    setStartedAt(now());
    setRemaining(totalSeconds);
    setRunning(true);
    if (store.settings!.focusModeOnStart) await setFocusMode(true);
    await scanBlockers();
  }

  function requestStart() {
    if (phase === 'focus') setShowGoalPrompt(true);
    else void beginFromChecklist();
  }

  function submitGoal(skip = false) {
    const goal = skip ? '' : sessionGoal.trim().slice(0, 280);
    setSessionGoal(goal);
    setIntention(goal);
    setShowGoalPrompt(false);
    setShowChecklist(true);
  }

  async function finishInterval() {
    if (!hasActiveInterval) return;
    setRunning(false);
    bell(store.settings!);
    if (phase === 'focus') {
      setShowPost(true);
      setPomodoroCount((c) => c + 1);
      setSessionStreak((s) => s + 1);
    } else {
      await window.studyflow.notify('Focus started', 'Break complete. Ready for the next round.');
      const next = 'focus';
      setPhase(next);
      setRemaining(phaseDuration(next, mode, customMinutes, store.settings!));
      if (store.settings!.autoStartFocus) {
        setStartedAt(now());
        setRunning(true);
      }
    }
  }

  async function saveSession() {
    const end = now();
    const start = startedAt || end - totalSeconds * 1000;
    const duration = Math.max(60, Math.round((end - start) / 1000));
    await window.studyflow.run(
      `INSERT INTO sessions(subject_id,started_at,ended_at,duration_seconds,session_type,mood_before,mood_after,energy_before,energy_after,note,intention,goal,goal_achieved,source,tags,source_url,source_title)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [subject?.id ?? null, start, end, duration, mode, moodBefore, post.mood, energyBefore, post.energy, post.note, intention, sessionGoal, goalAchieved || null, browserMetadata ? 'manual_browser' : 'manual', JSON.stringify(browserMetadata ? ['manual', 'browser-auto', 'class'] : ['manual']), browserMetadata?.url || null, browserMetadata?.title || null]
    );
    await resetChecklistForNextSession();
    setShowPost(false);
    setIntention('');
    setSessionGoal('');
    setGoalAchieved('');
    setPost({ mood: 3, energy: 3, note: '' });
    setBrowserMetadata(null);
    setStartedAt(null);
    await afterSessionSaved();
    const nextPhase: TimerPhase = mode === 'pomodoro' && (pomodoroCount + 1) % 4 === 0 ? 'longBreak' : 'shortBreak';
    setPhase(nextPhase);
    setRemaining(phaseDuration(nextPhase, mode, customMinutes, store.settings!));
    await window.studyflow.notify('Break started', 'Nice session. Take a real breath.');
    if (store.settings!.autoStartBreaks) setRunning(true);
  }

  async function afterSessionSaved() {
    await store.refresh();
    await unlockAchievements();
    await checkGoals(subject?.id ?? null);
    await setFocusMode(false);
  }

  async function unlockAchievements() {
    const sessions = await window.studyflow.query<Session>('SELECT * FROM sessions');
    const cards = await window.studyflow.get<{ total: number }>('SELECT SUM(review_count) as total FROM flashcards');
    const hits = await window.studyflow.get<{ total: number }>('SELECT COUNT(*) as total FROM goal_hits');
    const unlocked = await window.studyflow.query<{ key: string }>('SELECT key FROM achievements WHERE unlocked_at IS NOT NULL');
    const unlockedSet = new Set(unlocked.map((x) => x.key));
    const totalHours = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 3600;
    const streak = calculateDailyStreak(sessions).current;
    const pomodoros = sessions.filter((s) => s.session_type === 'pomodoro').length;
    const hour = new Date().getHours();
    const checks: Record<string, boolean> = {
      first_session: sessions.length >= 1,
      hours_10: totalHours >= 10,
      hours_50: totalHours >= 50,
      hours_100: totalHours >= 100,
      streak_3: streak >= 3,
      streak_7: streak >= 7,
      streak_30: streak >= 30,
      pomodoro_10: pomodoros >= 10,
      cards_50: (cards?.total || 0) >= 50,
      goal_hit_5: (hits?.total || 0) >= 5,
      night_owl: hour < 4,
      early_bird: hour < 7
    };
    for (const [key, ok] of Object.entries(checks)) {
      if (ok && !unlockedSet.has(key)) {
        await window.studyflow.run('INSERT INTO achievements(key,unlocked_at) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET unlocked_at=excluded.unlocked_at', [key, now()]);
        const badge = badges.find((b) => b.key === key);
        store.setToast(`Badge unlocked: ${badge?.name || key}`);
        await window.studyflow.notify('Badge unlocked', badge?.name || key);
      }
    }
  }

  async function checkGoals(sid: number | null) {
    const today = dateKey(now());
    const goals = store.goals.filter((g) => g.subject_id === sid && g.period === 'daily');
    for (const goal of goals) {
      const total = await totalMinutesForGoal(goal);
      if (total >= goal.target_minutes) {
        await window.studyflow.run('INSERT OR IGNORE INTO goal_hits(subject_id,hit_date,created_at) VALUES(?,?,?)', [sid, today, now()]);
        await window.studyflow.notify('Goal reached', `Goal hit for ${subject?.name || 'subject'}!`);
      }
    }
  }

  async function scanBlockers() {
    const list = store.settings!.blocklist;
    if (!list.length) return;
    const matches = await window.studyflow.appBlockerScan(list);
    if (matches.length) {
      await window.studyflow.appBlockerKill(matches);
    }
  }

  async function resetChecklistForNextSession() {
    await window.studyflow.resetChecklistChecked();
  }

  function stop() {
    setRunning(false);
    setSessionStreak(0);
    setStartedAt(null);
    setBrowserMetadata(null);
    setPhase('focus');
    setRemaining(phaseDuration('focus', mode, customMinutes, store.settings!));
    void setFocusMode(false);
  }

  async function setFocusMode(enabled: boolean) {
    await window.studyflow.focusModeSet(enabled);
    setFocusModeActive(enabled);
  }

  useEffect(() => {
    return window.studyflow.onTimerCommand((command: TimerCommand) => {
      if (command === 'start' && !hasActiveInterval) requestStart();
      if (command === 'pause' && running) setRunning(false);
      if (command === 'resume' && paused) setRunning(true);
      if (command === 'skip' && hasActiveInterval && !showPost) void finishInterval();
    });
  }, [hasActiveInterval, paused, running, showPost, phase, totalSeconds]);

  const progress = totalSeconds ? 1 - remaining / totalSeconds : 0;
  const ringColor = remaining <= 60 ? 'var(--danger)' : progress > 0.8 ? 'var(--warning)' : 'var(--accent)';

  return (
    <section className="page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Session Timer</h1>
          <p className="text-muted">Session streak: {sessionStreak} focused rounds</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="button" onClick={() => void setFocusMode(!focusModeActive)}>
            <Shield size={16} /> {focusModeActive ? 'Exit Focus Mode' : 'Start Focus Mode'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
        <div className="panel flex flex-col items-center gap-5">
          <ProgressRing progress={progress} color={ringColor} label={formatTimer(remaining)} />
          <div className="text-center">
            <div className="text-xl font-bold">{phase === 'focus' ? subject?.name || 'Choose subject' : phase === 'shortBreak' ? 'Short break' : 'Long break'}</div>
            {sessionGoal && <div className="session-goal-bar">{sessionGoal}</div>}
            {!sessionGoal && <div className="small">Set an intention before starting.</div>}
          </div>
          <div className="flex gap-2">
            {!hasActiveInterval ? (
              <button className="button primary" onClick={requestStart}><Play size={16} /> Start</button>
            ) : running ? (
              <button className="button" onClick={() => setRunning(false)}><Pause size={16} /> Pause</button>
            ) : (
              <button className="button primary" onClick={() => setRunning(true)}><Play size={16} /> Resume</button>
            )}
            {hasActiveInterval && <button className="button" onClick={() => void finishInterval()}><SkipForward size={16} /> Skip</button>}
            {hasActiveInterval && <button className="button danger" onClick={stop}><Square size={16} /> Stop</button>}
          </div>
        </div>
        <div className="panel space-y-4">
          <div className="grid-auto">
            <Field label="Subject">
              <select className="select" value={subjectId ?? ''} disabled={hasActiveInterval} onChange={(e) => setSubjectId(Number(e.target.value))}>
                {store.subjects.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </Field>
            <Field label="Mode">
              <select className="select" value={mode} disabled={hasActiveInterval} onChange={(e) => { setMode(e.target.value as SessionType); setPhase('focus'); }}>
                <option value="pomodoro">Pomodoro</option>
                <option value="custom">Custom</option>
                <option value="freeform">Freeform</option>
              </select>
            </Field>
            {mode === 'custom' && <Field label="Custom focus minutes">
              <input className="input" type="number" min={1} max={180} value={customMinutes} disabled={hasActiveInterval} onChange={(e) => setCustomMinutes(Number(e.target.value))} />
            </Field>}
            <Field label="Mood before">
              <Rating value={moodBefore} setValue={setMoodBefore} disabled={hasActiveInterval} />
            </Field>
            <Field label="Energy before">
              <Rating value={energyBefore} setValue={setEnergyBefore} disabled={hasActiveInterval} />
            </Field>
          </div>
          <Field label="Today I want to...">
            <textarea className="textarea" value={intention} disabled={hasActiveInterval} onChange={(e) => setIntention(e.target.value)} placeholder="Write the single outcome this session should create." />
          </Field>
          {phase !== 'focus' && <FlashcardsPage mini />}
        </div>
      </div>

      {showChecklist && (
        <SharedModal title="Pre-session checklist" onClose={() => setShowChecklist(false)}>
          <div className="space-y-3">
            <ChecklistEditor isTemplate />
            <div className="flex gap-2 justify-end">
              <button className="button" onClick={() => setShowChecklist(false)}>Cancel</button>
              <button className="button primary" onClick={() => beginFromChecklist()}>Start Session</button>
            </div>
          </div>
        </SharedModal>
      )}

      {showGoalPrompt && (
        <GoalModal
          onSkip={() => submitGoal(true)}
          onConfirm={(goal) => {
            setSessionGoal(goal);
            setIntention(goal);
            setShowGoalPrompt(false);
            setShowChecklist(true);
          }}
        />
      )}

      {showPost && (
        <SharedModal title="Session complete" onClose={() => setShowPost(false)}>
          <div className="space-y-4">
            <Field label="Mood after"><Rating value={post.mood} setValue={(v) => setPost((p) => ({ ...p, mood: v }))} /></Field>
            <Field label="Energy after"><Rating value={post.energy} setValue={(v) => setPost((p) => ({ ...p, energy: v }))} /></Field>
            {sessionGoal && <div className="panel !p-3"><div className="small">Session goal</div><div className="font-bold">{sessionGoal}</div></div>}
            {sessionGoal && <Field label="Did you achieve it?"><div className="flex gap-2"><button className={clsx('button success-choice', goalAchieved === 'yes' && 'selected')} onClick={() => setGoalAchieved('yes')}>Achieved ✓</button><button className={clsx('button warning-choice', goalAchieved === 'partial' && 'selected')} onClick={() => setGoalAchieved('partial')}>Partially</button><button className={clsx('button', goalAchieved === 'no' && 'selected')} onClick={() => setGoalAchieved('no')}>Didn't reach it</button></div></Field>}
            <Field label="Post-session note"><textarea className="textarea" value={post.note} onChange={(e) => setPost((p) => ({ ...p, note: e.target.value }))} /></Field>
            <button className="button primary w-full" onClick={saveSession}><Save size={16} /> Save Session</button>
            <button className="button ghost w-full" onClick={saveSession}>Skip reflection</button>
          </div>
        </SharedModal>
      )}
    </section>
  );
}

function ChecklistEditor({ isTemplate = false }: { isTemplate?: boolean }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  async function load() {
    setItems(await window.studyflow.getChecklistItems(isTemplate));
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const text = newItem.trim();
    if (!text) return;
    await window.studyflow.addChecklistItem(text, isTemplate);
    setNewItem('');
    await load();
  }

  async function update(id: number, fields: Partial<Pick<ChecklistItem, 'text' | 'checked' | 'position'>>) {
    await window.studyflow.updateChecklistItem(id, fields);
    await load();
  }

  async function remove(item: ChecklistItem) {
    await window.studyflow.deleteChecklistItem(item.id);
    await load();
  }

  async function move(id: number, dir: number) {
    const index = items.findIndex((item) => item.id === id);
    const nextIndex = index + dir;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setItems(next);
    await Promise.all(next.map((item, position) => window.studyflow.updateChecklistItem(item.id, { position })));
    await load();
  }

  async function finishEdit(item: ChecklistItem) {
    const text = editingText.trim();
    setEditingId(null);
    if (text && text !== item.text) await update(item.id, { text });
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <EmptyState icon={ListChecks} title={isTemplate ? 'No checklist templates yet' : 'No checklist items yet'} message={isTemplate ? 'Add recurring checklist items from Settings.' : 'Add a one-off item for this session.'} />}
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.id} className="checklist-item-row">
            <input type="checkbox" checked={!!item.checked} onChange={(e) => update(item.id, { checked: e.target.checked ? 1 : 0 })} />
            {editingId === item.id ? (
              <input className="input" autoFocus value={editingText} onChange={(e) => setEditingText(e.target.value)} onBlur={() => finishEdit(item)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            ) : (
              <button className={clsx('checklist-text', item.checked && 'done')} onClick={() => { setEditingId(item.id); setEditingText(item.text); }}>
                {item.text}
              </button>
            )}
            <button className="button !px-3" onClick={() => move(item.id, -1)} disabled={index === 0}>Up</button>
            <button className="button !px-3" onClick={() => move(item.id, 1)} disabled={index === items.length - 1}>Down</button>
            <button className="button danger !px-3" onClick={() => remove(item)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          placeholder="Add item"
        />
        <button className="button primary" onClick={add}><Plus size={16} /></button>
      </div>
    </div>
  );
}

function SubjectsPage() {
  const store = useStudyStore();
  const selected = store.subjects.find((s) => s.id === store.selectedSubjectId) || store.subjects[0];
  const [subjectForm, setSubjectForm] = useState({ name: '', color: '#14b8a6', icon: '' });
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editForm, setEditForm] = useState({ name: '', icon: '' });
  const [taskTitle, setTaskTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [due, setDue] = useState('');
  const [goalMinutes, setGoalMinutes] = useState(60);
  const [goalPeriod, setGoalPeriod] = useState<'daily' | 'weekly'>('daily');
  const tasks = store.tasks.filter((t) => t.subject_id === selected?.id);

  async function addSubject() {
    if (!subjectForm.name.trim()) return;
    await window.studyflow.run('INSERT INTO subjects(name,color,icon,created_at) VALUES(?,?,?,?)', [subjectForm.name, subjectForm.color, subjectForm.icon, now()]);
    setSubjectForm({ name: '', color: '#14b8a6', icon: '' });
    await store.refresh();
  }

  async function deleteSubject(id: number) {
    await window.studyflow.run('DELETE FROM tasks WHERE subject_id=?', [id]);
    for (const table of ['sessions', 'goals', 'notes', 'flashcards', 'goal_hits']) {
      await window.studyflow.run(`UPDATE ${table} SET subject_id=NULL WHERE subject_id=?`, [id]);
    }
    await window.studyflow.run('DELETE FROM subjects WHERE id=?', [id]);
    if (store.selectedSubjectId === id) store.selectSubject(null);
    await store.refresh();
  }

  function beginEditSubject(subject: Subject) {
    setEditingSubject(subject);
    setEditForm({ name: subject.name, icon: subject.icon || '' });
  }

  async function saveSubjectEdit() {
    if (!editingSubject || !editForm.name.trim()) return;
    await window.studyflow.run('UPDATE subjects SET name=?, icon=? WHERE id=?', [editForm.name.trim(), editForm.icon, editingSubject.id]);
    setEditingSubject(null);
    await store.refresh();
  }

  async function addTask() {
    const title = taskTitle.trim();
    if (!title || !selected) return;
    await window.studyflow.run('INSERT INTO tasks(subject_id,title,priority,due_date,created_at,sort_order) VALUES(?,?,?,?,?,?)', [
      selected.id,
      title,
      priority,
      due ? new Date(due).getTime() : null,
      now(),
      store.tasks.length
    ]);
    setTaskTitle('');
    setPriority('normal');
    setDue('');
    await store.refresh();
  }

  async function addGoal() {
    if (!selected) return;
    await window.studyflow.run('INSERT INTO goals(subject_id,period,target_minutes,created_at) VALUES(?,?,?,?)', [selected.id, goalPeriod, goalMinutes, now()]);
    await store.refresh();
  }

  async function deleteGoal(goal: Goal) {
    await window.studyflow.run('DELETE FROM goals WHERE id=?', [goal.id]);
    await store.refresh();
  }

  if (store.subjects.length === 0) {
    return (
      <section className="page space-y-5">
        <PageHeader title="Subjects" subtitle="Create your study structure before tracking sessions." />
        <EmptyState
          icon={BookOpen}
          title="No subjects yet"
          message="Add the subjects you're studying to track your time and goals."
          action={
            <div className="panel space-y-3 w-full max-w-md">
              <input className="input" placeholder="Subject name" value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} />
              <button className="button primary" onClick={addSubject}>Add your first subject -&gt;</button>
            </div>
          }
        />
      </section>
    );
  }

  return (
    <>
    <section className="page space-y-5">
      <h1 className="text-3xl font-black">Subjects & Tasks</h1>
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-4">
          <div className="panel space-y-3">
            <h2 className="font-bold">Create Subject</h2>
            <input className="input" placeholder="Name" value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} />
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <input className="input" type="color" value={subjectForm.color} onChange={(e) => setSubjectForm({ ...subjectForm, color: e.target.value })} />
              <input className="input" placeholder="Icon" value={subjectForm.icon} onChange={(e) => setSubjectForm({ ...subjectForm, icon: e.target.value })} />
            </div>
            <button className="button primary w-full" onClick={addSubject}><Plus size={16} /> Add Subject</button>
          </div>
          <div className="space-y-2">
            {store.subjects.map((s) => (
              <div key={s.id} className={clsx('panel subject-row w-full', selected?.id === s.id && 'subject-row-selected')}>
                <button className="subject-select text-left" aria-pressed={selected?.id === s.id} onClick={() => store.selectSubject(s.id)}>
                  <span className="font-bold" style={{ color: s.color }}>{s.icon} {s.name}</span>
                </button>
                <div className="subject-actions">
                  <button className="icon-action" onClick={() => beginEditSubject(s)} title={`Edit ${s.name}`} aria-label={`Edit ${s.name}`}>
                    <Pencil size={15} />
                  </button>
                  <button className="icon-action danger-action" onClick={() => void deleteSubject(s.id)} title={`Delete ${s.name}`} aria-label={`Delete ${s.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="panel space-y-3">
            <h2 className="font-bold">{selected?.name || 'No subject'} Tasks</h2>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_150px_auto] gap-2">
              <input className="input" placeholder="Task title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                <option value="urgent">Urgent</option><option value="important">Important</option><option value="normal">Normal</option><option value="low">Low</option>
              </select>
              <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              <button className="button primary" onClick={addTask}><Plus size={16} /> Add</button>
            </div>
            <FixedTaskList tasks={tasks} />
          </div>
          <div className="panel space-y-3">
            <h2 className="font-bold">Goals</h2>
            <Field label="Goals for">
              <select className="select" value={selected?.id ?? ''} onChange={(e) => store.selectSubject(Number(e.target.value))}>
                {store.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.icon} {subject.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-[140px_1fr_auto] gap-2">
              <select className="select" value={goalPeriod} onChange={(e) => setGoalPeriod(e.target.value as 'daily' | 'weekly')}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option>
              </select>
              <input className="input" type="number" min={1} value={goalMinutes} onChange={(e) => setGoalMinutes(Number(e.target.value))} />
              <button className="button primary" onClick={addGoal}>Save Goal</button>
            </div>
            <FixedGoalProgress goals={store.goals.filter((g) => g.subject_id === selected?.id)} onDelete={deleteGoal} />
          </div>
          <div className="panel">
            <h2 className="font-bold mb-3">Eisenhower Matrix</h2>
            <div className="grid grid-cols-2 gap-3">
              <FixedMatrixCell title="Urgent + Important" tasks={tasks.filter((t) => t.priority === 'urgent')} />
              <FixedMatrixCell title="Not Urgent + Important" tasks={tasks.filter((t) => t.priority === 'important')} />
              <FixedMatrixCell title="Urgent + Not Important" tasks={tasks.filter((t) => t.priority === 'normal')} />
              <FixedMatrixCell title="Neither" tasks={tasks.filter((t) => t.priority === 'low')} />
            </div>
          </div>
        </div>
      </div>
    </section>
    {editingSubject && (
      <SharedModal title={`Edit ${editingSubject.name}`} onClose={() => setEditingSubject(null)}>
        <div className="space-y-3">
          <input className="input" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          <input className="input" placeholder="Icon" value={editForm.icon} onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })} />
          <div className="modal-actions">
            <button className="button ghost" onClick={() => setEditingSubject(null)}>Cancel</button>
            <button className="button primary" onClick={() => void saveSubjectEdit()} disabled={!editForm.name.trim()}>Save Changes</button>
          </div>
        </div>
      </SharedModal>
    )}
    </>
  );
}

function AnalyticsPage() {
  const { sessions, subjects, goals } = useStudyStore();
  const [subjectFilter, setSubjectFilter] = useState('');
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [showReport, setShowReport] = useState(false);
  const stats = useMemo(() => buildStudyStats(sessions, subjects, period), [sessions, subjects, period]);
  const filtered = stats.sessions.filter((s) => !subjectFilter || s.subject_id === Number(subjectFilter));
  const mood = stats.sessions.slice(0, 30).reverse().map((s) => ({
    day: new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    mood: s.mood_after || 0,
    energy: s.energy_after || 0
  }));
  const hasStudyData = stats.sessions.length > 0;

  return (
    <section className="page space-y-5">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div>
          <h1 className="text-3xl font-black">Analytics</h1>
          <p className="text-muted mt-1">{stats.periodLabel} - {stats.sessions.length} completed sessions</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value as StatsPeriod)}>
            {statsPeriods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button className="button primary" onClick={() => setShowReport(true)}>View Report</button>
        </div>
      </div>

      <div className="analytics-tab-strip">
        <div className="segmented analytics-tabs">
          {analyticsTabs.map((item) => (
            <button key={item.value} className={clsx(tab === item.value && 'active')} onClick={() => setTab(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid-auto">
            <Metric icon={Clock3} label="Total study time" value={formatDuration(stats.totalSeconds)} />
            <Metric icon={ListChecks} label="Sessions completed" value={String(stats.sessionCount)} />
            <Metric icon={BarChart3} label="Average session" value={formatDuration(stats.averageSessionSeconds)} />
            <Metric icon={Trophy} label="Longest session" value={formatDuration(stats.longestSessionSeconds)} />
            <Metric icon={Flame} label="Current streak" value={`${stats.streak.current} days`} />
            <Metric icon={Trophy} label="Best streak" value={`${stats.streak.best} days`} />
            <Metric icon={Clock3} label="Days studied" value={String(stats.daysStudied)} />
            <Metric icon={BarChart3} label="Avg per active day" value={formatDuration(stats.averageActiveDaySeconds)} />
          </div>
          {!hasStudyData && <EmptyState icon={BarChart3} title="No statistics yet" message="Complete a study session to unlock trends, rankings, and time patterns." />}
          {hasStudyData && (
            <>
              <div className="insight-grid">
                <InsightCard label="Most studied subject" value={stats.topSubject?.name || 'None'} detail={stats.topSubject ? formatDuration(stats.topSubject.seconds) : 'No subject data'} />
                <InsightCard label="Most active time" value={stats.topHour.label} detail={formatDuration(stats.topHour.seconds)} />
                <InsightCard label="Most active weekday" value={stats.topWeekday.label} detail={formatDuration(stats.topWeekday.seconds)} />
                <InsightCard label="Best study day" value={stats.bestDay.label} detail={formatDuration(stats.bestDay.seconds)} />
                <InsightCard label="Best week" value={stats.bestWeek.label} detail={formatDuration(stats.bestWeek.seconds)} />
                <InsightCard label="Best month" value={stats.bestMonth.label} detail={formatDuration(stats.bestMonth.seconds)} />
              </div>
              <ChartPanel title={`${statsPeriods.find((item) => item.value === period)?.label || 'Period'} trend`}>
                <BarChart data={stats.trend}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--text-2)" interval="preserveStartEnd" />
                  <YAxis stroke="var(--text-2)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="hours" fill="var(--accent)" />
                </BarChart>
              </ChartPanel>
            </>
          )}
        </>
      )}

      {tab === 'subjects' && (
        <>
          {!hasStudyData && <EmptyState icon={BookOpen} title="No subject statistics yet" message="Log sessions with subjects to build your leaderboard." />}
          {hasStudyData && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ChartPanel title="Study time by subject">
                  <BarChart data={stats.subjectChart}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="var(--text-2)" interval={0} />
                    <YAxis stroke="var(--text-2)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="hours">
                      {stats.subjectChart.map((row) => <Cell key={row.label} fill={row.color} />)}
                    </Bar>
                  </BarChart>
                </ChartPanel>
                <ChartPanel title="Subject distribution">
                  <PieChart>
                    <Pie data={stats.subjectChart} dataKey="minutes" nameKey="label" outerRadius={100}>
                      {stats.subjectChart.map((row) => <Cell key={row.label} fill={row.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ChartPanel>
              </div>
              <div className="panel">
                <h2 className="font-bold mb-3">Subject Leaderboard</h2>
                <SubjectLeaderboard rows={stats.subjectRows} />
              </div>
            </>
          )}
        </>
      )}

      {tab === 'time' && (
        <>
          {!hasStudyData && <EmptyState icon={Clock3} title="No time patterns yet" message="Study sessions will reveal your strongest hours and weekdays." />}
          {hasStudyData && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ChartPanel title="Study time by hour">
                  <BarChart data={stats.hourRows}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="shortLabel" stroke="var(--text-2)" interval={2} />
                    <YAxis stroke="var(--text-2)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="hours" fill="var(--accent)" />
                  </BarChart>
                </ChartPanel>
                <ChartPanel title="Study time by weekday">
                  <BarChart data={stats.weekdayRows}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="var(--text-2)" />
                    <YAxis stroke="var(--text-2)" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="hours" fill="var(--success)" />
                  </BarChart>
                </ChartPanel>
                <ChartPanel title="Session type breakdown">
                  <PieChart>
                    <Pie data={stats.sessionTypeRows} dataKey="minutes" nameKey="label" outerRadius={100}>
                      {stats.sessionTypeRows.map((row, index) => <Cell key={row.label} fill={['var(--accent)', 'var(--warning)', 'var(--success)'][index]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ChartPanel>
                <div className="panel space-y-3">
                  <h2 className="font-bold">Records</h2>
                  <RecordRow label="Most active hour" value={stats.topHour.label} detail={formatDuration(stats.topHour.seconds)} />
                  <RecordRow label="Most active weekday" value={stats.topWeekday.label} detail={formatDuration(stats.topWeekday.seconds)} />
                  <RecordRow label="Best study day" value={stats.bestDay.label} detail={formatDuration(stats.bestDay.seconds)} />
                  <RecordRow label="Best week" value={stats.bestWeek.label} detail={formatDuration(stats.bestWeek.seconds)} />
                  <RecordRow label="Best month" value={stats.bestMonth.label} detail={formatDuration(stats.bestMonth.seconds)} />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'sessions' && (
        <>
          <div className="panel">
            <h2 className="font-bold mb-3">365-Day Heatmap</h2>
            <FixedHeatmap sessions={sessions} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartPanel title="Mood and energy">
              <LineChart data={mood}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="var(--text-2)" />
                <YAxis domain={[0, 5]} stroke="var(--text-2)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line dataKey="mood" stroke="var(--success)" />
                <Line dataKey="energy" stroke="var(--warning)" />
              </LineChart>
            </ChartPanel>
            <ChartPanel title="Recent period trend">
              <LineChart data={stats.trend}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="var(--text-2)" interval="preserveStartEnd" />
                <YAxis stroke="var(--text-2)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line dataKey="hours" stroke="var(--accent)" />
              </LineChart>
            </ChartPanel>
          </div>
          <div className="panel">
            <div className="flex gap-2 mb-3">
              <select className="select max-w-xs" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                <option value="">All subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <FixedSessionList sessions={filtered} />
          </div>
          <div className="panel">
            <h2 className="font-bold mb-3">Goal Progress</h2>
            <FixedGoalProgress goals={goals} />
          </div>
        </>
      )}
      {showReport && <WeeklyReport onClose={() => setShowReport(false)} />}
    </section>
  );
}

interface SubjectStatsRow {
  id: number | null;
  name: string;
  color: string;
  seconds: number;
  sessions: number;
  averageSeconds: number;
  percent: number;
}

interface ChartBucket {
  label: string;
  shortLabel?: string;
  color?: string;
  seconds: number;
  hours: number;
  minutes: number;
}

interface StudyStats {
  periodLabel: string;
  sessions: Session[];
  totalSeconds: number;
  sessionCount: number;
  averageSessionSeconds: number;
  longestSessionSeconds: number;
  daysStudied: number;
  averageActiveDaySeconds: number;
  streak: { current: number; best: number };
  subjectRows: SubjectStatsRow[];
  subjectChart: ChartBucket[];
  topSubject: SubjectStatsRow | null;
  hourRows: ChartBucket[];
  topHour: ChartBucket;
  weekdayRows: ChartBucket[];
  topWeekday: ChartBucket;
  bestDay: ChartBucket;
  bestWeek: ChartBucket;
  bestMonth: ChartBucket;
  sessionTypeRows: ChartBucket[];
  trend: ChartBucket[];
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="panel insight-card">
      <div className="small">{label}</div>
      <div className="insight-value">{value}</div>
      <div className="small">{detail}</div>
    </div>
  );
}

function RecordRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="stat-row">
      <div>
        <div className="font-bold">{value}</div>
        <div className="small">{label}</div>
      </div>
      <div className="font-bold">{detail}</div>
    </div>
  );
}

function SubjectLeaderboard({ rows }: { rows: SubjectStatsRow[] }) {
  if (rows.length === 0) return <EmptyState icon={BookOpen} message="No subject time in this period." />;
  return (
    <div className="leaderboard-list">
      {rows.map((row, index) => (
        <div key={`${row.id ?? 'unassigned'}-${row.name}`} className="leaderboard-row">
          <div className="leaderboard-main">
            <span className="rank-pill">{index + 1}</span>
            <span className="subject-dot" style={{ background: row.color, color: row.color }} />
            <div className="min-w-0">
              <div className="font-bold truncate">{row.name}</div>
              <div className="small">{row.sessions} sessions - Avg {formatDuration(row.averageSeconds)}</div>
            </div>
          </div>
          <div className="leaderboard-stats">
            <strong>{formatDuration(row.seconds)}</strong>
            <span>{row.percent}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${row.percent}%`, background: row.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildStudyStats(sessions: Session[], subjects: Subject[], period: StatsPeriod): StudyStats {
  const completed = sessions.filter(isCompletedSession);
  const scoped = filterSessionsByPeriod(completed, period);
  const totalSeconds = scoped.reduce((sum, session) => sum + sessionDuration(session), 0);
  const activeDays = new Set(scoped.map((session) => dateKey(session.started_at)));
  const subjectRows = buildSubjectStats(scoped, subjects, totalSeconds);
  const hourRows = buildHourRows(scoped);
  const weekdayRows = buildWeekdayRows(scoped);
  const sessionTypeRows = buildSessionTypeRows(scoped);

  return {
    periodLabel: periodLabel(period),
    sessions: scoped,
    totalSeconds,
    sessionCount: scoped.length,
    averageSessionSeconds: scoped.length ? Math.round(totalSeconds / scoped.length) : 0,
    longestSessionSeconds: Math.max(0, ...scoped.map(sessionDuration)),
    daysStudied: activeDays.size,
    averageActiveDaySeconds: activeDays.size ? Math.round(totalSeconds / activeDays.size) : 0,
    streak: calculateDailyStreak(scoped),
    subjectRows,
    subjectChart: subjectRows.map((row) => toChartBucket(row.name, row.seconds, row.name, row.color)),
    topSubject: subjectRows[0] || null,
    hourRows,
    topHour: maxBucket(hourRows),
    weekdayRows,
    topWeekday: maxBucket(weekdayRows),
    bestDay: maxBucket(groupSessions(scoped, (session) => dateKey(session.started_at), (session) => formatShortDate(session.started_at))),
    bestWeek: maxBucket(groupSessions(scoped, (session) => String(startOfWeek(new Date(session.started_at))), (session) => formatWeekRange(startOfWeek(new Date(session.started_at))))),
    bestMonth: maxBucket(groupSessions(scoped, (session) => monthKey(session.started_at), (session) => formatMonthLabel(session.started_at))),
    sessionTypeRows,
    trend: buildTrend(completed, scoped, period)
  };
}

function isCompletedSession(session: Session) {
  return sessionDuration(session) > 0;
}

function sessionDuration(session: Session) {
  return Math.max(0, session.duration_seconds || 0);
}

function filterSessionsByPeriod(sessions: Session[], period: StatsPeriod) {
  const range = periodRange(period);
  if (!range) return sessions;
  return sessions.filter((session) => session.started_at >= range.start && session.started_at < range.end);
}

function periodRange(period: StatsPeriod): { start: number; end: number } | null {
  const nowDate = new Date();
  if (period === 'lifetime') return null;
  if (period === 'week') {
    const start = startOfWeek(nowDate);
    return { start, end: start + 7 * dayMs };
  }
  if (period === 'month') {
    const start = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
    const end = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 1).getTime();
    return { start, end };
  }
  const start = new Date(nowDate.getFullYear(), 0, 1).getTime();
  return { start, end: new Date(nowDate.getFullYear() + 1, 0, 1).getTime() };
}

function periodLabel(period: StatsPeriod) {
  const nowDate = new Date();
  if (period === 'week') return `This week (${formatWeekRange(startOfWeek(nowDate))})`;
  if (period === 'month') return nowDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (period === 'year') return String(nowDate.getFullYear());
  return 'Lifetime';
}

function buildSubjectStats(sessions: Session[], subjects: Subject[], totalSeconds: number): SubjectStatsRow[] {
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const rows = new Map<string, SubjectStatsRow>();
  for (const session of sessions) {
    const id = session.subject_id ?? null;
    const subject = id === null ? undefined : subjectsById.get(id);
    const key = id === null ? 'unassigned' : String(id);
    const existing = rows.get(key) ?? {
      id,
      name: subject?.name || 'Unassigned',
      color: subject?.color || 'var(--accent)',
      seconds: 0,
      sessions: 0,
      averageSeconds: 0,
      percent: 0
    };
    existing.seconds += sessionDuration(session);
    existing.sessions += 1;
    rows.set(key, existing);
  }
  return [...rows.values()]
    .map((row) => ({
      ...row,
      averageSeconds: row.sessions ? Math.round(row.seconds / row.sessions) : 0,
      percent: totalSeconds ? Math.round((row.seconds / totalSeconds) * 100) : 0
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

function buildHourRows(sessions: Session[]): ChartBucket[] {
  const totals = Array.from({ length: 24 }, () => 0);
  for (const session of sessions) totals[new Date(session.started_at).getHours()] += sessionDuration(session);
  return totals.map((seconds, hour) => toChartBucket(formatHourRange(hour), seconds, formatHour(hour)));
}

function buildWeekdayRows(sessions: Session[]): ChartBucket[] {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totals = Array.from({ length: 7 }, () => 0);
  for (const session of sessions) totals[(new Date(session.started_at).getDay() + 6) % 7] += sessionDuration(session);
  return totals.map((seconds, index) => toChartBucket(labels[index], seconds));
}

function buildSessionTypeRows(sessions: Session[]): ChartBucket[] {
  const labels: Record<SessionType, string> = { pomodoro: 'Pomodoro', custom: 'Custom', freeform: 'Freeform' };
  const totals: Record<SessionType, number> = { pomodoro: 0, custom: 0, freeform: 0 };
  for (const session of sessions) {
    const type = session.session_type in totals ? session.session_type : 'custom';
    totals[type] += sessionDuration(session);
  }
  return (Object.keys(labels) as SessionType[]).map((type) => toChartBucket(labels[type], totals[type]));
}

function groupSessions(sessions: Session[], keyFor: (session: Session) => string, labelFor: (session: Session) => string): ChartBucket[] {
  const rows = new Map<string, { label: string; seconds: number }>();
  for (const session of sessions) {
    const key = keyFor(session);
    const existing = rows.get(key) ?? { label: labelFor(session), seconds: 0 };
    existing.seconds += sessionDuration(session);
    rows.set(key, existing);
  }
  return [...rows.values()].map((row) => toChartBucket(row.label, row.seconds));
}

function buildTrend(allSessions: Session[], scoped: Session[], period: StatsPeriod): ChartBucket[] {
  const nowDate = new Date();
  if (period === 'week') {
    const start = startOfWeek(nowDate);
    return Array.from({ length: 7 }, (_, day) => {
      const time = start + day * dayMs;
      return toChartBucket(new Date(time).toLocaleDateString(undefined, { weekday: 'short' }), sumBetween(scoped, time, time + dayMs));
    });
  }
  if (period === 'month') {
    const start = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
    const days = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
    return Array.from({ length: days }, (_, day) => {
      const time = start + day * dayMs;
      return toChartBucket(String(day + 1), sumBetween(scoped, time, time + dayMs));
    });
  }
  if (period === 'year') {
    return Array.from({ length: 12 }, (_, month) => {
      const start = new Date(nowDate.getFullYear(), month, 1).getTime();
      const end = new Date(nowDate.getFullYear(), month + 1, 1).getTime();
      return toChartBucket(new Date(start).toLocaleDateString(undefined, { month: 'short' }), sumBetween(scoped, start, end));
    });
  }
  if (allSessions.length === 0) return [];
  const first = Math.min(...allSessions.map((session) => session.started_at));
  const firstDate = new Date(first);
  const monthCount = (nowDate.getFullYear() - firstDate.getFullYear()) * 12 + nowDate.getMonth() - firstDate.getMonth() + 1;
  if (monthCount > 18) {
    return Array.from({ length: nowDate.getFullYear() - firstDate.getFullYear() + 1 }, (_, offset) => {
      const year = firstDate.getFullYear() + offset;
      return toChartBucket(String(year), sumBetween(allSessions, new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime()));
    });
  }
  return Array.from({ length: monthCount }, (_, offset) => {
    const date = new Date(firstDate.getFullYear(), firstDate.getMonth() + offset, 1);
    const start = date.getTime();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
    return toChartBucket(date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), sumBetween(allSessions, start, end));
  });
}

function sumBetween(sessions: Session[], start: number, end: number) {
  return sessions.filter((session) => session.started_at >= start && session.started_at < end).reduce((sum, session) => sum + sessionDuration(session), 0);
}

function maxBucket(rows: ChartBucket[]): ChartBucket {
  const fallback = toChartBucket('None', 0);
  return rows.reduce((best, row) => row.seconds > best.seconds ? row : best, fallback);
}

function toChartBucket(label: string, seconds: number, shortLabel?: string, color?: string): ChartBucket & { color?: string } {
  return {
    label,
    shortLabel,
    seconds,
    hours: Number((seconds / 3600).toFixed(2)),
    minutes: Number((seconds / 60).toFixed(1)),
    color
  };
}

function monthKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function formatWeekRange(start: number) {
  const end = start + 6 * dayMs;
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatHour(hour: number) {
  const h = hour % 12 || 12;
  return `${h} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatHourRange(hour: number) {
  return `${formatHour(hour)} - ${formatHour((hour + 1) % 24)}`;
}

function FlashcardsPage({ mini }: { mini: boolean }) {
  const store = useStudyStore();
  const [tab, setTab] = useState<'due' | 'all'>('due');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [review, setReview] = useState<Flashcard | null>(null);
  const cards = store.flashcards.filter((c) => (!mini || c.break_review) && (tab === 'all' || !c.next_review || c.next_review <= endOfDay()));

  async function addCard() {
    if (!front.trim() || !back.trim()) return;
    await window.studyflow.run('INSERT INTO flashcards(subject_id,front,back,next_review,created_at,break_review) VALUES(?,?,?,?,?,?)', [
      subjectId || null, front, back, now(), now(), 0
    ]);
    setFront('');
    setBack('');
    await store.refresh();
  }

  async function rate(card: Flashcard, rating: FlashcardRating) {
    const next = calculateNextReview(card, rating);
    await window.studyflow.run(
      'UPDATE flashcards SET interval_days=?, ease_factor=?, repetitions=?, next_review=?, review_count=? WHERE id=?',
      [next.interval_days, next.ease_factor, next.repetitions, next.next_review, next.review_count, card.id]
    );
    setReview(null);
    await store.refresh();
    if (!mini) setTab('all');
  }

  return (
    <section className={mini ? 'space-y-3' : 'page space-y-5'}>
      {!mini && <h1 className="text-3xl font-black">Flashcards</h1>}
      {!mini && (
        <div className="panel space-y-3">
          <h2 className="font-bold">Create Card</h2>
          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr_auto] gap-2">
            <select className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">No subject</option>{store.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="input" placeholder="Front" value={front} onChange={(e) => setFront(e.target.value)} />
            <input className="input" placeholder="Back" value={back} onChange={(e) => setBack(e.target.value)} />
            <button className="button primary" onClick={addCard}><Plus size={16} /> Add</button>
          </div>
        </div>
      )}
      <div className="panel">
        <div className="flex justify-between mb-3">
          <h2 className="font-bold">{mini ? 'Break Review' : 'Decks'}</h2>
          {!mini && <div className="flex gap-2"><button className="button" onClick={() => setTab('due')}>Review Due</button><button className="button" onClick={() => setTab('all')}>All</button></div>}
        </div>
        <div className="grid-auto">
          {cards.length === 0 && <EmptyState icon={Brain} message={mini ? 'No break-review cards queued.' : 'No cards here yet.'} />}
          {cards.map((card) => (
            <div key={card.id} className="panel">
              <div className="font-bold">{card.front}</div>
              <div className="small mt-2">Due {card.next_review ? formatDate(card.next_review) : 'now'} · interval {card.interval_days}d</div>
              <div className="flex gap-2 mt-3">
                <button className="button primary" onClick={() => setReview(card)}>Review</button>
                <button className="button" onClick={async () => { await window.studyflow.run('UPDATE flashcards SET break_review=? WHERE id=?', [card.break_review ? 0 : 1, card.id]); await store.refresh(); }}>
                  {card.break_review ? 'Remove break' : 'Add to break'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {!mini && <FixedDeckStats />}
      {review && <FixedReviewModal card={review} onClose={() => setReview(null)} onRate={rate} />}
    </section>
  );
}

function NotesPage() {
  const store = useStudyStore();
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [search, setSearch] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'dirty'>('idle');
  const noteSaveRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  async function loadNotes() {
    setNotes(await window.studyflow.getNotes(null));
  }

  useEffect(() => {
    void loadNotes();
  }, []);

  async function flushPendingSave() {
    if (!noteSaveRef.current || !selectedId) return;
    window.clearTimeout(noteSaveRef.current);
    noteSaveRef.current = null;
    await saveCurrent(title, content, subjectId);
  }

  async function openNote(id: number) {
    if (id !== selectedId) await flushPendingSave();
    const note = await window.studyflow.getNote(id);
    if (!note) return;
    setSelectedId(note.meta.id);
    setTitle(note.meta.title || 'Untitled');
    setContent(note.content || '');
    setSubjectId(note.meta.subject_id || '');
    setSaveState('idle');
  }

  async function newNote() {
    await flushPendingSave();
    const saved = await window.studyflow.saveNote({ id: null, title: 'Untitled', content: '', subjectId: subjectId || null });
    await loadNotes();
    await openNote(saved.id);
  }

  async function saveCurrent(nextTitle = title, nextContent = content, nextSubjectId: number | '' = subjectId) {
    if (noteSaveRef.current) window.clearTimeout(noteSaveRef.current);
    noteSaveRef.current = null;
    setSaveState('saving');
    const saved = await window.studyflow.saveNote({ id: selectedId, title: nextTitle || 'Untitled', content: nextContent, subjectId: nextSubjectId || null });
    setSelectedId(saved.id);
    await loadNotes();
    setSaveState('saved');
  }

  function scheduleSave(nextTitle: string, nextContent: string, nextSubjectId: number | '' = subjectId) {
    if (noteSaveRef.current) window.clearTimeout(noteSaveRef.current);
    setSaveState('dirty');
    noteSaveRef.current = window.setTimeout(() => {
      void saveCurrent(nextTitle, nextContent, nextSubjectId);
    }, 800);
  }

  async function removeNote(id: number) {
    if (selectedId !== id) await flushPendingSave();
    else if (noteSaveRef.current) {
      window.clearTimeout(noteSaveRef.current);
      noteSaveRef.current = null;
    }
    await window.studyflow.deleteNote(id);
    if (selectedId === id) {
      setSelectedId(null);
      setTitle('');
      setContent('');
    }
    await loadNotes();
  }

  function insertMarkdown(before: string, after = '') {
    const node = editorRef.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    const selected = content.slice(start, end);
    const next = `${content.slice(0, start)}${before}${selected || ''}${after}${content.slice(end)}`;
    setContent(next);
    scheduleSave(title, next);
    requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  const filtered = notes.filter((note) => (note.title || 'Untitled').toLowerCase().includes(search.toLowerCase()));
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <section className="page notes-page">
      <PageHeader title="Notes" subtitle="Markdown notes saved as files on disk." actions={<button className="button primary" onClick={newNote}><Plus size={15} /> New note</button>} />
      <div className="notes-shell">
        <div className="notes-list-panel">
          <div className="notes-list-header"><h2>Notes</h2><button className="button icon-only ghost" onClick={newNote}><Plus size={15} /></button></div>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notes" />
          {filtered.length === 0 && <EmptyState icon={NotebookPen} title="No notes yet" message="Create a note to start writing in Markdown." />}
          {filtered.map((note) => (
            <div key={note.id} className={clsx('note-list-row', selectedId === note.id && 'active')}>
              <button className="note-list-button" onClick={() => openNote(note.id)}>
                <span className="font-bold">{note.title || 'Untitled'}</span>
                <span className="small">{relativeTime(note.updated_at)}</span>
              </button>
              <button className="button icon-only danger note-delete" onClick={() => removeNote(note.id)}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className="notes-count">{notes.length} notes</div>
        </div>
        <div className="notes-editor-panel">
          {!selectedId ? (
            <EmptyState icon={NotebookPen} title="No note selected" message="Select a note or create a new one." action={<button className="button primary" onClick={newNote}>New note</button>} />
          ) : (
            <>
              <div className="note-topbar">
                <input className="note-title-input" placeholder="Title" value={title} onChange={(e) => { setTitle(e.target.value); scheduleSave(e.target.value, content); }} onBlur={() => saveCurrent()} />
                <select className="select note-subject" value={subjectId} onChange={(e) => { const value = e.target.value ? Number(e.target.value) : ''; setSubjectId(value); void saveCurrent(title, content, value); }}>
                  <option value="">No subject</option>{store.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="button ghost" onClick={() => window.studyflow.exportNote(selectedId, 'md')}>Export</button>
                <button className="button danger" onClick={() => removeNote(selectedId)}>Delete</button>
              </div>
              <div className="note-toolbar">
                <button className="button icon-only ghost" onClick={() => insertMarkdown('**', '**')}>B</button>
                <button className="button icon-only ghost" onClick={() => insertMarkdown('*', '*')}>I</button>
                <button className="button icon-only ghost" onClick={() => insertMarkdown('`', '`')}>C</button>
                <button className="button icon-only ghost" onClick={() => insertMarkdown('## ')}>H</button>
                <button className="button icon-only ghost" onClick={() => insertMarkdown('[', '](url)')}>L</button>
                <button className="button icon-only ghost" onClick={() => insertMarkdown('- ')}>UL</button>
                <button className="button icon-only ghost" onClick={() => insertMarkdown('1. ')}>OL</button>
                <button className="button icon-only ghost" onClick={() => insertMarkdown('> ')}>Q</button>
                <div className="segmented">
                  {(['edit', 'split', 'preview'] as const).map((modeName) => <button key={modeName} className={clsx(viewMode === modeName && 'active')} onClick={() => setViewMode(modeName)}>{modeName}</button>)}
                </div>
              </div>
              <div className={clsx('notes-editor-grid', viewMode)}>
                {viewMode !== 'preview' && <textarea ref={editorRef} className="markdown-input" value={content} onChange={(e) => { setContent(e.target.value); scheduleSave(title, e.target.value); }} onKeyDown={(event) => { if (event.key === 'Tab') { event.preventDefault(); insertMarkdown('  '); } }} />}
                {viewMode !== 'edit' && <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: marked.parse(content || '') }} />}
              </div>
              <div className="note-status"><span>{wordCount} words · {content.length} chars</span><span>{saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : saveState === 'dirty' ? 'Unsaved changes' : ''}</span></div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function BrowserPage() {
  const store = useStudyStore();
  const [settings, setSettings] = useState<Settings>(store.settings!);
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const [bridgeStatus, setBridgeStatus] = useState<BrowserBridgeStatus | null>(null);
  const debounceRef = useRef<Record<string, number>>({});
  const classRules = settings.browserClassRules || [];
  const distractionRules = settings.browserDistractionRules || [];
  const browserSessions = store.sessions.filter((session) => session.source === 'browser' || session.source === 'manual_browser');
  const browserSeconds = browserSessions.reduce((sum, session) => sum + (session.duration_seconds || 0), 0);
  const browserTodaySeconds = browserSessions.filter((session) => session.started_at >= startOfDay()).reduce((sum, session) => sum + (session.duration_seconds || 0), 0);
  const activeBrowserSessionId = bridgeStatus?.recording ? bridgeStatus.activeSessionId : null;

  useEffect(() => {
    window.studyflow.getSettings().then((loaded) => {
      setSettings(loaded);
      useStudyStore.setState({ settings: loaded });
    }).catch(() => {
      if (store.settings) setSettings(store.settings);
    });
  }, []);

  useEffect(() => {
    if (store.settings) setSettings(store.settings);
  }, [store.settings]);

  useEffect(() => {
    const refreshStatus = () => window.studyflow.getBrowserBridgeStatus().then(setBridgeStatus).catch(() => setBridgeStatus(null));
    void refreshStatus();
    const id = window.setInterval(refreshStatus, 5000);
    return () => window.clearInterval(id);
  }, [settings.browserLoggingEnabled]);

  async function persist(field: string, next: Settings) {
    setSettings(next);
    const saved = await window.studyflow.saveSettings(next);
    setSettings(saved);
    useStudyStore.setState({ settings: saved });
    setSavedFields((prev) => ({ ...prev, [field]: true }));
    window.setTimeout(() => setSavedFields((prev) => ({ ...prev, [field]: false })), 1500);
  }

  function debouncedPersist(field: string, next: Settings) {
    setSettings(next);
    window.clearTimeout(debounceRef.current[field]);
    debounceRef.current[field] = window.setTimeout(() => {
      void persist(field, next);
    }, 400);
  }

  function addBrowserRule() {
    void persist('browserClassRules', {
      ...settings,
      browserClassRules: [...classRules, { id: crypto.randomUUID(), pattern: '', subjectId: null }]
    });
  }

  function updateBrowserRule(id: string, patch: Partial<BrowserClassRule>) {
    debouncedPersist('browserClassRules', {
      ...settings,
      browserClassRules: classRules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule)
    });
  }

  function removeBrowserRule(id: string) {
    void persist('browserClassRules', { ...settings, browserClassRules: classRules.filter((rule) => rule.id !== id) });
  }

  function addDistractionRule() {
    void persist('browserDistractionRules', {
      ...settings,
      browserDistractionRules: [...distractionRules, { id: crypto.randomUUID(), pattern: '', label: '' }]
    });
  }

  function updateDistractionRule(id: string, patch: Partial<BrowserDistractionRule>) {
    debouncedPersist('browserDistractionRules', {
      ...settings,
      browserDistractionRules: distractionRules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule)
    });
  }

  function removeDistractionRule(id: string) {
    void persist('browserDistractionRules', { ...settings, browserDistractionRules: distractionRules.filter((rule) => rule.id !== id) });
  }

  return (
    <section className="page browser-page space-y-5">
      <PageHeader
        title="Browser Extension"
        subtitle="Pair the extension, approve class sites, review logged browser study sessions, and nudge yourself away from distraction loops."
        actions={(
          <>
            <button className="button" onClick={() => void store.refresh()}>Refresh History</button>
            <button className="button" onClick={() => void window.studyflow.notify('StudyFlow reminder', settings.browserDistractionMessage || 'Back to your StudyFlow plan.')}>Test Reminder</button>
          </>
        )}
      />
      <div className="browser-status-grid">
        <div className="panel browser-status-card">
          <div className="small">Bridge</div>
          <div className="metric mt-1">{bridgeStatus?.running ? 'Online' : 'Offline'}</div>
          <div className="small mt-1">{bridgeStatus?.running ? `http://${bridgeStatus.host}:${bridgeStatus.port}` : 'Restart StudyFlow to start the local bridge'}</div>
        </div>
        <div className="panel browser-status-card">
          <div className="small">Class Logging</div>
          <div className="metric mt-1">{settings.browserLoggingEnabled ? 'Enabled' : 'Off'}</div>
          <Toggle label="Log approved browser class sessions" checked={settings.browserLoggingEnabled} saved={savedFields.browserLoggingEnabled} onChange={(v) => persist('browserLoggingEnabled', { ...settings, browserLoggingEnabled: v })} />
        </div>
        <div className="panel browser-status-card">
          <div className="small">Distraction Reminders</div>
          <div className="metric mt-1">{settings.browserDistractionRemindersEnabled ? 'Active' : 'Muted'}</div>
          <Toggle label="Remind me on distracting sites" checked={settings.browserDistractionRemindersEnabled ?? true} saved={savedFields.browserDistractionRemindersEnabled} onChange={(v) => persist('browserDistractionRemindersEnabled', { ...settings, browserDistractionRemindersEnabled: v })} />
        </div>
      </div>

      <div className="browser-status-grid">
        <Metric icon={Clock3} label="Browser sessions" value={String(browserSessions.length)} />
        <Metric icon={BarChart3} label="Browser study time" value={formatDuration(browserSeconds)} />
        <Metric icon={Flame} label="Today from browser" value={formatDuration(browserTodaySeconds)} />
      </div>

      <SettingsPanel title="Browser Study History">
        {browserSessions.length === 0 && (
          <div className="browser-empty">No browser study sessions have been logged yet. Approved class playback will appear here after the extension records it.</div>
        )}
        {browserSessions.length > 0 && (
          <div className="browser-history-list">
            {browserSessions.slice(0, 25).map((session) => {
              const subject = store.subjects.find((item) => item.id === session.subject_id);
              const started = formatDateTime(session.started_at);
              const urlLabel = session.source_url ? browserHost(session.source_url) : 'No URL saved';
              return (
                <div className="browser-history-row" key={session.id}>
                  <div className="browser-history-main">
                    <div className="font-bold">{session.source_title || urlLabel}</div>
                    <div className="small">{started} · {sessionSourceLabel(session)} · {subject?.name || 'Unassigned'}</div>
                    {session.source_url && <div className="browser-url" title={session.source_url}>{session.source_url}</div>}
                  </div>
                  <div className="browser-history-meta">
                    <strong>{formatDuration(session.duration_seconds || 0)}</strong>
                    <span>{session.ended_at ? 'Saved' : activeBrowserSessionId === session.id ? 'Recording' : 'Paused'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsPanel>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-4">
        <SettingsPanel title="Pair Extension">
          <Field label="Pairing token">
            <div className="inline-control">
              <input className="input" readOnly value={settings.browserPairingToken} />
              <button className="button" onClick={async () => { await navigator.clipboard.writeText(settings.browserPairingToken); store.setToast('Pairing token copied'); }}><Copy size={15} /> Copy</button>
              <button className="button" onClick={() => void persist('browserPairingToken', { ...settings, browserPairingToken: makePairingToken() })}>Rotate</button>
            </div>
          </Field>
          <div className="browser-steps">
            <div>Open <strong>brave://extensions</strong> or <strong>chrome://extensions</strong>.</div>
            <div>Enable Developer mode and load the unpacked <strong>browser-extension</strong> folder.</div>
            <div>Click the extension from the puzzle menu, paste the token, then save and check.</div>
          </div>
        </SettingsPanel>

        <SettingsPanel title="Reminder Behavior">
          <NumberSetting label="Reminder cooldown minutes" value={settings.browserDistractionCooldownMinutes || 10} saved={savedFields.browserDistractionCooldownMinutes} onChange={(v) => persist('browserDistractionCooldownMinutes', { ...settings, browserDistractionCooldownMinutes: Math.max(1, v) })} />
          <Field label="Reminder message">
            <textarea
              className="textarea"
              rows={3}
              value={settings.browserDistractionMessage || ''}
              onChange={(e) => debouncedPersist('browserDistractionMessage', { ...settings, browserDistractionMessage: e.currentTarget.value })}
              placeholder="This looks like distraction territory. Come back to your StudyFlow plan."
            />
          </Field>
          <SavedBadge show={savedFields.browserDistractionMessage} />
        </SettingsPanel>
      </div>

      <SettingsPanel title="Approved Class URLs">
        <div className="flex items-center justify-between gap-2">
          <div className="small">Class sessions are logged only when the active tab matches one of these patterns, has playing video, and is audible.</div>
          <button className="button" onClick={addBrowserRule}><Plus size={15} /> Add URL</button>
        </div>
        {classRules.length === 0 && <div className="browser-empty">Add a site like pw.live, or use a wildcard pattern such as https://classes.example.com/*</div>}
        <div className="space-y-2">
          {classRules.map((rule) => (
            <div className="browser-rule-row" key={rule.id}>
              <input className="input" placeholder="pw.live" value={rule.pattern} onChange={(e) => updateBrowserRule(rule.id, { pattern: e.target.value })} />
              <select className="select" value={rule.subjectId ?? ''} onChange={(e) => updateBrowserRule(rule.id, { subjectId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Unassigned</option>
                {store.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
              <button className="button danger icon-only" title="Remove URL rule" onClick={() => removeBrowserRule(rule.id)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </SettingsPanel>

      <SettingsPanel title="Distraction Reminder Sites">
        <div className="flex items-center justify-between gap-2">
          <div className="small">When the active tab matches one of these patterns, the extension shows your reminder after the cooldown.</div>
          <button className="button" onClick={addDistractionRule}><Plus size={15} /> Add Site</button>
        </div>
        {distractionRules.length === 0 && <div className="browser-empty">Add distracting sites such as youtube.com, instagram.com, or reddit.com</div>}
        <div className="space-y-2">
          {distractionRules.map((rule) => (
            <div className="browser-distraction-row" key={rule.id}>
              <input className="input" placeholder="Label" value={rule.label} onChange={(e) => updateDistractionRule(rule.id, { label: e.target.value })} />
              <input className="input" placeholder="youtube.com" value={rule.pattern} onChange={(e) => updateDistractionRule(rule.id, { pattern: e.target.value })} />
              <button className="button danger icon-only" title="Remove reminder rule" onClick={() => removeDistractionRule(rule.id)}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </SettingsPanel>
    </section>
  );
}

function SettingsPage() {
  const store = useStudyStore();
  const [settings, setSettings] = useState<Settings>(store.settings!);
  const [savedFields, setSavedFields] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<Record<string, number>>({});

  useEffect(() => {
    window.studyflow.getSettings().then((loaded) => {
      setSettings(loaded);
      useStudyStore.setState({ settings: loaded });
    }).catch(() => {
      if (store.settings) setSettings(store.settings);
    });
  }, []);

  useEffect(() => {
    if (store.settings) setSettings(store.settings);
  }, [store.settings]);

  async function persist(field: string, next: Settings) {
    setSettings(next);
    const saved = await window.studyflow.saveSettings(next);
    setSettings(saved);
    useStudyStore.setState({ settings: saved });
    setSavedFields((prev) => ({ ...prev, [field]: true }));
    window.setTimeout(() => setSavedFields((prev) => ({ ...prev, [field]: false })), 1500);
  }

  function updateLocal(next: Settings) {
    setSettings(next);
  }

  function debouncedPersist(field: string, next: Settings) {
    updateLocal(next);
    window.clearTimeout(debounceRef.current[field]);
    debounceRef.current[field] = window.setTimeout(() => {
      void persist(field, next);
    }, 400);
  }

  async function clearData() {
    if (!window.confirm('Are you sure you want to clear all data? This cannot be undone.')) return;
    for (const table of ['goal_hits', 'achievements', 'flashcards', 'notes', 'checklist_items', 'goals', 'sessions', 'tasks', 'subjects']) {
      await window.studyflow.run(`DELETE FROM ${table}`);
    }
    await store.refresh();
  }

  return (
    <section className="page space-y-5">
      <h1 className="text-3xl font-black">Settings</h1>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SettingsPanel title="Timer">
          <NumberSetting label="Focus minutes" value={settings.pomodoroFocus} saved={savedFields.pomodoroFocus} onChange={(v) => persist('pomodoroFocus', { ...settings, pomodoroFocus: v })} />
          <NumberSetting label="Short break" value={settings.shortBreak} saved={savedFields.shortBreak} onChange={(v) => persist('shortBreak', { ...settings, shortBreak: v })} />
          <NumberSetting label="Long break" value={settings.longBreak} saved={savedFields.longBreak} onChange={(v) => persist('longBreak', { ...settings, longBreak: v })} />
          <Toggle label="Auto-start breaks" checked={settings.autoStartBreaks} saved={savedFields.autoStartBreaks} onChange={(v) => persist('autoStartBreaks', { ...settings, autoStartBreaks: v })} />
          <Toggle label="Auto-start focus" checked={settings.autoStartFocus} saved={savedFields.autoStartFocus} onChange={(v) => persist('autoStartFocus', { ...settings, autoStartFocus: v })} />
        </SettingsPanel>
        <SettingsPanel title="Checklist Templates">
          <ChecklistEditor isTemplate />
        </SettingsPanel>
        <SettingsPanel title="Notes">
          <Field label="Notes save directory">
            <div className="inline-control"><input className="input" value={settings.notes_dir} onChange={(e) => updateLocal({ ...settings, notes_dir: e.target.value })} onBlur={(e) => persist('notes_dir', { ...settings, notes_dir: e.currentTarget.value })} /><button className="button" onClick={async () => { const path = await window.studyflow.chooseDirectory(); if (path) await persist('notes_dir', { ...settings, notes_dir: path }); }}>Browse...</button></div>
          </Field>
          <Field label="Auto-backup directory">
            <div className="inline-control"><input className="input" value={settings.backup_dir} onChange={(e) => updateLocal({ ...settings, backup_dir: e.target.value })} onBlur={(e) => persist('backup_dir', { ...settings, backup_dir: e.currentTarget.value })} /><button className="button" onClick={async () => { const path = await window.studyflow.chooseDirectory(); if (path) await persist('backup_dir', { ...settings, backup_dir: path }); }}>Browse...</button></div>
          </Field>
        </SettingsPanel>
        <SettingsPanel title="Backup">
          <div className="small">Last backup: {settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : 'Never'}</div>
          <Toggle label="Auto-backup enabled" checked={settings.autoBackupEnabled} saved={savedFields.autoBackupEnabled} onChange={(v) => persist('autoBackupEnabled', { ...settings, autoBackupEnabled: v })} />
          <button className="button" onClick={async () => { const result = await window.studyflow.runBackup(); await persist('lastBackupAt', { ...settings, lastBackupAt: result.completedAt }); store.setToast(result.message); }}>Back up now</button>
        </SettingsPanel>
        <SettingsPanel title="Sounds">
          <select className="select" value={settings.ambientSound} onChange={(e) => persist('ambientSound', { ...settings, ambientSound: e.target.value })}>
            <option value="silence">Silence</option><option value="lofi">Lo-fi</option><option value="rain">Rain</option><option value="whitenoise">White Noise</option><option value="cafe">Cafe</option>
          </select>
          <SavedBadge show={savedFields.ambientSound} />
          <NumberSetting label="Ambient volume" value={settings.ambientVolume} saved={savedFields.ambientVolume} onChange={(v) => persist('ambientVolume', { ...settings, ambientVolume: v })} />
          <Toggle label="Play ambient during breaks" checked={settings.ambientDuringBreak} saved={savedFields.ambientDuringBreak} onChange={(v) => persist('ambientDuringBreak', { ...settings, ambientDuringBreak: v })} />
          <Toggle label="Bell alerts" checked={settings.bellEnabled} saved={savedFields.bellEnabled} onChange={(v) => persist('bellEnabled', { ...settings, bellEnabled: v })} />
          <NumberSetting label="Bell volume" value={settings.bellVolume} saved={savedFields.bellVolume} onChange={(v) => persist('bellVolume', { ...settings, bellVolume: v })} />
        </SettingsPanel>
        <SettingsPanel title="Focus Mode">
          <Toggle label="Enter Focus Mode when session starts" checked={settings.focusModeOnStart} saved={savedFields.focusModeOnStart} onChange={(v) => persist('focusModeOnStart', { ...settings, focusModeOnStart: v })} />
          <textarea className="textarea" value={settings.blocklist.join(', ')} onChange={(e) => debouncedPersist('blocklist', { ...settings, blocklist: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          <SavedBadge show={savedFields.blocklist} />
        </SettingsPanel>
        <SettingsPanel title="Appearance">
          <select className="select" value={settings.theme} onChange={(e) => persist('theme', { ...settings, theme: e.target.value as Settings['theme'] })}>
            <option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option>
          </select>
          <SavedBadge show={savedFields.theme} />
          <Field label="Accent color">
            <input className="input color-input" type="color" value={normalizeAccent(settings.accent)} onChange={(e) => persist('accent', { ...settings, accent: e.currentTarget.value })} />
          </Field>
          <SavedBadge show={savedFields.accent} />
        </SettingsPanel>
        <SettingsPanel title="Data & Startup">
          <Toggle label="Notifications" checked={Object.values(settings.notifications || {}).some(Boolean)} saved={savedFields.notifications} onChange={(v) => persist('notifications', { ...settings, notifications: { intervals: v, goals: v, badges: v, weekly: v } })} />
          <Toggle label="Auto-launch on Windows startup" checked={settings.autoLaunch} saved={savedFields.autoLaunch} onChange={(v) => persist('autoLaunch', { ...settings, autoLaunch: v })} />
          <div className="flex flex-wrap gap-2">
            <button className="button" onClick={async () => store.setToast((await window.studyflow.exportCsv()) || 'Export cancelled')}>Export CSV</button>
            <button className="button" onClick={async () => store.setToast((await window.studyflow.exportJson()) || 'Export cancelled')}>Export JSON</button>
            <button className="button" onClick={async () => { await window.studyflow.importJson('merge'); await store.refresh(); }}>Import JSON</button>
            <button className="button danger" onClick={clearData}>Clear all data</button>
          </div>
        </SettingsPanel>
        <SettingsPanel title="Feedback">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-accent" />
              <span className="font-bold">{feedbackEmail}</span>
            </div>
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(feedbackEmail);
                  store.setToast('Feedback email copied');
                } catch {
                  store.setToast('Could not copy feedback email');
                }
              }}
            >
              <Copy size={16} /> Copy Email
            </button>
          </div>
        </SettingsPanel>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="panel"><Icon size={20} className="text-accent" /><div className="small mt-3">{label}</div><div className="metric mt-1">{value}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="label">{label}</span>{children}</label>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <SharedModal title={title} onClose={onClose}>{children}</SharedModal>;
}

function Rating({ value, setValue, disabled = false }: { value: number; setValue: (value: number) => void; disabled?: boolean }) {
  return <div><div className="rating-row">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={value === n} disabled={disabled} className={clsx('button rating-button', value === n && 'selected')} onClick={() => setValue(n)}>{n}</button>)}</div><div className="small mt-1">Selected: {value} / 5</div></div>;
}

function ProgressRing({ progress, color, label }: { progress: number; color: string; label: string }) {
  const radius = 146;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="timer-ring" viewBox="0 0 320 320">
      <circle cx="160" cy="160" r={radius} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle cx="160" cy="160" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} transform="rotate(-90 160 160)" />
      <text x="160" y="174" textAnchor="middle" fontSize="64" fontWeight="700" fill="currentColor">{label}</text>
    </svg>
  );
}

function FixedTaskList({ tasks }: { tasks: Task[] }) {
  const store = useStudyStore();
  async function toggle(task: Task) {
    await window.studyflow.run('UPDATE tasks SET completed=? WHERE id=?', [task.completed ? 0 : 1, task.id]);
    await store.refresh();
  }
  async function remove(task: Task) {
    await window.studyflow.run('DELETE FROM tasks WHERE id=?', [task.id]);
    await store.refresh();
  }
  async function move(task: Task, dir: number) {
    await window.studyflow.run('UPDATE tasks SET sort_order=? WHERE id=?', [(task.sort_order || 0) + dir, task.id]);
    await store.refresh();
  }
  if (tasks.length === 0) return <EmptyState icon={ListChecks} message="No tasks for this subject yet." />;
  return <div className="space-y-2">{tasks.map((task) => <div key={task.id} className="task-row"><input type="checkbox" checked={!!task.completed} onChange={() => toggle(task)} /><span className={clsx('flex-1', task.completed && 'line-through text-muted')}>{task.title}</span><span className="small">{task.priority}</span><button className="button" onClick={() => move(task, -1)}>Up</button><button className="button" onClick={() => move(task, 1)}>Down</button><button className="button danger" onClick={() => remove(task)}><Trash2 size={14} /></button></div>)}</div>;
}

function FixedMatrixCell({ title, tasks }: { title: string; tasks: Task[] }) {
  return <div className="panel min-h-32"><div className="font-bold mb-2">{title}</div>{tasks.length === 0 && <div className="small py-1">No tasks</div>}{tasks.map((t) => <div key={t.id} className="small py-1">{t.completed ? 'Done' : 'Open'} - {t.title}</div>)}</div>;
}

function FixedSessionList({ sessions }: { sessions: Session[] }) {
  const { subjects } = useStudyStore();
  return <div className="space-y-2">{sessions.length === 0 && <EmptyState icon={Clock3} message="No sessions yet." />}{sessions.map((session) => { const s = subjects.find((x) => x.id === session.subject_id); return <div key={session.id} className="session-row"><div><div className="font-bold"><span style={{ color: s?.color }}>*</span> {s?.name || 'Unassigned'} <span className="small">{sessionSourceLabel(session)}</span></div><div className="small">{formatDateTime(session.started_at)} · mood {session.mood_after || '-'}/5</div></div><div className="font-bold">{formatDuration(session.duration_seconds || 0)}</div></div>; })}</div>;
}

function FixedGoalProgress({ goals, onDelete }: { goals: Goal[]; onDelete?: (goal: Goal) => void | Promise<void> }) {
  const { subjects } = useStudyStore();
  if (goals.length === 0) return <EmptyState icon={Trophy} message="No goals set." />;
  return <div className="space-y-3">{goals.map((goal) => <FixedGoalRow key={goal.id} goal={goal} subject={subjects.find((s) => s.id === goal.subject_id)} onDelete={onDelete} />)}</div>;
}

function FixedGoalRow({ goal, subject, onDelete }: { goal: Goal; subject?: Subject; onDelete?: (goal: Goal) => void | Promise<void> }) {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => { totalMinutesForGoal(goal).then(setMinutes).catch(() => setMinutes(0)); }, [goal.id, goal.period, goal.subject_id]);
  const pct = Math.min(100, Math.round((minutes / goal.target_minutes) * 100));
  return <div className="goal-progress-row"><div className="flex items-center justify-between gap-2 small mb-1"><span className="flex items-center gap-2">{subject?.name || 'All'} · {goal.period}{onDelete && <button className="icon-action danger-action" title="Delete goal" aria-label={`Delete ${subject?.name || 'all subjects'} ${goal.period} goal`} onClick={() => void onDelete(goal)}><Trash2 size={14} /></button>}</span><span>{minutes}/{goal.target_minutes}m · {Math.max(0, goal.target_minutes - minutes)}m left</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%`, background: subject?.color || 'var(--accent)' }} /></div></div>;
}

function FixedHeatmap({ sessions }: { sessions: Session[] }) {
  const map = new Map<string, number>();
  for (const session of sessions) map.set(dateKey(session.started_at), (map.get(dateKey(session.started_at)) || 0) + Math.round((session.duration_seconds || 0) / 60));
  const today = startOfDay();
  const start = startOfWeek(new Date(today - 364 * dayMs));
  const weeks = Array.from({ length: Math.ceil((today - start + dayMs) / (7 * dayMs)) }, (_, week) =>
    Array.from({ length: 7 }, (_day, day) => start + (week * 7 + day) * dayMs)
  );
  const monthLabels = weeks.flatMap((week, weekIndex) => {
    const monthStart = week.find((day) => day <= today && new Date(day).getDate() === 1);
    if (!monthStart && weekIndex !== 0) return [];
    const labelDay = monthStart || week.find((day) => day <= today) || week[0];
    return [{ weekIndex, label: new Date(labelDay).toLocaleDateString(undefined, { month: 'short' }) }];
  });
  const monthStartWeeks = new Set(monthLabels.map((item) => item.weekIndex));
  const gridStyle = { gridTemplateColumns: `32px repeat(${weeks.length}, 12px)` };

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-months" style={gridStyle}>
        <span />
        {monthLabels.map((item) => <span key={`${item.weekIndex}-${item.label}`} style={{ gridColumn: item.weekIndex + 2 }}>{item.label}</span>)}
      </div>
      <div className="heatmap-grid" style={gridStyle}>
        {[
          { row: 1, label: 'Mon' },
          { row: 3, label: 'Wed' },
          { row: 5, label: 'Fri' }
        ].map((item) => <span key={item.label} className="heatmap-day-label" style={{ gridRow: item.row }}>{item.label}</span>)}
        {weeks.map((week, weekIndex) => week.map((day, dayIndex) => {
          const mins = map.get(dateKey(day)) || 0;
          const alpha = Math.min(1, mins / 180);
          const isFuture = day > today;
          return (
            <div
              key={day}
              className={clsx('heat-cell', monthStartWeeks.has(weekIndex) && 'month-start', isFuture && 'future')}
              title={formatHeatmapTooltip(day, mins)}
              style={{
                gridColumn: weekIndex + 2,
                gridRow: dayIndex + 1,
                opacity: mins ? 0.25 + alpha * 0.75 : undefined,
                background: mins ? 'var(--accent)' : undefined
              }}
            />
          );
        }))}
      </div>
    </div>
  );
}

function FixedReviewModal({ card, onClose, onRate }: { card: Flashcard; onClose: () => void; onRate: (card: Flashcard, rating: FlashcardRating) => void }) {
  const [flipped, setFlipped] = useState(false);
  return <Modal title="Review card" onClose={onClose}><button className={clsx('flashcard-review', flipped && 'flipped')} onClick={() => setFlipped((value) => !value)}><span className="flashcard-face flashcard-front">{card.front}</span><span className="flashcard-face flashcard-back">{card.back}</span></button><div className="rating-row">{!flipped ? <button className="button primary" onClick={() => setFlipped(true)}>Reveal</button> : (['again', 'hard', 'good', 'easy'] as FlashcardRating[]).map((r, idx) => <button key={r} className={clsx('button rating-button', `rating-${idx + 1}`)} onClick={() => onRate(card, r)}>{idx + 1} {r}</button>)}</div></Modal>;
}

function FixedDeckStats() {
  const { flashcards, subjects } = useStudyStore();
  return <div className="panel"><h2 className="font-bold mb-3">Deck Stats</h2><div className="grid-auto">{subjects.map((subject) => { const cards = flashcards.filter((c) => c.subject_id === subject.id); return <div key={subject.id} className="panel"><div className="font-bold" style={{ color: subject.color }}>{subject.name}</div><div className="small">Total {cards.length} · Due {cards.filter((c) => !c.next_review || c.next_review <= endOfDay()).length} · Mastered {cards.filter((c) => c.interval_days > 21).length}</div></div>; })}</div></div>;
}

function AchievementsPanel() {
  const { achievements } = useStudyStore();
  const unlocked = new Set(achievements.filter((achievement) => achievement.unlocked_at).map((achievement) => achievement.key));
  return (
    <div className="panel">
      <h2 className="font-bold mb-3">Achievements</h2>
      <div className="achievement-grid">
        {badges.map((badge) => (
          <div key={badge.key} className={clsx('achievement', unlocked.has(badge.key) ? 'unlocked' : 'locked')}>
            <Trophy size={18} />
            <div>
              <div className="font-bold">{badge.name}</div>
              <div className="small">{badge.condition}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, message, action, compact = false }: { icon: React.ElementType; title?: string; message: string; action?: React.ReactNode; compact?: boolean }) {
  return <div className={clsx('empty-state', compact && 'compact')}><Icon size={compact ? 16 : 22} />{title && <strong>{title}</strong>}<span>{message}</span>{action}</div>;
}

function TaskList({ tasks }: { tasks: Task[] }) {
  const store = useStudyStore();
  async function toggle(task: Task) {
    await window.studyflow.run('UPDATE tasks SET completed=? WHERE id=?', [task.completed ? 0 : 1, task.id]);
    await store.refresh();
  }
  async function remove(task: Task) {
    await window.studyflow.run('DELETE FROM tasks WHERE id=?', [task.id]);
    await store.refresh();
  }
  async function move(task: Task, dir: number) {
    await window.studyflow.run('UPDATE tasks SET sort_order=? WHERE id=?', [(task.sort_order || 0) + dir, task.id]);
    await store.refresh();
  }
  if (tasks.length === 0) return <EmptyState icon={ListChecks} message="No tasks for this subject yet." />;
  return <div className="space-y-2">{tasks.map((task) => <div key={task.id} className="flex items-center gap-2 panel !p-3"><input type="checkbox" checked={!!task.completed} onChange={() => toggle(task)} /><span className={clsx('flex-1', task.completed && 'line-through text-muted')}>{task.title}</span><span className="small">{task.priority}</span><button className="button" onClick={() => move(task, -1)}>Up</button><button className="button" onClick={() => move(task, 1)}>Down</button><button className="button danger" onClick={() => remove(task)}><Trash2 size={14} /></button></div>)}</div>;
}

function MatrixCell({ title, tasks }: { title: string; tasks: Task[] }) {
  return <div className="panel min-h-32"><div className="font-bold mb-2">{title}</div>{tasks.map((t) => <div key={t.id} className="small py-1">{t.completed ? 'Done' : 'Open'} {t.title}</div>)}</div>;
}

function SessionList({ sessions }: { sessions: Session[] }) {
  const { subjects } = useStudyStore();
  return <div className="space-y-2">{sessions.length === 0 && <div className="small">No sessions yet.</div>}{sessions.map((session) => { const s = subjects.find((x) => x.id === session.subject_id); return <div key={session.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-2"><div><div className="font-bold"><span style={{ color: s?.color }}>*</span> {s?.name || 'Unassigned'}</div><div className="small">{formatDateTime(session.started_at)} · mood {session.mood_after || '-'}/5</div></div><div className="font-bold">{formatDuration(session.duration_seconds || 0)}</div></div>; })}</div>;
}

function GoalProgress({ goals }: { goals: Goal[] }) {
  const { subjects } = useStudyStore();
  if (goals.length === 0) return <div className="small">No goals set.</div>;
  return <div className="space-y-3">{goals.map((goal) => <GoalRow key={goal.id} goal={goal} subject={subjects.find((s) => s.id === goal.subject_id)} />)}</div>;
}

function GoalRow({ goal, subject }: { goal: Goal; subject?: Subject }) {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => { totalMinutesForGoal(goal).then(setMinutes).catch(() => setMinutes(0)); }, [goal.id]);
  const pct = Math.min(100, Math.round((minutes / goal.target_minutes) * 100));
  return <div><div className="flex justify-between small mb-1"><span>{subject?.name || 'All'} · {goal.period}</span><span>{minutes}/{goal.target_minutes}m · {Math.max(0, goal.target_minutes - minutes)}m left</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%`, background: subject?.color }} /></div></div>;
}

async function totalMinutesForGoal(goal: Goal) {
  const from = goal.period === 'daily' ? startOfDay() : startOfWeek();
  const rows = await window.studyflow.query<{ total: number }>('SELECT SUM(duration_seconds) as total FROM sessions WHERE started_at>=? AND (? IS NULL OR subject_id=?)', [from, goal.subject_id, goal.subject_id]);
  return Math.round((rows[0]?.total || 0) / 60);
}

function Heatmap({ sessions }: { sessions: Session[] }) {
  return <FixedHeatmap sessions={sessions} />;
}

function ChartPanel({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="panel h-80"><h2 className="font-bold mb-2">{title}</h2><ResponsiveContainer width="100%" height="88%">{children}</ResponsiveContainer></div>;
}

function ReviewModal({ card, onClose, onRate }: { card: Flashcard; onClose: () => void; onRate: (card: Flashcard, rating: FlashcardRating) => void }) {
  const [flipped, setFlipped] = useState(false);
  return <Modal title="Review card" onClose={onClose}><div className="panel text-center min-h-48 flex flex-col justify-center"><div className="text-2xl font-black">{flipped ? card.back : card.front}</div></div><div className="flex justify-center gap-2 mt-4">{!flipped ? <button className="button primary" onClick={() => setFlipped(true)}>Reveal</button> : (['again', 'hard', 'good', 'easy'] as FlashcardRating[]).map((r) => <button key={r} className="button primary" onClick={() => onRate(card, r)}>{r}</button>)}</div></Modal>;
}

function DeckStats() {
  const { flashcards, subjects } = useStudyStore();
  return <div className="panel"><h2 className="font-bold mb-3">Deck Stats</h2><div className="grid-auto">{subjects.map((subject) => { const cards = flashcards.filter((c) => c.subject_id === subject.id); return <div key={subject.id} className="panel"><div className="font-bold" style={{ color: subject.color }}>{subject.name}</div><div className="small">Total {cards.length} · Due {cards.filter((c) => !c.next_review || c.next_review <= endOfDay()).length} · Mastered {cards.filter((c) => c.interval_days > 21).length}</div></div>; })}</div></div>;
}

function WeeklyReport({ onClose }: { onClose: () => void }) {
  const { sessions, subjects, goals } = useStudyStore();
  const thisWeek = sessions.filter((s) => s.started_at >= startOfWeek());
  const lastWeekStart = startOfWeek() - 7 * dayMs;
  const lastWeek = sessions.filter((s) => s.started_at >= lastWeekStart && s.started_at < startOfWeek());
  const bySubject = subjects.map((subject) => ({ subject, seconds: thisWeek.filter((s) => s.subject_id === subject.id).reduce((sum, s) => sum + (s.duration_seconds || 0), 0) })).sort((a, b) => b.seconds - a.seconds);
  return <Modal title="End-of-week summary" onClose={onClose}><div className="space-y-3"><Metric icon={Clock3} label="This week" value={formatDuration(thisWeek.reduce((sum, s) => sum + (s.duration_seconds || 0), 0))} /><div className="panel">Last week: {formatDuration(lastWeek.reduce((sum, s) => sum + (s.duration_seconds || 0), 0))}</div><div className="panel">Most studied: {bySubject[0]?.subject.name || 'None'}</div><div className="panel">Goal completion: {goals.length ? Math.round((goals.filter((g) => g.target_minutes > 0).length / goals.length) * 100) : 0}%</div></div></Modal>;
}

function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="panel space-y-3"><h2 className="font-bold">{title}</h2>{children}</div>;
}

function NumberSetting({ label, value, saved, onChange, onCommit }: { label: string; value: number; saved?: boolean; onChange: (value: number) => void; onCommit?: () => void }) {
  return <Field label={label}><input className="input" type="number" min={0} max={240} value={value} onChange={(e) => onChange(Number(e.target.value))} onBlur={onCommit} /><SavedBadge show={!!saved} /></Field>;
}

function Toggle({ label, checked, saved, onChange }: { label: string; checked: boolean; saved?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span><SavedBadge show={!!saved} /></label>;
}

function SavedBadge({ show }: { show?: boolean }) {
  return <span className={clsx('saved-badge', show && 'show')}>Saved ✓</span>;
}

function phaseDuration(phase: TimerPhase, mode: SessionType, custom: number, settings: Settings) {
  if (phase === 'shortBreak') return settings.shortBreak * 60;
  if (phase === 'longBreak') return settings.longBreak * 60;
  if (mode === 'custom') return custom * 60;
  if (mode === 'freeform') return 60 * 60;
  return settings.pomodoroFocus * 60;
}

function todaySeconds(sessions: Session[]) {
  const from = startOfDay();
  return sessions.filter((s) => s.started_at >= from).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
}

function formatHeatmapTooltip(day: number, minutes: number) {
  const date = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date} — ${formatHeatmapMinutes(minutes)}`;
}

function formatHeatmapMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function sessionSourceLabel(session: Session) {
  if (session.source === 'browser') return 'browser class';
  if (session.source === 'manual_browser') return 'manual + browser class';
  return 'manual';
}

function browserHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function relativeTime(value: number | string) {
  const time = typeof value === 'number' ? value : Number(value) || new Date(value).getTime();
  const diff = Date.now() - time;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hr ago`;
  if (diff < 2 * day) return 'yesterday';
  return `${Math.floor(diff / day)} days ago`;
}

function chartDays(sessions: Session[], days: number) {
  return Array.from({ length: days }).map((_, i) => {
    const t = startOfDay() - (days - i - 1) * dayMs;
    const rows = sessions.filter((s) => s.started_at >= t && s.started_at < t + dayMs);
    return { day: new Date(t).toLocaleDateString(undefined, { weekday: 'short' }), hours: Number((rows.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 3600).toFixed(2)), energy: avg(rows.map((s) => s.energy_after || 0)) };
  });
}

function chartWeeks(sessions: Session[], weeks: number) {
  return Array.from({ length: weeks }).map((_, i) => {
    const t = startOfWeek() - (weeks - i - 1) * 7 * dayMs;
    const rows = sessions.filter((s) => s.started_at >= t && s.started_at < t + 7 * dayMs);
    return { week: `W${i + 1}`, hours: Number((rows.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 3600).toFixed(2)) };
  });
}

function avg(values: number[]) {
  const clean = values.filter(Boolean);
  return clean.length ? Number((clean.reduce((a, b) => a + b, 0) / clean.length).toFixed(1)) : 0;
}

function playAmbient(settings: Settings, ref: React.MutableRefObject<Howl | null>) {
  const src = soundUrls[settings.ambientSound];
  if (!src) return;
  if (!ref.current) ref.current = new Howl({ src: [src], loop: true, volume: settings.ambientVolume / 100, html5: true });
  ref.current.volume(settings.ambientVolume / 100);
  if (!ref.current.playing()) ref.current.play();
}

function bell(settings: Settings) {
  if (!settings.bellEnabled) return;
  try {
    const audio = new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.value = settings.bellVolume / 100;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.16);
  } catch {
    // AudioContext may be unavailable until the user interacts with the app.
  }
}

function normalizeAccent(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : defaultAccent;
}

function hexToRgb(hex: string) {
  const clean = normalizeAccent(hex).replace('#', '');
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}

function lightenHex(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => Math.min(255, value + amount).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function makePairingToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
