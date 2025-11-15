export const STORAGE_KEYS = {
  HISTORY: 'emiliaEnglishProgressLog',
  SETTINGS: 'emiliaEnglishSettings',
  WORD_OPTION_FLOOR: 'emiliaEnglishWordOptionFloor',
};

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

export const AUDIO_SETTINGS = {
  CORRECT_SRC: 'assets/audio/answer-correct.mp3',
  INCORRECT_SRC: 'assets/audio/answer-wrong.mp3',
  VOLUME: 0.65,
};

export const LETTER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

export const MASTERy_RULES = {
  MIN_ATTEMPTS: 4,
  ACCURACY_THRESHOLD: 0.85,
  RECENCY_WINDOW: 6,
};

export const EXERCISE_FORMATS = [
  {
    id: 'text_to_translation',
    promptType: 'text',
    answerType: 'translation',
    instruction: 'Which Hebrew word matches this English word?',
    requires: { translation: true },
  },
  {
    id: 'text_to_image',
    promptType: 'text',
    answerType: 'image',
    instruction: 'Which picture matches this word?',
    requires: { image: true },
  },
  {
    id: 'text_to_audio',
    promptType: 'text',
    answerType: 'audio',
    instruction: 'Tap the sound that matches this word.',
    requires: { audio: true },
  },
  {
    id: 'translation_to_text',
    promptType: 'translation',
    answerType: 'text',
    instruction: 'Which English word matches this Hebrew word?',
    requires: { translation: true },
  },
  {
    id: 'image_to_text',
    promptType: 'image',
    answerType: 'text',
    instruction: 'Which English word matches this picture?',
    requires: { image: true },
  },
  {
    id: 'audio_to_text',
    promptType: 'audio',
    answerType: 'text',
    instruction: 'Which English word did you hear?',
    requires: { audio: true },
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
  text: 'English word',
  translation: 'Hebrew word',
  image: 'Picture',
  audio: 'Sound',
  letter: 'Letter',
};
