import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const save = mutation({
  args: {
    deviceId: v.string(),
    collocation: v.string(),
    words: v.array(v.string()),
    category: v.string(),
    level: v.optional(v.string()),
    sourceContext: v.optional(v.string()),
  },
  handler: async (ctx, { deviceId, collocation, words, category, level, sourceContext }) => {
    // Check for duplicate
    const existing = await ctx.db
      .query("collocations")
      .withIndex("by_device_collocation", (q) =>
        q.eq("deviceId", deviceId).eq("collocation", collocation),
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("collocations", {
      deviceId,
      collocation,
      words,
      category,
      level,
      mastered: false,
      practiceCount: 0,
      discoveredAt: Date.now(),
      sourceContext,
    });
  },
});

export const updatePractice = mutation({
  args: {
    id: v.id("collocations"),
    deviceId: v.string(),
    correct: v.boolean(),
  },
  handler: async (ctx, { id, deviceId, correct }) => {
    const col = await ctx.db.get(id);
    if (!col || col.deviceId !== deviceId) return;

    const practiceCount = col.practiceCount + 1;
    const mastered = correct && practiceCount >= 5;

    await ctx.db.patch(id, {
      practiceCount,
      mastered,
      lastPracticed: Date.now(),
    });
  },
});

export const getForWord = query({
  args: { deviceId: v.string(), word: v.string() },
  handler: async (ctx, { deviceId, word }) => {
    const all = await ctx.db
      .query("collocations")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(1_000);

    const lower = word.toLowerCase();
    return all.filter((c) => c.words.some((w) => w.toLowerCase() === lower));
  },
});

export const getPracticeQueue = query({
  args: { deviceId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { deviceId, limit }) => {
    const all = await ctx.db
      .query("collocations")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(1_000);

    // Return unmastered collocations, sorted by least practiced first
    return all
      .filter((c) => !c.mastered)
      .sort((a, b) => a.practiceCount - b.practiceCount)
      .slice(0, limit ?? 10);
  },
});

export const getAll = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    return await ctx.db
      .query("collocations")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(1_000);
  },
});
