import test from 'node:test';
import assert from 'node:assert/strict';

import { state } from '../scripts/state.js';
import {
  markWordAsMastered,
  resetWordProgress,
} from '../scripts/progress.js';

// Simple in-memory localStorage mock for tests.
const createMemoryStorage = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
};

globalThis.localStorage = createMemoryStorage();

const LETTER_FORMAT = {
  id: 'audio_to_letter',
  promptType: 'audio',
  answerType: 'letter',
  requires: { audio: true, initialLetter: true },
};

function resetState() {
  state.words = [];
  state.formats = [];
  state.history = [];
  state.performanceMap = new Map();
  state.optionStateMap = new Map();
  state.wordOptionFloor = new Map();
}

test('markWordAsMastered promotes tuple stats and option floor', () => {
  resetState();
  state.words = [
    {
      id: 'dog',
      english: 'dog',
      hebrew: 'כלב',
      audio: 'assets/audio/dog.mp3',
      image: 'assets/images/dog.png',
      initialLetter: 'd',
    },
  ];
  state.formats = [LETTER_FORMAT];

  markWordAsMastered('dog');

  const key = 'dog::audio_to_letter';
  assert.equal(state.wordOptionFloor.get('dog'), 4);
  const stats = state.performanceMap.get(key);
  assert.ok(stats);
  assert.ok(stats.attempts >= 4);
  assert.equal(state.optionStateMap.get(key)?.level, 4);
});

test('resetWordProgress clears stats and lowers floor', () => {
  resetState();
  state.words = [
    {
      id: 'cat',
      english: 'cat',
      hebrew: 'חתול',
      audio: 'assets/audio/cat.mp3',
      image: 'assets/images/cat.png',
      initialLetter: 'c',
    },
  ];
  state.formats = [LETTER_FORMAT];
  state.history = [
    {
      wordId: 'cat',
      formatId: 'audio_to_letter',
      result: 'correct',
      questionFormat: 'audio',
      answerFormat: 'letter',
    },
  ];
  const key = 'cat::audio_to_letter';
  state.performanceMap.set(key, {
    attempts: 5,
    correct: 5,
    incorrect: 0,
    streak: 5,
  });
  state.optionStateMap.set(key, { level: 3 });
  state.wordOptionFloor.set('cat', 3);

  resetWordProgress('cat');

  assert.equal(state.history.length, 0);
  assert.equal(state.wordOptionFloor.get('cat'), 1);
  assert.equal(state.performanceMap.has(key), false);
  assert.equal(state.optionStateMap.has(key), false);
});
