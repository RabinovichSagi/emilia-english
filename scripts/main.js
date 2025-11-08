/**
 * Emilia English Practice
 * Vanilla JS implementation designed to run directly on GitHub Pages without build tooling.
 * Non-obvious logic (e.g., spaced repetition and transitions) is annotated to assist future updates.
 */

const STORAGE_KEY = 'emiliaEnglishProgressLog';
const SETTINGS_KEY = 'emiliaEnglishSettings';
const DEFAULT_SESSION_LENGTH = 10;
const MIN_SESSION_LENGTH = 5;
const MAX_SESSION_LENGTH = 20;
const CARD_FADE_DURATION = 280;
const BLANK_HOLD_DURATION = 500;
const LETTER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const CORRECT_SFX_SRC = 'assets/audio/answer-correct.mp3';
const INCORRECT_SFX_SRC = 'assets/audio/answer-wrong.mp3';

const EXERCISE_FORMATS = [
  {
    id: 'audio_to_image',
    promptType: 'audio',
    answerType: 'image',
    instruction: '🎧 ➜ 🖼️',
    requires: { audio: true, image: true },
  },
  {
    id: 'image_to_audio',
    promptType: 'image',
    answerType: 'audio',
    instruction: '🖼️ ➜ 🎧',
    requires: { audio: true, image: true },
  },
  {
    id: 'letter_to_image',
    promptType: 'letter',
    answerType: 'image',
    instruction: '🔤 ➜ 🖼️',
    requires: { image: true, initialLetter: true },
  },
  {
    id: 'letter_to_audio',
    promptType: 'letter',
    answerType: 'audio',
    instruction: '🔤 ➜ 🎧',
    requires: { audio: true, initialLetter: true },
  },
  {
    id: 'image_to_letter',
    promptType: 'image',
    answerType: 'letter',
    instruction: '🖼️ ➜ 🔤',
    requires: { image: true, initialLetter: true },
  },
  {
    id: 'audio_to_letter',
    promptType: 'audio',
    answerType: 'letter',
    instruction: '🎧 ➜ 🔤',
    requires: { audio: true, initialLetter: true },
  },
];

const FORMAT_LABELS = {
  text: 'English word',
  translation: 'Hebrew word',
  image: 'Picture',
  audio: 'Sound',
  letter: 'Letter',
};

const dom = {};
const state = {
  words: [],
  formats: [],
  history: [],
  performanceMap: new Map(),
  sessionLength: DEFAULT_SESSION_LENGTH,
  queue: [],
  sessionPlanLength: DEFAULT_SESSION_LENGTH,
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
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheDomReferences();
  attachEventListeners();
  loadStoredSettings();
  loadHistory();

  try {
    await loadWords();
  } catch (error) {
    console.error('Failed to load words.json', error);
    alert('Unable to load word data. Please ensure data/words.json is available.');
    return;
  }

  state.formats = computeAvailableFormats(state.words);

  if (state.formats.length < 3) {
    console.warn('Not enough exercise formats available. Check asset coverage.');
  }

  dom.sessionLengthDisplay.textContent = state.sessionLength.toString();
}

function cacheDomReferences() {
  dom.startScreen = document.getElementById('start-screen');
  dom.sessionScreen = document.getElementById('session-screen');
  dom.summaryScreen = document.getElementById('summary-screen');
  dom.exerciseCard = document.getElementById('exercise-card');
  dom.instruction = document.getElementById('instruction');
  dom.promptArea = document.getElementById('prompt-area');
  dom.optionsArea = document.getElementById('options-area');
  dom.feedbackArea = document.getElementById('feedback-area');
  dom.progressIndicator = document.getElementById('progress-indicator');
  dom.transitionOverlay = document.getElementById('transition-overlay');
  dom.optionTemplate = document.getElementById('option-template');
  dom.startButton = document.getElementById('start-button');
  dom.sessionLengthInput = document.getElementById('session-length-input');
  dom.sessionLengthDisplay = document.getElementById('session-length-display');
  dom.restartButton = document.getElementById('restart-button');
  dom.backHomeButton = document.getElementById('back-home-button');
  dom.summaryOverview = document.getElementById('summary-overview');
  dom.summaryDetails = document.getElementById('summary-details');
  dom.exportButton = document.getElementById('export-progress');
  dom.endSessionButton = document.getElementById('end-session-button');
}

function attachEventListeners() {
  dom.startButton.addEventListener('click', handleStartSession);
  dom.restartButton.addEventListener('click', handleRestart);
  dom.backHomeButton.addEventListener('click', returnHome);
  dom.exportButton.addEventListener('click', exportProgressLog);
  dom.endSessionButton.addEventListener('click', endSessionEarly);

  dom.sessionLengthInput.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    state.sessionLength = value;
    dom.sessionLengthDisplay.textContent = value.toString();
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ sessionLength: state.sessionLength })
    );
  });
}

function loadStoredSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  if (!stored) {
    dom.sessionLengthInput.value = DEFAULT_SESSION_LENGTH.toString();
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    const length = clampValue(
      parsed.sessionLength ?? DEFAULT_SESSION_LENGTH,
      MIN_SESSION_LENGTH,
      MAX_SESSION_LENGTH
    );
    state.sessionLength = length;
    dom.sessionLengthInput.value = length.toString();
  } catch (error) {
    console.warn('Failed to parse stored settings', error);
    dom.sessionLengthInput.value = DEFAULT_SESSION_LENGTH.toString();
  }
}

function loadHistory() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    state.history = [];
    state.performanceMap = new Map();
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    state.history = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to parse history log', error);
    state.history = [];
  }
  state.performanceMap = buildPerformanceMap(state.history);
}

async function loadWords() {
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

function computeAvailableFormats(words) {
  const wordCapabilities = new Map();
  words.forEach((word) => {
    wordCapabilities.set(word.id, {
      translation: Boolean(word.hebrew),
      image: Boolean(word.image),
      audio: Boolean(word.audio),
      initialLetter: Boolean(
        typeof word.initialLetter === 'string' && word.initialLetter.length > 0
      ),
    });
  });

  return EXERCISE_FORMATS.filter((format) =>
    words.some((word) => {
      const caps = wordCapabilities.get(word.id);
      return Object.entries(format.requires).every(
        ([key, needed]) => !needed || caps?.[key]
      );
    })
  );
}

function handleStartSession() {
  if (state.words.length === 0) {
    alert('Word list is empty. Please add entries to data/words.json.');
    return;
  }
  state.sessionStats = createEmptySessionStats();
  state.queue = buildSessionQueue();
  state.sessionPlanLength = state.queue.length;
  state.completedBaseExercises = 0;
  updateProgressIndicator();
  switchScreen(dom.startScreen, dom.sessionScreen);
  renderNextExercise(true);
}

function endSessionEarly() {
  if (!state.currentExercise) {
    return;
  }
  state.queue = [];
  showSessionSummary();
}

function handleRestart() {
  state.sessionStats = createEmptySessionStats();
  state.queue = buildSessionQueue();
  state.sessionPlanLength = state.queue.length;
  state.completedBaseExercises = 0;
  updateProgressIndicator();
  switchScreen(dom.summaryScreen, dom.sessionScreen);
  renderNextExercise(true);
}

function returnHome() {
  switchScreen(dom.summaryScreen, dom.startScreen);
}

function switchScreen(from, to) {
  from.classList.add('hidden');
  to.classList.remove('hidden');
}

function buildSessionQueue() {
  const performanceEntries = state.performanceMap;
  const allExercises = [];

  state.words.forEach((word) => {
    state.formats.forEach((format) => {
      if (!wordSupportsFormat(word, format)) {
        return;
      }
      const key = buildPerformanceKey(word.id, format.id);
      const stats = performanceEntries.get(key) ?? {
        attempts: 0,
        correct: 0,
        incorrect: 0,
        streak: 0,
      };
      const successRate =
        stats.attempts === 0 ? 0 : stats.correct / stats.attempts;
      const priorityScore = stats.attempts === 0 ? -1 : successRate;
      allExercises.push({
        word,
        format,
        stats,
        priorityScore,
      });
    });
  });

  if (allExercises.length === 0) {
    throw new Error('No valid exercise combinations available.');
  }

  // Sort by priority (lower success rate first) and randomize within buckets
  allExercises.sort((a, b) => {
    if (a.priorityScore === b.priorityScore) {
      return Math.random() - 0.5;
    }
    return a.priorityScore - b.priorityScore;
  });

  const sessionLength = clampValue(
    state.sessionLength,
    MIN_SESSION_LENGTH,
    Math.min(MAX_SESSION_LENGTH, allExercises.length)
  );

  const selected = [];
  const usedFormats = new Map();

  for (const candidate of allExercises) {
    if (selected.length >= sessionLength) {
      break;
    }
    selected.push(createExercise(candidate.word, candidate.format));
    usedFormats.set(candidate.format.id, true);
  }

  // Ensure variety: force at least three unique formats when possible.
  if (usedFormats.size < 3 && allExercises.length >= 3) {
    const missingFormats = state.formats
      .map((format) => format.id)
      .filter((id) => !usedFormats.has(id));
    for (const formatId of missingFormats) {
      const replacementCandidate = allExercises.find(
        (entry) => entry.format.id === formatId
      );
      if (!replacementCandidate) continue;
      const replaceIndex = selected.findIndex(
        (exercise) => exercise.format.id === selected[0].format.id
      );
      if (replaceIndex >= 0) {
        selected[replaceIndex] = createExercise(
          replacementCandidate.word,
          replacementCandidate.format
        );
        usedFormats.set(formatId, true);
        if (usedFormats.size >= 3) break;
      }
    }
  }

  return selected;
}

function createExercise(word, format) {
  const options = buildOptions(word, format);
  return {
    word,
    format,
    options,
    attempts: 0,
    hintUsed: false,
    id: `${word.id}-${format.id}-${crypto.randomUUID?.() ?? Math.random()}`,
    retryCount: 0,
    isRetry: false,
  };
}

function buildOptions(word, format) {
  if (format.answerType === 'letter') {
    return buildLetterOptions(word, format);
  }
  const distractorIds = pickDistractorIds(word, format);
  const wordMap = new Map(state.words.map((w) => [w.id, w]));
  const optionIds = [word.id, ...distractorIds];
  const options = optionIds.map((id) => {
    const optionWord = wordMap.get(id);
    if (!optionWord) {
      throw new Error(`Missing word data for option id ${id}`);
    }
    return transformWordToOption(optionWord, format, optionWord.id === word.id);
  });
  return shuffleArray(options);
}

function buildLetterOptions(word) {
  const targetLetter = normalizeLetter(word.initialLetter);
  if (!targetLetter) {
    throw new Error(`Word ${word.id} missing initialLetter for letter drill`);
  }

  const availableLetters = getAvailableLetters().filter(
    (letter) => letter !== targetLetter
  );
  const distractors = [];
  for (const letter of shuffleArray(availableLetters)) {
    if (distractors.length >= 3) break;
    distractors.push(letter);
  }
  if (distractors.length < 3) {
    const fallbackPool = shuffleArray(
      LETTER_ALPHABET.filter(
        (letter) =>
          letter !== targetLetter && !distractors.includes(letter.toLowerCase())
      )
    );
    for (const letter of fallbackPool) {
      if (distractors.length >= 3) break;
      distractors.push(letter);
    }
  }

  while (distractors.length < 3) {
    const filler =
      LETTER_ALPHABET.find(
        (letter) =>
          letter !== targetLetter && !distractors.includes(letter.toLowerCase())
      ) || targetLetter;
    distractors.push(filler);
  }

  const letters = shuffleArray([targetLetter, ...distractors.slice(0, 3)]);
  return letters.map((letter) => ({
    optionId: `letter-${letter}`,
    label: letter.toUpperCase(),
    letterValue: letter,
    isCorrect: letter === targetLetter,
  }));
}

function transformWordToOption(word, format, isCorrect) {
  let label = word.english;
  let imageSrc = null;
  let audioSrc = null;

  if (format.answerType === 'translation') {
    label = word.hebrew;
  } else if (format.answerType === 'image') {
    imageSrc = word.image;
    label = word.english;
  } else if (format.answerType === 'audio') {
    audioSrc = word.audio;
    label = word.english;
  }

  return {
    optionId: word.id,
    label,
    isCorrect,
    imageSrc,
    audioSrc,
  };
}

function pickDistractorIds(word, format) {
  const desiredCount = 3;
  const availableIds = new Set();
  const fallbackIds = new Set(
    state.words.map((candidate) => candidate.id).filter((id) => id !== word.id)
  );

  (word.distractorWordIds ?? []).forEach((id) => {
    if (id !== word.id) {
      availableIds.add(id);
    }
  });

  const result = [];
  const tryAdd = (id) => {
    if (result.includes(id) || id === word.id) return;
    const candidateWord = state.words.find((w) => w.id === id);
    if (!candidateWord) return;
    if (!wordSupportsAnswer(candidateWord, format)) return;
    if (format.promptType === 'letter') {
      const targetLetter = normalizeLetter(word.initialLetter);
      const candidateLetter = normalizeLetter(candidateWord.initialLetter);
      if (!candidateLetter || candidateLetter === targetLetter) return;
    }
    result.push(id);
  };

  availableIds.forEach(tryAdd);

  if (result.length < desiredCount) {
    const fallbackArray = Array.from(fallbackIds);
    shuffleArray(fallbackArray);
    for (const candidateId of fallbackArray) {
      if (result.length >= desiredCount) break;
      tryAdd(candidateId);
    }
  }

  if (result.length < desiredCount) {
    throw new Error(
      `Unable to find enough distractors for word ${word.id} format ${format.id}`
    );
  }
  return result;
}

function wordSupportsFormat(word, format) {
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

function wordSupportsAnswer(word, format) {
  if (format.answerType === 'translation') return Boolean(word.hebrew);
  if (format.answerType === 'image') return Boolean(word.image);
  if (format.answerType === 'audio') return Boolean(word.audio);
  if (format.answerType === 'letter')
    return Boolean(word.initialLetter && word.initialLetter.length > 0);
  return true;
}

function renderNextExercise(skipTransition = false) {
  if (state.queue.length === 0) {
    showSessionSummary();
    return;
  }

  const render = () => {
    clearPendingPromptAudio();
    state.currentExercise = state.queue.shift();
    state.currentExercise.attempts = 0;
    state.currentExercise.hintUsed = false;
    state.attemptStartTime = performance.now();
    dom.feedbackArea.textContent = '';
    dom.feedbackArea.className = 'feedback-area';
    renderInstruction(state.currentExercise.format);
    renderPrompt(state.currentExercise.word, state.currentExercise.format);
    renderOptions(state.currentExercise);
    updateProgressIndicator();
  };

  if (skipTransition) {
    dom.exerciseCard.classList.remove('hidden');
    dom.exerciseCard.classList.add('card-active');
    render();
  } else {
    runTransition(render);
  }
}

function renderInstruction(format) {
  dom.instruction.textContent = format.instruction;
}

function renderPrompt(word, format) {
  dom.promptArea.innerHTML = '';
  dom.promptArea.style.fontSize = '';
  stopCurrentAudio();
  clearPendingPromptAudio();

  if (format.promptType === 'letter') {
    const chip = document.createElement('span');
    chip.className = 'letter-chip';
    chip.textContent = (word.initialLetter || '?').toUpperCase();
    dom.promptArea.appendChild(chip);
    return;
  }

  if (format.promptType === 'text') {
    dom.promptArea.textContent = word.english;
    return;
  }

  if (format.promptType === 'translation') {
    dom.promptArea.textContent = word.hebrew;
    dom.promptArea.style.fontSize = 'clamp(2rem, 5vw, 3rem)';
    return;
  }

  if (format.promptType === 'image') {
    const img = document.createElement('img');
    img.src = word.image;
    img.alt = word.english;
    dom.promptArea.appendChild(img);
    return;
  }

  if (format.promptType === 'audio') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'prompt-audio-button';
    button.innerHTML = '▶️';
    button.addEventListener('click', () => playAudio(word.audio));
    dom.promptArea.appendChild(button);
    state.pendingPromptAudio = window.setTimeout(() => {
      playAudio(word.audio);
      state.pendingPromptAudio = null;
    }, 50);
    return;
  }

  dom.promptArea.textContent = word.english;
}

function renderOptions(exercise) {
  dom.optionsArea.innerHTML = '';

  exercise.options.forEach((option) => {
    const optionNode = dom.optionTemplate.content
      .cloneNode(true)
      .querySelector('.option-button');

    optionNode.dataset.optionId = option.optionId;
    optionNode.dataset.correct = option.isCorrect ? 'true' : 'false';
    optionNode.textContent = '';
    optionNode.setAttribute('aria-label', option.label);

    if (option.letterValue) {
      optionNode.classList.add('letter-option');
      optionNode.textContent = option.label;
    } else if (option.imageSrc) {
      optionNode.classList.add('image-option');
      const img = document.createElement('img');
      img.src = option.imageSrc;
      img.alt = option.label;
      optionNode.appendChild(img);
      const pointer = document.createElement('span');
      pointer.className = 'option-pointer';
      pointer.setAttribute('aria-hidden', 'true');
      pointer.innerHTML = '👇';
      optionNode.appendChild(pointer);
    } else if (option.audioSrc) {
      optionNode.classList.add('audio-option');
      const preview = document.createElement('span');
      preview.className = 'audio-preview-control';
      preview.setAttribute('aria-label', 'Play sound');
      preview.innerHTML = '🔊';
      optionNode.appendChild(preview);
      const pointer = document.createElement('span');
      pointer.className = 'option-pointer';
      pointer.setAttribute('aria-hidden', 'true');
      pointer.innerHTML = '👇';
      optionNode.appendChild(pointer);
    } else {
      optionNode.textContent = option.label;
    }

    optionNode.addEventListener('click', (event) =>
      handleAnswerSelection(exercise, option, event)
    );
    dom.optionsArea.appendChild(optionNode);
  });
}

function handleAnswerSelection(exercise, option, event) {
  if (!state.currentExercise || state.transitionInProgress) {
    return;
  }

  if (
    option.audioSrc &&
    event?.target.closest &&
    event.target.closest('.audio-preview-control')
  ) {
    playAudio(option.audioSrc);
    event.preventDefault();
    return;
  }

  exercise.attempts += 1;

  const durationMs = Math.round(performance.now() - state.attemptStartTime);
  const isCorrect = option.isCorrect;
  const willTriggerHint =
    !isCorrect && exercise.attempts >= 2 && exercise.hintUsed === false;
  const wasHintUsed = exercise.hintUsed || willTriggerHint;

  recordAttempt({
    wordId: exercise.word.id,
    format: exercise.format,
    selectedOptionId: option.optionId,
    isCorrect,
    durationMs,
    wasHintUsed,
  });

  highlightOption(option.optionId, isCorrect);
  disableOptions();
  playFeedbackSound(isCorrect);

  if (isCorrect) {
    dom.feedbackArea.textContent = 'Great job!';
    dom.feedbackArea.classList.add('feedback-correct');
    scheduleNextExercise(exercise);
  } else {
    dom.feedbackArea.textContent = 'Almost! Try again.';
    dom.feedbackArea.classList.add('feedback-incorrect');
    handleIncorrectAttempt(exercise, option);
  }
}

function handleIncorrectAttempt(exercise, option) {
  if (exercise.attempts >= 2 && !exercise.hintUsed) {
    exercise.hintUsed = true;
    triggerHint(exercise);
    revealCorrectOption(exercise);
    queueExerciseRetry(exercise);
    scheduleNextExercise(exercise, 2000);
  } else {
    // Allow another attempt immediately.
    enableOptionsExcept(option.optionId);
    state.attemptStartTime = performance.now();
  }
}

function triggerHint(exercise) {
  const format = exercise.format;
  if (format.promptType === 'audio') {
    playAudio(exercise.word.audio);
  } else if (format.answerType === 'image' || format.answerType === 'text') {
    const correctButton = [...dom.optionsArea.children].find(
      (button) => button.dataset.correct === 'true'
    );
    if (correctButton) {
      correctButton.classList.add('soft-pulse');
      setTimeout(() => correctButton.classList.remove('soft-pulse'), 1200);
    }
  }
}

function revealCorrectOption(exercise) {
  dom.feedbackArea.textContent = 'Here is the correct answer!';
  const correctButton = [...dom.optionsArea.children].find(
    (button) => button.dataset.correct === 'true'
  );
  const incorrectButtons = [...dom.optionsArea.children].filter(
    (button) => button.dataset.correct !== 'true'
  );
  if (correctButton) {
    correctButton.classList.add('option-correct');
  }
  incorrectButtons.forEach((btn) => btn.classList.add('option-incorrect'));
}

function queueExerciseRetry(exercise) {
  const retryExercise = {
    ...exercise,
    attempts: 0,
    hintUsed: false,
    retryCount: exercise.retryCount + 1,
    isRetry: true,
  };
  const insertIndex = Math.min(2, state.queue.length);
  state.queue.splice(insertIndex, 0, retryExercise);
}

function scheduleNextExercise(exercise, delay = 900) {
  if (exercise && !exercise.isRetry) {
    state.completedBaseExercises = Math.min(
      state.completedBaseExercises + 1,
      state.sessionPlanLength
    );
  }
  updateProgressIndicator();
  setTimeout(() => renderNextExercise(), delay);
}

function highlightOption(optionId, isCorrect) {
  [...dom.optionsArea.children].forEach((button) => {
    if (button.dataset.optionId === optionId) {
      button.classList.add(isCorrect ? 'option-correct' : 'option-incorrect');
    }
  });
}

function disableOptions() {
  [...dom.optionsArea.children].forEach((button) => {
    button.disabled = true;
  });
}

function enableOptionsExcept(optionId) {
  [...dom.optionsArea.children].forEach((button) => {
    if (button.dataset.optionId === optionId) {
      button.disabled = true;
    } else {
      button.disabled = false;
      button.classList.remove('option-incorrect');
    }
  });
}

function recordAttempt({
  wordId,
  format,
  selectedOptionId,
  isCorrect,
  durationMs,
  wasHintUsed,
}) {
  const entry = {
    timestamp: new Date().toISOString(),
    wordId,
    questionFormat: format.promptType,
    answerFormat: format.answerType,
    formatId: format.id,
    selectedOptionId,
    result: isCorrect ? 'correct' : 'incorrect',
    attemptDurationMs: durationMs,
    wasHintUsed,
  };

  state.history.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  updatePerformanceMapWithEntry(entry);
  updateSessionStats(entry);
}

function updatePerformanceMapWithEntry(entry) {
  const key = buildPerformanceKey(entry.wordId, entry.formatId);
  const existing =
    state.performanceMap.get(key) ?? {
      attempts: 0,
      correct: 0,
      incorrect: 0,
      streak: 0,
    };
  const updated = { ...existing };
  updated.attempts += 1;
  if (entry.result === 'correct') {
    updated.correct += 1;
    updated.streak = Math.max(updated.streak + 1, 1);
  } else {
    updated.incorrect += 1;
    updated.streak = Math.min(updated.streak - 1, -1);
  }
  updated.lastAttempt = entry.timestamp;
  state.performanceMap.set(key, updated);
}

function createEmptySessionStats() {
  return {
    total: 0,
    correct: 0,
    incorrect: 0,
    formatBreakdown: new Map(),
  };
}

function updateSessionStats(entry) {
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

function updateProgressIndicator() {
  const total = state.sessionPlanLength || state.sessionLength;
  const completed = Math.min(state.completedBaseExercises, total);
  dom.progressIndicator.textContent = `${completed} / ${total}`;
}

function runTransition(renderCallback) {
  if (state.transitionInProgress) return;
  state.transitionInProgress = true;

  dom.exerciseCard.classList.add('fade-out');
  setTimeout(() => {
    dom.exerciseCard.classList.add('hidden');
    dom.transitionOverlay.classList.remove('hidden');
    dom.transitionOverlay.classList.add('active');

    setTimeout(async () => {
      await renderCallback();
      dom.transitionOverlay.classList.remove('active');
      setTimeout(() => {
        dom.transitionOverlay.classList.add('hidden');
        dom.exerciseCard.classList.remove('hidden', 'fade-out');
        dom.exerciseCard.classList.add('fade-in');
        setTimeout(() => {
          dom.exerciseCard.classList.remove('fade-in');
          state.transitionInProgress = false;
        }, CARD_FADE_DURATION);
      }, CARD_FADE_DURATION);
    }, BLANK_HOLD_DURATION);
  }, CARD_FADE_DURATION);
}

function showSessionSummary() {
  state.currentExercise = null;
  if (!state.sessionStats) {
    state.sessionStats = createEmptySessionStats();
  }
  const { total, correct } = state.sessionStats;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  dom.summaryOverview.textContent = `You answered ${correct} of ${total} correctly (${accuracy}% accuracy).`;

  dom.summaryDetails.innerHTML = '';
  if (state.sessionStats.formatBreakdown.size === 0) {
    dom.summaryDetails.textContent =
      'Work through a full session to see a detailed report.';
    dom.summaryDetails.classList.remove('summary-details');
  } else {
    dom.summaryDetails.classList.add('summary-details');
    const table = document.createElement('table');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th>Word</th>
      <th>Prompt → Answer</th>
      <th>Accuracy</th>
    `;
    table.appendChild(headerRow);

    const breakdowns = Array.from(
      state.sessionStats.formatBreakdown.values()
    ).sort((a, b) => {
      const accA = a.attempts === 0 ? 1 : a.correct / a.attempts;
      const accB = b.attempts === 0 ? 1 : b.correct / b.attempts;
      return accA - accB;
    });

    breakdowns.forEach((breakdown) => {
      const word = state.words.find((w) => w.id === breakdown.wordId);
      const accuracyPct =
        breakdown.attempts === 0
          ? 0
          : Math.round((breakdown.correct / breakdown.attempts) * 100);
      const promptLabel =
        FORMAT_LABELS[breakdown.questionFormat] ?? breakdown.questionFormat;
      const answerLabel =
        FORMAT_LABELS[breakdown.answerFormat] ?? breakdown.answerFormat;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${word ? word.english : breakdown.wordId}</td>
        <td>${promptLabel} → ${answerLabel}</td>
        <td>${accuracyPct}% (${breakdown.correct}/${breakdown.attempts})</td>
      `;
      table.appendChild(row);
    });

    dom.summaryDetails.appendChild(table);

    const weakest = breakdowns
      .filter((item) => item.attempts > 0 && item.correct < item.attempts)
      .slice(0, 3);
    if (weakest.length > 0) {
      const reminder = document.createElement('p');
      reminder.className = 'weakness-note';
      const phrases = weakest.map((item) => {
        const word = state.words.find((w) => w.id === item.wordId);
        const promptLabel =
          FORMAT_LABELS[item.questionFormat] ?? item.questionFormat;
        const answerLabel =
          FORMAT_LABELS[item.answerFormat] ?? item.answerFormat;
        return `${word ? word.english : item.wordId} (${promptLabel} → ${answerLabel})`;
      });
      reminder.textContent = `Let’s revisit: ${phrases.join(', ')} next time.`;
      dom.summaryDetails.appendChild(reminder);
    }
  }

  switchScreen(dom.sessionScreen, dom.summaryScreen);
}

function exportProgressLog() {
  const blob = new Blob([JSON.stringify(state.history, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `emilia-progress-${new Date()
    .toISOString()
    .split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function playAudio(src) {
  stopCurrentAudio();
  const audio = new Audio(src);
  state.currentAudio = audio;
  audio.play().catch((error) => {
    console.warn('Audio playback failed', error);
  });
}

function stopCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
}

function clearPendingPromptAudio() {
  if (state.pendingPromptAudio) {
    clearTimeout(state.pendingPromptAudio);
    state.pendingPromptAudio = null;
  }
}

function playFeedbackSound(isCorrect) {
  const src = isCorrect ? CORRECT_SFX_SRC : INCORRECT_SFX_SRC;
  const audio = new Audio(src);
  audio.volume = 0.65;
  audio.play().catch((error) => {
    console.warn('Feedback audio playback failed', error);
  });
}

function getAvailableLetters() {
  const letterSet = new Set();
  state.words.forEach((word) => {
    const letter = normalizeLetter(word.initialLetter);
    if (letter) {
      letterSet.add(letter);
    }
  });
  return Array.from(letterSet);
}

function normalizeLetter(value) {
  if (typeof value !== 'string') return null;
  const letter = value.trim().charAt(0).toLowerCase();
  return letter && LETTER_ALPHABET.includes(letter) ? letter : null;
}

function buildPerformanceMap(historyEntries) {
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
    map.set(key, existing);
  });
  return map;
}

function buildPerformanceKey(wordId, formatId) {
  return `${wordId}::${formatId}`;
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
