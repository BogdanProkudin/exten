interface Word {
  _id: string;
  lastReviewed?: number;
  reviewCount: number;
  consecutiveCorrect?: number;
  intervalDays?: number;
  status: "new" | "learning" | "known";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function getReviewScore(word: Word): number {
  const now = Date.now();

  if (!word.lastReviewed) return 1000;

  const daysSince = (now - word.lastReviewed) / DAY_MS;
  const interval = word.intervalDays ?? 1;
  // Overdue ratio: how overdue relative to interval
  let score = ((daysSince - interval) / interval) * 100;

  if (word.status === "new") score += 50;
  if (word.status === "learning") score += 25;

  return score;
}

export function needsReview(word: Word): boolean {
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
