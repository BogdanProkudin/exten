import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { getDeviceId } from "../src/lib/device-id";
import { translateWord } from "../src/lib/translate";
import { canMakeAiCall, incrementAiCalls } from "../src/lib/pro-gate";
import type { Id } from "../convex/_generated/dataModel";

const REVIEW_ALARM = "vocabify-review";
const RADAR_DECAY_ALARM = "vocabify-radar-decay";

// --- Type-safe message types ---
type TranslateMessage = { type: "TRANSLATE_WORD"; word: string; lang?: string };
type GetStatsMessage = { type: "GET_STATS" };
type GetAchievementsMessage = { type: "GET_ACHIEVEMENTS" };
type SaveMessage = {
  type: "SAVE_WORD";
  word: string;
  translation: string;
  example?: string;
  sourceUrl?: string;
  exampleContext?: string[];
  exampleSource?: string;
};
type ReviewResultMessage = {
  type: "REVIEW_RESULT";
  wordId: string;
  remembered: boolean;
};
type GetDeviceIdMessage = { type: "GET_DEVICE_ID" };
type ScanPageMessage = { type: "SCAN_PAGE"; words: string[] };
type GetVocabCacheMessage = { type: "GET_VOCAB_CACHE" };
type AiExplainMessage = {
  type: "AI_EXPLAIN";
  word: string;
  sentence: string;
  targetLang?: string;
  userLevel?: string;
};
type AiSimplifyMessage = { type: "AI_SIMPLIFY"; text: string; userLevel?: string };
type CheckProMessage = { type: "CHECK_PRO" };
type GetWordByLemmaMessage = { type: "GET_WORD_BY_LEMMA"; lemma: string; word?: string };
type ToggleHardMessage = { type: "TOGGLE_HARD"; wordId: string };
type AddContextMessage = { type: "ADD_CONTEXT"; wordId: string; sentence: string; url: string };
type DeleteWordMessage = { type: "DELETE_WORD"; wordId: string };

type AppMessage =
  | TranslateMessage
  | SaveMessage
  | ReviewResultMessage
  | GetDeviceIdMessage
  | ScanPageMessage
  | GetVocabCacheMessage
  | AiExplainMessage
  | AiSimplifyMessage
  | CheckProMessage
  | GetWordByLemmaMessage
  | ToggleHardMessage
  | AddContextMessage
  | GetStatsMessage
  | GetAchievementsMessage
  | DeleteWordMessage;

function isValidMessage(msg: unknown): msg is AppMessage {
  if (!msg || typeof msg !== "object" || !("type" in msg)) return false;
  const m = msg as Record<string, unknown>;
  switch (m.type) {
    case "TRANSLATE_WORD":
      return typeof m.word === "string";
    case "SAVE_WORD":
      return typeof m.word === "string" && typeof m.translation === "string";
    case "REVIEW_RESULT":
      return typeof m.wordId === "string" && typeof m.remembered === "boolean";
    case "GET_DEVICE_ID":
      return true;
    case "SCAN_PAGE":
      return Array.isArray(m.words);
    case "GET_VOCAB_CACHE":
      return true;
    case "AI_EXPLAIN":
      return typeof m.word === "string" && typeof m.sentence === "string";
    case "AI_SIMPLIFY":
      return typeof m.text === "string";
    case "CHECK_PRO":
      return true;
    case "GET_WORD_BY_LEMMA":
      return typeof m.lemma === "string";
    case "TOGGLE_HARD":
      return typeof m.wordId === "string";
    case "ADD_CONTEXT":
      return typeof m.wordId === "string" && typeof m.sentence === "string" && typeof m.url === "string";
    case "GET_STATS":
      return true;
    case "GET_ACHIEVEMENTS":
      return true;
    case "DELETE_WORD":
      return typeof m.wordId === "string";
    default:
      return false;
  }
}

// Fire-and-forget event logging — never blocks the main flow
function logEvent(
  convex: ConvexHttpClient,
  deviceId: string,
  type: "word_lookup" | "word_saved" | "review_remembered" | "review_forgot" | "toast_shown",
  word?: string,
) {
  convex
    .mutation(api.events.logEvent, { deviceId, type, word })
    .catch(() => {});
}

export default defineBackground(() => {
  const convex = new ConvexHttpClient(
    import.meta.env.VITE_CONVEX_URL as string,
  );

  // --- Update word count badge ---
  async function updateBadge() {
    try {
      const deviceId = await getDeviceId();
      const stats = await convex.query(api.words.stats, { deviceId });
      const count = stats.total;
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
      chrome.action.setBadgeBackgroundColor({ color: "#3b82f6" });
    } catch {
      // Silently fail — badge is non-critical
    }
  }

  chrome.runtime.onInstalled.addListener(async () => {
    await getDeviceId();
    chrome.alarms.create(REVIEW_ALARM, { periodInMinutes: 30 });
    chrome.alarms.create(RADAR_DECAY_ALARM, { periodInMinutes: 60 * 24 });

    // Create context menus
    chrome.contextMenus.create({
      id: "vocabify-translate",
      title: "Translate with Vocabify",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "vocabify-save",
      title: "Save to Vocabify",
      contexts: ["selection"],
    });

    // Set initial badge
    updateBadge();
  });

  // --- Context menu handler ---
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id || !info.selectionText) return;
    const text = info.selectionText.trim();
    if (!text || text.length < 2 || text.length > 40) return;

    try {
      if (info.menuItemId === "vocabify-translate") {
        await chrome.tabs.sendMessage(tab.id, {
          type: "CONTEXT_MENU_TRANSLATE",
          word: text,
        });
      } else if (info.menuItemId === "vocabify-save") {
        // Translate then save
        const deviceId = await getDeviceId();
        const translation = await translateWord(text);
        await convex.mutation(api.words.add, {
          deviceId,
          word: text,
          translation,
          example: "",
          sourceUrl: tab.url || "",
        });
        logEvent(convex, deviceId, "word_saved", text);
        const xpResult = await convex.mutation(api.gamification.awardXp, {
          deviceId,
          action: "word_saved",
        });
        updateBadge();
        // Notify content script of successful save
        await chrome.tabs.sendMessage(tab.id, {
          type: "CONTEXT_MENU_SAVED",
          word: text,
          translation,
          xp: xpResult,
        });
      }
    } catch (e) {
      console.error("[Vocabify] Context menu error:", e);
    }
  });

  // --- Keyboard shortcut handler ---
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "translate-selection") return;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) return;
      await chrome.tabs.sendMessage(tab.id, { type: "KEYBOARD_TRANSLATE" });
    } catch {
      // Content script not available
    }
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    // Radar decay: remove entries older than 7 days
    if (alarm.name === RADAR_DECAY_ALARM) {
      try {
        const data = await chrome.storage.local.get("vocabifyRadar") as Record<string, { seen: Record<string, { count: number; lastSeenAt: number }> } | undefined>;
        const radar = data.vocabifyRadar;
        if (!radar?.seen) return;
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const filtered: Record<string, { count: number; lastSeenAt: number }> = {};
        for (const [lemma, entry] of Object.entries(radar.seen)) {
          if (entry.lastSeenAt >= sevenDaysAgo) {
            filtered[lemma] = entry;
          }
        }
        await chrome.storage.local.set({ vocabifyRadar: { seen: filtered } });
      } catch (e) {
        console.error("[Vocabify] Radar decay error:", e);
      }
      return;
    }

    if (alarm.name !== REVIEW_ALARM) return;

    try {
      const deviceId = await getDeviceId();

      // Read configurable interval, DND, and toast limit from storage
      const settings = await chrome.storage.sync.get([
        "reviewIntervalMinutes",
        "dndUntil",
        "maxToastsPerDay",
      ]) as { reviewIntervalMinutes?: number; dndUntil?: number; maxToastsPerDay?: number };
      if (settings.dndUntil && Date.now() < settings.dndUntil) return;

      // Daily toast limit check
      const maxToasts = settings.maxToastsPerDay ?? 15;
      const toastData = await chrome.storage.local.get([
        "toastsShownToday",
        "lastToastResetDate",
      ]) as { toastsShownToday?: number; lastToastResetDate?: string };

      const today = new Date().toISOString().slice(0, 10);
      let toastsShown = toastData.toastsShownToday ?? 0;
      if (toastData.lastToastResetDate !== today) {
        toastsShown = 0;
        await chrome.storage.local.set({ toastsShownToday: 0, lastToastResetDate: today });
      }
      if (toastsShown >= maxToasts) return;

      const words = await convex.query(api.words.getReviewWords, {
        deviceId,
        limit: 1,
      });

      if (words.length === 0) return;

      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const tab = tabs[0];
      if (!tab?.id) return; // No active tab (e.g., all windows minimized)

      // Skip chrome:// and other restricted URLs
      if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://"))) {
        return;
      }

      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_REVIEW",
          word: words[0],
        });
        // Increment daily toast counter
        await chrome.storage.local.set({ toastsShownToday: toastsShown + 1 });
        // Log toast_shown event
        logEvent(convex, deviceId, "toast_shown", words[0].word);
      } catch {
        // Content script not loaded on this tab — skip silently
      }
    } catch (e) {
      console.error("[Vocabify] Alarm handler error:", e);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isValidMessage(message)) {
      sendResponse({ error: "Unknown message type" });
      return false;
    }
    handleMessage(message, convex, updateBadge).then(sendResponse);
    return true; // keep channel open for async response
  });
});

async function handleMessage(message: AppMessage, convex: ConvexHttpClient, updateBadge: () => Promise<void>) {
  const deviceId = await getDeviceId();

  switch (message.type) {
    case "TRANSLATE_WORD": {
      try {
        const translation = await translateWord(message.word, message.lang);
        logEvent(convex, deviceId, "word_lookup", message.word);
        return { success: true, translation };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "SAVE_WORD": {
      try {
        const wordId = await convex.mutation(api.words.add, {
          deviceId,
          word: message.word,
          translation: message.translation,
          example: message.example || "",
          sourceUrl: message.sourceUrl || "",
          exampleContext: message.exampleContext,
          exampleSource: message.exampleSource,
        });
        logEvent(convex, deviceId, "word_saved", message.word);
        // Award XP for saving word
        const xpResult = await convex.mutation(api.gamification.awardXp, {
          deviceId,
          action: "word_saved",
        });
        updateBadge();
        return { success: true, xp: xpResult, wordId };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "REVIEW_RESULT": {
      try {
        const result = await convex.mutation(api.words.updateReview, {
          id: message.wordId as Id<"words">,
          deviceId,
          remembered: message.remembered,
        });
        logEvent(
          convex,
          deviceId,
          message.remembered ? "review_remembered" : "review_forgot",
        );
        // Award XP for review
        const xpResult = await convex.mutation(api.gamification.awardXp, {
          deviceId,
          action: message.remembered ? "review_remembered" : "review_forgot",
        });
        return { 
          success: true, 
          newStatus: result?.newStatus, 
          intervalDays: result?.intervalDays,
          xp: xpResult,
        };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "GET_DEVICE_ID": {
      return { deviceId };
    }

    case "SCAN_PAGE": {
      try {
        const savedWords = await convex.query(api.words.getWordSet, { deviceId });
        const savedSet = new Set(savedWords.map((w: string) => w.toLowerCase()));
        const unsaved = message.words.filter((w: string) => !savedSet.has(w.toLowerCase()));
        return { success: true, words: unsaved.slice(0, 10) };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "GET_VOCAB_CACHE": {
      try {
        const cache = await convex.query(api.words.getVocabCache, { deviceId });
        return { success: true, ...cache };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "AI_EXPLAIN": {
      try {
        const proCheck = await canMakeAiCall();
        if (!proCheck.allowed) {
          return { success: false, error: "Daily AI limit reached", remaining: 0 };
        }
        const result = await convex.action(api.ai.explainWord, {
          word: message.word,
          sentence: message.sentence,
          targetLang: message.targetLang,
          userLevel: message.userLevel,
        });
        await incrementAiCalls();
        const remaining = (await canMakeAiCall()).remaining;
        return { success: true, explanation: result.explanation, remaining };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "AI_SIMPLIFY": {
      try {
        const proCheck = await canMakeAiCall();
        if (!proCheck.allowed) {
          return { success: false, error: "Daily AI limit reached", remaining: 0 };
        }
        const result = await convex.action(api.ai.simplifyText, {
          text: message.text,
          userLevel: message.userLevel,
        });
        await incrementAiCalls();
        const remaining = (await canMakeAiCall()).remaining;
        return {
          success: true,
          simplified: result.simplified,
          originalLength: message.text.length,
          remaining,
        };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "CHECK_PRO": {
      try {
        const status = await canMakeAiCall();
        return { success: true, ...status };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "GET_WORD_BY_LEMMA": {
      try {
        const word = await convex.query(api.words.getByLemma, {
          deviceId,
          lemma: message.lemma,
          word: message.word,
        });
        return { success: true, word };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "TOGGLE_HARD": {
      try {
        await convex.mutation(api.words.toggleHard, {
          id: message.wordId as Id<"words">,
          deviceId,
        });
        return { success: true };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "ADD_CONTEXT": {
      try {
        const result = await convex.mutation(api.words.addContext, {
          id: message.wordId as Id<"words">,
          deviceId,
          sentence: message.sentence,
          url: message.url,
        });
        return { success: true, duplicate: result?.duplicate ?? false };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "GET_STATS": {
      try {
        const stats = await convex.query(api.gamification.getStats, { deviceId });
        return { success: true, stats };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "GET_ACHIEVEMENTS": {
      try {
        const achievements = await convex.query(api.gamification.getAchievements, { deviceId });
        return { success: true, achievements };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "DELETE_WORD": {
      try {
        await convex.mutation(api.words.remove, {
          id: message.wordId as Id<"words">,
          deviceId,
        });
        updateBadge();
        return { success: true };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }
  }
}
