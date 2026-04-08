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
    // Entry type (legacy field, always "word")
    type: v.optional(v.literal("word")),
    // FSRS-5 memory model fields
    fsrsStability: v.optional(v.number()),
    fsrsDifficulty: v.optional(v.number()),
    fsrsElapsedDays: v.optional(v.number()),
    fsrsScheduledDays: v.optional(v.number()),
    fsrsReps: v.optional(v.number()),
    fsrsLapses: v.optional(v.number()),
    fsrsState: v.optional(v.union(
      v.literal("new"),
      v.literal("learning"),
      v.literal("review"),
      v.literal("relearning"),
    )),
    fsrsLastReview: v.optional(v.number()),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_word", ["deviceId", "word"])
    .index("by_device_status", ["deviceId", "status"])
    .index("by_device_lemma", ["deviceId", "lemma"])
    .index("by_device_type", ["deviceId", "type"]),

  // AI response cache
  aiCache: defineTable({
    key: v.string(),
    type: v.union(v.literal("explain"), v.literal("simplify"), v.literal("sentence_analyze")),
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
      v.literal("writing_practice"),
    ),
    word: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_type", ["deviceId", "type"]),

  // Gamification: User stats
  userStats: defineTable({
    deviceId: v.string(),
    // Streaks
    currentStreak: v.number(),
    longestStreak: v.number(),
    lastActiveDate: v.string(), // YYYY-MM-DD format
    // XP & Levels
    totalXp: v.number(),
    level: v.number(),
    // Daily progress
    dailyXp: v.number(),
    dailyWordsLearned: v.number(),
    dailyReviewsDone: v.number(),
    dailyGoalXp: v.number(), // configurable goal
    // FSRS desired retention (default 0.9)
    desiredRetention: v.optional(v.number()),
    // Lifetime stats
    totalWordsLearned: v.number(),
    totalReviewsDone: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_device", ["deviceId"]),

  // Gamification: Achievements
  achievements: defineTable({
    deviceId: v.string(),
    achievementId: v.string(), // e.g., "first_word", "streak_7", "level_10"
    unlockedAt: v.number(),
    notified: v.boolean(), // whether user has seen the notification
  })
    .index("by_device", ["deviceId"])
    .index("by_device_achievement", ["deviceId", "achievementId"]),

  // Collocation teaching system
  collocations: defineTable({
    deviceId: v.string(),
    collocation: v.string(),
    words: v.array(v.string()),
    category: v.string(),
    level: v.optional(v.string()),
    mastered: v.boolean(),
    practiceCount: v.number(),
    lastPracticed: v.optional(v.number()),
    discoveredAt: v.number(),
    sourceContext: v.optional(v.string()),
  })
    .index("by_device", ["deviceId"])
    .index("by_device_collocation", ["deviceId", "collocation"]),

  // AI rate limiting (per-device daily counters)
  aiRateLimits: defineTable({
    deviceId: v.string(),
    date: v.string(), // YYYY-MM-DD
    callCount: v.number(),
  }).index("by_device_date", ["deviceId", "date"]),

  // Reading Speed Tracking
  readingSessions: defineTable({
    deviceId: v.string(),
    wordCount: v.number(),
    timeSeconds: v.number(),
    wpm: v.number(),
    contentType: v.string(), // 'article', 'youtube', 'social', 'news', 'reference', etc.
    domain: v.string(),
    language: v.string(),
    comprehensionScore: v.number(), // 1-5 rating
    timestamp: v.string(), // ISO string
    createdAt: v.number(),
  }).index("by_device", ["deviceId"]),
});
