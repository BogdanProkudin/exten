import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { computeRetrievability, cardFromWord } from "../src/lib/fsrs";

// Canonical strength formula — mirrors src/lib/memory-strength.ts computeStrength()
function computeWordStrength(word: {
  intervalDays?: number;
  consecutiveCorrect?: number;
  forgotCount?: number;
  lastReviewed?: number;
  status: string;
  reviewCount?: number;
  fsrsStability?: number;
  fsrsLastReview?: number;
  fsrsState?: string;
  fsrsDifficulty?: number;
  fsrsElapsedDays?: number;
  fsrsScheduledDays?: number;
  fsrsReps?: number;
  fsrsLapses?: number;
}): number {
  // FSRS path: strength = retrievability × 100
  if (word.fsrsStability != null && word.fsrsLastReview != null && word.fsrsLastReview > 0) {
    const card = cardFromWord(word as Parameters<typeof cardFromWord>[0]);
    const R = computeRetrievability(card, Date.now());
    return Math.round(R * 100);
  }

  // Legacy path (canonical formula)
  const intervalDays = word.intervalDays ?? 1;
  const consecutiveCorrect = word.consecutiveCorrect ?? 0;
  const forgotCount = word.forgotCount ?? 0;
  const lastReviewed = word.lastReviewed;

  const intervalScore = Math.min(40, (Math.log2(intervalDays + 1) / Math.log2(91)) * 40);
  const streakScore = Math.min(25, consecutiveCorrect * 5);
  const forgetPenalty = Math.min(25, forgotCount * 5);

  let recencyScore = 0;
  if (lastReviewed) {
    const daysSinceReview = (Date.now() - lastReviewed) / (24 * 60 * 60 * 1000);
    recencyScore = Math.max(0, 20 * (1 - daysSinceReview / 30));
  }

  const statusBonus = word.status === "known" ? 15 : word.status === "learning" ? 5 : 0;

  const raw = intervalScore + streakScore - forgetPenalty + recencyScore + statusBonus;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// Helper: format timestamp to YYYY-MM-DD in UTC
function toDateString(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().split("T")[0];
}

// Get activity heatmap data (GitHub-style)
export const getActivityHeatmap = query({
  args: { deviceId: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { deviceId, days: daysArg }) => {
    const days = daysArg ?? 90;
    const now = Date.now();
    const startTs = now - days * 24 * 60 * 60 * 1000;

    // Get events in range (cap at 10K to prevent timeout)
    const events = await ctx.db
      .query("events")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(10_000);

    // Get words added in range (cap at 10K)
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(10_000);

    // Count by date
    const countMap = new Map<string, number>();

    for (const event of events) {
      if (event.timestamp >= startTs) {
        const dateStr = toDateString(event.timestamp);
        countMap.set(dateStr, (countMap.get(dateStr) || 0) + 1);
      }
    }

    for (const word of words) {
      if (word.addedAt && word.addedAt >= startTs) {
        const dateStr = toDateString(word.addedAt);
        countMap.set(dateStr, (countMap.get(dateStr) || 0) + 1);
      }
    }

    // Build array for each day in range (including zeros)
    const result: { date: string; count: number }[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = toDateString(now - i * dayMs);
      result.push({ date: dateStr, count: countMap.get(dateStr) || 0 });
    }

    return result;
  },
});

// Get review accuracy trend over time
export const getAccuracyTrend = query({
  args: { deviceId: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { deviceId, days: daysArg }) => {
    const days = daysArg ?? 30;
    const now = Date.now();
    const startTs = now - days * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("events")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(10_000);

    const rememberedMap = new Map<string, number>();
    const forgotMap = new Map<string, number>();

    for (const event of events) {
      if (event.timestamp < startTs) continue;
      const dateStr = toDateString(event.timestamp);
      if (event.type === "review_remembered") {
        rememberedMap.set(dateStr, (rememberedMap.get(dateStr) || 0) + 1);
      } else if (event.type === "review_forgot") {
        forgotMap.set(dateStr, (forgotMap.get(dateStr) || 0) + 1);
      }
    }

    const result: { date: string; remembered: number; forgot: number; accuracy: number }[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = toDateString(now - i * dayMs);
      const remembered = rememberedMap.get(dateStr) || 0;
      const forgot = forgotMap.get(dateStr) || 0;
      const total = remembered + forgot;
      const accuracy = total > 0 ? Math.round((remembered / total) * 100) : 0;
      result.push({ date: dateStr, remembered, forgot, accuracy });
    }

    return result;
  },
});

// Get word strength distribution
export const getWordStrengthDistribution = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    let weak = 0;
    let growing = 0;
    let strong = 0;
    let mastered = 0;

    for (const word of words) {
      const strength = computeWordStrength(word);
      // Thresholds aligned with src/lib/memory-strength.ts strengthLabel():
      // Fragile(<20) + Weak(<40) → weak, Fair(<60) → growing, Good(<80) → strong, Strong(>=80) → mastered
      if (strength < 40) weak++;
      else if (strength < 60) growing++;
      else if (strength < 80) strong++;
      else mastered++;
    }

    return { weak, growing, strong, mastered };
  },
});

// Get top words by strength
export const getTopWords = query({
  args: {
    deviceId: v.string(),
    type: v.union(v.literal("strongest"), v.literal("weakest")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { deviceId, type, limit: limitArg }) => {
    const limit = limitArg ?? 10;
    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();

    const wordsWithStrength = words.map((w) => ({
      word: w.word,
      translation: w.translation,
      strength: computeWordStrength(w),
      reviewCount: w.reviewCount || 0,
      status: w.status,
    }));

    wordsWithStrength.sort((a, b) =>
      type === "strongest" ? b.strength - a.strength : a.strength - b.strength
    );

    return wordsWithStrength.slice(0, limit);
  },
});

// Get streak history (active days)
export const getStreakHistory = query({
  args: { deviceId: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { deviceId, days: daysArg }) => {
    const days = daysArg ?? 90;
    const now = Date.now();
    const startTs = now - days * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("events")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(10_000);

    const words = await ctx.db
      .query("words")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(10_000);

    const activeDays = new Set<string>();

    for (const event of events) {
      if (event.timestamp >= startTs) {
        activeDays.add(toDateString(event.timestamp));
      }
    }

    for (const word of words) {
      if (word.addedAt && word.addedAt >= startTs) {
        activeDays.add(toDateString(word.addedAt));
      }
    }

    const result: { date: string; active: boolean }[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = toDateString(now - i * dayMs);
      result.push({ date: dateStr, active: activeDays.has(dateStr) });
    }

    return result;
  },
});

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
      .filter((w) => {
        if (w.fsrsDifficulty != null) return w.fsrsDifficulty >= 5 || w.isHard;
        return (w.difficulty || 1) > 1.5 || w.isHard;
      })
      .sort((a, b) => {
        const da = a.fsrsDifficulty ?? ((a.difficulty || 1) - 1) / 2 * 9 + 1;
        const db = b.fsrsDifficulty ?? ((b.difficulty || 1) - 1) / 2 * 9 + 1;
        return db - da;
      })
      .slice(0, 5)
      .map((w) => ({ word: w.word, difficulty: w.fsrsDifficulty ?? (w.difficulty || 1) }));

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
      return sum + computeWordStrength(w);
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

// Save reading session data
export const saveReadingSession = mutation({
  args: {
    deviceId: v.string(),
    wordCount: v.number(),
    timeSeconds: v.number(),
    wpm: v.number(),
    contentType: v.string(),
    domain: v.string(),
    language: v.string(),
    comprehensionScore: v.number(),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("readingSessions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// Get reading speed trend data
export const getReadingSpeedTrend = query({
  args: { deviceId: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { deviceId, days: daysArg }) => {
    const days = daysArg ?? 30;
    const now = Date.now();
    const startTs = now - days * 24 * 60 * 60 * 1000;

    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(5_000);

    const filteredSessions = sessions.filter((s) => s.createdAt >= startTs);

    // Group by day
    const dailyData = new Map<string, { totalWpm: number; totalComprehension: number; sessionCount: number }>();
    
    for (const session of filteredSessions) {
      const dateStr = toDateString(session.createdAt);
      const existing = dailyData.get(dateStr) || { totalWpm: 0, totalComprehension: 0, sessionCount: 0 };
      dailyData.set(dateStr, {
        totalWpm: existing.totalWpm + session.wpm,
        totalComprehension: existing.totalComprehension + session.comprehensionScore,
        sessionCount: existing.sessionCount + 1,
      });
    }

    // Generate complete date range
    const result = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = toDateString(date.getTime());
      const data = dailyData.get(dateStr);
      
      result.unshift({
        date: dateStr,
        avgWpm: data ? Math.round(data.totalWpm / data.sessionCount) : 0,
        avgComprehension: data ? Math.round((data.totalComprehension / data.sessionCount) * 20) : 0, // Convert 1-5 to 0-100
        sessionCount: data ? data.sessionCount : 0,
      });
    }

    return result;
  },
});

// Get reading statistics by content type
export const getReadingStatsByContentType = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(5_000);

    const statsByType = new Map<string, { totalWords: number; totalTime: number; totalSessions: number; totalComprehension: number }>();

    for (const session of sessions) {
      const existing = statsByType.get(session.contentType) || { 
        totalWords: 0, 
        totalTime: 0, 
        totalSessions: 0,
        totalComprehension: 0 
      };
      
      statsByType.set(session.contentType, {
        totalWords: existing.totalWords + session.wordCount,
        totalTime: existing.totalTime + session.timeSeconds,
        totalSessions: existing.totalSessions + 1,
        totalComprehension: existing.totalComprehension + session.comprehensionScore,
      });
    }

    const result = Array.from(statsByType.entries()).map(([contentType, stats]) => ({
      contentType,
      avgWpm: stats.totalTime > 0 ? Math.round((stats.totalWords / stats.totalTime) * 60) : 0,
      avgComprehension: stats.totalSessions > 0 ? Math.round((stats.totalComprehension / stats.totalSessions) * 20) : 0,
      sessionCount: stats.totalSessions,
      totalWords: stats.totalWords,
      totalTimeMinutes: Math.round(stats.totalTime / 60),
    }));

    return result.sort((a, b) => b.sessionCount - a.sessionCount);
  },
});

// Get reading progress insights
export const getReadingInsights = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(5_000);

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalWordsRead: 0,
        totalTimeHours: 0,
        avgWpm: 0,
        avgComprehension: 0,
        favoriteContentType: null,
        bestWpmSession: null,
        longestSession: null,
      };
    }

    const totalWordsRead = sessions.reduce((sum, s) => sum + s.wordCount, 0);
    const totalTimeSeconds = sessions.reduce((sum, s) => sum + s.timeSeconds, 0);
    const avgWpm = totalTimeSeconds > 0 ? Math.round((totalWordsRead / totalTimeSeconds) * 60) : 0;
    const avgComprehension = Math.round((sessions.reduce((sum, s) => sum + s.comprehensionScore, 0) / sessions.length) * 20);

    // Find favorite content type
    const contentTypeCounts = new Map<string, number>();
    for (const session of sessions) {
      contentTypeCounts.set(session.contentType, (contentTypeCounts.get(session.contentType) || 0) + 1);
    }
    const favoriteContentType = Array.from(contentTypeCounts.entries())
      .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

    // Best WPM session
    const bestWpmSession = sessions.reduce((best, current) => 
      current.wpm > best.wpm ? current : best
    );

    // Longest session
    const longestSession = sessions.reduce((longest, current) =>
      current.timeSeconds > longest.timeSeconds ? current : longest
    );

    return {
      totalSessions: sessions.length,
      totalWordsRead,
      totalTimeHours: Math.round((totalTimeSeconds / 3600) * 10) / 10,
      avgWpm,
      avgComprehension,
      favoriteContentType,
      bestWpmSession: {
        wpm: bestWpmSession.wpm,
        contentType: bestWpmSession.contentType,
        domain: bestWpmSession.domain,
        date: toDateString(bestWpmSession.createdAt),
      },
      longestSession: {
        timeMinutes: Math.round(longestSession.timeSeconds / 60),
        contentType: longestSession.contentType,
        domain: longestSession.domain,
        wordCount: longestSession.wordCount,
        date: toDateString(longestSession.createdAt),
      },
    };
  },
});
