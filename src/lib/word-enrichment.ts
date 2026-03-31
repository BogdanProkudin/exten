import { getFromStore, putInStore } from "./indexed-db";
import { lookupLocal } from "./local-dictionary";

export interface WordEnrichment {
  synonyms: string[];
  antonyms: string[];
  definitions: { partOfSpeech: string; definition: string; example?: string }[];
  phonetic?: string;
  phoneticAudio?: string;
}

interface CacheEntry {
  data: WordEnrichment;
  timestamp: number;
  version?: number;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const ENRICHMENT_CACHE_VERSION = 2;
const DATAMUSE_MIN_SCORE = 1000;

export async function getWordEnrichment(word: string): Promise<WordEnrichment | null> {
  try {
    const normalizedWord = word.toLowerCase().trim();
    if (!normalizedWord || normalizedWord.includes(" ")) return null;

    // 1. Check IndexedDB enrichment cache
    const cached = await getFromStore<CacheEntry>("enrichment", normalizedWord);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.version === ENRICHMENT_CACHE_VERSION) {
      return cached.data;
    }

    // 2. Check local dictionary (10K common words) for definitions/phonetics
    const localEntry = await lookupLocal(normalizedWord);

    // 3. Fetch from Free Dictionary API (skip if local dict has data) and Datamuse API in parallel
    const fetchPromises: [Promise<Response>, Promise<Response>, Promise<Response>] = [
      localEntry
        ? Promise.reject("skip") as unknown as Promise<Response>
        : fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`),
      fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(normalizedWord)}&max=5`),
      fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(normalizedWord)}&max=5`),
    ];
    const [dictResult, synResult, antResult] = await Promise.allSettled(fetchPromises);

    const enrichment: WordEnrichment = {
      synonyms: [],
      antonyms: [],
      definitions: localEntry
        ? localEntry.definitions.map((d) => ({
            partOfSpeech: d.pos,
            definition: d.def,
            example: d.example,
          }))
        : [],
      phonetic: localEntry?.phonetic,
    };

    // 4. Parse Free Dictionary API response (only for definitions/phonetics, NOT synonyms)
    if (dictResult.status === "fulfilled" && dictResult.value.ok) {
      try {
        const dictData = await dictResult.value.json();
        if (Array.isArray(dictData) && dictData.length > 0) {
          const entry = dictData[0];

          if (entry.phonetic) {
            enrichment.phonetic = entry.phonetic;
          }

          if (Array.isArray(entry.phonetics)) {
            for (const p of entry.phonetics) {
              if (p.audio) {
                enrichment.phoneticAudio = p.audio;
                break;
              }
              if (!enrichment.phonetic && p.text) {
                enrichment.phonetic = p.text;
              }
            }
          }

          if (Array.isArray(entry.meanings)) {
            for (const meaning of entry.meanings) {
              const partOfSpeech = meaning.partOfSpeech || "unknown";

              // NOTE: We intentionally skip Free Dictionary synonyms/antonyms here.
              // They are WordNet-derived and include loose hypernyms/related words
              // that create spurious edges in the Word Map. Datamuse rel_syn/rel_ant
              // with score filtering is the sole source for synonyms/antonyms.

              if (Array.isArray(meaning.definitions)) {
                for (const def of meaning.definitions) {
                  if (enrichment.definitions.length < 5) {
                    enrichment.definitions.push({
                      partOfSpeech,
                      definition: def.definition,
                      ...(def.example && { example: def.example }),
                    });
                  }
                }
              }
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // 5. Parse Datamuse synonyms (with score filtering)
    if (synResult.status === "fulfilled" && synResult.value.ok) {
      try {
        const synData = await synResult.value.json();
        if (Array.isArray(synData)) {
          for (const item of synData) {
            if (
              item.word &&
              (item.score ?? 0) >= DATAMUSE_MIN_SCORE &&
              enrichment.synonyms.length < 10 &&
              !enrichment.synonyms.includes(item.word)
            ) {
              enrichment.synonyms.push(item.word);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // 6. Parse Datamuse antonyms (with score filtering)
    if (antResult.status === "fulfilled" && antResult.value.ok) {
      try {
        const antData = await antResult.value.json();
        if (Array.isArray(antData)) {
          for (const item of antData) {
            if (
              item.word &&
              (item.score ?? 0) >= DATAMUSE_MIN_SCORE &&
              enrichment.antonyms.length < 10 &&
              !enrichment.antonyms.includes(item.word)
            ) {
              enrichment.antonyms.push(item.word);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // 7. Cache in IndexedDB (no size limit unlike chrome.storage.local)
    await putInStore("enrichment", normalizedWord, {
      data: enrichment,
      timestamp: Date.now(),
      version: ENRICHMENT_CACHE_VERSION,
    });

    return enrichment;
  } catch {
    return null;
  }
}

/** Batch enrichment for multiple words (used by Word Map). */
export async function getEnrichmentBatch(
  words: string[],
): Promise<Map<string, WordEnrichment>> {
  const results = new Map<string, WordEnrichment>();
  // Fetch in parallel, max 5 concurrent
  const CONCURRENCY = 5;
  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const batch = words.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (w) => {
        const enrichment = await getWordEnrichment(w);
        if (enrichment) results.set(w.toLowerCase(), enrichment);
      }),
    );
  }
  return results;
}
