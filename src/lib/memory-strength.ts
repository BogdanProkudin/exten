import { computeRetrievability, cardFromWord, type FSRSState } from "./fsrs";

interface WordForStrength {
  intervalDays?: number;
  consecutiveCorrect?: number;
  forgotCount?: number;
  lastReviewed?: number;
  status: "new" | "learning" | "known";
  reviewCount: number;
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

export function computeStrength(word: WordForStrength): number {
  // FSRS path: strength = retrievability * 100
  if (word.fsrsStability != null && word.fsrsLastReview != null && word.fsrsLastReview > 0) {
    const card = cardFromWord(word);
    const R = computeRetrievability(card, Date.now());
    return Math.round(R * 100);
  }

  // Legacy path (unchanged)
  const intervalDays = word.intervalDays ?? 1;
  const consecutiveCorrect = word.consecutiveCorrect ?? 0;
  const forgotCount = word.forgotCount ?? 0;
  const lastReviewed = word.lastReviewed;

  const intervalScore = Math.min(40, (Math.log2(intervalDays + 1) / Math.log2(91)) * 40);
  const streakScore = Math.min(25, consecutiveCorrect * 5);
  const forgetPenalty = Math.min(25, forgotCount * 5);

  let recencyScore = 0;
  if (lastReviewed) {
    const daysSinceReview = (Date.now() - lastReviewed) / (24 * 60 * 60 * 1000);
    recencyScore = Math.max(0, 20 * (1 - daysSinceReview / 30));
  }

  const statusBonus = word.status === "known" ? 15 : word.status === "learning" ? 5 : 0;

  const raw = intervalScore + streakScore - forgetPenalty + recencyScore + statusBonus;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function strengthLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Weak";
  return "Fragile";
}

export function strengthColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#84cc16";
  if (score >= 40) return "#a16207";
  if (score >= 20) return "#f97316";
  return "#ef4444";
}
