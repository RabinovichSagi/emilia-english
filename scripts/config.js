// Persistent storage keys for history/settings/option floors.
export const STORAGE_KEYS = {
  HISTORY: 'emiliaEnglishProgressLog',
  SETTINGS: 'emiliaEnglishSettings',
  WORD_OPTION_FLOOR: 'emiliaEnglishWordOptionFloor',
};

// Session-level constraints that govern flow and pacing.
export const SESSION_LIMITS = {
  DEFAULT_LENGTH: 10,
  MIN_LENGTH: 5,
  MAX_LENGTH: 20,
  CARD_FADE_DURATION: 280,
  BLANK_HOLD_DURATION: 500,
  MAX_NEW_WORDS_PER_SESSION: 3,
  MAX_REPEAT_PASSES: 2,
  MAX_OCCURRENCES_PER_WORD: 3,
};

// Audio resources for feedback sounds.
export const AUDIO_SETTINGS = {
  CORRECT_SRC: 'assets/audio/answer-correct.mp3',
  INCORRECT_SRC: 'assets/audio/answer-wrong.mp3',
  VOLUME: 0.65,
};

// Alphabet used for letter drills.
export const LETTER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

// Mastery thresholds, emphasizing recent performance.
export const MASTERy_RULES = {
  MIN_ATTEMPTS: 4,
  ACCURACY_THRESHOLD: 0.85,
  RECENCY_WINDOW: 6,
};

export const EXERCISE_FORMATS = [
  {
    id: 'translation_to_audio',
    promptType: 'translation',
    answerType: 'audio',
    instruction: 'Tap the sound that matches this Hebrew word.',
    requires: { translation: true, audio: true },
  },
  {
    id: 'audio_to_image',
    promptType: 'audio',
    answerType: 'image',
    instruction: 'Which picture matches the sound?',
    requires: { audio: true, image: true },
  },
  {
    id: 'letter_to_image',
    promptType: 'letter',
    answerType: 'image',
    instruction: 'Which picture starts with this letter?',
    requires: { image: true, initialLetter: true },
  },
  {
    id: 'letter_to_audio',
    promptType: 'letter',
    answerType: 'audio',
    instruction: 'Tap the word that starts with this letter.',
    requires: { audio: true, initialLetter: true },
  },
  {
    id: 'image_to_letter',
    promptType: 'image',
    answerType: 'letter',
    instruction: 'Which letter does this word start with?',
    requires: { image: true, initialLetter: true },
  },
  {
    id: 'audio_to_letter',
    promptType: 'audio',
    answerType: 'letter',
    instruction: 'Listen and choose the first letter of the word.',
    requires: { audio: true, initialLetter: true },
  },
];

export const FORMAT_LABELS = {
  translation: 'Hebrew word',
  image: 'Picture',
  audio: 'Sound',
  letter: 'Letter',
};

// Format ids that were removed (to filter persisted history).
export const DEPRECATED_FORMAT_IDS = new Set([
  'translation_to_text',
  'image_to_text',
  'audio_to_text',
  'text_to_translation',
  'text_to_image',
  'text_to_audio',
]);
