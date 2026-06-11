import type { Session } from '@shared/types';
import { dateKey, dayMs, startOfDay } from './time';

export const badges = [
  { key: 'first_session', name: 'First Step', condition: 'Complete first session', accent: '#78dca0' },
  { key: 'sessions_25', name: 'Study Regular', condition: 'Complete 25 sessions', accent: '#66d9ef' },
  { key: 'sessions_100', name: 'Session Centurion', condition: 'Complete 100 sessions', accent: '#b392ff' },
  { key: 'hours_10', name: '10-Hour Club', condition: 'Accumulate 10 total hours', accent: '#ff8c3c' },
  { key: 'hours_50', name: 'Dedicated Scholar', condition: 'Accumulate 50 total hours', accent: '#ffd37a' },
  { key: 'hours_100', name: 'Century', condition: 'Accumulate 100 total hours', accent: '#ff7a8a' },
  { key: 'hours_250', name: 'Quarter Legend', condition: 'Accumulate 250 total hours', accent: '#78dca0' },
  { key: 'hours_500', name: 'Master Archive', condition: 'Accumulate 500 total hours', accent: '#b392ff' },
  { key: 'streak_3', name: 'On a Roll', condition: '3-day streak', accent: '#66d9ef' },
  { key: 'streak_7', name: 'Weekly Warrior', condition: '7-day streak', accent: '#78dca0' },
  { key: 'streak_14', name: 'Fortnight Flame', condition: '14-day streak', accent: '#ffd37a' },
  { key: 'streak_30', name: 'Month of Mastery', condition: '30-day streak', accent: '#b392ff' },
  { key: 'streak_60', name: 'Unbroken Path', condition: '60-day streak', accent: '#66d9ef' },
  { key: 'pomodoro_10', name: 'Tomato Farmer', condition: 'Complete 10 Pomodoro sessions', accent: '#ff8c3c' },
  { key: 'pomodoro_50', name: 'Focus Harvest', condition: 'Complete 50 Pomodoro sessions', accent: '#78dca0' },
  { key: 'pomodoro_100', name: 'Pomodoro Pro', condition: 'Complete 100 Pomodoro sessions', accent: '#ff7a8a' },
  { key: 'browser_60', name: 'Class Companion', condition: 'Log 1 hour from browser classes', accent: '#66d9ef' },
  { key: 'browser_300', name: 'Lecture Loyalist', condition: 'Log 5 hours from browser classes', accent: '#b392ff' },
  { key: 'browser_900', name: 'Lecture Library', condition: 'Log 15 hours from browser classes', accent: '#ffd37a' },
  { key: 'browser_1800', name: 'Course Crusher', condition: 'Log 30 hours from browser classes', accent: '#78dca0' },
  { key: 'cards_50', name: 'Flashcard Fan', condition: 'Review 50 flashcards', accent: '#ffd37a' },
  { key: 'cards_200', name: 'Recall Runner', condition: 'Review 200 flashcards', accent: '#66d9ef' },
  { key: 'cards_500', name: 'Memory Machine', condition: 'Review 500 flashcards', accent: '#b392ff' },
  { key: 'goal_hit_5', name: 'Goal Getter', condition: 'Hit daily goal 5 times', accent: '#78dca0' },
  { key: 'goal_hit_15', name: 'Target Locked', condition: 'Hit daily goal 15 times', accent: '#ff8c3c' },
  { key: 'goal_hit_30', name: 'Promise Keeper', condition: 'Hit daily goal 30 times', accent: '#ff7a8a' },
  { key: 'deep_work_90', name: 'Deep Work', condition: 'Complete a 90-minute session', accent: '#78dca0' },
  { key: 'marathon_180', name: 'Study Marathon', condition: 'Complete a 3-hour session', accent: '#b392ff' },
  { key: 'subject_trio', name: 'Subject Trio', condition: 'Study 3 different subjects', accent: '#66d9ef' },
  { key: 'reflection_10', name: 'Reflective Learner', condition: 'Write notes/goals for 10 sessions', accent: '#ffd37a' },
  { key: 'weekend_warrior', name: 'Weekend Warrior', condition: 'Study on a weekend', accent: '#ff8c3c' },
  { key: 'night_owl', name: 'Night Owl', condition: 'Complete a session after midnight', accent: '#b392ff' },
  { key: 'early_bird', name: 'Early Bird', condition: 'Complete a session before 7am', accent: '#ffd37a' }
];

export type Badge = typeof badges[number];

export function evaluateAchievements(sessions: Session[], flashcardReviewCount = 0, goalHitCount = 0): Record<string, boolean> {
  const completed = sessions.filter((session) => (session.duration_seconds || 0) > 0);
  const totalHours = completed.reduce((sum, session) => sum + (session.duration_seconds || 0), 0) / 3600;
  const browserMinutes = completed
    .filter((session) => session.source === 'browser' || session.source === 'manual_browser')
    .reduce((sum, session) => sum + (session.duration_seconds || 0), 0) / 60;
  const streak = calculateDailyStreak(completed).current;
  const pomodoros = completed.filter((session) => session.session_type === 'pomodoro').length;
  const hours = completed.map((session) => new Date(session.started_at).getHours());
  const uniqueSubjects = new Set(completed.map((session) => session.subject_id).filter(Boolean));
  const reflectiveSessions = completed.filter((session) => [session.note, session.intention, session.goal].some((value) => String(value || '').trim())).length;
  return {
    first_session: completed.length >= 1,
    sessions_25: completed.length >= 25,
    sessions_100: completed.length >= 100,
    hours_10: totalHours >= 10,
    hours_50: totalHours >= 50,
    hours_100: totalHours >= 100,
    hours_250: totalHours >= 250,
    hours_500: totalHours >= 500,
    streak_3: streak >= 3,
    streak_7: streak >= 7,
    streak_14: streak >= 14,
    streak_30: streak >= 30,
    streak_60: streak >= 60,
    pomodoro_10: pomodoros >= 10,
    pomodoro_50: pomodoros >= 50,
    pomodoro_100: pomodoros >= 100,
    browser_60: browserMinutes >= 60,
    browser_300: browserMinutes >= 300,
    browser_900: browserMinutes >= 900,
    browser_1800: browserMinutes >= 1800,
    cards_50: flashcardReviewCount >= 50,
    cards_200: flashcardReviewCount >= 200,
    cards_500: flashcardReviewCount >= 500,
    goal_hit_5: goalHitCount >= 5,
    goal_hit_15: goalHitCount >= 15,
    goal_hit_30: goalHitCount >= 30,
    deep_work_90: completed.some((session) => (session.duration_seconds || 0) >= 90 * 60),
    marathon_180: completed.some((session) => (session.duration_seconds || 0) >= 180 * 60),
    subject_trio: uniqueSubjects.size >= 3,
    reflection_10: reflectiveSessions >= 10,
    weekend_warrior: completed.some((session) => [0, 6].includes(new Date(session.started_at).getDay())),
    night_owl: hours.some((hour) => hour < 4),
    early_bird: hours.some((hour) => hour < 7)
  };
}

export function calculateDailyStreak(sessions: Session[], freezeDates: string[] = []): { current: number; best: number; freezesUsed: number } {
  const days = [...new Set([
    ...sessions.filter((s) => (s.duration_seconds || 0) > 0).map((s) => dateKey(s.started_at)),
    ...freezeDates
  ])].sort();
  let best = 0;
  let run = 0;
  let previous = '';
  for (const day of days) {
    const t = new Date(`${day}T00:00:00`).getTime();
    const prevT = previous ? new Date(`${previous}T00:00:00`).getTime() : 0;
    run = previous && t - prevT === dayMs ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  let current = 0;
  const set = new Set(days);
  let cursor = startOfDay();
  if (!set.has(dateKey(cursor))) cursor -= dayMs;
  while (set.has(dateKey(cursor))) {
    current += 1;
    cursor -= dayMs;
  }
  return { current, best, freezesUsed: freezeDates.length };
}
