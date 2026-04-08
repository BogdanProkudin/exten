import { type FSRSState } from "./fsrs";

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
  const reps = word.fsrsReps ?? 0;
  if (reps === 0) return 0;

  const stability = word.fsrsStability ?? 0;
  const lapses = word.fsrsLapses ?? 0;

  // Stability-based strength (maps days of stability → 0-100%)
  let strength: number;
  if (stability < 1) {
    strength = Math.round(stability * 20);                       // 0–20%
  } else if (stability < 3) {
    strength = Math.round(20 + ((stability - 1) / 2) * 20);     // 20–40%
  } else if (stability < 7) {
    strength = Math.round(40 + ((stability - 3) / 4) * 20);     // 40–60%
  } else if (stability < 14) {
    strength = Math.round(60 + ((stability - 7) / 7) * 15);     // 60–75%
  } else if (stability < 30) {
    strength = Math.round(75 + ((stability - 14) / 16) * 10);   // 75–85%
  } else if (stability < 90) {
    strength = Math.round(85 + ((stability - 30) / 60) * 10);   // 85–95%
  } else {
    strength = Math.min(100, Math.round(95 + ((stability - 90) / 90) * 5)); // 95–100%
  }

  // Lapses penalty: -5% per lapse, max -15%
  const lapsePenalty = Math.min(15, lapses * 5);
  strength = Math.max(0, strength - lapsePenalty);

  return strength;
}

export function strengthLabel(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Weak";
  return "Fragile";
}

export function strengthColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green — strong
  if (score >= 50) return "#f59e0b"; // amber — growing
  if (score > 0)   return "#ef4444"; // red — weak
  return "#94a3b8";                  // gray — new/zero
}
