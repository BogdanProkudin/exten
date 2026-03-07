import { v } from "convex/values";
import { action, query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// djb2 hash — deterministic, no crypto deps
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

// --- Internal helpers ---

export const getCachedResult = internalQuery({
  args: { key: v.string(), type: v.union(v.literal("explain"), v.literal("simplify")) },
  handler: async (ctx, { key, type }) => {
    return await ctx.db
      .query("aiCache")
      .withIndex("by_key_type", (q) => q.eq("key", key).eq("type", type))
      .first();
  },
});

export const setCachedResult = internalMutation({
  args: {
    key: v.string(),
    type: v.union(v.literal("explain"), v.literal("simplify")),
    word: v.optional(v.string()),
    input: v.string(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aiCache", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// --- Actions ---

export const explainWord = action({
  args: {
    word: v.string(),
    sentence: v.string(),
    targetLang: v.optional(v.string()),
    userLevel: v.optional(v.string()),
  },
  handler: async (ctx, { word, sentence, targetLang, userLevel }): Promise<{ explanation: string }> => {
    const cacheKey = djb2(`explain:${word}:${sentence}:${targetLang || "en"}:${userLevel || "B1"}`);

    // Check cache
    const cached = await ctx.runQuery(internal.ai.getCachedResult, {
      key: cacheKey,
      type: "explain",
    });
    if (cached) {
      return JSON.parse(cached.result);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Validate user level
    const validLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
    const level = validLevels.has(userLevel || "") ? userLevel! : "B1";
    
    // Map language codes to full names for the AI prompt
    const langCodeToName: Record<string, string> = {
      en: "English",
      ru: "Russian",
      es: "Spanish",
      fr: "French",
      de: "German",
      it: "Italian",
      pt: "Portuguese",
      zh: "Chinese",
      ja: "Japanese",
      ko: "Korean",
      ar: "Arabic",
      hi: "Hindi",
      uk: "Ukrainian",
      pl: "Polish",
      tr: "Turkish",
    };
    const lang = langCodeToName[targetLang || ""] || targetLang || "English";

    const prompt = `You are a vocabulary tutor. Explain the word "${word}" in simple terms suitable for a ${level}-level English learner.
${sentence ? `Context sentence: "${sentence}"` : ""}
${lang !== "English" ? `Give the explanation in ${lang}.` : ""}

Provide:
1. A clear, simple definition (1-2 sentences)
2. Why this word is used in this context (if context provided)
3. One example sentence using the word

Keep the total response under 100 words.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content?.trim() || "No explanation available.";
    const result = { explanation };

    // Cache result
    await ctx.runMutation(internal.ai.setCachedResult, {
      key: cacheKey,
      type: "explain",
      word,
      input: sentence,
      result: JSON.stringify(result),
    });

    return result;
  },
});

export const simplifyText = action({
  args: {
    text: v.string(),
    userLevel: v.optional(v.string()),
  },
  handler: async (ctx, { text, userLevel }): Promise<{ simplified: string }> => {
    // Truncate input
    const truncated = text.slice(0, 12_000);
    const cacheKey = djb2(`simplify:${truncated}:${userLevel || "B1"}`);

    // Check cache
    const cached = await ctx.runQuery(internal.ai.getCachedResult, {
      key: cacheKey,
      type: "simplify",
    });
    if (cached) {
      return JSON.parse(cached.result);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Validate user level
    const validLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
    const level = validLevels.has(userLevel || "") ? userLevel! : "B1";

    const prompt = `Rewrite the following text at a ${level} English level. Use shorter sentences, simpler vocabulary, and clear structure. Keep the same meaning and key information.

Text to simplify:
${truncated}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const simplified = data.choices?.[0]?.message?.content?.trim() || "Could not simplify text.";
    const result = { simplified };

    // Cache result
    await ctx.runMutation(internal.ai.setCachedResult, {
      key: cacheKey,
      type: "simplify",
      input: truncated.slice(0, 500), // store abbreviated input for debugging
      result: JSON.stringify(result),
    });

    return result;
  },
});
