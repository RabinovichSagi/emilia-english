import { AUDIO_SETTINGS } from './config.js';
import { state } from './state.js';

/**
 * Play the provided audio source, ensuring any previously playing prompt stops.
 */
export function playAudio(src) {
  stopCurrentAudio();
  const audio = new Audio(src);
  state.currentAudio = audio;
  audio.play().catch((error) => {
    console.warn('Audio playback failed', error);
  });
}

/**
 * Stop and clear the currently playing audio prompt (if any).
 */
export function stopCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
}

/**
 * Schedule prompt audio with a short delay so it triggers after the card fades in.
 */
export function schedulePromptAudio(src, delay = 50) {
  clearPendingPromptAudio();
  state.pendingPromptAudio = window.setTimeout(() => {
    playAudio(src);
    state.pendingPromptAudio = null;
  }, delay);
}

/**
 * Cancel any queued prompt audio before rendering a new card.
 */
export function clearPendingPromptAudio() {
  if (state.pendingPromptAudio) {
    clearTimeout(state.pendingPromptAudio);
    state.pendingPromptAudio = null;
  }
}

/**
 * Play the “correct” or “incorrect” feedback sound after an attempt.
 */
export function playFeedbackSound(isCorrect) {
  const src = isCorrect
    ? AUDIO_SETTINGS.CORRECT_SRC
    : AUDIO_SETTINGS.INCORRECT_SRC;
  const audio = new Audio(src);
  audio.volume = AUDIO_SETTINGS.VOLUME;
  audio.play().catch((error) => {
    console.warn('Feedback audio playback failed', error);
  });
}
