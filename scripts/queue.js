import {
  SESSION_LIMITS,
  EXERCISE_FORMATS,
  LETTER_ALPHABET,
  DEPRECATED_FORMAT_IDS,
} from './config.js';
import { clamp, shuffle } from './utils.js';
import { state } from './state.js';
import {
  buildWordProgressMap,
  getOptionCountForTuple,
  wordSupportsFormat,
  isTupleMastered,
} from './progress.js';
import { shouldScheduleMastered } from './scheduleMastery.js';
import { normalizeLetter, getAvailableLetters } from './letters.js';

/**
 * Determine which exercise formats are supported by the current word set.
 */
export function computeAvailableFormats(words) {
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

  return EXERCISE_FORMATS.filter(
    (format) =>
      !DEPRECATED_FORMAT_IDS.has(format.id) &&
      words.some((word) => {
        const caps = wordCapabilities.get(word.id);
        return Object.entries(format.requires).every(
          ([key, needed]) => !needed || caps?.[key]
        );
      })
  );
}

/**
 * Build the prioritized exercise queue, balancing new/unmastered/mastered words.
 */
export function buildSessionQueue() {
  const allExercises = [];

  state.words.forEach((word) => {
    state.formats.forEach((format) => {
      if (DEPRECATED_FORMAT_IDS.has(format.id)) return;
      if (!wordSupportsFormat(word, format)) {
        return;
      }
      const key = `${word.id}::${format.id}`;
      const stats = state.performanceMap.get(key) ?? {
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

  const sortedExercises = allExercises.sort((a, b) => {
    if (a.priorityScore === b.priorityScore) {
      return Math.random() - 0.5;
    }
    return a.priorityScore - b.priorityScore;
  });

  const sessionLength = clamp(
    state.sessionLength,
    SESSION_LIMITS.MIN_LENGTH,
    Math.min(SESSION_LIMITS.MAX_LENGTH, sortedExercises.length)
  );

  const wordProgress = buildWordProgressMap();
  const unmasteredSet = new Set();
  const masteredSet = new Set();
  const newSet = new Set();

  state.words.forEach((word) => {
    const progress = wordProgress.get(word.id);
    if (!progress || progress.totalFormats === 0) {
      return;
    }
    let dueMastered = 0;
    state.formats.forEach((format) => {
      if (DEPRECATED_FORMAT_IDS.has(format.id)) return;
      if (!wordSupportsFormat(word, format)) return;
      const key = `${word.id}::${format.id}`;
      const stats = state.performanceMap.get(key);
      if (stats && isTupleMastered(stats) && shouldScheduleMastered(word.id, format.id)) {
        dueMastered += 1;
      }
    });
    if (progress.attemptedFormats === 0) {
      newSet.add(word.id);
    } else if (progress.pendingFormats > 0 || progress.freshFormats > 0) {
      unmasteredSet.add(word.id);
      if (dueMastered > 0) {
        masteredSet.add(word.id);
      }
    } else if (dueMastered > 0) {
      masteredSet.add(word.id);
    }
  });

  const selected = [];
  const wordUsage = new Map();
  const newWordsIntroduced = new Set();

  /**
   * Attempt to add the candidate exercise, respecting new-word limits and per-word usage caps.
   */
  const tryAddCandidate = (
    candidate,
    { isNew = false, overrideLimit = false } = {}
  ) => {
    if (selected.length >= sessionLength) return false;
    const wordId = candidate.word.id;
    if (
      isNew &&
      !newWordsIntroduced.has(wordId) &&
      newWordsIntroduced.size >= SESSION_LIMITS.MAX_NEW_WORDS_PER_SESSION
    ) {
      return false;
    }
    if (!overrideLimit) {
      const usage = wordUsage.get(wordId) ?? 0;
      if (usage >= SESSION_LIMITS.MAX_OCCURRENCES_PER_WORD) {
        return false;
      }
    }
    selected.push(createExercise(candidate.word, candidate.format));
    wordUsage.set(wordId, (wordUsage.get(wordId) ?? 0) + 1);
    if (isNew) newWordsIntroduced.add(wordId);
    return true;
  };

  /**
   * Pull exercises whose word id is within wordSet into the queue.
   */
  const takeFromSet = (
    wordSet,
    { isNew = false, overrideLimit = false } = {}
  ) => {
    if (!wordSet || wordSet.size === 0) return;
    const passes = overrideLimit
      ? 1
      : isNew
      ? 1
      : SESSION_LIMITS.MAX_REPEAT_PASSES;
    for (let pass = 0; pass < passes; pass += 1) {
      let added = false;
      for (const candidate of sortedExercises) {
        if (selected.length >= sessionLength) break;
        if (!wordSet.has(candidate.word.id)) continue;
        if (tryAddCandidate(candidate, { isNew, overrideLimit })) {
          added = true;
        }
      }
      if (selected.length >= sessionLength || !added) break;
    }
  };

  if (unmasteredSet.size > 0) {
    takeFromSet(unmasteredSet);
    if (selected.length === 0 && newSet.size > 0) {
      takeFromSet(newSet, { isNew: true });
    }
    if (selected.length < sessionLength) {
      takeFromSet(masteredSet);
    }
  } else {
    takeFromSet(newSet, { isNew: true });
    if (selected.length < sessionLength) {
      takeFromSet(masteredSet);
    }
  }

  if (selected.length < sessionLength) {
    takeFromSet(unmasteredSet, { overrideLimit: true });
    if (selected.length < sessionLength) {
      takeFromSet(newSet, { isNew: true, overrideLimit: true });
    }
    if (selected.length < sessionLength) {
      takeFromSet(masteredSet, { overrideLimit: true });
    }
  }

  if (selected.length === 0) {
    for (const candidate of sortedExercises) {
      if (selected.length >= sessionLength) break;
      tryAddCandidate(candidate, { overrideLimit: true });
    }
  }

  return selected.slice(0, sessionLength);
}

/**
 * Create an exercise object with options precomputed for the given tuple.
 */
export function createExercise(word, format) {
  const optionCount = getOptionCountForTuple(word.id, format.id);
  const options = buildOptions(word, format, optionCount);
  return {
    word,
    format,
    options,
    optionCount: options.length,
    attempts: 0,
    hintUsed: false,
    id: `${word.id}-${format.id}-${crypto.randomUUID?.() ?? Math.random()}`,
    retryCount: 0,
    isRetry: false,
  };
}

/**
 * Build the selectable options for a given word/format combination.
 */
export function buildOptions(word, format, optionCount) {
  if (format.answerType === 'letter') {
    return buildLetterOptions(word, optionCount);
  }
  const desiredDistractors = Math.max(optionCount - 1, 0);
  const distractorIds = pickDistractorIds(word, format, desiredDistractors);
  const wordMap = new Map(state.words.map((w) => [w.id, w]));
  const optionIds = [word.id, ...distractorIds];
  const options = optionIds.map((id) => {
    const optionWord = wordMap.get(id);
    if (!optionWord) {
      throw new Error(`Missing word data for option id ${id}`);
    }
    return transformWordToOption(optionWord, format, optionWord.id === word.id);
  });
  return shuffle(options);
}

/**
 * Specialized option builder for letter drills (ensures enough distractors).
 */
export function buildLetterOptions(word, optionCount) {
  const targetLetter = normalizeLetter(word.initialLetter);
  if (!targetLetter) {
    throw new Error(`Word ${word.id} missing initialLetter for letter drill`);
  }

  const availableLetters = getAvailableLetters().filter(
    (letter) => letter !== targetLetter
  );
  const distractors = [];
  for (const letter of shuffle(availableLetters)) {
    if (distractors.length >= 3) break;
    distractors.push(letter);
  }
  if (distractors.length < 3) {
    const fallbackPool = shuffle(
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

  const totalOptions = clamp(optionCount, 1, 4);
  const letters = shuffle([
    targetLetter,
    ...distractors.slice(0, totalOptions - 1),
  ]);
  return letters.map((letter) => ({
    optionId: `letter-${letter}`,
    label: letter.toUpperCase(),
    letterValue: letter,
    isCorrect: letter === targetLetter,
  }));
}

/**
 * Pick N distractor word IDs respecting modality requirements.
 */
export function pickDistractorIds(word, format, desiredCount = 3) {
  if (desiredCount <= 0) {
    return [];
  }
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
    shuffle(fallbackArray);
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
  return result.slice(0, desiredCount);
}

/**
 * Convert a word into the option payload needed to render a button/card.
 */
export function transformWordToOption(word, format, isCorrect) {
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
    label = 'Play Sound';
  }

  return {
    optionId: word.id,
    label,
    isCorrect,
    imageSrc,
    audioSrc,
  };
}

/**
 * Determine whether the word can serve as an answer for the target format.
 */
function wordSupportsAnswer(word, format) {
  if (format.answerType === 'translation') return Boolean(word.hebrew);
  if (format.answerType === 'image') return Boolean(word.image);
  if (format.answerType === 'audio') return Boolean(word.audio);
  if (format.answerType === 'letter')
    return Boolean(word.initialLetter && word.initialLetter.length > 0);
  return true;
}
