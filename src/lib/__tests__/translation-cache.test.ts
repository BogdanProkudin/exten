import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for IndexedDB, which does not exist under vitest's node
// environment. The logic under test is the read path (TTL, collision check),
// not the storage engine.
const store = new Map<string, unknown>();

vi.mock('../indexed-db', () => ({
  getFromStore: async (_s: string, key: string) => store.get(key) ?? null,
  putInStore: async (_s: string, key: string, value: unknown) => { store.set(key, value); },
  getAllKeys: async () => [...store.keys()],
  deleteFromStore: async (_s: string, key: string) => { store.delete(key); },
}));

const {
  translationCacheKey,
  getCachedTranslation,
  setCachedTranslation,
  pruneTranslationCache,
} = await import('../translation-cache');

const TRANSLATION = {
  word: 'bank',
  translation: 'берег',
  alternatives: [],
  partOfSpeech: 'noun',
  contextMeaning: '',
  example: '',
  exampleTranslation: '',
  isEnglish: true,
};

beforeEach(() => {
  store.clear();
  vi.useRealTimers();
});

// The cache key decides whether a paid API call is skipped. Two different
// lookups colliding means the user is shown a translation for the wrong sense;
// the same lookup missing means they are billed twice.

const LANG = 'ru';
const LEVEL = 'B1';

describe('translationCacheKey', () => {
  it('is stable for identical input', () => {
    const a = translationCacheKey('bank', 'By the river bank.', LANG, LEVEL);
    const b = translationCacheKey('bank', 'By the river bank.', LANG, LEVEL);
    expect(a).toBe(b);
  });

  it('separates different senses of the same word', () => {
    const river = translationCacheKey('bank', 'They sat on the river bank.', LANG, LEVEL);
    const money = translationCacheKey('bank', 'The bank raised rates.', LANG, LEVEL);
    expect(river).not.toBe(money);
  });

  it('separates target languages', () => {
    const ru = translationCacheKey('bank', 'ctx', 'ru', LEVEL);
    const uk = translationCacheKey('bank', 'ctx', 'uk', LEVEL);
    expect(ru).not.toBe(uk);
  });

  it('separates learner levels', () => {
    const b1 = translationCacheKey('bank', 'ctx', LANG, 'B1');
    const c1 = translationCacheKey('bank', 'ctx', LANG, 'C1');
    expect(b1).not.toBe(c1);
  });

  it('is case-insensitive on the word', () => {
    const lower = translationCacheKey('bank', 'ctx', LANG, LEVEL);
    const upper = translationCacheKey('BANK', 'ctx', LANG, LEVEL);
    expect(lower).toBe(upper);
  });

  it('is case-insensitive and whitespace-insensitive on the context', () => {
    const a = translationCacheKey('bank', 'The River Bank.', LANG, LEVEL);
    const b = translationCacheKey('bank', '  the river bank.  ', LANG, LEVEL);
    expect(a).toBe(b);
  });

  it('uses a distinct marker when there is no context', () => {
    const none = translationCacheKey('bank', '', LANG, LEVEL);
    const blank = translationCacheKey('bank', '   \n\t ', LANG, LEVEL);
    expect(none).toBe(blank);
    expect(none).toContain('nocontext');
  });

  it('does not confuse no-context with a context that hashes oddly', () => {
    const none = translationCacheKey('bank', '', LANG, LEVEL);
    const some = translationCacheKey('bank', 'a', LANG, LEVEL);
    expect(none).not.toBe(some);
  });

  it('keeps the word readable in the key for debugging', () => {
    expect(translationCacheKey('serendipity', 'ctx', LANG, LEVEL)).toContain('serendipity');
  });

  it('separates words whose keys could otherwise run together', () => {
    // "a|b" and "a" + "|b" must not collapse into the same string.
    const a = translationCacheKey('a|b', 'ctx', LANG, LEVEL);
    const b = translationCacheKey('a', 'b|ctx', LANG, LEVEL);
    expect(a).not.toBe(b);
  });
});

describe('translationCacheKey — collision stress', () => {
  it('produces no collisions across 20k distinct contexts', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      keys.add(translationCacheKey('bank', `context number ${i}`, LANG, LEVEL));
    }
    expect(keys.size).toBe(20_000);
  });

  it('produces no collisions across 5k words x 4 languages', () => {
    const langs = ['ru', 'uk', 'es', 'de'];
    const keys = new Set<string>();
    for (let i = 0; i < 5_000; i++) {
      for (const lang of langs) {
        keys.add(translationCacheKey(`word${i}`, 'shared context', lang, LEVEL));
      }
    }
    expect(keys.size).toBe(20_000);
  });

  it('handles a very long context without hanging', () => {
    const huge = 'lorem ipsum '.repeat(50_000); // ~600KB
    const start = performance.now();
    const key = translationCacheKey('bank', huge, LANG, LEVEL);
    expect(performance.now() - start).toBeLessThan(200);
    expect(key.length).toBeLessThan(120); // the hash keeps the key short
  });

  it('handles unicode context without throwing', () => {
    expect(() => translationCacheKey('bank', '👋 привет 世界 🚀', LANG, LEVEL)).not.toThrow();
    const a = translationCacheKey('bank', '👋 привет', LANG, LEVEL);
    const b = translationCacheKey('bank', '👋 привіт', LANG, LEVEL);
    expect(a).not.toBe(b);
  });
});

describe('cache read path', () => {
  it('round-trips a stored translation', async () => {
    const key = translationCacheKey('bank', 'river ctx', LANG, LEVEL);
    await setCachedTranslation(key, TRANSLATION, 'river ctx');

    expect(await getCachedTranslation(key, 'river ctx')).toEqual(TRANSLATION);
  });

  it('misses on an empty store', async () => {
    expect(await getCachedTranslation('nothing-here', '')).toBeNull();
  });

  it('treats an entry past its TTL as a miss', async () => {
    const key = translationCacheKey('bank', 'ctx', LANG, LEVEL);
    await setCachedTranslation(key, TRANSLATION, 'ctx');

    const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + THIRTY_ONE_DAYS);
    expect(await getCachedTranslation(key, 'ctx')).toBeNull();
    vi.restoreAllMocks();
  });

  it('rejects a hash collision rather than serving the wrong sense', async () => {
    // Force a collision: write under a key, then read with a different context.
    const key = translationCacheKey('bank', 'the river bank', LANG, LEVEL);
    await setCachedTranslation(key, TRANSLATION, 'the river bank');

    expect(await getCachedTranslation(key, 'the river bank')).toEqual(TRANSLATION);
    expect(await getCachedTranslation(key, 'the central bank raised rates')).toBeNull();
  });

  it('ignores case and surrounding whitespace when verifying context', async () => {
    const key = translationCacheKey('bank', 'The River Bank', LANG, LEVEL);
    await setCachedTranslation(key, TRANSLATION, 'The River Bank');

    expect(await getCachedTranslation(key, '  the river bank  ')).toEqual(TRANSLATION);
  });

  it('still serves legacy entries written before context was stored', async () => {
    const key = translationCacheKey('bank', 'ctx', LANG, LEVEL);
    store.set(key, { result: TRANSLATION, timestamp: Date.now() }); // no `context`

    expect(await getCachedTranslation(key, 'ctx')).toEqual(TRANSLATION);
  });

  it('survives a corrupt entry without throwing', async () => {
    store.set('bad', { nonsense: true });
    await expect(getCachedTranslation('bad', '')).resolves.toBeNull();
  });
});

describe('cache pruning', () => {
  it('drops expired entries and keeps fresh ones', async () => {
    const now = Date.now();
    const OLD = now - 40 * 24 * 60 * 60 * 1000;

    store.set('fresh', { result: TRANSLATION, timestamp: now, context: '' });
    store.set('stale', { result: TRANSLATION, timestamp: OLD, context: '' });

    const dropped = await pruneTranslationCache();

    expect(dropped).toBe(1);
    expect(store.has('fresh')).toBe(true);
    expect(store.has('stale')).toBe(false);
  });

  it('evicts the oldest entries once over the cap', async () => {
    const now = Date.now();
    for (let i = 0; i < 2100; i++) {
      store.set(`k${i}`, { result: TRANSLATION, timestamp: now - i, context: '' });
    }

    await pruneTranslationCache();

    expect(store.size).toBe(2000);
    // Newest survive, oldest are gone.
    expect(store.has('k0')).toBe(true);
    expect(store.has('k2099')).toBe(false);
  });

  it('is a no-op on an empty store', async () => {
    await expect(pruneTranslationCache()).resolves.toBe(0);
  });
});
