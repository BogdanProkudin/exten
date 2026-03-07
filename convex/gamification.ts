import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";

// XP rewards for different actions
const XP_REWARDS = {
  WORD_SAVED: 10,
  REVIEW_REMEMBERED: 15,
  REVIEW_FORGOT: 5, // Still reward effort
  STREAK_BONUS: 5, // Per day of streak
  DAILY_GOAL_COMPLETE: 50,
  FIRST_WORD_OF_DAY: 20,
};

// Level thresholds (XP required for each level)
const LEVEL_THRESHOLDS = [
  0,      // Level 1
  100,    // Level 2
  250,    // Level 3
  500,    // Level 4
  850,    // Level 5
  1300,   // Level 6
  1900,   // Level 7
  2600,   // Level 8
  3500,   // Level 9
  4600,   // Level 10
  6000,   // Level 11
  7700,   // Level 12
  9700,   // Level 13
  12000,  // Level 14
  15000,  // Level 15
  // ... continues
];

// Achievement definitions
export const ACHIEVEMENTS = {
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

// Helper: Get today's date string
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

// Helper: Calculate level from XP
function calculateLevel(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return level;
}

// Helper: XP needed for next level
function xpForNextLevel(currentXp: number): { current: number; needed: number; progress: number } {
  const level = calculateLevel(currentXp);
  const currentLevelXp = LEVEL_THRESHOLDS[level - 1] || 0;
  const nextLevelXp = LEVEL_THRESHOLDS[level] || currentLevelXp + 1000;
  
  return {
    current: currentXp - currentLevelXp,
    needed: nextLevelXp - currentLevelXp,
    progress: Math.min(100, Math.round(((currentXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100)),
  };
}

// Get or create user stats
export const getStats = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    
    if (!stats) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        totalXp: 0,
        level: 1,
        dailyXp: 0,
        dailyWordsLearned: 0,
        dailyReviewsDone: 0,
        dailyGoalXp: 100,
        totalWordsLearned: 0,
        totalReviewsDone: 0,
        xpProgress: { current: 0, needed: 100, progress: 0 },
        isNewDay: true,
      };
    }

    const today = getTodayString();
    const isNewDay = stats.lastActiveDate !== today;
    
    return {
      ...stats,
      // Reset daily stats if it's a new day
      dailyXp: isNewDay ? 0 : stats.dailyXp,
      dailyWordsLearned: isNewDay ? 0 : stats.dailyWordsLearned,
      dailyReviewsDone: isNewDay ? 0 : stats.dailyReviewsDone,
      // Calculate streak (might be broken if missed a day)
      currentStreak: isStreakBroken(stats.lastActiveDate) ? 0 : stats.currentStreak,
      xpProgress: xpForNextLevel(stats.totalXp),
      isNewDay,
    };
  },
});

// Check if streak is broken (missed more than 1 day)
function isStreakBroken(lastActiveDate: string): boolean {
  const last = new Date(lastActiveDate);
  const today = new Date(getTodayString());
  const diffDays = Math.floor((today.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays > 1;
}

// Award XP for an action
export const awardXp = mutation({
  args: {
    deviceId: v.string(),
    action: v.union(
      v.literal("word_saved"),
      v.literal("review_remembered"),
      v.literal("review_forgot"),
    ),
  },
  handler: async (ctx, { deviceId, action }) => {
    const today = getTodayString();
    
    // Get or create stats
    let stats = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();
    
    const now = Date.now();
    
    if (!stats) {
      // Create new stats
      const newStats = {
        deviceId,
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
        totalXp: 0,
        level: 1,
        dailyXp: 0,
        dailyWordsLearned: 0,
        dailyReviewsDone: 0,
        dailyGoalXp: 100,
        totalWordsLearned: 0,
        totalReviewsDone: 0,
        createdAt: now,
        updatedAt: now,
      };
      const id = await ctx.db.insert("userStats", newStats);
      stats = { _id: id, _creationTime: now, ...newStats };
    }

    // Calculate XP to award
    let xpToAward = 0;
    let isFirstWordOfDay = false;
    
    const isNewDay = stats.lastActiveDate !== today;
    
    switch (action) {
      case "word_saved":
        xpToAward = XP_REWARDS.WORD_SAVED;
        if (isNewDay || stats.dailyWordsLearned === 0) {
          xpToAward += XP_REWARDS.FIRST_WORD_OF_DAY;
          isFirstWordOfDay = true;
        }
        break;
      case "review_remembered":
        xpToAward = XP_REWARDS.REVIEW_REMEMBERED;
        break;
      case "review_forgot":
        xpToAward = XP_REWARDS.REVIEW_FORGOT;
        break;
    }

    // Streak bonus
    if (!isStreakBroken(stats.lastActiveDate)) {
      xpToAward += Math.min(stats.currentStreak, 30) * XP_REWARDS.STREAK_BONUS;
    }

    // Update stats
    const newTotalXp = stats.totalXp + xpToAward;
    const newLevel = calculateLevel(newTotalXp);
    const leveledUp = newLevel > stats.level;

    // Update streak
    let newStreak = stats.currentStreak;
    if (isNewDay) {
      if (isStreakBroken(stats.lastActiveDate)) {
        newStreak = 1; // Reset streak
      } else {
        newStreak = stats.currentStreak + 1; // Continue streak
      }
    }

    // Daily progress
    const newDailyXp = (isNewDay ? 0 : stats.dailyXp) + xpToAward;
    const newDailyWords = (isNewDay ? 0 : stats.dailyWordsLearned) + (action === "word_saved" ? 1 : 0);
    const newDailyReviews = (isNewDay ? 0 : stats.dailyReviewsDone) + (action.startsWith("review_") ? 1 : 0);

    // Check if daily goal completed
    const dailyGoalJustCompleted = stats.dailyXp < stats.dailyGoalXp && newDailyXp >= stats.dailyGoalXp;
    if (dailyGoalJustCompleted) {
      // Award bonus XP for completing daily goal (will be added on next action)
    }

    await ctx.db.patch(stats._id, {
      totalXp: newTotalXp,
      level: newLevel,
      currentStreak: newStreak,
      longestStreak: Math.max(stats.longestStreak, newStreak),
      lastActiveDate: today,
      dailyXp: newDailyXp,
      dailyWordsLearned: newDailyWords,
      dailyReviewsDone: newDailyReviews,
      totalWordsLearned: stats.totalWordsLearned + (action === "word_saved" ? 1 : 0),
      totalReviewsDone: stats.totalReviewsDone + (action.startsWith("review_") ? 1 : 0),
      updatedAt: now,
    });

    // Check for new achievements
    const newAchievements = await checkAchievements(ctx, deviceId, {
      totalWords: stats.totalWordsLearned + (action === "word_saved" ? 1 : 0),
      totalReviews: stats.totalReviewsDone + (action.startsWith("review_") ? 1 : 0),
      streak: newStreak,
      level: newLevel,
    });

    return {
      xpAwarded: xpToAward,
      totalXp: newTotalXp,
      level: newLevel,
      leveledUp,
      streak: newStreak,
      dailyProgress: {
        xp: newDailyXp,
        goal: stats.dailyGoalXp,
        complete: newDailyXp >= stats.dailyGoalXp,
      },
      newAchievements,
      isFirstWordOfDay,
    };
  },
});

// Check and award achievements
async function checkAchievements(
  ctx: any,
  deviceId: string,
  stats: { totalWords: number; totalReviews: number; streak: number; level: number }
): Promise<Array<{ id: string; name: string; icon: string; xp: number }>> {
  const newAchievements: Array<{ id: string; name: string; icon: string; xp: number }> = [];

  const achievementsToCheck = [
    { id: "first_word", condition: stats.totalWords >= 1 },
    { id: "words_10", condition: stats.totalWords >= 10 },
    { id: "words_50", condition: stats.totalWords >= 50 },
    { id: "words_100", condition: stats.totalWords >= 100 },
    { id: "words_500", condition: stats.totalWords >= 500 },
    { id: "streak_3", condition: stats.streak >= 3 },
    { id: "streak_7", condition: stats.streak >= 7 },
    { id: "streak_30", condition: stats.streak >= 30 },
    { id: "streak_100", condition: stats.streak >= 100 },
    { id: "level_5", condition: stats.level >= 5 },
    { id: "level_10", condition: stats.level >= 10 },
    { id: "reviews_100", condition: stats.totalReviews >= 100 },
    { id: "reviews_500", condition: stats.totalReviews >= 500 },
  ];

  for (const { id, condition } of achievementsToCheck) {
    if (!condition) continue;

    // Check if already unlocked
    const existing = await ctx.db
      .query("achievements")
      .withIndex("by_device_achievement", (q) =>
        q.eq("deviceId", deviceId).eq("achievementId", id)
      )
      .first();

    if (!existing) {
      const achievement = ACHIEVEMENTS[id as keyof typeof ACHIEVEMENTS];
      await ctx.db.insert("achievements", {
        deviceId,
        achievementId: id,
        unlockedAt: Date.now(),
        notified: false,
      });
      newAchievements.push({
        id,
        name: achievement.name,
        icon: achievement.icon,
        xp: achievement.xp,
      });
    }
  }

  return newAchievements;
}

// Get user achievements
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

// Mark achievement as notified
export const markAchievementNotified = mutation({
  args: { deviceId: v.string(), achievementId: v.string() },
  handler: async (ctx, { deviceId, achievementId }) => {
    const achievement = await ctx.db
      .query("achievements")
      .withIndex("by_device_achievement", (q) =>
        q.eq("deviceId", deviceId).eq("achievementId", achievementId)
      )
      .first();

    if (achievement) {
      await ctx.db.patch(achievement._id, { notified: true });
    }
  },
});

// Get unnotified achievements
export const getUnnotifiedAchievements = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const unnotified = await ctx.db
      .query("achievements")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .filter((q) => q.eq(q.field("notified"), false))
      .collect();

    return unnotified.map((a) => ({
      id: a.achievementId,
      ...ACHIEVEMENTS[a.achievementId as keyof typeof ACHIEVEMENTS],
      unlockedAt: a.unlockedAt,
    }));
  },
});

// Update daily goal
export const updateDailyGoal = mutation({
  args: { deviceId: v.string(), goalXp: v.number() },
  handler: async (ctx, { deviceId, goalXp }) => {
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .first();

    if (stats) {
      await ctx.db.patch(stats._id, { dailyGoalXp: goalXp });
    }
  },
});
