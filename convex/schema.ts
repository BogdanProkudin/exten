import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  words: defineTable({
    deviceId: v.string(),
    word: v.string(),
    translation: v.string(),
    example: v.string(),
    sourceUrl: v.string(),
    addedAt: v.number(),
    lastReviewed: v.optional(v.number()),
    reviewCount: v.number(),
    consecutiveCorrect: v.optional(v.number()),
    intervalDays: v.optional(v.number()),
    status: v.union(
      v.literal("new"),
      v.literal("learning"),
      v.literal("known"),
    ),
    // Adaptive difficulty (Feature 2)
    difficulty: v.optional(v.number()), // 1.0–3.0, default 1.0
    forgotCount: v.optional(v.number()), // explicit counter, default 0
    // Word normalization (Feature 3)
    lemma: v.optional(v.string()),
    // Hard word flag (Feature 5 V3)
    isHard: v.optional(v.boolean()),
    // Context history (Feature 6 V3)
    contexts: v.optional(v.array(v.object({
      sentence: v.string(),
      url: v.string(),
      timestamp: v.number(),
    }))),
    // Smart context capture
    exampleContext: v.optional(v.array(v.string())),
    exampleSource: v.optional(v.string()),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_word", ["deviceId", "word"])
    .index("by_device_status", ["deviceId", "status"])
    .index("by_device_lemma", ["deviceId", "lemma"]),

  // AI response cache
  aiCache: defineTable({
    key: v.string(),
    type: v.union(v.literal("explain"), v.literal("simplify")),
    word: v.optional(v.string()),
    input: v.string(),
    result: v.string(),
    createdAt: v.number(),
  }).index("by_key_type", ["key", "type"]),

  // Event analytics (Feature 5)
  events: defineTable({
    deviceId: v.string(),
    type: v.union(
      v.literal("word_lookup"),
      v.literal("word_saved"),
      v.literal("review_remembered"),
      v.literal("review_forgot"),
      v.literal("toast_shown"),
    ),
    word: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_type", ["deviceId", "type"]),
});
