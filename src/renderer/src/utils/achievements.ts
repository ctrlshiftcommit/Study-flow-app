import type { Session } from '@shared/types';
import { dateKey, dayMs, startOfDay } from './time';

export const badges = [
  { key: 'first_session', name: 'First Step', condition: 'Complete first session' },
  { key: 'hours_10', name: '10-Hour Club', condition: 'Accumulate 10 total hours' },
  { key: 'hours_50', name: 'Dedicated Scholar', condition: 'Accumulate 50 total hours' },
  { key: 'hours_100', name: 'Century', condition: 'Accumulate 100 total hours' },
  { key: 'streak_3', name: 'On a Roll', condition: '3-day streak' },
  { key: 'streak_7', name: 'Weekly Warrior', condition: '7-day streak' },
  { key: 'streak_30', name: 'Month of Mastery', condition: '30-day streak' },
  { key: 'pomodoro_10', name: 'Tomato Farmer', condition: 'Complete 10 Pomodoro sessions' },
  { key: 'cards_50', name: 'Flashcard Fan', condition: 'Review 50 flashcards' },
  { key: 'goal_hit_5', name: 'Goal Getter', condition: 'Hit daily goal 5 times' },
  { key: 'night_owl', name: 'Night Owl', condition: 'Complete a session after midnight' },
  { key: 'early_bird', name: 'Early Bird', condition: 'Complete a session before 7am' }
];

export function calculateDailyStreak(sessions: Session[]): { current: number; best: number } {
  const days = [...new Set(sessions.filter((s) => (s.duration_seconds || 0) > 0).map((s) => dateKey(s.started_at)))].sort();
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
  let cursor = startOfDay();
  const set = new Set(days);
  while (set.has(dateKey(cursor))) {
    current += 1;
    cursor -= dayMs;
  }
  return { current, best };
}
