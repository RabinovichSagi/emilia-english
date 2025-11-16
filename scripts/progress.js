import { MASTERy_RULES, STORAGE_KEYS } from './config.js';
import { clamp } from './utils.js';
import { state } from './state.js';
import { scheduleMasteryReview } from './scheduleMastery.js';

/**
 * Factory for the session stats object used by the summary screen.
 */
export function createEmptySessionStats() {
  return {
    total: 0,
    correct: 0,
    incorrect: 0,
    formatBreakdown: new Map(),
  };
}

/**
 * Update per-session summary statistics with a single attempt.
 */
export function updateSessionStats(entry) {
  if (!state.sessionStats) return;
  state.sessionStats.total += 1;
  if (entry.result === 'correct') {
    state.sessionStats.correct += 1;
  } else {
    state.sessionStats.incorrect += 1;
  }
  const key = buildPerformanceKey(entry.wordId, entry.formatId);
  const breakdownEntry =
    state.sessionStats.formatBreakdown.get(key) ?? {
      wordId: entry.wordId,
      formatId: entry.formatId,
      questionFormat: entry.questionFormat,
      answerFormat: entry.answerFormat,
      attempts: 0,
      correct: 0,
    };
  breakdownEntry.attempts += 1;
  if (entry.result === 'correct') {
    breakdownEntry.correct += 1;
  }
  state.sessionStats.formatBreakdown.set(key, breakdownEntry);
}

/**
 * Aggregate attempt history into per-tuple performance stats.
 */
export function buildPerformanceMap(historyEntries) {
  const map = new Map();
  historyEntries.forEach((entry) => {
    if (!entry.wordId || !entry.formatId) return;
    const key = buildPerformanceKey(entry.wordId, entry.formatId);
    const existing =
      map.get(key) ?? {
        attempts: 0,
        correct: 0,
        incorrect: 0,
        streak: 0,
        recent: [],
      };
    existing.attempts += 1;
    if (entry.result === 'correct') {
      existing.correct += 1;
      existing.streak = Math.max(existing.streak + 1, 1);
    } else {
      existing.incorrect += 1;
      existing.streak = Math.min(existing.streak - 1, -1);
    }
    existing.lastAttempt = entry.timestamp;
    existing.recent = updateRecentResults(existing.recent, entry.result);
    map.set(key, existing);
  });
  return map;
}

/**
 * Incrementally update the performance map after recording an attempt.
 */
export function updatePerformanceMapWithEntry(entry) {
  const key = buildPerformanceKey(entry.wordId, entry.formatId);
  const existing =
    state.performanceMap.get(key) ?? {
      attempts: 0,
      correct: 0,
      incorrect: 0,
      streak: 0,
      recent: [],
    };
  existing.attempts += 1;
  if (entry.result === 'correct') {
    existing.correct += 1;
    existing.streak = Math.max(existing.streak + 1, 1);
  } else {
    existing.incorrect += 1;
    existing.streak = Math.min(existing.streak - 1, -1);
  }
  existing.lastAttempt = entry.timestamp;
  existing.recent = updateRecentResults(existing.recent, entry.result);
  state.performanceMap.set(key, existing);
  scheduleMasteryReview(entry.wordId, entry.formatId, isTupleMastered(existing));
}

/**
 * Update the adaptive option-level state for a tuple after an attempt.
 */
export function updateOptionStateWithEntry(entry) {
  if (!entry.wordId || !entry.formatId) return;
  const key = buildPerformanceKey(entry.wordId, entry.formatId);
  let optionState = state.optionStateMap.get(key);
  if (!optionState) {
    optionState = createDefaultOptionState();
    state.optionStateMap.set(key, optionState);
  }
  applyOptionStateTransition(optionState, entry.result === 'correct');
}

/**
 * Summarize per-word mastery progress (pending/new/mastered counts).
 */
export function buildWordProgressMap() {
  const map = new Map();
  state.words.forEach((word) => {
    map.set(word.id, {
      totalFormats: 0,
      attemptedFormats: 0,
      pendingFormats: 0,
      masteredFormats: 0,
      freshFormats: 0,
    });
  });

  state.words.forEach((word) => {
    const entry = map.get(word.id);
    state.formats.forEach((format) => {
      if (!wordSupportsFormat(word, format)) {
        return;
      }
      entry.totalFormats += 1;
      const key = buildPerformanceKey(word.id, format.id);
      const stats = state.performanceMap.get(key);
      if (!stats || !stats.attempts) {
        entry.freshFormats += 1;
        return;
      }
      entry.attemptedFormats += 1;
      if (isTupleMastered(stats)) {
        entry.masteredFormats += 1;
      } else {
        entry.pendingFormats += 1;
      }
    });
  });

  return map;
}

/**
 * Convenience for generating a consistent tuple key.
 */
export function buildPerformanceKey(wordId, formatId) {
  return `${wordId}::${formatId}`;
}

/**
 * Determine how many options to show for a tuple, respecting floor + adaptive level.
 */
export function getOptionCountForTuple(wordId, formatId) {
  const key = buildPerformanceKey(wordId, formatId);
  const entry = state.optionStateMap.get(key);
  const baseLevel = entry ? entry.level : 1;
  const floor = state.wordOptionFloor.get(wordId) ?? 1;
  return clamp(Math.max(baseLevel, floor), 1, 4);
}

/**
 * Base option-state object for unseen tuples.
 */
export function createDefaultOptionState() {
  return {
    level: 1,
    successRun: 0,
    failureRun: 0,
  };
}

/**
 * Adjust the option-state level based on consecutive successes/failures.
 */
export function applyOptionStateTransition(optionState, wasCorrect) {
  if (wasCorrect) {
    optionState.failureRun = 0;
    optionState.successRun += 1;
    if (optionState.level === 1 && optionState.successRun >= 1) {
      optionState.level = 2;
      optionState.successRun = 0;
    } else if (optionState.level === 2 && optionState.successRun >= 2) {
      optionState.level = 3;
      optionState.successRun = 0;
    } else if (optionState.level === 3 && optionState.successRun >= 2) {
      optionState.level = 4;
      optionState.successRun = 0;
    } else if (optionState.level === 4) {
      optionState.successRun = Math.min(optionState.successRun, 2);
    }
  } else {
    optionState.successRun = 0;
    optionState.failureRun += 1;
    if (optionState.level >= 3 && optionState.failureRun >= 2) {
      optionState.level = 2;
      optionState.failureRun = 0;
    } else {
      optionState.failureRun = Math.min(optionState.failureRun, 2);
    }
  }
  optionState.level = clamp(optionState.level, 1, 4);
}

/**
 * Determine whether a tuple is considered mastered using recency-weighted accuracy.
 */
export function isTupleMastered(stats) {
  if (!stats) return false;
  const recent = stats.recent ?? [];
  const windowSize = Math.min(MASTERy_RULES.RECENCY_WINDOW, recent.length);
  const recentAccuracy =
    windowSize === 0
      ? 0
      : recent.slice(-windowSize).filter((result) => result === 'correct')
          .length / windowSize;
  return (
    recentAccuracy >= MASTERy_RULES.ACCURACY_THRESHOLD &&
    stats.attempts >= MASTERy_RULES.MIN_ATTEMPTS
  );
}

/**
 * Check if a word has the required assets for a given format.
 */
export function wordSupportsFormat(word, format) {
  if (format.requires.translation && !word.hebrew) return false;
  if (format.requires.image && !word.image) return false;
  if (format.requires.audio && !word.audio) return false;
  if (
    format.requires.initialLetter &&
    !(typeof word.initialLetter === 'string' && word.initialLetter.length > 0)
  )
    return false;
  return true;
}

function updateRecentResults(recent = [], result) {
  const copy = Array.isArray(recent) ? [...recent] : [];
  copy.push(result);
  if (copy.length > MASTERy_RULES.RECENCY_WINDOW) {
    copy.shift();
  }
  return copy;
}

function persistHistorySnapshot() {
  localStorage.setItem(
    STORAGE_KEYS.HISTORY,
    JSON.stringify(state.history ?? [])
  );
}

function persistWordOptionFloorSnapshot() {
  const payload = Object.fromEntries(state.wordOptionFloor ?? new Map());
  localStorage.setItem(STORAGE_KEYS.WORD_OPTION_FLOOR, JSON.stringify(payload));
}

/**
 * Force all tuples for a word into the mastered state and raise its option floor.
 */
export function markWordAsMastered(wordId) {
  state.formats.forEach((format) => {
    const key = buildPerformanceKey(wordId, format.id);
    const stats = state.performanceMap.get(key) ?? {
      attempts: 0,
      correct: 0,
      incorrect: 0,
      streak: 0,
    };
    stats.attempts = Math.max(stats.attempts, MASTERy_RULES.MIN_ATTEMPTS);
    stats.correct = Math.max(
      stats.correct,
      Math.ceil(stats.attempts * MASTERy_RULES.ACCURACY_THRESHOLD)
    );
    stats.incorrect = Math.max(0, stats.attempts - stats.correct);
    state.performanceMap.set(key, stats);
    state.optionStateMap.set(
      key,
      Object.assign(createDefaultOptionState(), { level: 4 })
    );
  });
  state.wordOptionFloor.set(wordId, 4);
  persistWordOptionFloorSnapshot();
}

/**
 * Wipe history/state for a word so it re-enters the queue as brand new.
 */
export function resetWordProgress(wordId) {
  state.history = state.history.filter((entry) => entry.wordId !== wordId);
  persistHistorySnapshot();

  state.formats.forEach((format) => {
    const key = buildPerformanceKey(wordId, format.id);
    state.performanceMap.delete(key);
    state.optionStateMap.delete(key);
  });
  state.wordOptionFloor.set(wordId, 1);
  persistWordOptionFloorSnapshot();
}
