import { SESSION_LIMITS } from './config.js';

/**
 * Application-wide mutable state. Keeping this in one object helps
 * share data between modules while keeping the initial values clear.
 */
export const state = {
  // Word list loaded from data/words.json.
  words: [],
  // Exercise formats available for the current content set.
  formats: [],
  // Chronological attempt history persisted in localStorage.
  history: [],
  // Map keyed by `${wordId}::${formatId}` tracking attempts/correctness.
  performanceMap: new Map(),
  // Adaptive option-level state (per tuple) to control distractor count.
  optionStateMap: new Map(),
  // Minimum option level per word (so once a word reaches 2+ choices it stays there).
  wordOptionFloor: new Map(),
  // Current desired session length (adjustable via slider).
  sessionLength: SESSION_LIMITS.DEFAULT_LENGTH,
  // Actual number of cards scheduled for the active session.
  sessionPlanLength: SESSION_LIMITS.DEFAULT_LENGTH,
  // Queue of exercises waiting to be presented.
  queue: [],
  // Number of base exercises completed (used for progress indicator).
  completedBaseExercises: 0,
  // Currently displayed exercise (null when between cards).
  currentExercise: null,
  // Timestamp when the current attempt started (for duration tracking).
  attemptStartTime: 0,
  // Aggregate stats for the active session (shown on summary screen).
  sessionStats: null,
  // Flag to prevent overlapping card transitions.
  transitionInProgress: false,
  // Currently playing audio instance (so we can stop it before new prompts).
  currentAudio: null,
  // Placeholder for future SFX caching (currently unused but documented).
  sfx: {
    correct: null,
    incorrect: null,
  },
  // Timeout id for delayed prompt audio playback.
  pendingPromptAudio: null,
  // Timeout id controlling how long the celebration balloons stay on screen.
  balloonTimeoutId: null,
};

/**
 * Central reference holder for DOM nodes we need to manipulate.
 */
export const dom = {};
