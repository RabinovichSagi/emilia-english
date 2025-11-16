import {
  SESSION_LIMITS,
  FORMAT_LABELS,
} from './config.js';
import { dom, state } from './state.js';
import {
  loadWords,
  loadHistory,
  loadSessionLength,
  saveSessionLength,
  loadWordOptionFloor,
  persistWordOptionFloor,
  persistHistory,
} from './storage.js';
import {
  computeAvailableFormats,
  buildSessionQueue,
} from './queue.js';
import {
  createEmptySessionStats,
  updateSessionStats,
  updatePerformanceMapWithEntry,
  updateOptionStateWithEntry,
} from './progress.js';
import {
  playAudio,
  stopCurrentAudio,
  schedulePromptAudio,
  clearPendingPromptAudio,
  playFeedbackSound,
} from './audio.js';
import { openControlPanel, hideControlPanel } from './controlPanel.js';
import { loadReviewSchedule } from './scheduleMastery.js';

import {
  initBalloonCelebration,
  startBalloonCelebration,
  stopBalloonCelebration,
} from './balloons.js';

document.addEventListener('DOMContentLoaded', init);

/**
 * Entry point: load persisted data, fetch words, bootstrap UI.
 */
async function init() {
  initBalloonCelebration();
  cacheDomReferences();
  attachEventListeners();
  applyStoredSettings();
  loadWordOptionFloor();
  loadHistory();
  loadReviewSchedule();

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

/**
 * Gather all DOM nodes the app mutates frequently.
 */
function cacheDomReferences() {
  dom.startScreen = document.getElementById('start-screen');
  dom.sessionScreen = document.getElementById('session-screen');
  dom.summaryScreen = document.getElementById('summary-screen');
  dom.exerciseCard = document.getElementById('exercise-card');
  dom.promptArea = document.getElementById('prompt-area');
  dom.optionsArea = document.getElementById('options-area');
  dom.feedbackArea = document.getElementById('feedback-area');
  dom.progressIndicator = document.getElementById('progress-indicator');
  dom.transitionOverlay = document.getElementById('transition-overlay');
  dom.optionTemplate = document.getElementById('option-template');
  dom.startButton = document.getElementById('start-button');
  dom.openControlPanelButton = document.getElementById('open-control-panel');
  dom.closeControlPanelButton = document.getElementById('close-control-panel');
  dom.controlPanel = document.getElementById('control-panel');
  dom.controlPanelBody = document.getElementById('control-panel-body');
  dom.sessionLengthInput = document.getElementById('session-length-input');
  dom.sessionLengthDisplay = document.getElementById('session-length-display');
  dom.restartButton = document.getElementById('restart-button');
  dom.backHomeButton = document.getElementById('back-home-button');
  dom.summaryOverview = document.getElementById('summary-overview');
  dom.summaryDetails = document.getElementById('summary-details');
  dom.exportButton = document.getElementById('export-progress');
  dom.endSessionButton = document.getElementById('end-session-button');
}

/**
 * Wire up button handlers, slider, and overlay interactions.
 */
function attachEventListeners() {
  dom.startButton.addEventListener('click', handleStartSession);
  dom.restartButton.addEventListener('click', handleRestart);
  dom.backHomeButton.addEventListener('click', returnHome);
  dom.exportButton.addEventListener('click', exportProgressLog);
  dom.endSessionButton.addEventListener('click', endSessionEarly);
  dom.openControlPanelButton.addEventListener('click', openControlPanel);
  dom.closeControlPanelButton.addEventListener('click', hideControlPanel);
  dom.controlPanel?.addEventListener('click', (event) => {
    if (event.target === dom.controlPanel) {
      hideControlPanel();
    }
  });

  dom.sessionLengthInput.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    state.sessionLength = value;
    dom.sessionLengthDisplay.textContent = value.toString();
    saveSessionLength(state.sessionLength);
  });
}

/**
 * Apply the previously saved session length, clamped to valid bounds.
 */
function applyStoredSettings() {
  const stored = loadSessionLength();
  if (stored) {
    const length = Math.min(
      Math.max(stored, SESSION_LIMITS.MIN_LENGTH),
      SESSION_LIMITS.MAX_LENGTH
    );
    state.sessionLength = length;
    dom.sessionLengthInput.value = length.toString();
  } else {
    dom.sessionLengthInput.value = state.sessionLength.toString();
  }
}

/**
 * Initialize a new practice session and render the first card.
 */
function handleStartSession() {
  if (state.words.length === 0) {
    alert('Word list is empty. Please add entries to data/words.json.');
    return;
  }
  state.sessionStats = createEmptySessionStats();
  state.queue = buildSessionQueue();
  state.sessionPlanLength = state.queue.length;
  state.completedBaseExercises = 0;
  logPlannedExercises(state.queue);
  updateProgressIndicator();
  switchScreen(dom.startScreen, dom.sessionScreen);
  clearBalloonTimeout();
  stopBalloonCelebration();
  hideControlPanel();
  renderNextExercise(true);
}

/**
 * Abort the current session and jump to the summary screen.
 */
function endSessionEarly() {
  if (!state.currentExercise) {
    return;
  }
  state.queue = [];
  showSessionSummary();
}

/**
 * Restart a new session from the summary screen.
 */
function handleRestart() {
  state.sessionStats = createEmptySessionStats();
  state.queue = buildSessionQueue();
  state.sessionPlanLength = state.queue.length;
  state.completedBaseExercises = 0;
  logPlannedExercises(state.queue);
  updateProgressIndicator();
  switchScreen(dom.summaryScreen, dom.sessionScreen);
  clearBalloonTimeout();
  stopBalloonCelebration();
  hideControlPanel();
  renderNextExercise(true);
}

/**
 * Return to the home screen from the summary.
 */
function returnHome() {
  switchScreen(dom.summaryScreen, dom.startScreen);
  hideControlPanel();
}

/**
 * Utility: toggle which main screen is visible.
 */
function switchScreen(from, to) {
  from.classList.add('hidden');
  to.classList.remove('hidden');
}

/**
 * Pop the next exercise from the queue and show it (with fade transitions).
 */
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
    renderPrompt(state.currentExercise.word, state.currentExercise.format);
    renderOptions(state.currentExercise);
    handleSingleOptionPromotion(state.currentExercise);
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

/**
 * Render the stimulus/prompt portion of the exercise card.
 */
function renderPrompt(word, format) {
  dom.promptArea.innerHTML = '';
  dom.promptArea.style.fontSize = '';
  dom.promptArea.style.direction = '';
  dom.promptArea.style.gap = '';
  stopCurrentAudio();
  clearPendingPromptAudio();

  if (format.answerType === 'letter') {
    const answerInstruction = document.createElement('div');
    answerInstruction.className = 'letter-instruction';
    answerInstruction.dir = 'rtl';
    answerInstruction.textContent = 'בְּאֵיזוֹ אוֹת מַתְחִילָה הַמִּלָּה?';
    dom.promptArea.appendChild(answerInstruction);
  }

  if (format.promptType === 'letter') {
    dom.promptArea.style.direction = 'rtl';
    dom.promptArea.style.gap = '20px';
    const instruction = document.createElement('div');
    instruction.className = 'letter-instruction';
    instruction.dir = 'rtl';
    instruction.textContent = 'אֵיזוֹ מִלָּה מַתְחִילָה בָּאוֹת?';
    dom.promptArea.appendChild(instruction);
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
    schedulePromptAudio(word.audio, 50);
    return;
  }

  dom.promptArea.textContent = word.english;
}

/**
 * Render the answer options (buttons/images/audio/letters) for a card.
 */
function renderOptions(exercise) {
  dom.optionsArea.innerHTML = '';

  exercise.options.forEach((option) => {
    const optionNode = dom.optionTemplate.content
      .cloneNode(true)
      .querySelector('.option-button');

    optionNode.dataset.optionId = option.optionId;
    optionNode.dataset.correct = option.isCorrect ? 'true' : 'false';
    optionNode.textContent = '';

    if (option.letterValue) {
      optionNode.classList.add('letter-option');
      optionNode.textContent = option.label;
    } else if (option.imageSrc) {
      const img = document.createElement('img');
      img.src = option.imageSrc;
      img.alt = option.label;
      optionNode.appendChild(img);
      const label = document.createElement('span');
      label.textContent = option.label;
      optionNode.appendChild(label);
    } else if (option.audioSrc) {
      const preview = document.createElement('span');
      preview.className = 'audio-preview-control';
      preview.innerHTML = '🔊 Preview';
      optionNode.appendChild(preview);
      const hint = document.createElement('span');
      hint.className = 'option-audio-hint';
      hint.textContent = 'Tap here to choose';
      optionNode.appendChild(hint);
    } else {
      optionNode.textContent = option.label;
    }

    optionNode.addEventListener('click', (event) =>
      handleAnswerSelection(exercise, option, event)
    );
    dom.optionsArea.appendChild(optionNode);
  });
}

/**
 * Primary tap handler for option buttons, including audio previews.
 */
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
  const willTriggerHint =
    !option.isCorrect &&
    exercise.attempts >= 2 &&
    exercise.hintUsed === false;
  const wasHintUsed = exercise.hintUsed || willTriggerHint;

  recordAttempt({
    wordId: exercise.word.id,
    format: exercise.format,
    selectedOptionId: option.optionId,
    isCorrect: option.isCorrect,
    durationMs,
    wasHintUsed,
  });

  highlightOption(option.optionId, option.isCorrect);
  disableOptions();
  playFeedbackSound(option.isCorrect);

  if (option.isCorrect) {
    dom.feedbackArea.textContent = 'Great job!';
    dom.feedbackArea.classList.add('feedback-correct');
    scheduleNextExercise(exercise);
  } else {
    dom.feedbackArea.textContent = 'Almost! Try again.';
    dom.feedbackArea.classList.add('feedback-incorrect');
    handleIncorrectAttempt(exercise, option);
  }
}

/**
 * Handle incorrect answers: hints, retries, or requeueing.
 */
function handleIncorrectAttempt(exercise, option) {
  if (exercise.attempts >= 2 && !exercise.hintUsed) {
    exercise.hintUsed = true;
    triggerHint(exercise);
    revealCorrectOption(exercise);
    queueExerciseRetry(exercise);
    scheduleNextExercise(exercise);
  } else {
    enableOptionsExcept(option.optionId);
    state.attemptStartTime = performance.now();
  }
}

/**
 * Provide a gentle hint (replay audio or pulse correct option).
 */
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

/**
 * Visually reveal the correct option after exhausting attempts.
 */
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

/**
 * Insert a missed exercise back into the queue a couple cards ahead.
 */
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

/**
 * Advance to the next card after a short delay, tracking progress counts.
 */
function scheduleNextExercise(exercise) {
  if (exercise && !exercise.isRetry) {
    state.completedBaseExercises = Math.min(
      state.completedBaseExercises + 1,
      state.sessionPlanLength
    );
  }
  updateProgressIndicator();
  setTimeout(() => renderNextExercise(), 900);
}

/**
 * Highlight the tapped option in green/red based on correctness.
 */
function highlightOption(optionId, isCorrect) {
  [...dom.optionsArea.children].forEach((button) => {
    if (button.dataset.optionId === optionId) {
      button.classList.add(isCorrect ? 'option-correct' : 'option-incorrect');
    }
  });
}

/**
 * Disable all option buttons (used post-selection).
 */
function disableOptions() {
  [...dom.optionsArea.children].forEach((button) => {
    button.disabled = true;
  });
}

/**
 * Enable all options except the one that was just tapped.
 */
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

/**
 * Persist a single attempt and update all derived state maps.
 */
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
  persistHistory();
  updatePerformanceMapWithEntry(entry);
  updateSessionStats(entry);
  updateOptionStateWithEntry(entry);
}

/**
 * Update the progress text (e.g., “3 / 10”) based on completed cards.
 */
function updateProgressIndicator() {
  const total = state.sessionPlanLength || state.sessionLength;
  const completed = Math.min(state.completedBaseExercises, total);
  dom.progressIndicator.textContent = `${completed} / ${total}`;
}

/**
 * Animate fade-out, blank pause, and fade-in between exercises.
 */
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
        }, SESSION_LIMITS.CARD_FADE_DURATION);
      }, SESSION_LIMITS.CARD_FADE_DURATION);
    }, SESSION_LIMITS.BLANK_HOLD_DURATION);
  }, SESSION_LIMITS.CARD_FADE_DURATION);
}

/**
 * Display the summary screen with accuracy and weakest tuples.
 */
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
  } else {
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

    dom.summaryDetails.classList.add('summary-details');
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
  startBalloonCelebration();
  scheduleBalloonTimeout();
}

/**
 * Download the full history as prettified JSON.
 */
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

/**
 * Log the planned session queue to the console for debugging.
 */
function logPlannedExercises(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    console.info('[Session Plan] No exercises queued.');
    return;
  }
  const timestamp = new Date().toLocaleTimeString();
  console.groupCollapsed(`[Session Plan ${timestamp}] ${exercises.length} cards`);
  exercises.forEach((exercise, index) => {
    console.log(
      `#${index + 1}: ${exercise.word.english} (${exercise.word.id}) — ${exercise.format.id} [${exercise.format.promptType}→${exercise.format.answerType}] options=${exercise.optionCount}`
    );
  });
  console.groupEnd();
}

/**
 * Promote a word’s minimum option level once it has seen a single-option card.
 */
function handleSingleOptionPromotion(exercise) {
  if (!exercise || exercise.optionCount > 1) return;
  promoteWordFloor(exercise.word.id, 2);
}

/**
 * Increase a word’s option-floor (persisted) so it never drops below minLevel.
 */
function promoteWordFloor(wordId, minLevel) {
  const current = state.wordOptionFloor.get(wordId) ?? 1;
  if (current >= minLevel) return;
  state.wordOptionFloor.set(wordId, minLevel);
  persistWordOptionFloor();
}

/**
 * Auto-hide the celebration balloons after a few seconds.
 */
function scheduleBalloonTimeout() {
  clearBalloonTimeout();
  state.balloonTimeoutId = window.setTimeout(() => {
    stopBalloonCelebration();
    clearBalloonTimeout();
  }, 5000);
}

/**
 * Clear any outstanding balloon timeout.
 */
function clearBalloonTimeout() {
  if (state.balloonTimeoutId) {
    clearTimeout(state.balloonTimeoutId);
    state.balloonTimeoutId = null;
  }
}
