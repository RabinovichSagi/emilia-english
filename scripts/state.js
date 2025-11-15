import { SESSION_LIMITS } from './config.js';

export const state = {
  words: [],
  formats: [],
  history: [],
  performanceMap: new Map(),
  optionStateMap: new Map(),
  wordOptionFloor: new Map(),
  sessionLength: SESSION_LIMITS.DEFAULT_LENGTH,
  sessionPlanLength: SESSION_LIMITS.DEFAULT_LENGTH,
  queue: [],
  completedBaseExercises: 0,
  currentExercise: null,
  attemptStartTime: 0,
  sessionStats: null,
  transitionInProgress: false,
  currentAudio: null,
  sfx: {
    correct: null,
    incorrect: null,
  },
  pendingPromptAudio: null,
  balloonTimeoutId: null,
};

export const dom = {};
