import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// Achievement definitions
const ACHIEVEMENTS = {
  first_word: { name: "First Steps", description: "Save your first word", icon: "🌱", xp: 25 },
  words_10: { name: "Collector", description: "Save 10 words", icon: "📚", xp: 50 },
  words_50: { name: "Bookworm", description: "Save 50 words", icon: "🐛", xp: 100 },
  words_100: { name: "Word Wizard", description: "Save 100 words", icon: "🧙", xp: 200 },
  words_500: { name: "Lexicon Legend", description: "Save 500 words", icon: "👑", xp: 500 },
  streak_3: { name: "Consistent", description: "3 day streak", icon: "🔥", xp: 30 },
  streak_7: { name: "Weekly Warrior", description: "7 day streak", icon: "⚡", xp: 75 },
  streak_30: { name: "Monthly Master", description: "30 day streak", icon: "💎", xp: 300 },
  streak_100: { name: "Unstoppable", description: "100 day streak", icon: "🏆", xp: 1000 },
  level_5: { name: "Rising Star", description: "Reach level 5", icon: "⭐", xp: 100 },
  level_10: { name: "Expert", description: "Reach level 10", icon: "🌟", xp: 250 },
  reviews_100: { name: "Dedicated", description: "Complete 100 reviews", icon: "🎯", xp: 100 },
  reviews_500: { name: "Memory Master", description: "Complete 500 reviews", icon: "🧠", xp: 300 },
  perfect_day: { name: "Perfect Day", description: "Review 20+ words with 100% accuracy", icon: "💯", xp: 75 },
} as const;

export const getAchievements = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const unlocked = await ctx.db
      .query("achievements")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    const unlockedIds = new Set(unlocked.map((a) => a.achievementId));

    return Object.entries(ACHIEVEMENTS).map(([id, achievement]) => ({
      id,
      ...achievement,
      unlocked: unlockedIds.has(id),
      unlockedAt: unlocked.find((a) => a.achievementId === id)?.unlockedAt,
    }));
  },
});

// Word-count thresholds for achievements
const WORD_COUNT_ACHIEVEMENTS: Array<{ id: string; threshold: number }> = [
  { id: "first_word", threshold: 1 },
  { id: "words_10", threshold: 10 },
  { id: "words_50", threshold: 50 },
  { id: "words_100", threshold: 100 },
  { id: "words_500", threshold: 500 },
];

export const checkAchievements = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    // Count total words for this device
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    const wordCount = words.length;

    // Get already-unlocked achievement IDs
    const unlocked = await ctx.db
      .query("achievements")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    const unlockedIds = new Set(unlocked.map((a) => a.achievementId));

    const newAchievements: Array<{ id: string; name: string; icon: string; xp: number }> = [];

    for (const { id, threshold } of WORD_COUNT_ACHIEVEMENTS) {
      if (wordCount >= threshold && !unlockedIds.has(id)) {
        const def = ACHIEVEMENTS[id as keyof typeof ACHIEVEMENTS];
        await ctx.db.insert("achievements", {
          deviceId,
          achievementId: id,
          unlockedAt: Date.now(),
          notified: false,
        });
        newAchievements.push({ id, name: def.name, icon: def.icon, xp: def.xp });
      }
    }

    // Check streak and review-count achievements
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    if (stats) {
      const STREAK_ACHIEVEMENTS = [
        { id: "streak_3", threshold: 3 },
        { id: "streak_7", threshold: 7 },
        { id: "streak_30", threshold: 30 },
        { id: "streak_100", threshold: 100 },
      ];
      for (const { id, threshold } of STREAK_ACHIEVEMENTS) {
        if ((stats.currentStreak ?? 0) >= threshold && !unlockedIds.has(id)) {
          const def = ACHIEVEMENTS[id as keyof typeof ACHIEVEMENTS];
          await ctx.db.insert("achievements", {
            deviceId,
            achievementId: id,
            unlockedAt: Date.now(),
            notified: false,
          });
          newAchievements.push({ id, name: def.name, icon: def.icon, xp: def.xp });
        }
      }
      const REVIEW_ACHIEVEMENTS = [
        { id: "reviews_100", threshold: 100 },
        { id: "reviews_500", threshold: 500 },
      ];
      for (const { id, threshold } of REVIEW_ACHIEVEMENTS) {
        if ((stats.totalReviewsDone ?? 0) >= threshold && !unlockedIds.has(id)) {
          const def = ACHIEVEMENTS[id as keyof typeof ACHIEVEMENTS];
          await ctx.db.insert("achievements", {
            deviceId,
            achievementId: id,
            unlockedAt: Date.now(),
            notified: false,
          });
          newAchievements.push({ id, name: def.name, icon: def.icon, xp: def.xp });
        }
      }
    }

    return { newAchievements };
  },
});

// --- Daily Goal & Streak ---

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return d.toISOString().slice(0, 10) === yesterday.toISOString().slice(0, 10);
}

export const getDailyProgress = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const row = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();

    if (!row) {
      return {
        wordsReviewed: 0,
        wordsSaved: 0,
        totalToday: 0,
        goalTarget: 10,
        goalMet: false,
        streak: 0,
        longestStreak: 0,
      };
    }

    const today = todayStr();
    const isToday = row.lastActiveDate === today;

    return {
      wordsReviewed: isToday ? row.dailyReviewsDone : 0,
      wordsSaved: isToday ? row.dailyWordsLearned : 0,
      totalToday: isToday ? row.dailyReviewsDone + row.dailyWordsLearned : 0,
      goalTarget: row.dailyGoalXp, // repurposed as word count target
      goalMet: isToday ? (row.dailyReviewsDone + row.dailyWordsLearned) >= row.dailyGoalXp : false,
      streak: row.currentStreak,
      longestStreak: row.longestStreak,
    };
  },
});

export const incrementDailyProgress = internalMutation({
  args: { deviceId: v.string(), type: v.union(v.literal("review"), v.literal("save")) },
  handler: async (ctx, { deviceId, type }) => {
    const now = Date.now();
    const today = todayStr();

    let row = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();

    if (!row) {
      // Lazy init
      const id = await ctx.db.insert("userStats", {
        deviceId,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
        totalXp: 0,
        level: 1,
        dailyXp: 0,
        dailyWordsLearned: type === "save" ? 1 : 0,
        dailyReviewsDone: type === "review" ? 1 : 0,
        dailyGoalXp: 10,
        totalWordsLearned: type === "save" ? 1 : 0,
        totalReviewsDone: type === "review" ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: now };

    // Day rollover
    if (row.lastActiveDate !== today) {
      const previousGoalMet =
        (row.dailyReviewsDone + row.dailyWordsLearned) >= row.dailyGoalXp;

      if (isYesterday(row.lastActiveDate) && previousGoalMet) {
        updates.currentStreak = row.currentStreak + 1;
      } else {
        updates.currentStreak = 1;
      }

      // Reset daily counters
      updates.dailyReviewsDone = 0;
      updates.dailyWordsLearned = 0;
      updates.dailyXp = 0;
      updates.lastActiveDate = today;
    }

    // Increment the right counter
    const dailyReviews = (updates.dailyReviewsDone as number | undefined) ?? row.dailyReviewsDone;
    const dailyWords = (updates.dailyWordsLearned as number | undefined) ?? row.dailyWordsLearned;

    if (type === "review") {
      updates.dailyReviewsDone = dailyReviews + 1;
      updates.totalReviewsDone = row.totalReviewsDone + 1;
    } else {
      updates.dailyWordsLearned = dailyWords + 1;
      updates.totalWordsLearned = row.totalWordsLearned + 1;
    }

    // Update longest streak
    const streak = (updates.currentStreak as number | undefined) ?? row.currentStreak;
    updates.longestStreak = Math.max(row.longestStreak, streak);

    await ctx.db.patch(row._id, updates);
  },
});

export const setDailyGoal = mutation({
  args: { deviceId: v.string(), goal: v.number() },
  handler: async (ctx, { deviceId, goal }) => {
    const clampedGoal = Math.max(1, Math.min(100, Math.round(goal)));
    const now = Date.now();
    const today = todayStr();

    const row = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();

    if (!row) {
      await ctx.db.insert("userStats", {
        deviceId,
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: today,
        totalXp: 0,
        level: 1,
        dailyXp: 0,
        dailyWordsLearned: 0,
        dailyReviewsDone: 0,
        dailyGoalXp: clampedGoal,
        totalWordsLearned: 0,
        totalReviewsDone: 0,
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    await ctx.db.patch(row._id, { dailyGoalXp: clampedGoal, updatedAt: now });
  },
});

export const addReviewXP = mutation({
  args: { deviceId: v.string(), xp: v.number() },
  handler: async (ctx, { deviceId, xp }) => {
    if (xp <= 0) return;
    const clampedXp = Math.min(xp, 50); // Server-side cap to prevent abuse
    const row = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      totalXp: (row.totalXp ?? 0) + clampedXp,
      dailyXp: (row.dailyXp ?? 0) + clampedXp,
      updatedAt: Date.now(),
    });
  },
});
