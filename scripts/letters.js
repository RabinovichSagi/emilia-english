import { LETTER_ALPHABET } from './config.js';
import { state } from './state.js';

/**
 * Normalize any input to a lowercase letter within our supported alphabet.
 */
export function normalizeLetter(value) {
  if (typeof value !== 'string') return null;
  const letter = value.trim().charAt(0).toLowerCase();
  return letter && LETTER_ALPHABET.includes(letter) ? letter : null;
}

/**
 * Return the set of letter initials currently available across the word list.
 */
export function getAvailableLetters() {
  const letterSet = new Set();
  state.words.forEach((word) => {
    const letter = normalizeLetter(word.initialLetter);
    if (letter) {
      letterSet.add(letter);
    }
  });
  return Array.from(letterSet);
}
