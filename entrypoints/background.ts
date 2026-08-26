import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { getDeviceId } from "../src/lib/device-id";
import { translateWord } from "../src/lib/translate";
import { classifySelection } from "../src/lib/language-guard";
import {
  translateWithOpenAI,
  translateSentenceWithOpenAI,
  OpenAiTranslateError,
  type AiSentenceTranslation,
} from "../src/lib/openai-translate";
import {
  translationCacheKey,
  sentenceCacheKey,
  getCachedTranslation,
  setCachedTranslation,
} from "../src/lib/translation-cache";
import { canMakeAiCall, tryConsumeAiCall } from "../src/lib/pro-gate";
import type { Id } from "../convex/_generated/dataModel";
import { getDefaultState, type SchedulerState } from "../src/lib/smart-scheduler";
import { populateFromAsset } from "../src/lib/local-dictionary";

const RADAR_DECAY_ALARM = "vocabify-radar-decay";
const SCHEDULER_STATE_KEY = "vocabifySchedulerState";
const TIMER_STATE_KEY = "vocabifyTimerState";

// --- Timer ---
const REVIEW_TIMER_ALARM = "vocabify-review-timer";
const DEFAULT_REVIEW_INTERVAL_MIN = 30;

async function getReviewIntervalMs(): Promise<number> {
  const data = await chrome.storage.sync.get("reviewIntervalMinutes");
  const minutes = (data.reviewIntervalMinutes as number) || DEFAULT_REVIEW_INTERVAL_MIN;
  return minutes * 60 * 1000;
}

async function scheduleNextReview() {
  const intervalMs = await getReviewIntervalMs();
  const nextReviewAt = Date.now() + intervalMs;
  await chrome.storage.session.set({ [TIMER_STATE_KEY]: { nextReviewAt } });
  chrome.alarms.create(REVIEW_TIMER_ALARM, { when: nextReviewAt });
}

// --- Type-safe message types ---
type TranslateMessage = { type: "TRANSLATE_WORD"; word: string; lang?: string };
type AiTranslateSentenceMessage = {
  type: "AI_TRANSLATE_SENTENCE";
  sentence: string;
  pageTitle?: string;
  url?: string;
  /** False asks for the free chain only, so nothing is billed. Default true. */
  useAi?: boolean;
};
type AiTranslateMessage = {
  type: "AI_TRANSLATE";
  word: string;
  sentence?: string;
  pageTitle?: string;
  url?: string;
};
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
  rating?: number;
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
type AddContextMessage = { type: "ADD_CONTEXT"; wordId: string; sentence: string; url: string };
type DeleteWordMessage = { type: "DELETE_WORD"; wordId: string };
type AiAnalyzeSentenceMessage = {
  type: "AI_ANALYZE_SENTENCE";
  sentence: string;
  targetLang?: string;
  userLevel?: string;
};
type UpdateActivityMessage = { type: "UPDATE_ACTIVITY" };
type VideoStateMessage = { type: "VIDEO_STATE"; playing: boolean };
type TypingStateMessage = { type: "TYPING_STATE"; typing: boolean };
type DictLookupMessage = { type: "DICT_LOOKUP"; word: string };
type GetTimerStateMessage = { type: "GET_TIMER_STATE" };
type ScheduleNextReviewMessage = { type: "SCHEDULE_NEXT_REVIEW" };
type OpenDashboardMessage = { type: "OPEN_DASHBOARD"; hash?: string };
type UpdateAlarmMessage = { type: "UPDATE_ALARM"; intervalMinutes: number };
type SpeakWordMessage = { type: "SPEAK_WORD"; word: string };
type StopSpeakingMessage = { type: "STOP_SPEAKING" };

type AppMessage =
  | TranslateMessage
  | AiTranslateMessage
  | AiTranslateSentenceMessage
  | SaveMessage
  | ReviewResultMessage
  | GetDeviceIdMessage
  | ScanPageMessage
  | GetVocabCacheMessage
  | AiExplainMessage
  | AiSimplifyMessage
  | CheckProMessage
  | GetWordByLemmaMessage
  | AddContextMessage
  | DeleteWordMessage
  | AiAnalyzeSentenceMessage
  | UpdateActivityMessage
  | VideoStateMessage
  | TypingStateMessage
  | DictLookupMessage
  | GetTimerStateMessage
  | ScheduleNextReviewMessage
  | OpenDashboardMessage
  | UpdateAlarmMessage
  | { type: "GET_DISTRACTORS"; wordId: string; count?: number }
  | SpeakWordMessage
  | StopSpeakingMessage
;

// Upper bounds for page-controlled text forwarded to the paid translation API.
const MAX_TRANSLATE_WORD = 300;
const MAX_TRANSLATE_SENTENCE = 1200;
const MAX_TRANSLATE_TITLE = 200;

// Keys OpenAI has rejected this worker lifetime. Deliberately in memory only:
// it clears when the worker restarts, so pasting a corrected key starts working
// again without any explicit reset.
const rejectedKeys = new Set<string>();
const isKeyKnownBad = (key: string) => rejectedKeys.has(key);
const markKeyBad = (key: string) => rejectedKeys.add(key);

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isValidMessage(msg: unknown): msg is AppMessage {
  if (!msg || typeof msg !== "object" || !("type" in msg)) return false;
  const m = msg as Record<string, unknown>;
  switch (m.type) {
    case "TRANSLATE_WORD":
      return typeof m.word === "string";
    case "AI_TRANSLATE_SENTENCE":
      return typeof m.sentence === "string"
        && (m.pageTitle === undefined || typeof m.pageTitle === "string")
        && (m.url === undefined || typeof m.url === "string")
        && (m.useAi === undefined || typeof m.useAi === "boolean");
    case "AI_TRANSLATE":
      // The optional fields are sliced without further checks in the handler,
      // and an unhandled throw there leaves the message port unanswered.
      return typeof m.word === "string"
        && (m.sentence === undefined || typeof m.sentence === "string")
        && (m.pageTitle === undefined || typeof m.pageTitle === "string")
        && (m.url === undefined || typeof m.url === "string");
    case "SAVE_WORD":
      return typeof m.word === "string" && typeof m.translation === "string";
    case "REVIEW_RESULT":
      return typeof m.wordId === "string" && (typeof m.remembered === "boolean" || typeof m.rating === "number");
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
    case "ADD_CONTEXT":
      return typeof m.wordId === "string" && typeof m.sentence === "string" && typeof m.url === "string";
    case "DELETE_WORD":
      return typeof m.wordId === "string";
    case "AI_ANALYZE_SENTENCE":
      return typeof m.sentence === "string";
    case "UPDATE_ACTIVITY":
      return true;
    case "VIDEO_STATE":
      return typeof m.playing === "boolean";
    case "TYPING_STATE":
      return typeof m.typing === "boolean";
    case "DICT_LOOKUP":
      return typeof m.word === "string";
    case "GET_TIMER_STATE":
      return true;
    case "SCHEDULE_NEXT_REVIEW":
      return true;
    case "OPEN_DASHBOARD":
      return true;
    case "UPDATE_ALARM":
      return typeof m.intervalMinutes === "number";
    case "GET_DISTRACTORS":
      return typeof m.wordId === "string";
    case "SPEAK_WORD":
      return typeof m.word === "string";
    case "STOP_SPEAKING":
      return true;
    default:
      return false;
  }
}

// Fire-and-forget event logging — never blocks the main flow
type EventType = "word_lookup" | "word_saved" | "review_remembered" | "review_forgot" | "toast_shown" | "writing_practice";

function logEvent(
  convex: ConvexHttpClient,
  deviceId: string,
  type: EventType,
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

  // --- Simple review timer ---
  // Track last N shown word IDs to avoid repetition
  const RECENT_SHOWN_MAX = 5;
  let recentlyShownIds: string[] = [];

  async function handleReviewAlarm() {
    try {
      // Check Do Not Disturb
      const dndData = await chrome.storage.sync.get("dndUntil") as Record<string, number | undefined>;
      if (dndData.dndUntil && Date.now() < dndData.dndUntil) {
        await scheduleNextReview();
        return;
      }

      // Check daily toast limit
      const settings = await chrome.storage.sync.get("maxToastsPerDay") as Record<string, number | undefined>;
      const maxToasts = settings.maxToastsPerDay ?? 15;
      const limitData = await chrome.storage.local.get(["toastsShownToday", "lastToastResetDate"]) as Record<string, unknown>;
      const todayStr = new Date().toISOString().slice(0, 10);
      const toastsToday = (limitData.lastToastResetDate === todayStr ? (limitData.toastsShownToday as number) ?? 0 : 0);
      if (toastsToday >= maxToasts) {
        await scheduleNextReview();
        return;
      }

      const deviceId = await getDeviceId();
      const words = await convex.query(api.words.getReviewWords, {
        deviceId,
        limit: 3,
        recentlyShownIds,
      });

      if (words.length === 0) {
        await scheduleNextReview();
        return;
      }

      // Pick the top word (highest score)
      const picked = words[0];

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) {
        await scheduleNextReview();
        return;
      }

      if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://"))) {
        await scheduleNextReview();
        return;
      }

      await chrome.tabs.sendMessage(tab.id, { type: "SHOW_REVIEW", word: picked });

      // Track recently shown to avoid repetition
      recentlyShownIds.push(picked._id.toString());
      if (recentlyShownIds.length > RECENT_SHOWN_MAX) {
        recentlyShownIds = recentlyShownIds.slice(-RECENT_SHOWN_MAX);
      }

      // Update counters
      const toastData = await chrome.storage.local.get(["toastsShownToday", "lastToastResetDate"]) as Record<string, unknown>;
      const today = new Date().toISOString().slice(0, 10);
      let toastsShown = (toastData.toastsShownToday as number) ?? 0;
      if (toastData.lastToastResetDate !== today) toastsShown = 0;
      await chrome.storage.local.set({ toastsShownToday: toastsShown + 1, lastToastResetDate: today });

      logEvent(convex, deviceId, "toast_shown", words[0].word);
      // Next timer is scheduled by SCHEDULE_NEXT_REVIEW when popup closes
    } catch (e) {
      console.error("[Vocabify Timer] Error:", e);
      // On error (content script not loaded), still schedule next
      await scheduleNextReview();
    }
  }

  chrome.runtime.onInstalled.addListener(async () => {
    await getDeviceId();

    chrome.alarms.create(RADAR_DECAY_ALARM, { periodInMinutes: 60 * 24 });

    // Initialize idle detection (60s threshold)
    chrome.idle.setDetectionInterval(60);

    // Initialize scheduler state
    await chrome.storage.session.set({ [SCHEDULER_STATE_KEY]: getDefaultState() });

    // Start review timer
    await scheduleNextReview();

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

    // Populate local dictionary from bundled asset (non-blocking)
    populateFromAsset().catch(() => {});

    // Migrate enrichment cache from chrome.storage.local to IndexedDB
    migrateStorageToIndexedDB().catch(() => {});

    // Set initial badge
    updateBadge();
  });

  async function migrateStorageToIndexedDB() {
    try {
      const { getFromStore, putInStore } = await import("../src/lib/indexed-db");
      const migrated = await getFromStore<boolean>("settings", "migrationComplete");
      if (migrated) return;

      // Migrate enrichment cache
      const enrichmentData = await chrome.storage.local.get("vocabifyEnrichment");
      if (enrichmentData.vocabifyEnrichment) {
        const cache = enrichmentData.vocabifyEnrichment as Record<string, { data: unknown; timestamp: number }>;
        for (const [key, value] of Object.entries(cache)) {
          await putInStore("enrichment", key, value);
        }
        await chrome.storage.local.remove("vocabifyEnrichment");
      }

      // Migrate radar data
      const radarData = await chrome.storage.local.get("vocabifyRadar");
      if (radarData.vocabifyRadar) {
        await putInStore("radar", "radar-data", radarData.vocabifyRadar);
        await chrome.storage.local.remove("vocabifyRadar");
      }

      // Migrate openaiApiKey from sync to local storage
      const syncData = await chrome.storage.sync.get("openaiApiKey");
      if (syncData.openaiApiKey) {
        await chrome.storage.local.set({ openaiApiKey: syncData.openaiApiKey });
        await chrome.storage.sync.remove("openaiApiKey");
      }

      await putInStore("settings", "migrationComplete", true);
    } catch (e) {
      console.error("[Vocabify] Migration error:", e);
    }
  }

  // --- Idle state tracking ---
  chrome.idle.onStateChanged.addListener(async (newState) => {
    const data = await chrome.storage.session.get(SCHEDULER_STATE_KEY) as Record<string, SchedulerState | undefined>;
    const state = data[SCHEDULER_STATE_KEY] ?? getDefaultState();
    state.idleState = newState as SchedulerState["idleState"];
    if (newState === "active") {
      const now = Date.now();
      // Reset session start if coming back from idle/locked
      if (!state.sessionStart || now - state.lastActiveTime > 5 * 60 * 1000) {
        state.sessionStart = now;
      }
      state.lastActiveTime = now;
    }
    await chrome.storage.session.set({ [SCHEDULER_STATE_KEY]: state });
  });

  // --- Tab change tracking ---
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      const data = await chrome.storage.session.get(SCHEDULER_STATE_KEY) as Record<string, SchedulerState | undefined>;
      const state = data[SCHEDULER_STATE_KEY] ?? getDefaultState();
      state.tabUrl = tab.url || "";
      state.lastActiveTime = Date.now();
      await chrome.storage.session.set({ [SCHEDULER_STATE_KEY]: state });
    } catch {
      // Tab might be gone
    }
  });

  // --- Context menu handler ---
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id || !info.selectionText) return;
    const text = info.selectionText.trim();
    if (!text || text.length > 40) return;
    // English-only: don't act on Russian, CJK, Greek, Arabic, etc. Phrases stay
    // allowed — the selection popup accepts them, so the menu must too.
    if (classifySelection(text) === "reject") return;

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
        updateBadge();
        // Notify content script of successful save
        await chrome.tabs.sendMessage(tab.id, {
          type: "CONTEXT_MENU_SAVED",
          word: text,
          translation,
        });
      }
    } catch (e) {
      console.error("[Vocabify] Context menu error:", e);
    }
  });

  // --- Keyboard shortcut handler ---
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === "open-dashboard") {
      await openDashboard();
      return;
    }
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
        const { getFromStore, putInStore } = await import("../src/lib/indexed-db");
        const radar = await getFromStore<{ seen: Record<string, { count: number; lastSeenAt: number }> }>("radar", "radar-data");
        if (!radar?.seen) return;
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const filtered: Record<string, { count: number; lastSeenAt: number }> = {};
        for (const [lemma, entry] of Object.entries(radar.seen)) {
          if (entry.lastSeenAt >= sevenDaysAgo) {
            filtered[lemma] = entry;
          }
        }
        await putInStore("radar", "radar-data", { seen: filtered });
      } catch (e) {
        console.error("[Vocabify] Radar decay error:", e);
      }
      return;
    }

    if (alarm.name === REVIEW_TIMER_ALARM) {
      await handleReviewAlarm();
      return;
    }

  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only accept messages from this extension
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ error: "Unauthorized" });
      return false;
    }
    if (!isValidMessage(message)) {
      sendResponse({ error: "Unknown message type" });
      return false;
    }

    // Without the catch, a throw anywhere in handleMessage leaves the port open
    // and the caller's sendMessage promise never settles — the popup spins
    // forever instead of showing an error.
    handleMessage(message, convex, updateBadge)
      .then(sendResponse)
      .catch((e) => {
        console.error("[Vocabify] message handler failed:", e);
        sendResponse({ success: false, error: "Internal error" });
      });
    return true; // keep channel open for async response
  });
});

async function openDashboard(hash?: string) {
  const dashboardUrl = chrome.runtime.getURL("/dashboard.html");
  const matchUrl = `${dashboardUrl}*`;
  const tabs = await chrome.tabs.query({ url: matchUrl });
  if (tabs.length > 0 && tabs[0].id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId != null) {
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
    if (hash) {
      await chrome.tabs.update(tabs[0].id, { url: `${dashboardUrl}#${hash}` });
    }
    return;
  }
  const url = hash ? `${dashboardUrl}#${hash}` : dashboardUrl;
  await chrome.tabs.create({ url });
}

let offscreenCreating: Promise<void> | null = null;

async function ensureOffscreen() {
  const existing = await chrome.offscreen.hasDocument?.().catch(() => false);
  if (existing) return;
  if (offscreenCreating) { await offscreenCreating; return; }
  offscreenCreating = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "TTS audio playback for word pronunciation",
  });
  await offscreenCreating;
  offscreenCreating = null;
}

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

    // Whole-sentence translation. Same key, cache, clamps and fallback as the
    // word path — the only differences are the schema and the extras it returns.
    case "AI_TRANSLATE_SENTENCE": {
      const sentence = message.sentence.slice(0, MAX_TRANSLATE_SENTENCE).trim();
      const pageTitle = (message.pageTitle ?? "").slice(0, MAX_TRANSLATE_TITLE);
      const url = message.url ?? "";

      if (!sentence) return { success: false, error: "Empty sentence" };

      const sync = await chrome.storage.sync.get([
        "targetLang",
        "userLevel",
        "enableSmartTranslation",
      ]) as Record<string, unknown>;
      const targetLang = (sync.targetLang as string) || "ru";
      const userLevel = (sync.userLevel as string) || "B1";
      const aiEnabled = sync.enableSmartTranslation !== false;

      const local = await chrome.storage.local.get("openaiApiKey") as { openaiApiKey?: string };
      const apiKey = local.openaiApiKey?.trim();

      let aiError: string | null = null;

      // The caller can opt out per request: long paragraphs open on the free
      // chain so nothing is spent until the reader asks for AI.
      const wantsAi = message.useAi !== false;

      if (!wantsAi) {
        aiError = null;
      } else if (apiKey && isKeyKnownBad(apiKey)) {
        aiError = "auth";
      } else if (aiEnabled && apiKey) {
        const cacheKey = sentenceCacheKey(sentence, targetLang, userLevel);
        const cached = await getCachedTranslation<AiSentenceTranslation>(cacheKey, sentence);
        if (cached) {
          return { success: true, source: "ai", result: cached, cached: true };
        }

        try {
          const result = await translateSentenceWithOpenAI({
            apiKey,
            sentence,
            pageTitle,
            domain: safeHostname(url),
            targetLang,
            userLevel,
          });

          if (!result.isEnglish) {
            return { success: false, error: "Not English", notEnglish: true };
          }

          await setCachedTranslation(cacheKey, result, sentence);
          return { success: true, source: "ai", result, cached: false };
        } catch (e) {
          aiError = e instanceof OpenAiTranslateError ? e.kind : "network";
          if (aiError === "auth") markKeyBad(apiKey);
          console.warn(`[Vocabify] AI sentence translation failed (${aiError}), using fallback`);
        }
      }

      try {
        const translation = await translateWord(sentence, targetLang);
        return { success: true, source: "basic", translation, aiError };
      } catch (e) {
        return { success: false, error: String(e), aiError };
      }
    }

    // Context-aware lookup. Runs here rather than in the content script because
    // MV3 content scripts cannot make cross-origin requests.
    case "AI_TRANSLATE": {
      // Clamp before anything else. All three fields are page-controlled, and
      // pageTitle in particular is whatever <title> the site chose — an
      // oversized one would be billed to the user's OpenAI account on every
      // lookup and would blow out the cache key.
      const word = message.word.slice(0, MAX_TRANSLATE_WORD);
      const sentence = (message.sentence ?? "").slice(0, MAX_TRANSLATE_SENTENCE);
      const pageTitle = (message.pageTitle ?? "").slice(0, MAX_TRANSLATE_TITLE);
      const url = message.url ?? "";

      if (!word.trim()) return { success: false, error: "Empty word" };

      const sync = await chrome.storage.sync.get([
        "targetLang",
        "userLevel",
        "enableSmartTranslation",
      ]) as Record<string, unknown>;
      const targetLang = (sync.targetLang as string) || "ru";
      const userLevel = (sync.userLevel as string) || "B1";
      const aiEnabled = sync.enableSmartTranslation !== false;

      const local = await chrome.storage.local.get("openaiApiKey") as { openaiApiKey?: string };
      const apiKey = local.openaiApiKey?.trim();

      let aiError: string | null = null;

      // A key OpenAI already rejected will be rejected again. Retrying it on
      // every lookup adds the full request timeout in front of the free
      // fallback, so each word takes tens of seconds instead of one.
      if (apiKey && isKeyKnownBad(apiKey)) {
        aiError = "auth";
      } else if (aiEnabled && apiKey) {
        const cacheKey = translationCacheKey(word, sentence, targetLang, userLevel);
        const cached = await getCachedTranslation(cacheKey, sentence);
        if (cached) {
          logEvent(convex, deviceId, "word_lookup", word);
          return { success: true, source: "ai", result: cached, cached: true };
        }

        try {
          const result = await translateWithOpenAI({
            apiKey,
            word,
            sentence,
            pageTitle,
            domain: safeHostname(url),
            targetLang,
            userLevel,
          });
          // The script check catches non-Latin text for free; this catches the
          // Latin-script case it cannot (French, Spanish, invented words). Do
          // not cache a verdict about text we are not going to translate.
          if (!result.isEnglish) {
            return { success: false, error: "Not English", notEnglish: true };
          }

          await setCachedTranslation(cacheKey, result, sentence);
          logEvent(convex, deviceId, "word_lookup", word);
          return { success: true, source: "ai", result, cached: false };
        } catch (e) {
          // Fall through to the free chain — a broken key must not break lookups.
          aiError = e instanceof OpenAiTranslateError ? e.kind : "network";
          if (aiError === "auth") markKeyBad(apiKey);
          console.warn(`[Vocabify] AI translation failed (${aiError}), using fallback`);
        }
      }

      try {
        const translation = await translateWord(word, targetLang);
        logEvent(convex, deviceId, "word_lookup", word);
        return { success: true, source: "basic", translation, aiError };
      } catch (e) {
        return { success: false, error: String(e), aiError };
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
        updateBadge();
        // Schedule a review if no timer is active
        const timerData = await chrome.storage.session.get(TIMER_STATE_KEY) as Record<string, { nextReviewAt: number } | undefined>;
        if (!timerData[TIMER_STATE_KEY] || timerData[TIMER_STATE_KEY]!.nextReviewAt < Date.now()) {
          await scheduleNextReview();
        }
        // Check for newly unlocked achievements
        const { newAchievements } = await convex.mutation(
          api.gamification.checkAchievements,
          { deviceId },
        );
        return {
          success: true,
          wordId,
          achievements: newAchievements,
        };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "REVIEW_RESULT": {
      try {
        const result = await convex.mutation(api.words.updateReview, {
          id: message.wordId as Id<"words">,
          deviceId,
          ...(message.rating != null
            ? { rating: message.rating }
            : { remembered: message.remembered }),
        });
        const wasRemembered = message.rating != null ? message.rating >= 3 : message.remembered;
        logEvent(
          convex,
          deviceId,
          wasRemembered ? "review_remembered" : "review_forgot",
        );
        // Check for newly unlocked achievements
        const { newAchievements } = await convex.mutation(
          api.gamification.checkAchievements,
          { deviceId },
        );
        // Timer is rescheduled by SCHEDULE_NEXT_REVIEW when the popup closes
        return {
          success: true,
          newStatus: result?.newStatus,
          intervalDays: result?.intervalDays,
          achievements: newAchievements,
        };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "GET_DISTRACTORS": {
      try {
        const words = await convex.query(api.words.getQuizWords, { deviceId, limit: 30 });
        const distractors = words
          .filter((w: { _id: any }) => String(w._id) !== message.wordId)
          .map((w: { _id: any; word: string; translation: string; type?: string }) => ({
            _id: String(w._id),
            word: w.word,
            translation: w.translation,
            type: w.type,
          }));
        return { success: true, distractors };
      } catch (e) {
        return { success: false, distractors: [], error: String(e) };
      }
    }

    case "GET_DEVICE_ID": {
      return { deviceId };
    }

    case "SCHEDULE_NEXT_REVIEW": {
      await scheduleNextReview();
      return { success: true };
    }

    case "UPDATE_ALARM": {
      const mins = (message as UpdateAlarmMessage).intervalMinutes;
      await chrome.storage.sync.set({ reviewIntervalMinutes: mins });
      await scheduleNextReview();
      return { success: true };
    }

    case "GET_TIMER_STATE": {
      const data = await chrome.storage.session.get(TIMER_STATE_KEY) as Record<string, { nextReviewAt: number } | undefined>;
      const timer = data[TIMER_STATE_KEY];
      if (!timer) return { nextReviewAt: null };
      return { nextReviewAt: timer.nextReviewAt };
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
        // Atomic check+consume to prevent race condition
        const consumed = await tryConsumeAiCall();
        if (!consumed.allowed) {
          return { success: false, error: "Daily AI limit reached", remaining: 0 };
        }
        const result = await convex.action(api.ai.explainWord, {
          word: message.word,
          sentence: message.sentence,
          deviceId,
          targetLang: message.targetLang,
          userLevel: message.userLevel,
        });
        return { success: true, explanation: result.explanation, remaining: consumed.remaining };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "AI_SIMPLIFY": {
      try {
        // Atomic check+consume to prevent race condition
        const consumed = await tryConsumeAiCall();
        if (!consumed.allowed) {
          return { success: false, error: "Daily AI limit reached", remaining: 0 };
        }
        const result = await convex.action(api.ai.simplifyText, {
          text: message.text,
          deviceId,
          userLevel: message.userLevel,
        });
        return {
          success: true,
          simplified: result.simplified,
          originalLength: message.text.length,
          remaining: consumed.remaining,
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

    case "AI_ANALYZE_SENTENCE": {
      try {
        const consumed = await tryConsumeAiCall();
        if (!consumed.allowed) {
          return { success: false, error: "Daily AI limit reached", remaining: 0 };
        }
        const result = await convex.action(api.ai.analyzeSentence, {
          sentence: message.sentence,
          deviceId,
          targetLang: message.targetLang,
          userLevel: message.userLevel,
        });
        return { success: true, analysis: result, remaining: consumed.remaining };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "UPDATE_ACTIVITY": {
      try {
        const data = await chrome.storage.session.get(SCHEDULER_STATE_KEY) as Record<string, SchedulerState | undefined>;
        const state = data[SCHEDULER_STATE_KEY] ?? getDefaultState();
        state.lastActiveTime = Date.now();
        state.idleState = "active";
        await chrome.storage.session.set({ [SCHEDULER_STATE_KEY]: state });
        return { success: true };
      } catch {
        return { success: true };
      }
    }

    case "VIDEO_STATE": {
      try {
        const data = await chrome.storage.session.get(SCHEDULER_STATE_KEY) as Record<string, SchedulerState | undefined>;
        const state = data[SCHEDULER_STATE_KEY] ?? getDefaultState();
        state.isVideoPlaying = message.playing;
        await chrome.storage.session.set({ [SCHEDULER_STATE_KEY]: state });
        return { success: true };
      } catch {
        return { success: true };
      }
    }

    case "TYPING_STATE": {
      try {
        const data = await chrome.storage.session.get(SCHEDULER_STATE_KEY) as Record<string, SchedulerState | undefined>;
        const state = data[SCHEDULER_STATE_KEY] ?? getDefaultState();
        state.isTyping = message.typing;
        await chrome.storage.session.set({ [SCHEDULER_STATE_KEY]: state });
        return { success: true };
      } catch {
        return { success: true };
      }
    }

    case "DICT_LOOKUP": {
      try {
        const { lookupLocal } = await import("../src/lib/local-dictionary");
        const entry = await lookupLocal(message.word);
        return { success: true, entry };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "OPEN_DASHBOARD": {
      await openDashboard(message.hash);
      return { success: true };
    }

    case "SPEAK_WORD": {
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ target: "offscreen", type: "SPEAK_WORD", word: message.word });
      return { success: true };
    }

    case "STOP_SPEAKING": {
      await ensureOffscreen();
      await chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_SPEAKING" });
      return { success: true };
    }

  }
}
