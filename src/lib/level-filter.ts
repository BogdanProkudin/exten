import type { FrequencyBand } from "./frequency-list";
import type { UnknownWord } from "./page-analyzer";

export interface LevelConfig {
  priorityBands: FrequencyBand[];
  secondaryBands: FrequencyBand[];
  hiddenBands: FrequencyBand[];
  priorityLabel: string;
}

const LEVEL_CONFIGS: Record<string, LevelConfig> = {
  A2: {
    priorityBands: ["top2k"],
    secondaryBands: ["top5k"],
    hiddenBands: ["top10k", "rare"],
    priorityLabel: "Essential words for your level",
  },
  B1: {
    priorityBands: ["top5k"],
    secondaryBands: ["top2k", "top10k"],
    hiddenBands: ["rare"],
    priorityLabel: "Words to grow your B1 vocabulary",
  },
  B2: {
    priorityBands: ["top10k"],
    secondaryBands: ["top2k", "top5k", "rare"],
    hiddenBands: [],
    priorityLabel: "Advancing to B2 vocabulary",
  },
  C1: {
    priorityBands: ["top10k", "rare"],
    secondaryBands: ["top5k"],
    hiddenBands: ["top2k"],
    priorityLabel: "Advanced vocabulary",
  },
};

export function getConfigForLevel(level: string): LevelConfig {
  return LEVEL_CONFIGS[level] ?? LEVEL_CONFIGS.B1;
}

export function filterAndSortByLevel(
  words: UnknownWord[],
  level: string,
): { priority: UnknownWord[]; secondary: UnknownWord[] } {
  const config = getConfigForLevel(level);
  const prioritySet = new Set(config.priorityBands);
  const secondarySet = new Set(config.secondaryBands);

  const priority: UnknownWord[] = [];
  const secondary: UnknownWord[] = [];

  for (const w of words) {
    if (prioritySet.has(w.frequency)) {
      priority.push(w);
    } else if (secondarySet.has(w.frequency)) {
      secondary.push(w);
    }
    // hidden words are excluded
  }

  // Sort each group by occurrences descending
  priority.sort((a, b) => b.occurrences - a.occurrences);
  secondary.sort((a, b) => b.occurrences - a.occurrences);

  return { priority, secondary };
}

export function getLevelAwareComprehension(
  totalUnique: number,
  unknownWords: UnknownWord[],
  level: string,
): number {
  if (totalUnique === 0) return 100;
  const config = getConfigForLevel(level);
  const relevantBands = new Set([...config.priorityBands, ...config.secondaryBands]);
  const relevantUnknown = unknownWords.filter((w) => relevantBands.has(w.frequency)).length;
  return Math.round(((totalUnique - relevantUnknown) / totalUnique) * 100);
}
