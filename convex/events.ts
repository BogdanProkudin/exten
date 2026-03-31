import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const logEvent = mutation({
  args: {
    deviceId: v.string(),
    type: v.union(
      v.literal("word_lookup"),
      v.literal("word_saved"),
      v.literal("review_remembered"),
      v.literal("review_forgot"),
      v.literal("toast_shown"),
      v.literal("writing_practice"),
    ),
    word: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { deviceId, type, word, metadata }) => {
    await ctx.db.insert("events", {
      deviceId,
      type,
      word,
      timestamp: Date.now(),
      metadata,
    });
  },
});

export const getEventStats = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(10_000);

    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.type] = (counts[event.type] ?? 0) + 1;
    }
    return counts;
  },
});
