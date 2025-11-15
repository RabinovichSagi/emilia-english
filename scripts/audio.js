import { AUDIO_SETTINGS } from './config.js';
import { state } from './state.js';

export function playAudio(src) {
  stopCurrentAudio();
  const audio = new Audio(src);
  state.currentAudio = audio;
  audio.play().catch((error) => {
    console.warn('Audio playback failed', error);
  });
}

export function stopCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
}

export function schedulePromptAudio(src, delay = 50) {
  clearPendingPromptAudio();
  state.pendingPromptAudio = window.setTimeout(() => {
    playAudio(src);
    state.pendingPromptAudio = null;
  }, delay);
}

export function clearPendingPromptAudio() {
  if (state.pendingPromptAudio) {
    clearTimeout(state.pendingPromptAudio);
    state.pendingPromptAudio = null;
  }
}

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
