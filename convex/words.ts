import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { lemmatize } from "../src/lib/lemmatize";
import {
  initCard,
  computeRetrievability,
  mapBooleanToRating,
  scheduleCard,
  cardFromWord,
  applyTypeIntervalMultiplier,
  type FSRSCard,
  type FSRSRating,
  type FSRSState,
} from "../src/lib/fsrs";

function inferType(text: string): "word" | "phrase" | "sentence" {
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount === 1) return "word";
  if (wordCount >= 5 || /[.!?,;:'"()]/.test(text)) return "sentence";
  return "phrase";
}

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
      byType: {
        words: words.filter((w) => (w.type ?? inferType(w.word)) === "word").length,
        phrases: words.filter((w) => (w.type ?? inferType(w.word)) === "phrase").length,
        sentences: words.filter((w) => (w.type ?? inferType(w.word)) === "sentence").length,
        // Per-type status breakdowns for filtered views
        wordsLearning: words.filter((w) => (w.type ?? inferType(w.word)) !== "sentence" && w.status === "learning").length,
        wordsKnown: words.filter((w) => (w.type ?? inferType(w.word)) !== "sentence" && w.status === "known").length,
        sentencesLearning: words.filter((w) => (w.type ?? inferType(w.word)) === "sentence" && w.status === "learning").length,
        sentencesKnown: words.filter((w) => (w.type ?? inferType(w.word)) === "sentence" && w.status === "known").length,
      },
    };
  },
});

export const getReviewWords = query({
  args: {
    deviceId: v.string(),
    limit: v.optional(v.number()),
    recentlyShownIds: v.optional(v.array(v.string())),
    typeFilter: v.optional(v.array(v.string())),
    excludeIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { deviceId, limit, recentlyShownIds, typeFilter, excludeIds }) => {
    const allWords = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    // Filter by type if specified
    let words = typeFilter
      ? allWords.filter((w) => typeFilter.includes(w.type ?? inferType(w.word)))
      : allWords;

    // Hard-exclude words already reviewed this page session
    if (excludeIds && excludeIds.length > 0) {
      const excludeSet = new Set(excludeIds);
      words = words.filter((w) => !excludeSet.has(w._id));
    }

    if (words.length === 0) return [];

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const recentSet = new Set(recentlyShownIds ?? []);

    // Filter to words that are actually due for review
    const dueWords = words.filter((w) => {
      // Recently saved words (< 30 min, never reviewed) are always eligible
      const minutesSinceSaved = (now - w.addedAt) / (60 * 1000);
      if (minutesSinceSaved < 30 && w.reviewCount === 0) return true;

      if (w.fsrsState != null) {
        // New words are always due
        if (w.fsrsState === "new") return true;
        // Learning/relearning: always eligible (FSRS handles scheduling)
        if (w.fsrsState === "learning" || w.fsrsState === "relearning") {
          return true;
        }
        // Review state: check if past scheduled review date
        const dueTime = (w.fsrsLastReview ?? 0) + (w.fsrsScheduledDays ?? 0) * dayMs;
        return now >= dueTime;
      } else {
        // Legacy path
        if (!w.lastReviewed) return true;
        const dueTime = w.lastReviewed + (w.intervalDays ?? 1) * dayMs;
        return now >= dueTime;
      }
    });

    // Score due words by priority
    const scored = dueWords.map((w) => {
      let score = 0;

      if (w.fsrsState != null) {
        if (w.fsrsState === "new") {
          score = 200;
        } else if (w.fsrsState === "learning" || w.fsrsState === "relearning") {
          score = 500;
        } else {
          const card = cardFromWord(w);
          const R = computeRetrievability(card, now);
          score = (1 - R) * 100;
          if (R < 0.9) score += 100;
        }
      } else {
        if (!w.lastReviewed) {
          score = 200;
        } else {
          const daysSince = (now - w.lastReviewed) / dayMs;
          const interval = w.intervalDays ?? 1;
          const overdueRatio = (daysSince - interval) / interval;
          score = overdueRatio > 0 ? overdueRatio * 100 + 100 : Math.max(1, 50 + overdueRatio * 50);
        }
        if (w.status === "new") score += 50;
        if (w.status === "learning") score += 25;
      }

      if (w.isHard) score += 30;

      // Recently saved bonus
      const minutesSinceSaved = (now - w.addedAt) / (60 * 1000);
      if (minutesSinceSaved < 30 && w.reviewCount === 0) {
        score += Math.round(400 * (1 - minutesSinceSaved / 30));
      }

      // Anti-repetition penalty
      if (recentSet.has(w._id.toString())) {
        score -= 500;
      }

      return { ...w, _score: score };
    });

    // Sort by score, highest first
    scored.sort((a, b) => b._score - a._score);

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
    type: v.optional(v.union(v.literal("word"), v.literal("phrase"), v.literal("sentence"))),
  },
  handler: async (ctx, { deviceId, word, translation, example, sourceUrl, exampleContext, exampleSource, type }) => {
    if (word.length > 300)
      throw new Error("Word must be 300 characters or less");
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

    const lemma = word.includes(" ") ? word.toLowerCase() : lemmatize(word);

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

    const id = await ctx.db.insert("words", {
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
      fsrsState: "new",
      ...(exampleContext && { exampleContext }),
      ...(exampleSource && { exampleSource }),
      type: type ?? inferType(word),
    });

    // Track daily progress
    await ctx.runMutation(internal.gamification.incrementDailyProgress, {
      deviceId,
      type: "save",
    });

    return id;
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

export const removeBatch = mutation({
  args: { ids: v.array(v.id("words")), deviceId: v.string() },
  handler: async (ctx, { ids, deviceId }) => {
    let deleted = 0;
    for (const id of ids) {
      const word = await ctx.db.get(id);
      if (!word || word.deviceId !== deviceId) continue;
      await ctx.db.delete(id);
      deleted++;
    }
    return { deleted };
  },
});

export const updateReview = mutation({
  args: {
    id: v.id("words"),
    deviceId: v.string(),
    remembered: v.optional(v.boolean()),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, { id, deviceId, remembered, rating: rawRating }) => {
    const word = await ctx.db.get(id);
    if (!word) return;
    if (word.deviceId !== deviceId) {
      throw new Error("Unauthorized: word does not belong to this device");
    }

    const now = Date.now();
    // Determine FSRS rating: explicit rating takes priority, else derive from boolean
    const rating: FSRSRating = rawRating != null
      ? (Math.max(1, Math.min(4, Math.round(rawRating))) as FSRSRating)
      : mapBooleanToRating(remembered ?? false);
    // Derive remembered boolean for legacy fields
    const remembered_ = rating >= 3;

    // Get desired retention from user stats
    const userStats = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    const desiredRetention = userStats?.desiredRetention ?? 0.9;

    // Build FSRS card from current state (or init if no FSRS data yet)
    const card = cardFromWord(word);
    const newCard = scheduleCard(card, rating, now, desiredRetention);

    // Apply type-based interval multiplier
    if (newCard.scheduledDays > 0) {
      newCard.scheduledDays = applyTypeIntervalMultiplier(newCard.scheduledDays, word.type);
    }

    // Map FSRS state to legacy status for backward compat
    const fsrsToStatus: Record<FSRSState, "new" | "learning" | "known"> = {
      new: "new",
      learning: "learning",
      relearning: "learning",
      review: "known",
    };
    const newStatus = fsrsToStatus[newCard.state];

    // Update legacy fields alongside FSRS fields
    let consecutiveCorrect = word.consecutiveCorrect ?? 0;
    let difficulty = word.difficulty ?? 1.0;
    let forgotCount = word.forgotCount ?? 0;

    if (remembered_) {
      consecutiveCorrect += 1;
      difficulty = Math.max(difficulty - 0.2, 1.0);
    } else {
      difficulty = Math.min(difficulty + 1.0, 3.0);
      forgotCount += 1;
      consecutiveCorrect = 0;
    }

    await ctx.db.patch(id, {
      lastReviewed: now,
      reviewCount: word.reviewCount + 1,
      consecutiveCorrect,
      intervalDays: newCard.scheduledDays,
      status: newStatus,
      difficulty,
      forgotCount,
      // FSRS fields
      fsrsStability: newCard.stability,
      fsrsDifficulty: newCard.difficulty,
      fsrsElapsedDays: newCard.elapsedDays,
      fsrsScheduledDays: newCard.scheduledDays,
      fsrsReps: newCard.reps,
      fsrsLapses: newCard.lapses,
      fsrsState: newCard.state,
      fsrsLastReview: now,
    });

    // Track daily progress
    await ctx.runMutation(internal.gamification.incrementDailyProgress, {
      deviceId,
      type: "review",
    });

    const retrievability = computeRetrievability(newCard, now);
    return { newStatus, intervalDays: newCard.scheduledDays, retrievability };
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
      .filter((w) => {
        // FSRS path: difficulty >= 7 on 1-10 scale
        if (w.fsrsDifficulty != null) {
          return w.fsrsDifficulty >= 7 || (w.forgotCount ?? 0) >= 3 || w.isHard === true;
        }
        // Legacy path
        return (w.difficulty ?? 1) >= 2 || (w.forgotCount ?? 0) >= 3 || w.isHard === true;
      })
      .sort((a, b) => {
        // Sort by FSRS difficulty when available, else legacy
        const diffA = a.fsrsDifficulty ?? ((a.difficulty ?? 1) - 1) / 2 * 9 + 1;
        const diffB = b.fsrsDifficulty ?? ((b.difficulty ?? 1) - 1) / 2 * 9 + 1;
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

export const backfillLemmas = internalMutation({
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
      type: w.type ?? inferType(w.word),
      reviewCount: w.reviewCount ?? 0,
      contexts: w.contexts ?? [],
      createdAt: w.addedAt ?? w._creationTime,
    }));
  },
});

// Get word of the day - prioritizes words that need review
export const getWordOfTheDay = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    
    if (words.length === 0) return null;
    
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Calculate a deterministic "random" based on date
    const today = Math.floor(now / dayMs);
    const seed = today % words.length;
    
    // Score words by need for review (higher = needs more practice)
    const scoredWords = words.map((w) => {
      let strength: number;
      let score: number;

      if (w.fsrsState != null && w.fsrsLastReview) {
        // FSRS path: strength = retrievability × 100
        const card = cardFromWord(w);
        const R = computeRetrievability(card, now);
        strength = Math.round(R * 100);
        score = (1 - R) + (w.isHard ? 2 : 0);
      } else {
        // Legacy path — canonical formula from src/lib/memory-strength.ts
        const intervalDays = w.intervalDays ?? 1;
        const consecutiveCorrect = w.consecutiveCorrect ?? 0;
        const forgotCount = w.forgotCount ?? 0;
        const lastReviewed = w.lastReviewed;

        const intervalScore = Math.min(40, (Math.log2(intervalDays + 1) / Math.log2(91)) * 40);
        const streakScore = Math.min(25, consecutiveCorrect * 5);
        const forgetPenalty = Math.min(25, forgotCount * 5);

        let recencyScore = 0;
        if (lastReviewed) {
          const daysSinceReview = (now - lastReviewed) / dayMs;
          recencyScore = Math.max(0, 20 * (1 - daysSinceReview / 30));
        }

        const statusBonus = w.status === "known" ? 15 : w.status === "learning" ? 5 : 0;
        strength = Math.round(Math.max(0, Math.min(100, intervalScore + streakScore - forgetPenalty + recencyScore + statusBonus)));

        // Score for word-of-day selection (higher = needs more practice)
        const daysSinceReview = lastReviewed ? (now - lastReviewed) / dayMs : 30;
        const overdue = daysSinceReview / intervalDays;
        score = overdue + (w.difficulty || 1) + (w.isHard ? 2 : 0);
      }

      return {
        word: w,
        score,
        strength: Math.round(strength),
      };
    });
    
    // Sort by score (highest = most needs practice) and pick based on seed
    scoredWords.sort((a, b) => b.score - a.score);
    const topCandidates = scoredWords.slice(0, Math.max(5, Math.floor(words.length * 0.3)));
    const selected = topCandidates[seed % topCandidates.length];
    
    return {
      word: selected.word.word,
      translation: selected.word.translation,
      example: selected.word.example || null,
      strength: selected.strength,
      reviewCount: selected.word.reviewCount || 0,
    };
  },
});

// Get words for quiz mode
export const getQuizWords = query({
  args: {
    deviceId: v.string(),
    limit: v.optional(v.number()),
    typeFilter: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { deviceId, limit, typeFilter }) => {
    const allWords = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    // Filter to words that have translations, use deterministic "shuffle" based on word hash
    const validWords = allWords
      .filter((w) => {
        if (!w.word || !w.translation) return false;
        if (typeFilter) return typeFilter.includes(w.type ?? inferType(w.word));
        return true;
      })
      .sort((a, b) => {
        // Deterministic pseudo-shuffle: hash-based ordering using creation time + word
        const hashA = (a._creationTime * 31 + a.word.charCodeAt(0)) % 1000;
        const hashB = (b._creationTime * 31 + b.word.charCodeAt(0)) % 1000;
        return hashA - hashB;
      })
      .slice(0, limit || 50);

    return validWords.map((w) => ({
      _id: w._id,
      word: w.word,
      translation: w.translation,
      type: w.type ?? inferType(w.word),
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
    type: v.optional(v.union(v.literal("word"), v.literal("phrase"), v.literal("sentence"))),
  },
  handler: async (ctx, { deviceId, word, translation, status, type }) => {
    const lemma = word.includes(" ") ? word.toLowerCase() : lemmatize(word);

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
      type: type ?? inferType(word),
    });

    return { imported: true };
  },
});

// Backfill FSRS fields for existing words (one-time migration)
export const backfillFSRS = internalMutation({
  args: {},
  handler: async (ctx) => {
    const words = await ctx.db.query("words").collect();
    let updated = 0;
    for (const word of words) {
      if (word.fsrsState != null) continue; // Already has FSRS data

      // Map legacy difficulty (1-3) to FSRS difficulty (1-10)
      const legacyDiff = word.difficulty ?? 1;
      const fsrsDifficulty = ((legacyDiff - 1) / 2) * 9 + 1;

      // Map legacy status to FSRS state
      let fsrsState: FSRSState;
      if (word.status === "known") {
        fsrsState = "review";
      } else if (word.status === "learning") {
        fsrsState = "learning";
      } else {
        fsrsState = "new";
      }

      await ctx.db.patch(word._id, {
        fsrsDifficulty,
        fsrsStability: word.intervalDays ?? 1,
        fsrsReps: word.reviewCount ?? 0,
        fsrsLapses: word.forgotCount ?? 0,
        fsrsState,
        fsrsLastReview: word.lastReviewed,
        fsrsElapsedDays: 0,
        fsrsScheduledDays: word.intervalDays ?? 0,
      });
      updated++;
    }
    return { updated };
  },
});

// Backfill type field for existing words (one-time migration)
export const backfillTypes = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    let updated = 0;

    for (const word of words) {
      if (word.type != null) continue; // Already typed

      await ctx.db.patch(word._id, { type: inferType(word.word) });
      updated++;
    }
    return { updated };
  },
});

// Get words suitable for writing prompts
export const getWritingPromptWords = query({
  args: { deviceId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { deviceId, limit }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    const now = Date.now();
    const maxWords = limit ?? 5;

    const candidates = words
      .filter((w) => {
        // Words in learning or review state with at least 1 context
        const hasContext = (w.contexts && w.contexts.length > 0) || !!w.example;
        const inLearning =
          w.fsrsState === "learning" ||
          w.fsrsState === "review" ||
          w.fsrsState === "relearning" ||
          w.status === "learning" ||
          w.status === "known";
        return hasContext && inLearning;
      })
      .map((w) => {
        let retrievability = 0.5;
        if (w.fsrsState != null && w.fsrsLastReview) {
          const card = cardFromWord(w);
          retrievability = computeRetrievability(card, now);
        }
        return { ...w, retrievability };
      })
      // Sort by retrievability ascending (practice what you're about to forget)
      .sort((a, b) => a.retrievability - b.retrievability);

    return candidates.slice(0, maxWords).map((w) => ({
      _id: w._id,
      word: w.word,
      translation: w.translation,
      contexts: w.contexts ?? [],
      example: w.example,
      retrievability: w.retrievability,
    }));
  },
});
