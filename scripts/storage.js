import { STORAGE_KEYS, DEPRECATED_FORMAT_IDS } from './config.js';
import { state } from './state.js';
import {
  buildPerformanceMap,
  updateOptionStateWithEntry,
} from './progress.js';

/**
 * Read the saved session length from localStorage.
 */
export function loadSessionLength() {
  const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return typeof parsed.sessionLength === 'number'
      ? parsed.sessionLength
      : null;
  } catch (error) {
    console.warn('Failed to parse stored settings', error);
    return null;
  }
}

/**
 * Persist the session length slider value.
 */
export function saveSessionLength(length) {
  localStorage.setItem(
    STORAGE_KEYS.SETTINGS,
    JSON.stringify({ sessionLength: length })
  );
}

/**
 * Load the per-word minimum option levels so adaptive difficulty survives reloads.
 */
export function loadWordOptionFloor() {
  const stored = localStorage.getItem(STORAGE_KEYS.WORD_OPTION_FLOOR);
  if (!stored) {
    state.wordOptionFloor = new Map();
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    const entries = Object.entries(parsed ?? {}).map(([wordId, level]) => [
      wordId,
      Number(level) || 1,
    ]);
    state.wordOptionFloor = new Map(entries);
  } catch (error) {
    console.warn('Failed to parse word option floor', error);
    state.wordOptionFloor = new Map();
  }
}

/**
 * Save the per-word option floors back to localStorage.
 */
export function persistWordOptionFloor() {
  const payload = Object.fromEntries(state.wordOptionFloor);
  localStorage.setItem(STORAGE_KEYS.WORD_OPTION_FLOOR, JSON.stringify(payload));
}

/**
 * Rehydrate the attempt history, performance map, and option states from storage.
 */
export function loadHistory() {
  const stored = localStorage.getItem(STORAGE_KEYS.HISTORY);
  if (!stored) {
    state.history = [];
    state.performanceMap = new Map();
    state.optionStateMap = new Map();
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    const entries = Array.isArray(parsed) ? parsed : [];
    state.history = entries.filter(
      (entry) => !DEPRECATED_FORMAT_IDS.has(entry?.formatId)
    );
  } catch (error) {
    console.warn('Failed to parse history log', error);
    state.history = [];
  }
  state.performanceMap = buildPerformanceMap(state.history);
  state.optionStateMap = new Map();
  state.history.forEach((entry) => updateOptionStateWithEntry(entry));
}

/**
 * Save the full attempt history array.
 */
export function persistHistory() {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.history));
}

/**
 * Fetch and parse the words JSON from the static data folder.
 */
export async function loadWords() {
  const response = await fetch('data/words.json');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = await response.json();
  if (!json || !Array.isArray(json.words)) {
    throw new Error('Invalid words.json format: expected { words: [...] }');
  }
  state.words = json.words;
}
