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
}

const CACHE_KEY = "vocabifyEnrichment";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX_ENTRIES = 200;

async function getCache(): Promise<Record<string, CacheEntry>> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    return (result[CACHE_KEY] as Record<string, CacheEntry>) || {};
  } catch {
    return {};
  }
}

async function setCache(cache: Record<string, CacheEntry>): Promise<void> {
  try {
    // Limit cache to CACHE_MAX_ENTRIES, remove oldest when full
    const entries = Object.entries(cache);
    if (entries.length > CACHE_MAX_ENTRIES) {
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      cache = Object.fromEntries(entries.slice(0, CACHE_MAX_ENTRIES));
    }
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch {
    // Silently fail on cache write errors
  }
}

export async function getWordEnrichment(word: string): Promise<WordEnrichment | null> {
  try {
    const normalizedWord = word.toLowerCase().trim();
    if (!normalizedWord || normalizedWord.includes(" ")) return null;

    // 1. Check cache first
    const cache = await getCache();
    const cached = cache[normalizedWord];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    // 2. Fetch from Free Dictionary API and Datamuse API in parallel
    const [dictResult, synResult, antResult] = await Promise.allSettled([
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalizedWord)}`),
      fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(normalizedWord)}&max=5`),
      fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(normalizedWord)}&max=5`),
    ]);

    const enrichment: WordEnrichment = {
      synonyms: [],
      antonyms: [],
      definitions: [],
    };

    // 3. Parse Free Dictionary API response
    if (dictResult.status === "fulfilled" && dictResult.value.ok) {
      try {
        const dictData = await dictResult.value.json();
        if (Array.isArray(dictData) && dictData.length > 0) {
          const entry = dictData[0];

          // Phonetic
          if (entry.phonetic) {
            enrichment.phonetic = entry.phonetic;
          }

          // Phonetic audio
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

          // Meanings: definitions, synonyms, antonyms
          if (Array.isArray(entry.meanings)) {
            for (const meaning of entry.meanings) {
              const partOfSpeech = meaning.partOfSpeech || "unknown";

              // Collect synonyms from meanings
              if (Array.isArray(meaning.synonyms)) {
                for (const syn of meaning.synonyms) {
                  if (enrichment.synonyms.length < 10 && !enrichment.synonyms.includes(syn)) {
                    enrichment.synonyms.push(syn);
                  }
                }
              }

              // Collect antonyms from meanings
              if (Array.isArray(meaning.antonyms)) {
                for (const ant of meaning.antonyms) {
                  if (enrichment.antonyms.length < 10 && !enrichment.antonyms.includes(ant)) {
                    enrichment.antonyms.push(ant);
                  }
                }
              }

              // Collect definitions
              if (Array.isArray(meaning.definitions)) {
                for (const def of meaning.definitions) {
                  if (enrichment.definitions.length < 5) {
                    enrichment.definitions.push({
                      partOfSpeech,
                      definition: def.definition,
                      ...(def.example && { example: def.example }),
                    });
                  }

                  // Also collect synonyms/antonyms from individual definitions
                  if (Array.isArray(def.synonyms)) {
                    for (const syn of def.synonyms) {
                      if (enrichment.synonyms.length < 10 && !enrichment.synonyms.includes(syn)) {
                        enrichment.synonyms.push(syn);
                      }
                    }
                  }
                  if (Array.isArray(def.antonyms)) {
                    for (const ant of def.antonyms) {
                      if (enrichment.antonyms.length < 10 && !enrichment.antonyms.includes(ant)) {
                        enrichment.antonyms.push(ant);
                      }
                    }
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

    // 4. Parse Datamuse synonyms
    if (synResult.status === "fulfilled" && synResult.value.ok) {
      try {
        const synData = await synResult.value.json();
        if (Array.isArray(synData)) {
          for (const item of synData) {
            if (item.word && enrichment.synonyms.length < 10 && !enrichment.synonyms.includes(item.word)) {
              enrichment.synonyms.push(item.word);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // 5. Parse Datamuse antonyms
    if (antResult.status === "fulfilled" && antResult.value.ok) {
      try {
        const antData = await antResult.value.json();
        if (Array.isArray(antData)) {
          for (const item of antData) {
            if (item.word && enrichment.antonyms.length < 10 && !enrichment.antonyms.includes(item.word)) {
              enrichment.antonyms.push(item.word);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // 6. Cache and return
    cache[normalizedWord] = { data: enrichment, timestamp: Date.now() };
    await setCache(cache);

    return enrichment;
  } catch {
    // Never throw
    return null;
  }
}
