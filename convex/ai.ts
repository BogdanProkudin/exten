import { v } from "convex/values";
import { action, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const AI_DAILY_LIMIT = 50; // max AI calls per device per day

// djb2 hash — deterministic, no crypto deps
function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function todayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

const langCodeToName: Record<string, string> = {
  en: "English", ru: "Russian", es: "Spanish", fr: "French",
  de: "German", it: "Italian", pt: "Portuguese", zh: "Chinese",
  ja: "Japanese", ko: "Korean", ar: "Arabic", hi: "Hindi",
  uk: "Ukrainian", pl: "Polish", tr: "Turkish",
};

const validLevels = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

function resolveLevel(userLevel?: string): string {
  return validLevels.has(userLevel || "") ? userLevel! : "B1";
}

function resolveLang(targetLang?: string): string {
  return langCodeToName[targetLang || ""] || targetLang || "English";
}

/** Strip characters that could break out of prompt template quotes */
function sanitizeForPrompt(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ").replace(/\r/g, "");
}

// --- Internal helpers ---

export const getCachedResult = internalQuery({
  args: { key: v.string(), type: v.union(v.literal("explain"), v.literal("simplify"), v.literal("sentence_analyze")) },
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
    type: v.union(v.literal("explain"), v.literal("simplify"), v.literal("sentence_analyze")),
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

export const checkAndIncrementRateLimit = internalMutation({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    const date = todayUTC();
    const existing = await ctx.db
      .query("aiRateLimits")
      .withIndex("by_device_date", (q) => q.eq("deviceId", deviceId).eq("date", date))
      .first();

    if (existing) {
      if (existing.callCount >= AI_DAILY_LIMIT) {
        return { allowed: false, remaining: 0 };
      }
      await ctx.db.patch(existing._id, { callCount: existing.callCount + 1 });
      return { allowed: true, remaining: AI_DAILY_LIMIT - existing.callCount - 1 };
    }

    await ctx.db.insert("aiRateLimits", { deviceId, date, callCount: 1 });
    return { allowed: true, remaining: AI_DAILY_LIMIT - 1 };
  },
});

// Shared OpenAI fetch with sanitized error handling
async function callOpenAI(
  apiKey: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    // Log full error server-side, return generic message to client
    const err = await response.text();
    console.error(`OpenAI API error: ${response.status} ${err}`);
    throw new Error("AI service temporarily unavailable. Please try again later.");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// --- Actions ---

export const explainWord = action({
  args: {
    word: v.string(),
    sentence: v.string(),
    deviceId: v.string(),
    targetLang: v.optional(v.string()),
    userLevel: v.optional(v.string()),
  },
  handler: async (ctx, { word, sentence, deviceId, targetLang, userLevel }): Promise<{ explanation: string }> => {
    const cacheKey = djb2(`explain:${word}:${sentence}:${targetLang || "en"}:${userLevel || "B1"}`);

    // Check cache first (doesn't count against rate limit)
    const cached = await ctx.runQuery(internal.ai.getCachedResult, {
      key: cacheKey,
      type: "explain",
    });
    if (cached) {
      return JSON.parse(cached.result);
    }

    // Server-side rate limit check
    const rateCheck = await ctx.runMutation(internal.ai.checkAndIncrementRateLimit, { deviceId });
    if (!rateCheck.allowed) {
      throw new Error("Daily AI limit reached. Try again tomorrow.");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("AI service not configured");
    }

    const level = resolveLevel(userLevel);
    const lang = resolveLang(targetLang);

    const prompt = `You are a vocabulary tutor. Explain the word "${sanitizeForPrompt(word)}" in simple terms suitable for a ${level}-level English learner.
${sentence ? `Context sentence: "${sanitizeForPrompt(sentence)}"` : ""}
${lang !== "English" ? `Give the explanation in ${lang}.` : ""}

Provide:
1. A clear, simple definition (1-2 sentences)
2. Why this word is used in this context (if context provided)
3. One example sentence using the word

Keep the total response under 100 words.`;

    const content = await callOpenAI(apiKey, prompt, 200, 0.3);
    const explanation = content || "No explanation available.";
    const result = { explanation };

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
    deviceId: v.string(),
    userLevel: v.optional(v.string()),
  },
  handler: async (ctx, { text, deviceId, userLevel }): Promise<{ simplified: string }> => {
    const truncated = text.slice(0, 12_000);
    const cacheKey = djb2(`simplify:${truncated}:${userLevel || "B1"}`);

    const cached = await ctx.runQuery(internal.ai.getCachedResult, {
      key: cacheKey,
      type: "simplify",
    });
    if (cached) {
      return JSON.parse(cached.result);
    }

    const rateCheck = await ctx.runMutation(internal.ai.checkAndIncrementRateLimit, { deviceId });
    if (!rateCheck.allowed) {
      throw new Error("Daily AI limit reached. Try again tomorrow.");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("AI service not configured");
    }

    const level = resolveLevel(userLevel);

    const prompt = `Rewrite the following text at a ${level} English level. Use shorter sentences, simpler vocabulary, and clear structure. Keep the same meaning and key information.

Text to simplify:
${sanitizeForPrompt(truncated)}`;

    const content = await callOpenAI(apiKey, prompt, 2000, 0.3);
    const simplified = content || "Could not simplify text.";
    const result = { simplified };

    await ctx.runMutation(internal.ai.setCachedResult, {
      key: cacheKey,
      type: "simplify",
      input: truncated.slice(0, 500),
      result: JSON.stringify(result),
    });

    return result;
  },
});

// --- Sentence Analysis ---

export interface SentenceAnalysis {
  grammar: string;
  phrases: { phrase: string; type: string; meaning: string }[];
  simplified: string;
  vocabulary: { word: string; role: string }[];
}

export const analyzeSentence = action({
  args: {
    sentence: v.string(),
    deviceId: v.string(),
    targetLang: v.optional(v.string()),
    userLevel: v.optional(v.string()),
  },
  handler: async (ctx, { sentence, deviceId, targetLang, userLevel }): Promise<SentenceAnalysis> => {
    const truncated = sentence.slice(0, 300);
    const cacheKey = djb2(`sentence_analyze:${truncated}:${targetLang || "en"}:${userLevel || "B1"}`);

    const cached = await ctx.runQuery(internal.ai.getCachedResult, {
      key: cacheKey,
      type: "sentence_analyze",
    });
    if (cached) {
      return JSON.parse(cached.result);
    }

    const rateCheck = await ctx.runMutation(internal.ai.checkAndIncrementRateLimit, { deviceId });
    if (!rateCheck.allowed) {
      throw new Error("Daily AI limit reached. Try again tomorrow.");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("AI service not configured");
    }

    const level = resolveLevel(userLevel);
    const lang = resolveLang(targetLang);

    const prompt = `Analyze this English sentence for a ${level}-level learner.
${lang !== "English" ? `Respond in ${lang}.` : ""}

Sentence: "${sanitizeForPrompt(truncated)}"

Return ONLY valid JSON with this structure:
{
  "grammar": "1-2 sentence grammar explanation",
  "phrases": [{"phrase": "...", "type": "idiom|phrasal_verb|collocation", "meaning": "..."}],
  "simplified": "simpler version of the sentence",
  "vocabulary": [{"word": "...", "role": "subject|verb|object|modifier|preposition|conjunction"}]
}

Keep grammar explanation under 50 words. List only notable phrases (0-3). Vocabulary should cover main content words (3-8 entries).`;

    const content = await callOpenAI(apiKey, prompt, 300, 0.2);

    let result: SentenceAnalysis;
    try {
      const parsed = JSON.parse(content || "{}");
      // Validate shape — only accept expected fields with correct types
      result = {
        grammar: typeof parsed.grammar === "string" ? parsed.grammar : content,
        phrases: Array.isArray(parsed.phrases)
          ? parsed.phrases.filter((p: unknown) =>
              p && typeof p === "object" && typeof (p as any).phrase === "string"
                && typeof (p as any).type === "string" && typeof (p as any).meaning === "string"
            ).slice(0, 5)
          : [],
        simplified: typeof parsed.simplified === "string" ? parsed.simplified : truncated,
        vocabulary: Array.isArray(parsed.vocabulary)
          ? parsed.vocabulary.filter((v: unknown) =>
              v && typeof v === "object" && typeof (v as any).word === "string"
                && typeof (v as any).role === "string"
            ).slice(0, 10)
          : [],
      };
    } catch {
      result = {
        grammar: content,
        phrases: [],
        simplified: truncated,
        vocabulary: [],
      };
    }

    await ctx.runMutation(internal.ai.setCachedResult, {
      key: cacheKey,
      type: "sentence_analyze",
      input: truncated,
      result: JSON.stringify(result),
    });

    return result;
  },
});
