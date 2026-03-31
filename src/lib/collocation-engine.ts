// Collocation engine: finds and discovers word pairings.
// Static data comes from phrase-detector.ts, dynamic from Datamuse API.

import { getFromStore, putInStore } from "./indexed-db";

export interface CollocationMatch {
  collocation: string;
  category: string;
  level?: string;
  source: "static" | "discovered";
}

interface CachedCollocations {
  matches: CollocationMatch[];
  timestamp: number;
}

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

// Rate limiting: at most one batch of Datamuse requests per 2 seconds
let lastBatchTime = 0;
const BATCH_INTERVAL = 2000;

// Import static data from phrase-detector
import { COLLOCATION_META, getAllCollocationsForWord } from "./phrase-detector";

export function getCollocationsForWord(word: string): CollocationMatch[] {
  const lower = word.toLowerCase().trim();
  const results: CollocationMatch[] = [];

  // 1. Static collocations from phrase-detector
  const staticMatches = getAllCollocationsForWord(lower);
  for (const match of staticMatches) {
    const meta = COLLOCATION_META.get(match);
    results.push({
      collocation: match,
      category: meta?.category ?? "general",
      level: meta?.level,
      source: "static",
    });
  }

  return results;
}

export async function getCollocationsWithCache(word: string): Promise<CollocationMatch[]> {
  const lower = word.toLowerCase().trim();
  const results = getCollocationsForWord(lower);

  // Check IndexedDB for discovered collocations
  const cached = await getFromStore<CachedCollocations>("collocations", lower);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Add discovered ones that aren't already in static results
    const existing = new Set(results.map(r => r.collocation));
    for (const match of cached.matches) {
      if (!existing.has(match.collocation)) {
        results.push(match);
      }
    }
  }

  return results;
}

export async function discoverCollocations(word: string): Promise<CollocationMatch[]> {
  const lower = word.toLowerCase().trim();
  if (!lower || lower.includes(" ")) return [];

  // Throttle API calls
  const now = Date.now();
  if (now - lastBatchTime < BATCH_INTERVAL) return [];
  lastBatchTime = now;

  const discovered: CollocationMatch[] = [];

  try {
    // Query Datamuse for collocations
    const [adjForNoun, nounForAdj, leftContext] = await Promise.allSettled([
      fetch(`https://api.datamuse.com/words?rel_jjb=${encodeURIComponent(lower)}&max=5`).then(r => r.json()),
      fetch(`https://api.datamuse.com/words?rel_jja=${encodeURIComponent(lower)}&max=5`).then(r => r.json()),
      fetch(`https://api.datamuse.com/words?lc=${encodeURIComponent(lower)}&max=5`).then(r => r.json()),
    ]);

    // Adjectives that describe this noun
    if (adjForNoun.status === "fulfilled" && Array.isArray(adjForNoun.value)) {
      for (const item of adjForNoun.value.slice(0, 3)) {
        if (item.word) {
          discovered.push({
            collocation: `${item.word} ${lower}`,
            category: "adjective + noun",
            source: "discovered",
          });
        }
      }
    }

    // Nouns described by this adjective
    if (nounForAdj.status === "fulfilled" && Array.isArray(nounForAdj.value)) {
      for (const item of nounForAdj.value.slice(0, 3)) {
        if (item.word) {
          discovered.push({
            collocation: `${lower} ${item.word}`,
            category: "adjective + noun",
            source: "discovered",
          });
        }
      }
    }

    // Left context (what commonly comes before this word)
    if (leftContext.status === "fulfilled" && Array.isArray(leftContext.value)) {
      for (const item of leftContext.value.slice(0, 3)) {
        if (item.word) {
          discovered.push({
            collocation: `${item.word} ${lower}`,
            category: "common pairing",
            source: "discovered",
          });
        }
      }
    }
    // Log rejected promises for debugging
    if (adjForNoun.status === "rejected") console.warn("[Vocabify] Datamuse adjForNoun failed:", adjForNoun.reason);
    if (nounForAdj.status === "rejected") console.warn("[Vocabify] Datamuse nounForAdj failed:", nounForAdj.reason);
    if (leftContext.status === "rejected") console.warn("[Vocabify] Datamuse leftContext failed:", leftContext.reason);
  } catch (e) {
    console.warn("[Vocabify] Datamuse API error:", e);
  }

  // Cache in IndexedDB
  if (discovered.length > 0) {
    await putInStore("collocations", lower, {
      matches: discovered,
      timestamp: Date.now(),
    });
  }

  return discovered;
}
