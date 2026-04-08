// Local dictionary: 10K most common English words with definitions,
// phonetics, CEFR levels, and common learner mistakes.
// Stored in IndexedDB for instant, offline lookups.

import { getFromStore, putInStore, getAllKeys, bulkPut } from "./indexed-db";

export interface DictEntry {
  word: string;
  definitions: { pos: string; def: string; example?: string }[];
  phonetic?: string;
  commonMistakes?: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
}

export async function lookupLocal(word: string): Promise<DictEntry | null> {
  const normalized = word.toLowerCase().trim();
  if (!normalized) return null;
  return getFromStore<DictEntry>("dictionary", normalized);
}

export async function isPopulated(): Promise<boolean> {
  try {
    const keys = await getAllKeys("dictionary");
    return keys.length > 100; // sanity check
  } catch {
    return false;
  }
}

export async function populateFromAsset(): Promise<void> {
  try {
    const alreadyPopulated = await isPopulated();
    if (alreadyPopulated) return;

    // Fetch the dictionary JSON from extension assets
    const url = chrome.runtime.getURL("data/dictionary-10k.json");
    const response = await fetch(url);
    if (!response.ok) {
      console.warn("[Vocabify] Dictionary asset not found, skipping population");
      return;
    }

    const entries: DictEntry[] = await response.json();
    if (!Array.isArray(entries) || entries.length === 0) return;

    // Bulk insert into IndexedDB
    const pairs: [string, DictEntry][] = entries.map((e) => [
      e.word.toLowerCase(),
      e,
    ]);

    // Insert in chunks to avoid blocking
    const CHUNK_SIZE = 500;
    for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
      await bulkPut("dictionary", pairs.slice(i, i + CHUNK_SIZE));
    }

  } catch (e) {
    console.error("[Vocabify] Failed to populate dictionary:", e);
  }
}
