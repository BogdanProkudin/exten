/**
 * Smart review challenge selection.
 * Picks challenge type based on word learning state, builds challenge objects.
 */

import { computeStrength } from "./memory-strength";

export type ChallengeType =
  | "mc-word-to-translation"
  | "mc-translation-to-word"
  | "type-translation"
  | "type-word";

export interface Challenge {
  type: ChallengeType;
  prompt: string;
  correctAnswer: string;
  options?: string[];
  correctIndex?: number;
}

interface WordLike {
  _id: string;
  word: string;
  translation: string;
  type?: string;
  fsrsState?: string;
  fsrsReps?: number;
  fsrsLapses?: number;
  fsrsStability?: number;
  fsrsDifficulty?: number;
  fsrsLastReview?: number;
  fsrsScheduledDays?: number;
  fsrsElapsedDays?: number;
  reviewCount?: number;
  status?: string;
  // fields needed by computeStrength
  intervalDays?: number;
  consecutiveCorrect?: number;
  forgotCount?: number;
  lastReviewed?: number;
}

const CHALLENGE_LADDER: ChallengeType[] = [
  "mc-word-to-translation",
  "mc-translation-to-word",
  "type-translation",
  "type-word",
];

/**
 * Deterministic hash from string → number in [0, 1).
 * Used for seeded randomness so challenge type doesn't flicker on re-render.
 */
function hashToFloat(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 10000) / 10000;
}

export function selectChallengeType(word: WordLike, totalVocabSize: number): ChallengeType {
  const strength = computeStrength(word as any);
  const reps = word.fsrsReps ?? word.reviewCount ?? 0;
  const lapses = word.fsrsLapses ?? 0;
  const state = word.fsrsState;

  // Determine base challenge level
  let baseIndex: number;

  if (!state || state === "new" || reps === 0) {
    baseIndex = 0; // mc-word-to-translation
  } else if (state === "relearning" || lapses > 3) {
    baseIndex = 0; // mc-word-to-translation
  } else if (reps <= 3 || strength < 50) {
    baseIndex = 1; // mc-translation-to-word
  } else if (strength >= 80 && reps >= 5) {
    baseIndex = 3; // type-word
  } else if (strength >= 50) {
    baseIndex = 2; // type-translation
  } else {
    baseIndex = 1; // default: mc-translation-to-word
  }

  // Can't do MC with < 4 words total
  if (totalVocabSize < 4 && baseIndex < 2) {
    baseIndex = 2; // force typing
  }

  // Apply deterministic variation seeded by word ID + day bucket
  const dayBucket = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const variationSeed = hashToFloat(word._id + dayBucket);

  if (variationSeed < 0.2) {
    // 20% chance one level harder
    baseIndex = Math.min(baseIndex + 1, CHALLENGE_LADDER.length - 1);
  } else if (variationSeed > 0.9) {
    // 10% chance one level easier
    baseIndex = Math.max(baseIndex - 1, 0);
    // But still can't do MC with < 4 words
    if (totalVocabSize < 4 && baseIndex < 2) baseIndex = 2;
  }

  return CHALLENGE_LADDER[baseIndex];
}

export function resultToFSRSRating(challengeType: ChallengeType, correct: boolean): number {
  if (!correct) return 1; // Again

  // Only the hardest challenge (type the word from memory) earns Easy (4)
  if (challengeType === "type-word") return 4;

  // All other correct answers earn Good (3)
  return 3;
}

export function pickDistractors(
  allWords: WordLike[],
  currentWord: WordLike,
  count: number = 3,
): WordLike[] {
  const seen = new Set<string>();
  seen.add(currentWord.translation.toLowerCase().trim());

  const filtered = allWords
    .filter((w) => {
      if (w._id === currentWord._id) return false;
      const t = w.translation.toLowerCase().trim();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  return shuffleWithSeed(filtered, currentWord._id).slice(0, count);
}

function shuffleWithSeed<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.abs(((hashToFloat(seed + i) * (i + 1)) | 0) % (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildChallenge(word: WordLike, allWords: WordLike[], forceEasier?: boolean): Challenge {
  const totalVocabSize = allWords.length + 1; // +1 for current word
  let type = selectChallengeType(word, totalVocabSize);

  // When reviewing mistakes, downgrade typing challenges to multiple choice
  if (forceEasier) {
    if (type === "type-translation") type = "mc-word-to-translation";
    else if (type === "type-word") type = "mc-translation-to-word";
  }

  const isReverse = type === "mc-translation-to-word" || type === "type-word";
  const prompt = isReverse ? word.translation : word.word;
  const correctAnswer = isReverse ? word.word : word.translation;

  if (type === "type-translation" || type === "type-word") {
    return { type, prompt, correctAnswer };
  }

  // MC: build options
  const distractors = pickDistractors(allWords, word, 3);

  // Build option texts
  const distractorAnswers = distractors.map((d) =>
    isReverse ? d.word : d.translation
  );

  // If we don't have enough distractors, fall back to typing
  if (distractorAnswers.length < 3) {
    const fallbackType = isReverse ? "type-word" : "type-translation";
    return { type: fallbackType, prompt, correctAnswer };
  }

  const allOptions = [correctAnswer, ...distractorAnswers];
  const shuffled = shuffleWithSeed(allOptions, word._id + Math.floor(Date.now() / 86400000));
  const correctIndex = shuffled.indexOf(correctAnswer);

  return {
    type,
    prompt,
    correctAnswer,
    options: shuffled,
    correctIndex,
  };
}
