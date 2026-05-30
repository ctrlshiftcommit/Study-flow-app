import type { Flashcard, FlashcardRating } from '@shared/types';

const quality: Record<FlashcardRating, number> = {
  again: 2,
  hard: 3,
  good: 4,
  easy: 5
};

export function calculateNextReview(card: Flashcard, rating: FlashcardRating) {
  const q = quality[rating];
  let ease = card.ease_factor || 2.5;
  let repetitions = card.repetitions || 0;
  let interval = card.interval_days || 1;

  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (rating === 'hard') interval = Math.max(1, interval * 1.2);
    else if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = rating === 'easy' ? 6 : 3;
    else interval = interval * ease * (rating === 'easy' ? 1.3 : 1);
  }

  const next_review = Date.now() + Math.round(interval * 86_400_000);
  return {
    interval_days: Number(interval.toFixed(2)),
    ease_factor: Number(ease.toFixed(2)),
    repetitions,
    next_review,
    review_count: (card.review_count || 0) + 1
  };
}
