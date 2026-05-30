import { create } from 'zustand';
import type { Achievement, Flashcard, Goal, NoteSummary, Session, Settings, Subject, Task } from '@shared/types';

interface StudyState {
  subjects: Subject[];
  tasks: Task[];
  sessions: Session[];
  goals: Goal[];
  notes: NoteSummary[];
  flashcards: Flashcard[];
  achievements: Achievement[];
  settings: Settings | null;
  selectedSubjectId: number | null;
  toast: string | null;
  loading: boolean;
  setToast: (message: string | null) => void;
  selectSubject: (id: number | null) => void;
  refresh: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<void>;
}

export const useStudyStore = create<StudyState>((set, get) => ({
  subjects: [],
  tasks: [],
  sessions: [],
  goals: [],
  notes: [],
  flashcards: [],
  achievements: [],
  settings: null,
  selectedSubjectId: null,
  toast: null,
  loading: true,
  setToast: (toast) => set({ toast }),
  selectSubject: (selectedSubjectId) => set({ selectedSubjectId }),
  refresh: async () => {
    const [subjects, tasks, sessions, goals, notes, flashcards, achievements, settings] = await Promise.all([
      window.studyflow.query<Subject>('SELECT * FROM subjects ORDER BY created_at ASC'),
      window.studyflow.query<Task>('SELECT * FROM tasks ORDER BY completed ASC, sort_order ASC, created_at DESC'),
      window.studyflow.query<Session>('SELECT * FROM sessions ORDER BY started_at DESC'),
      window.studyflow.query<Goal>('SELECT * FROM goals ORDER BY created_at DESC'),
      window.studyflow.getNotes(),
      window.studyflow.query<Flashcard>('SELECT * FROM flashcards ORDER BY created_at DESC'),
      window.studyflow.query<Achievement>('SELECT * FROM achievements ORDER BY unlocked_at DESC'),
      window.studyflow.getSettings()
    ]);
    set({
      subjects,
      tasks,
      sessions,
      goals,
      notes,
      flashcards,
      achievements,
      settings,
      selectedSubjectId: get().selectedSubjectId ?? subjects[0]?.id ?? null,
      loading: false
    });
  },
  saveSettings: async (settings) => {
    const saved = await window.studyflow.saveSettings(settings);
    set({ settings: saved });
  }
}));
