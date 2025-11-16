import { clamp } from './utils.js';

const REVIEW_STORAGE_KEY = 'emiliaEnglishMasterySchedule';

// Days between reviews; grows exponentially for mastered tuples.
const REVIEW_INTERVALS = [0, 1, 3, 7, 14];

const reviewSchedule = new Map();

/**
 * Load the spaced-repetition review schedule from storage.
 */
export function loadReviewSchedule() {
  const stored = localStorage.getItem(REVIEW_STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    Object.entries(parsed).forEach(([tupleKey, data]) => {
      reviewSchedule.set(tupleKey, {
        intervalIndex: data.intervalIndex || 0,
        nextReview: data.nextReview || Date.now(),
      });
    });
  } catch (error) {
    console.warn('Failed to parse mastery review schedule', error);
  }
}

/**
 * Persist the current review schedule.
 */
export function persistReviewSchedule() {
  const payload = {};
  reviewSchedule.forEach((value, key) => {
    payload[key] = value;
  });
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Update the review interval for a tuple each time it’s answered.
 */
export function scheduleMasteryReview(wordId, formatId, mastered) {
  const key = `${wordId}::${formatId}`;
  const entry = reviewSchedule.get(key) ?? {
    intervalIndex: 0,
    nextReview: Date.now(),
  };

  if (mastered) {
    entry.intervalIndex = clamp(entry.intervalIndex + 1, 0, REVIEW_INTERVALS.length - 1);
  } else {
    entry.intervalIndex = clamp(entry.intervalIndex - 1, 0, REVIEW_INTERVALS.length - 1);
  }

  const days = REVIEW_INTERVALS[entry.intervalIndex];
  entry.nextReview = Date.now() + days * 24 * 60 * 60 * 1000;
  reviewSchedule.set(key, entry);
  persistReviewSchedule();
}

/**
 * Determine whether a mastered tuple is due for resurfacing.
 */
export function shouldScheduleMastered(wordId, formatId) {
  const key = `${wordId}::${formatId}`;
  const entry = reviewSchedule.get(key);
  if (!entry) return true;
  return Date.now() >= entry.nextReview;
}
