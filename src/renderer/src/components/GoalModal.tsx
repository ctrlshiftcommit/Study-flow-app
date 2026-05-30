import { useEffect, useRef, useState } from 'react';

export function GoalModal({ onConfirm, onSkip }: { onConfirm: (goal: string) => void; onSkip: () => void }) {
  const [goal, setGoal] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSkip]);

  return (
    <div className="goal-modal-backdrop">
      <div className="goal-modal-panel" role="dialog" aria-modal="true">
        <div className="label">SESSION GOAL</div>
        <h2>What will you accomplish?</h2>
        <p>A clear intention improves focus by ~40%.</p>
        <textarea
          ref={ref}
          className="textarea"
          rows={5}
          maxLength={280}
          value={goal}
          onChange={(event) => setGoal(event.target.value.slice(0, 280))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onConfirm(goal.trim());
            }
          }}
          placeholder="e.g. Complete problem set 3, read sections 2.1-2.4..."
        />
        <div className="char-line">{goal.length} / 280</div>
        <div className="modal-actions">
          <button className="button ghost" onClick={onSkip}>Skip for now</button>
          <button className="button primary" onClick={() => onConfirm(goal.trim())}>Start session -&gt;</button>
        </div>
      </div>
    </div>
  );
}
