import { computeRetrievability, cardFromWord, type FSRSState } from "./fsrs";

interface Word {
  _id: string;
  lastReviewed?: number;
  reviewCount: number;
  consecutiveCorrect?: number;
  intervalDays?: number;
  status: "new" | "learning" | "known";
  type?: string;
  // FSRS fields
  fsrsStability?: number;
  fsrsDifficulty?: number;
  fsrsElapsedDays?: number;
  fsrsScheduledDays?: number;
  fsrsReps?: number;
  fsrsLapses?: number;
  fsrsState?: FSRSState;
  fsrsLastReview?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DESIRED_RETENTION = 0.9;

export function getReviewScore(word: Word): number {
  const now = Date.now();

  // FSRS path
  if (word.fsrsState != null) {
    if (word.fsrsState === "new") return 1000;
    const card = cardFromWord(word);
    const R = computeRetrievability(card, now);
    const score = (1 - R) * 100;
    return score;
  }

  // Legacy path
  if (!word.lastReviewed) return 1000;

  const daysSince = (now - word.lastReviewed) / DAY_MS;
  const interval = word.intervalDays ?? (word.status === "known" ? 7 : 1);
  let score = ((daysSince - interval) / interval) * 100;

  if (word.status === "new") score += 50;
  if (word.status === "learning") score += 25;

  return score;
}

export function needsReview(
  word: Word,
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
): boolean {
  // FSRS path
  if (word.fsrsState != null) {
    if (word.fsrsState === "new" || word.fsrsState === "learning" || word.fsrsState === "relearning") {
      return true;
    }
    const card = cardFromWord(word);
    const R = computeRetrievability(card, Date.now());
    return R < desiredRetention;
  }

  // Legacy path
  if (!word.lastReviewed) return true;

  const now = Date.now();
  const interval = word.intervalDays ?? (word.status === "known" ? 7 : 1);
  return now - word.lastReviewed > interval * DAY_MS;
}

export function sortByReviewPriority<T extends Word>(words: T[]): T[] {
  return [...words]
    .filter(needsReview)
    .sort((a, b) => getReviewScore(b) - getReviewScore(a));
}

/**
 * Round-robin interleave by type to avoid showing many items of the same type in a row.
 */
export function interleaveByType<T extends Word>(words: T[]): T[] {
  const byType: Record<string, T[]> = {};
  for (const w of words) {
    const t = w.type ?? "word";
    (byType[t] ??= []).push(w);
  }

  const queues = Object.values(byType);
  const result: T[] = [];
  let idx = 0;

  while (result.length < words.length) {
    let added = false;
    for (const q of queues) {
      if (idx < q.length) {
        result.push(q[idx]);
        added = true;
      }
    }
    if (!added) break;
    idx++;
  }

  return result;
}
