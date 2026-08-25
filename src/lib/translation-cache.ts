// Local cache for AI translations.
//
// Every lookup costs a paid API call, and users re-read the same page and
// re-select the same word constantly. The cache key includes the context
// sentence because the whole point of the AI path is that "bank" translates
// differently by context — a context-free key would serve the wrong sense.

import { getFromStore, putInStore, getAllKeys, deleteFromStore } from "./indexed-db";
import type { AiTranslation, AiSentenceTranslation } from "./openai-translate";

/** Both shapes carry a `translation` string, which is all the cache inspects. */
type Cacheable = AiTranslation | AiSentenceTranslation;

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** Hard cap on stored entries — one lookup can add one, so this grows forever otherwise. */
const MAX_ENTRIES = 2000;
/**
 * Chance that a write also triggers a prune.
 *
 * A "writes since last prune" counter would live in service-worker memory, and
 * MV3 tears that worker down after ~30s idle — with lookups spaced out the
 * counter would reset before ever reaching its threshold, so pruning would
 * effectively never run. Sampling is stateless and survives restarts.
 */
const PRUNE_CHANCE = 0.02;

interface CacheEntry<T extends Cacheable = Cacheable> {
  result: T;
  timestamp: number;
  /** The context this entry was built from, kept to detect hash collisions. */
  context?: string;
}

/**
 * djb2 — deterministic and dependency-free.
 *
 * It is only 32 bits, so distinct contexts can land on the same key. That would
 * serve a translation for the wrong sense of the word, which is exactly the
 * failure this cache exists to avoid. Reads verify the stored context instead of
 * trusting the hash, so a collision costs one extra API call and never a wrong
 * answer.
 */
function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function normalizeContext(sentence: string): string {
  return sentence.trim().toLowerCase();
}

/**
 * Sentence lookups share the store with word lookups, so the key is namespaced.
 * Without the prefix a one-word "sentence" would collide with that word's entry
 * and serve a word-shaped result where the popup expects a sentence-shaped one.
 */
export function sentenceCacheKey(
  sentence: string,
  targetLang: string,
  userLevel: string,
): string {
  return `sent|${hash(normalizeContext(sentence))}|${targetLang}|${userLevel}`;
}

export function translationCacheKey(
  word: string,
  sentence: string,
  targetLang: string,
  userLevel: string,
): string {
  const normalized = normalizeContext(sentence);
  const context = normalized ? hash(normalized) : "nocontext";
  return `${word.toLowerCase()}|${targetLang}|${userLevel}|${context}`;
}

/**
 * IndexedDB hands back whatever was written, including rows from an older
 * schema or a partial write. Without this check a malformed row is returned as
 * if it were a translation and the popup renders blank.
 */
function isUsableEntry(entry: unknown): entry is CacheEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Partial<CacheEntry>;
  if (typeof e.timestamp !== "number" || !Number.isFinite(e.timestamp)) return false;
  if (!e.result || typeof e.result !== "object") return false;
  return typeof (e.result as Cacheable).translation === "string";
}

export async function getCachedTranslation<T extends Cacheable = AiTranslation>(
  key: string,
  sentence = "",
): Promise<T | null> {
  try {
    const entry = await getFromStore<CacheEntry<T>>("translations", key);
    if (!isUsableEntry(entry)) return null;
    if (Date.now() - entry.timestamp > TTL_MS) return null;

    // Treat a hash collision as a miss. Entries written before `context` was
    // stored have no value to compare against, so they are trusted as before.
    if (entry.context !== undefined && entry.context !== normalizeContext(sentence)) {
      return null;
    }

    return entry.result;
  } catch {
    return null;
  }
}

export async function setCachedTranslation<T extends Cacheable>(
  key: string,
  result: T,
  sentence = "",
): Promise<void> {
  try {
    await putInStore<CacheEntry<T>>("translations", key, {
      result,
      timestamp: Date.now(),
      context: normalizeContext(sentence),
    });

    // Awaited, not fire-and-forget: a floating promise in an MV3 worker can be
    // cut off when the message event ends, leaving the prune half-done.
    if (Math.random() < PRUNE_CHANCE) {
      await pruneTranslationCache();
    }
  } catch {
    // A cache write failing must never break the lookup it was speeding up.
  }
}

/**
 * Drops expired entries, then the oldest entries if still over the cap.
 * Reading an expired entry returns null but never removes it, so without this
 * the store grows by one row per distinct (word, context) pair forever.
 */
export async function pruneTranslationCache(): Promise<number> {
  try {
    const keys = await getAllKeys("translations");
    if (keys.length <= MAX_ENTRIES) {
      // Still drop anything already expired, but skip the sort.
      const now = Date.now();
      let dropped = 0;
      for (const k of keys) {
        const entry = await getFromStore<CacheEntry>("translations", k);
        if (entry && now - entry.timestamp > TTL_MS) {
          await deleteFromStore("translations", k);
          dropped++;
        }
      }
      return dropped;
    }

    const entries: { key: string; timestamp: number }[] = [];
    for (const k of keys) {
      const entry = await getFromStore<CacheEntry>("translations", k);
      entries.push({ key: k, timestamp: entry?.timestamp ?? 0 });
    }

    const now = Date.now();
    const fresh = entries.filter((e) => now - e.timestamp <= TTL_MS);
    const expired = entries.filter((e) => now - e.timestamp > TTL_MS);

    fresh.sort((a, b) => a.timestamp - b.timestamp); // oldest first
    const overflow = Math.max(0, fresh.length - MAX_ENTRIES);
    const toDelete = [...expired, ...fresh.slice(0, overflow)];

    for (const e of toDelete) {
      await deleteFromStore("translations", e.key);
    }
    return toDelete.length;
  } catch {
    return 0;
  }
}
