import { v } from "convex/values";
import { query } from "./_generated/server";

// Get learning insights and analytics
export const getInsights = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    if (words.length === 0) {
      return null;
    }

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;

    // Time-based stats
    const wordsThisWeek = words.filter((w) => w.addedAt && now - w.addedAt < weekMs).length;
    const wordsThisMonth = words.filter((w) => w.addedAt && now - w.addedAt < monthMs).length;
    const wordsLastWeek = words.filter((w) => 
      w.addedAt && now - w.addedAt >= weekMs && now - w.addedAt < 2 * weekMs
    ).length;

    // Learning velocity (words per day this week)
    const velocity = wordsThisWeek / 7;

    // Retention rate (words that stuck vs total reviews)
    const totalReviews = words.reduce((sum, w) => sum + (w.reviewCount || 0), 0);
    const knownWords = words.filter((w) => w.status === "known").length;
    const retentionRate = words.length > 0 ? (knownWords / words.length) * 100 : 0;

    // Hardest words (highest difficulty)
    const hardestWords = words
      .filter((w) => (w.difficulty || 1) > 1.5 || w.isHard)
      .sort((a, b) => (b.difficulty || 1) - (a.difficulty || 1))
      .slice(0, 5)
      .map((w) => ({ word: w.word, difficulty: w.difficulty || 1 }));

    // Most practiced words
    const mostPracticed = words
      .filter((w) => (w.reviewCount || 0) > 0)
      .sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0))
      .slice(0, 5)
      .map((w) => ({ word: w.word, reviewCount: w.reviewCount || 0 }));

    // Words due for review
    const dueForReview = words.filter((w) => {
      if (!w.lastReviewed) return true;
      const interval = w.intervalDays ?? 1;
      return now - w.lastReviewed > interval * dayMs;
    }).length;

    // Streak of consecutive days with activity
    const uniqueDays = new Set(
      words
        .filter((w) => w.addedAt)
        .map((w) => Math.floor(w.addedAt! / dayMs))
    );

    // Weekly activity (last 7 days)
    const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
      const day = Math.floor((now - i * dayMs) / dayMs);
      const wordsAdded = words.filter((w) => 
        w.addedAt && Math.floor(w.addedAt / dayMs) === day
      ).length;
      const date = new Date(day * dayMs);
      return {
        day: date.toLocaleDateString("en", { weekday: "short" }),
        count: wordsAdded,
      };
    }).reverse();

    // Status breakdown
    const statusBreakdown = {
      new: words.filter((w) => w.status === "new").length,
      learning: words.filter((w) => w.status === "learning").length,
      known: words.filter((w) => w.status === "known").length,
    };

    // Average strength
    const avgStrength = words.reduce((sum, w) => {
      const strength = 
        (w.consecutiveCorrect || 0) * 15 + 
        (w.status === "known" ? 50 : w.status === "learning" ? 25 : 0);
      return sum + Math.min(100, strength);
    }, 0) / words.length;

    return {
      totalWords: words.length,
      wordsThisWeek,
      wordsThisMonth,
      wordsLastWeek,
      velocity: Math.round(velocity * 10) / 10,
      velocityTrend: wordsThisWeek > wordsLastWeek ? "up" : wordsThisWeek < wordsLastWeek ? "down" : "stable",
      retentionRate: Math.round(retentionRate),
      totalReviews,
      dueForReview,
      hardestWords,
      mostPracticed,
      weeklyActivity,
      statusBreakdown,
      avgStrength: Math.round(avgStrength),
      uniqueDaysActive: uniqueDays.size,
    };
  },
});
