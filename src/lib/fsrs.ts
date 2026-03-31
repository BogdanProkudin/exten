// FSRS-5 — Free Spaced Repetition Scheduler
// Pure TypeScript implementation based on the open-source FSRS algorithm.
// No external dependencies.

export type FSRSState = "new" | "learning" | "review" | "relearning";
export type FSRSRating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface FSRSCard {
  stability: number; // S: days until R drops to desired_retention
  difficulty: number; // D: 1–10 scale
  elapsedDays: number; // days since last review
  scheduledDays: number; // days until next review
  reps: number; // total successful reviews
  lapses: number; // times forgotten after learning
  state: FSRSState;
  lastReview: number; // timestamp (ms)
}

// FSRS-5 default parameters (19 weights)
const w = [
  0.4072, // w0  — initial stability for Again
  1.1829, // w1  — initial stability for Hard
  3.1262, // w2  — initial stability for Good
  15.4722, // w3  — initial stability for Easy
  7.2102, // w4  — difficulty base
  0.5316, // w5  — difficulty factor
  1.0651, // w6  — difficulty mean reversion rate
  0.0046, // w7  — difficulty damping
  1.5071, // w8  — stability factor (success)
  0.1176, // w9  — stability decay (success)
  1.0156, // w10 — stability recall factor
  0.5893, // w11 — stability lapse base
  0.2634, // w12 — stability lapse difficulty factor
  0.0605, // w13 — stability lapse stability factor
  0.3782, // w14 — stability lapse retrievability factor
  0.1380, // w15 — hard penalty
  2.7203, // w16 — easy bonus
  2.009, // w17 — short-term stability factor
  0.3205, // w18 — short-term stability exponent
];

const DEFAULT_DESIRED_RETENTION = 0.9;

export function initCard(): FSRSCard {
  return {
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    lastReview: 0,
  };
}

/** Compute retrievability: probability of recall after elapsed time. */
export function computeRetrievability(card: FSRSCard, now: number): number {
  if (card.state === "new" || card.stability <= 0 || card.lastReview === 0) {
    return 0;
  }
  const elapsedDays = Math.max(0, (now - card.lastReview) / (24 * 60 * 60 * 1000));
  return Math.pow(1 + elapsedDays / (9 * card.stability), -1);
}

/** Map boolean remembered → FSRS rating. */
export function mapBooleanToRating(remembered: boolean): FSRSRating {
  return remembered ? 3 : 1; // Good or Again
}

function clampDifficulty(d: number): number {
  return Math.min(10, Math.max(1, d));
}

function initDifficulty(rating: FSRSRating): number {
  return clampDifficulty(w[4] - Math.exp(w[5] * (rating - 1)) + 1);
}

function initStability(rating: FSRSRating): number {
  return Math.max(0.1, w[rating - 1]);
}

function nextInterval(stability: number, desiredRetention: number): number {
  return Math.max(1, Math.round(9 * stability * (1 / desiredRetention - 1)));
}

function nextDifficulty(d: number, rating: FSRSRating): number {
  const newD = d - w[6] * (rating - 3);
  // Mean reversion toward initial difficulty of rating=3 (Good)
  return clampDifficulty(w[7] * initDifficulty(3) + (1 - w[7]) * newD);
}

function nextRecallStability(
  d: number,
  s: number,
  r: number,
  rating: FSRSRating,
): number {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  return (
    s *
    (1 +
      Math.exp(w[8]) *
        (11 - d) *
        Math.pow(s, -w[9]) *
        (Math.exp(w[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function nextForgetStability(
  d: number,
  s: number,
  r: number,
): number {
  return Math.min(
    s,
    w[11] *
      Math.pow(d, -w[12]) *
      (Math.pow(s + 1, w[13]) - 1) *
      Math.exp(w[14] * (1 - r)),
  );
}

function nextShortTermStability(s: number, rating: FSRSRating): number {
  return s * Math.exp(w[17] * (rating - 3 + w[18]));
}

/** Schedule the next review of a card given a rating. */
export function scheduleCard(
  card: FSRSCard,
  rating: FSRSRating,
  now: number,
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
): FSRSCard {
  const elapsedDays =
    card.lastReview > 0
      ? Math.max(0, (now - card.lastReview) / (24 * 60 * 60 * 1000))
      : 0;

  const next: FSRSCard = { ...card, elapsedDays, lastReview: now };

  switch (card.state) {
    case "new": {
      next.difficulty = initDifficulty(rating);
      next.stability = initStability(rating);
      next.reps = 1;

      if (rating === 1) {
        // Again → learning
        next.state = "learning";
        next.scheduledDays = 0;
        next.lapses += 1;
      } else if (rating === 2) {
        // Hard → learning
        next.state = "learning";
        next.scheduledDays = 0;
      } else {
        // Good/Easy → review
        next.state = "review";
        next.scheduledDays = nextInterval(next.stability, desiredRetention);
      }
      break;
    }

    case "learning":
    case "relearning": {
      next.difficulty = nextDifficulty(card.difficulty, rating);
      next.stability = nextShortTermStability(card.stability, rating);
      next.reps = card.reps + 1;

      if (rating === 1) {
        // Again → stay in learning/relearning
        next.scheduledDays = 0;
        if (card.state === "learning") {
          next.lapses += 1;
        }
      } else if (rating === 2) {
        // Hard → stay
        next.scheduledDays = 0;
      } else {
        // Good/Easy → graduate to review
        next.state = "review";
        next.scheduledDays = nextInterval(next.stability, desiredRetention);
      }
      break;
    }

    case "review": {
      const r = computeRetrievability(card, now);
      next.difficulty = nextDifficulty(card.difficulty, rating);
      next.reps = card.reps + 1;

      if (rating === 1) {
        // Again → relearning (lapse)
        next.state = "relearning";
        next.lapses = card.lapses + 1;
        next.stability = nextForgetStability(next.difficulty, card.stability, r);
        next.scheduledDays = 0;
      } else {
        // Hard/Good/Easy → stay in review with updated stability
        next.stability = nextRecallStability(
          next.difficulty,
          card.stability,
          r,
          rating,
        );
        next.scheduledDays = nextInterval(next.stability, desiredRetention);
      }
      break;
    }
  }

  return next;
}

/** Apply type-based interval multiplier: phrases retain longer, sentences even more. */
export function applyTypeIntervalMultiplier(
  scheduledDays: number,
  wordType?: string,
): number {
  const multipliers: Record<string, number> = {
    word: 1.0,
    phrase: 1.3,
    sentence: 1.8,
  };
  const m = multipliers[wordType ?? "word"] ?? 1.0;
  return Math.max(1, Math.round(scheduledDays * m));
}

/** Build an FSRSCard from word document fields. */
export function cardFromWord(word: {
  fsrsStability?: number;
  fsrsDifficulty?: number;
  fsrsElapsedDays?: number;
  fsrsScheduledDays?: number;
  fsrsReps?: number;
  fsrsLapses?: number;
  fsrsState?: FSRSState;
  fsrsLastReview?: number;
}): FSRSCard {
  if (word.fsrsState == null) {
    return initCard();
  }
  return {
    stability: word.fsrsStability ?? 0,
    difficulty: word.fsrsDifficulty ?? 0,
    elapsedDays: word.fsrsElapsedDays ?? 0,
    scheduledDays: word.fsrsScheduledDays ?? 0,
    reps: word.fsrsReps ?? 0,
    lapses: word.fsrsLapses ?? 0,
    state: word.fsrsState,
    lastReview: word.fsrsLastReview ?? 0,
  };
}
