import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { lemmatize } from "../src/lib/lemmatize";

export const list = query({
  args: { deviceId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { deviceId, paginationOpts }) => {
    return await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const stats = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return {
      total: words.length,
      new: words.filter((w) => w.status === "new").length,
      learning: words.filter((w) => w.status === "learning").length,
      known: words.filter((w) => w.status === "known").length,
      needReview: words.filter((w) => {
        if (!w.lastReviewed) return true;
        const interval = w.intervalDays ?? (w.status === "known" ? 7 : 1);
        return now - w.lastReviewed > interval * dayMs;
      }).length,
    };
  },
});

export const getReviewWords = query({
  args: { deviceId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { deviceId, limit }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const scored = words
      .filter((w) => {
        if (!w.lastReviewed) return true;
        const interval = w.intervalDays ?? (w.status === "known" ? 7 : 1);
        return now - w.lastReviewed > interval * dayMs;
      })
      .map((w) => {
        let score = 0;
        if (!w.lastReviewed) {
          score = 1000;
        } else {
          const daysSince = (now - w.lastReviewed) / dayMs;
          const interval = w.intervalDays ?? 1;
          score = ((daysSince - interval) / interval) * 100;
        }
        if (w.status === "new") score += 50;
        if (w.status === "learning") score += 25;
        if (w.isHard) score += 40;
        return { ...w, _score: score };
      })
      .sort((a, b) => b._score - a._score);

    return scored.slice(0, limit ?? 10);
  },
});

export const getWordSet = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    const wordSet: string[] = [];
    for (const w of words) {
      wordSet.push(w.word);
      if (w.lemma) wordSet.push(w.lemma);
    }
    return wordSet;
  },
});

export const getVocabCache = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    const wordList: string[] = [];
    const lemmaList: string[] = [];
    const statuses: Record<string, string> = {};

    for (const w of words) {
      wordList.push(w.word);
      statuses[w.word] = w.status;
      if (w.lemma) {
        lemmaList.push(w.lemma);
        statuses[w.lemma] = w.status;
      }
    }

    return { words: wordList, lemmas: lemmaList, statuses };
  },
});

export const getByLemma = query({
  args: { deviceId: v.string(), lemma: v.string(), word: v.optional(v.string()) },
  handler: async (ctx, { deviceId, lemma, word }) => {
    // Try lemma index first
    let found = await ctx.db
      .query("words")
      .withIndex("by_device_lemma", (q) =>
        q.eq("deviceId", deviceId).eq("lemma", lemma),
      )
      .first();

    // Fallback: try exact word match (handles pre-migration entries without lemma)
    if (!found && word) {
      found = await ctx.db
        .query("words")
        .withIndex("by_device_word", (q) =>
          q.eq("deviceId", deviceId).eq("word", word),
        )
        .first();
    }

    if (!found) return null;

    return {
      _id: found._id,
      word: found.word,
      translation: found.translation,
      status: found.status,
      isHard: found.isHard ?? false,
      contexts: found.contexts ?? [],
      reviewCount: found.reviewCount,
      lastReviewed: found.lastReviewed,
      difficulty: found.difficulty ?? 1.0,
      consecutiveCorrect: found.consecutiveCorrect ?? 0,
      intervalDays: found.intervalDays ?? 1,
    };
  },
});

export const add = mutation({
  args: {
    deviceId: v.string(),
    word: v.string(),
    translation: v.string(),
    example: v.string(),
    sourceUrl: v.string(),
    exampleContext: v.optional(v.array(v.string())),
    exampleSource: v.optional(v.string()),
  },
  handler: async (ctx, { deviceId, word, translation, example, sourceUrl, exampleContext, exampleSource }) => {
    if (word.length > 100)
      throw new Error("Word must be 100 characters or less");
    if (translation.length > 500)
      throw new Error("Translation must be 500 characters or less");
    if (example.length > 1000)
      throw new Error("Example must be 1000 characters or less");
    if (sourceUrl.length > 2000)
      throw new Error("Source URL must be 2000 characters or less");
    if (exampleContext) {
      if (exampleContext.length > 3)
        throw new Error("Example context must have 3 or fewer sentences");
      for (const ctx_ of exampleContext) {
        if (ctx_.length > 300)
          throw new Error("Context sentence must be 300 characters or less");
      }
    }

    const lemma = lemmatize(word);

    // Check duplicate by lemma first (catches "running" when "run" already exists)
    const existingByLemma = await ctx.db
      .query("words")
      .withIndex("by_device_lemma", (q) =>
        q.eq("deviceId", deviceId).eq("lemma", lemma),
      )
      .first();

    if (existingByLemma) {
      const newContext = { sentence: example, url: sourceUrl, timestamp: Date.now() };
      const contexts = [...(existingByLemma.contexts ?? []), newContext].slice(-5);
      await ctx.db.patch(existingByLemma._id, {
        contexts,
        example,
        ...(exampleContext && { exampleContext }),
        ...(exampleSource && { exampleSource }),
      });
      return existingByLemma._id;
    }

    // Fallback: check by exact word for pre-migration words without lemma
    const existing = await ctx.db
      .query("words")
      .withIndex("by_device_word", (q) =>
        q.eq("deviceId", deviceId).eq("word", word.toLowerCase()),
      )
      .first();

    if (existing) {
      const newContext = { sentence: example, url: sourceUrl, timestamp: Date.now() };
      const contexts = [...(existing.contexts ?? []), newContext].slice(-5);
      await ctx.db.patch(existing._id, {
        contexts,
        example,
        ...(!existing.lemma && { lemma }),
        ...(exampleContext && { exampleContext }),
        ...(exampleSource && { exampleSource }),
      });
      return existing._id;
    }

    return await ctx.db.insert("words", {
      deviceId,
      word: word.toLowerCase(),
      translation,
      example,
      sourceUrl,
      addedAt: Date.now(),
      reviewCount: 0,
      consecutiveCorrect: 0,
      intervalDays: 1,
      status: "new",
      difficulty: 1.0,
      forgotCount: 0,
      lemma,
      isHard: false,
      contexts: [{ sentence: example, url: sourceUrl, timestamp: Date.now() }],
      ...(exampleContext && { exampleContext }),
      ...(exampleSource && { exampleSource }),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("words"), deviceId: v.string() },
  handler: async (ctx, { id, deviceId }) => {
    const word = await ctx.db.get(id);
    if (!word) return;
    if (word.deviceId !== deviceId) {
      throw new Error("Unauthorized: word does not belong to this device");
    }
    await ctx.db.delete(id);
  },
});

export const updateReview = mutation({
  args: {
    id: v.id("words"),
    deviceId: v.string(),
    remembered: v.boolean(),
  },
  handler: async (ctx, { id, deviceId, remembered }) => {
    const word = await ctx.db.get(id);
    if (!word) return;
    if (word.deviceId !== deviceId) {
      throw new Error("Unauthorized: word does not belong to this device");
    }

    const SRS_INTERVALS = [1, 3, 7, 14, 30, 90];
    let newStatus = word.status;
    let consecutiveCorrect = word.consecutiveCorrect ?? 0;
    let intervalDays = word.intervalDays ?? 1;
    let difficulty = word.difficulty ?? 1.0;
    let forgotCount = word.forgotCount ?? 0;

    if (remembered) {
      consecutiveCorrect += 1;
      difficulty = Math.max(difficulty - 0.2, 1.0);

      if (word.status === "new") {
        newStatus = "learning";
        intervalDays = SRS_INTERVALS[0];
      } else if (word.status === "learning" && consecutiveCorrect >= 3) {
        newStatus = "known";
        intervalDays = SRS_INTERVALS[2]; // 7 days
      } else if (difficulty >= 2) {
        // Hard words stay at current interval — must prove themselves
      } else {
        const currentIdx = SRS_INTERVALS.indexOf(intervalDays);
        const nextIdx = Math.min(
          (currentIdx === -1 ? 0 : currentIdx) + 1,
          SRS_INTERVALS.length - 1,
        );
        intervalDays = SRS_INTERVALS[nextIdx];
      }
    } else {
      difficulty = Math.min(difficulty + 1.0, 3.0);
      forgotCount += 1;
      consecutiveCorrect = 0;
      intervalDays = SRS_INTERVALS[0];
      if (word.status === "known") {
        newStatus = "learning";
      } else if (word.status === "learning") {
        newStatus = "new";
      }
    }

    await ctx.db.patch(id, {
      lastReviewed: Date.now(),
      reviewCount: word.reviewCount + 1,
      consecutiveCorrect,
      intervalDays,
      status: newStatus,
      difficulty,
      forgotCount,
    });

    return { newStatus, intervalDays };
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("words"),
    deviceId: v.string(),
    status: v.union(v.literal("new"), v.literal("learning"), v.literal("known")),
  },
  handler: async (ctx, { id, deviceId, status }) => {
    const word = await ctx.db.get(id);
    if (!word) return;
    if (word.deviceId !== deviceId) {
      throw new Error("Unauthorized: word does not belong to this device");
    }

    const updates: Record<string, unknown> = { status };
    // Reset progress when manually setting to "new"
    if (status === "new") {
      updates.consecutiveCorrect = 0;
      updates.intervalDays = 1;
      updates.difficulty = 1.0;
    }

    await ctx.db.patch(id, updates);
  },
});

export const search = query({
  args: { deviceId: v.string(), term: v.string() },
  handler: async (ctx, { deviceId, term }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    const lower = term.toLowerCase();
    return words.filter(
      (w) =>
        w.word.includes(lower) || w.translation.toLowerCase().includes(lower),
    );
  },
});

export const getHardWords = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    return words
      .filter((w) => (w.difficulty ?? 1) >= 2 || (w.forgotCount ?? 0) >= 3 || w.isHard === true)
      .sort((a, b) => {
        const diffA = a.difficulty ?? 1;
        const diffB = b.difficulty ?? 1;
        if (diffB !== diffA) return diffB - diffA;
        return (b.forgotCount ?? 0) - (a.forgotCount ?? 0);
      });
  },
});

export const toggleHard = mutation({
  args: { id: v.id("words"), deviceId: v.string() },
  handler: async (ctx, { id, deviceId }) => {
    const word = await ctx.db.get(id);
    if (!word) return;
    if (word.deviceId !== deviceId) {
      throw new Error("Unauthorized: word does not belong to this device");
    }
    await ctx.db.patch(id, { isHard: !(word.isHard ?? false) });
  },
});

export const addContext = mutation({
  args: {
    id: v.id("words"),
    deviceId: v.string(),
    sentence: v.string(),
    url: v.string(),
  },
  handler: async (ctx, { id, deviceId, sentence, url }) => {
    const word = await ctx.db.get(id);
    if (!word) return;
    if (word.deviceId !== deviceId) {
      throw new Error("Unauthorized: word does not belong to this device");
    }
    const existing = word.contexts ?? [];
    if (existing.some((c) => c.sentence === sentence)) {
      return { duplicate: true };
    }
    const newContext = { sentence, url, timestamp: Date.now() };
    const contexts = [...existing, newContext].slice(-5);
    await ctx.db.patch(id, { contexts });
    return { duplicate: false };
  },
});

export const backfillLemmas = mutation({
  args: {},
  handler: async (ctx) => {
    const words = await ctx.db.query("words").collect();
    let updated = 0;
    for (const word of words) {
      if (!word.lemma) {
        await ctx.db.patch(word._id, { lemma: lemmatize(word.word) });
        updated++;
      }
    }
    return { updated };
  },
});

// Export all words for backup
export const getAllForExport = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    
    return words.map((w) => ({
      word: w.word,
      translation: w.translation,
      status: w.status,
      reviewCount: w.reviewCount ?? 0,
      contexts: w.contexts ?? [],
      createdAt: w.addedAt ?? w._creationTime,
    }));
  },
});

// Import a single word (used for batch import)
export const importWord = mutation({
  args: {
    deviceId: v.string(),
    word: v.string(),
    translation: v.string(),
    status: v.optional(v.union(v.literal("new"), v.literal("learning"), v.literal("known"))),
  },
  handler: async (ctx, { deviceId, word, translation, status }) => {
    const lemma = lemmatize(word);
    
    // Check if word already exists
    const existing = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .filter((q) => q.eq(q.field("lemma"), lemma))
      .first();
    
    if (existing) {
      return { imported: false, reason: "exists" };
    }
    
    // Insert new word
    await ctx.db.insert("words", {
      deviceId,
      word: word.toLowerCase(),
      lemma,
      translation,
      example: "",
      status: status ?? "new",
      sourceUrl: "",
      addedAt: Date.now(),
      reviewCount: 0,
      lastReviewed: undefined,
      consecutiveCorrect: 0,
      intervalDays: 1,
      difficulty: 1,
      forgotCount: 0,
      isHard: false,
      contexts: [],
    });
    
    return { imported: true };
  },
});
