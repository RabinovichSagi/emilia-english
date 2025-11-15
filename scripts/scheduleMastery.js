import { state } from './state.js';
import { clamp } from './utils.js';

const REVIEW_STORAGE_KEY = 'emiliaEnglishMasterySchedule';

const REVIEW_INTERVALS = [0, 1, 3, 7, 14]; // days

const reviewSchedule = new Map();

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

export function persistReviewSchedule() {
  const payload = {};
  reviewSchedule.forEach((value, key) => {
    payload[key] = value;
  });
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(payload));
}

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

export function shouldScheduleMastered(wordId, formatId) {
  const key = `${wordId}::${formatId}`;
  const entry = reviewSchedule.get(key);
  if (!entry) return true;
  return Date.now() >= entry.nextReview;
}
