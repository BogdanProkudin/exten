import { lemmatize } from "./lemmatize";
import { getFrequencyBand, BAND_2K, BAND_5K, BAND_10K, type FrequencyBand } from "./frequency-list";

const MAX_CHARS_TO_ANALYZE = 80_000;
const MAX_TEXT_NODES = 2_000;

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "SVG", "MATH", "CODE", "PRE", "KBD",
]);

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "dare", "ought", "used", "it", "its", "this", "that", "these", "those",
  "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your",
  "yours", "he", "him", "his", "she", "her", "hers", "they", "them",
  "their", "theirs", "what", "which", "who", "whom", "whose", "when",
  "where", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "because", "if", "then",
  "also", "about", "up", "out", "into", "over", "after", "before",
  "between", "under", "again", "there", "here", "once", "during",
  "while", "through", "above", "below", "until", "against", "am",
]);

export type CEFRLevel = "A2" | "B1" | "B2" | "C1";

export interface UnknownWord {
  word: string;
  lemma: string;
  frequency: FrequencyBand;
  occurrences: number;
  difficulty: number; // 0-1 scale, calculated from frequency
}

export interface PageAnalysisResult {
  totalUniqueWords: number;
  totalWordTokens: number;
  unknownWords: UnknownWord[];
  knownWordCount: number;
  unknownWordCount: number;
  comprehensionPercent: number;
  difficultyLevel: CEFRLevel;
  analysisTimeMs: number;
  truncated: boolean;
}

export interface VocabCache {
  words: Set<string>;
  lemmas: Set<string>;
}

interface LemmaEntry {
  forms: Set<string>;
  count: number;
}

function extractTokens(): { lemmaMap: Map<string, LemmaEntry>; totalTokens: number; truncated: boolean } {
  const lemmaMap = new Map<string, LemmaEntry>();
  let totalTokens = 0;
  let totalChars = 0;
  let nodeCount = 0;
  let truncated = false;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (nodeCount >= MAX_TEXT_NODES) {
      truncated = true;
      break;
    }

    const parent = node.parentElement;
    if (!parent) continue;
    if (SKIP_TAGS.has(parent.tagName)) continue;

    // Skip hidden elements
    try {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;
    } catch {
      continue;
    }

    const text = node.textContent || "";
    if (totalChars + text.length > MAX_CHARS_TO_ANALYZE) {
      truncated = true;
      break;
    }
    totalChars += text.length;
    nodeCount++;

    const tokens = text.split(/[^a-zA-Z'-]+/);
    for (const token of tokens) {
      // Clean leading/trailing hyphens/apostrophes
      const cleaned = token.replace(/^['-]+|['-]+$/g, "");
      if (cleaned.length < 2 || cleaned.length > 45) continue;
      if (!/^[a-zA-Z]/.test(cleaned)) continue;

      const lower = cleaned.toLowerCase();
      if (STOP_WORDS.has(lower)) continue;

      totalTokens++;
      const lemma = lemmatize(lower);

      const entry = lemmaMap.get(lemma);
      if (entry) {
        entry.forms.add(lower);
        entry.count++;
      } else {
        lemmaMap.set(lemma, { forms: new Set([lower]), count: 1 });
      }
    }
  }

  return { lemmaMap, totalTokens, truncated };
}

function computeDifficulty(lemmaMap: Map<string, LemmaEntry>): CEFRLevel {
  const totalUnique = lemmaMap.size;
  if (totalUnique === 0) return "A2";

  let in2k = 0;
  let in5k = 0;
  let in10k = 0;

  for (const lemma of lemmaMap.keys()) {
    if (BAND_2K.has(lemma)) in2k++;
    else if (BAND_5K.has(lemma)) in5k++;
    else if (BAND_10K.has(lemma)) in10k++;
  }

  const pct2k = in2k / totalUnique;
  const pct5k = (in2k + in5k) / totalUnique;
  const pct10k = (in2k + in5k + in10k) / totalUnique;

  if (pct2k > 0.85) return "A2";
  if (pct5k > 0.70) return "B1";
  if (pct10k > 0.55) return "B2";
  return "C1";
}

export function analyzePageContent(vocabCache: VocabCache): PageAnalysisResult {
  const startTime = performance.now();
  const { lemmaMap, totalTokens, truncated } = extractTokens();

  let knownCount = 0;
  let unknownCount = 0;
  const unknownWords: UnknownWord[] = [];

  for (const [lemma, entry] of lemmaMap) {
    const isKnown =
      vocabCache.lemmas.has(lemma) ||
      [...entry.forms].some((f) => vocabCache.words.has(f));

    if (isKnown) {
      knownCount++;
    } else {
      unknownCount++;
      // Pick the most common surface form
      const sortedForms = [...entry.forms];
      const frequency = getFrequencyBand(lemma);
      // Calculate difficulty: 0-1 scale based on frequency band
      const difficulty = frequency === "rare" ? 1.0 : 
                        frequency === "top10k" ? 0.8 : 
                        frequency === "top5k" ? 0.6 : 
                        frequency === "top2k" ? 0.4 : 0.2;
      
      unknownWords.push({
        word: sortedForms[0],
        lemma,
        frequency,
        occurrences: entry.count,
        difficulty,
      });
    }
  }

  // Sort by occurrences descending, cap at 50
  unknownWords.sort((a, b) => b.occurrences - a.occurrences);
  const capped = unknownWords.slice(0, 50);

  const totalUnique = lemmaMap.size;
  const comprehensionPercent = totalUnique > 0
    ? Math.round((knownCount / totalUnique) * 100)
    : 100;

  return {
    totalUniqueWords: totalUnique,
    totalWordTokens: totalTokens,
    unknownWords: capped,
    knownWordCount: knownCount,
    unknownWordCount: unknownCount,
    comprehensionPercent,
    difficultyLevel: computeDifficulty(lemmaMap),
    analysisTimeMs: Math.round(performance.now() - startTime),
    truncated,
  };
}
