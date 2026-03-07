interface WordForStrength {
  intervalDays?: number;
  consecutiveCorrect?: number;
  forgotCount?: number;
  lastReviewed?: number;
  status: "new" | "learning" | "known";
  reviewCount: number;
}

export function computeStrength(word: WordForStrength): number {
  const intervalDays = word.intervalDays ?? 1;
  const consecutiveCorrect = word.consecutiveCorrect ?? 0;
  const forgotCount = word.forgotCount ?? 0;
  const lastReviewed = word.lastReviewed;

  // Interval component: max 40pts at 90-day interval
  const intervalScore = Math.min(40, (Math.log2(intervalDays + 1) / Math.log2(91)) * 40);

  // Streak component: max 25pts at 5+ consecutive correct
  const streakScore = Math.min(25, consecutiveCorrect * 5);

  // Forget penalty: up to -25pts
  const forgetPenalty = Math.min(25, forgotCount * 5);

  // Recency: decays over 30 days, max 20pts
  let recencyScore = 0;
  if (lastReviewed) {
    const daysSinceReview = (Date.now() - lastReviewed) / (24 * 60 * 60 * 1000);
    recencyScore = Math.max(0, 20 * (1 - daysSinceReview / 30));
  }

  // Status bonus
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
