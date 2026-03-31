import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { getDeviceId } from "../src/lib/device-id";
import { translateWord } from "../src/lib/translate";
import { canMakeAiCall, tryConsumeAiCall } from "../src/lib/pro-gate";
import type { Id } from "../convex/_generated/dataModel";
import { getDefaultState, type SchedulerState } from "../src/lib/smart-scheduler";
import { populateFromAsset } from "../src/lib/local-dictionary";

const REVIEW_ALARM = "vocabify-review";
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
  console.log("[Vocabify Timer] Scheduled next review at", new Date(nextReviewAt).toLocaleTimeString(), `(${intervalMs / 1000}s from now)`);
}

// --- Type-safe message types ---
type TranslateMessage = { type: "TRANSLATE_WORD"; word: string; lang?: string };
type SaveMessage = {
  type: "SAVE_WORD";
  word: string;
  translation: string;
  example?: string;
  sourceUrl?: string;
  exampleContext?: string[];
  exampleSource?: string;
  wordType?: "word" | "phrase" | "sentence";
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
type ToggleHardMessage = { type: "TOGGLE_HARD"; wordId: string };
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
type GetCollocationsMessage = { type: "GET_COLLOCATIONS"; word: string };
type SaveCollocationMessage = {
  type: "SAVE_COLLOCATION";
  collocation: string;
  words: string[];
  category: string;
  level?: string;
  sourceContext?: string;
};
type DiscoverCollocationsMessage = { type: "DISCOVER_COLLOCATIONS"; word: string };
type DictLookupMessage = { type: "DICT_LOOKUP"; word: string };
type GetTimerStateMessage = { type: "GET_TIMER_STATE" };
type ScheduleNextReviewMessage = { type: "SCHEDULE_NEXT_REVIEW" };
type OpenDashboardMessage = { type: "OPEN_DASHBOARD"; hash?: string };
type UpdateAlarmMessage = { type: "UPDATE_ALARM"; intervalMinutes: number };

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
  | DeleteWordMessage
  | AiAnalyzeSentenceMessage
  | UpdateActivityMessage
  | VideoStateMessage
  | TypingStateMessage
  | GetCollocationsMessage
  | SaveCollocationMessage
  | DiscoverCollocationsMessage
  | DictLookupMessage
  | GetTimerStateMessage
  | ScheduleNextReviewMessage
  | OpenDashboardMessage
  | UpdateAlarmMessage
  | { type: "GET_DISTRACTORS"; wordId: string; count?: number }
;

function isValidMessage(msg: unknown): msg is AppMessage {
  if (!msg || typeof msg !== "object" || !("type" in msg)) return false;
  const m = msg as Record<string, unknown>;
  switch (m.type) {
    case "TRANSLATE_WORD":
      return typeof m.word === "string";
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
    case "TOGGLE_HARD":
      return typeof m.wordId === "string";
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
    case "GET_COLLOCATIONS":
      return typeof m.word === "string";
    case "SAVE_COLLOCATION":
      return typeof m.collocation === "string" && Array.isArray(m.words);
    case "DISCOVER_COLLOCATIONS":
      return typeof m.word === "string";
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
    console.log("[Vocabify Timer] Alarm fired, checking for due words...");
    try {
      // Check Do Not Disturb
      const dndData = await chrome.storage.sync.get("dndUntil") as Record<string, number | undefined>;
      if (dndData.dndUntil && Date.now() < dndData.dndUntil) {
        console.log("[Vocabify Timer] DND active, skipping review");
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
        console.log("[Vocabify Timer] Daily toast limit reached, skipping");
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
        console.log("[Vocabify Timer] No words at all, skipping");
        await scheduleNextReview();
        return;
      }

      // Pick the top word (highest score)
      const picked = words[0];
      console.log("[Vocabify Timer] Scores:", words.map((w: { word: string; _score: number }) => `${w.word}=${w._score.toFixed(1)}`).join(", "));

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id) {
        console.log("[Vocabify Timer] No active tab found");
        await scheduleNextReview();
        return;
      }

      if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://"))) {
        console.log("[Vocabify Timer] Active tab is restricted, rescheduling");
        await scheduleNextReview();
        return;
      }

      console.log("[Vocabify Timer] Showing word:", picked.word, "(score:", picked._score.toFixed(1), ")");
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

    // Smart scheduler: 2-min heartbeat instead of fixed interval
    chrome.alarms.create(REVIEW_ALARM, { periodInMinutes: 2 });
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
      console.log("[Vocabify] Storage migration to IndexedDB complete");
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

    if (alarm.name === REVIEW_ALARM) {
      // Legacy heartbeat — no longer needed, timer alarm handles reviews
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

    handleMessage(message, convex, updateBadge).then(sendResponse);
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
          type: message.wordType,
        });
        logEvent(convex, deviceId, "word_saved", message.word);
        updateBadge();
        // Schedule a review if no timer is active
        const timerData = await chrome.storage.session.get(TIMER_STATE_KEY) as Record<string, { nextReviewAt: number } | undefined>;
        if (!timerData[TIMER_STATE_KEY] || timerData[TIMER_STATE_KEY]!.nextReviewAt < Date.now()) {
          console.log("[Vocabify Timer] Word saved, scheduling review");
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
        console.log("[Vocabify Timer] Review result received");
        // Award XP for completing a review
        const reviewXp = wasRemembered ? 15 : 10;
        await convex.mutation(api.gamification.addReviewXP, { deviceId, xp: reviewXp });
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
      console.log("[Vocabify Timer] Review popup closed, scheduling next review");
      await scheduleNextReview();
      return { success: true };
    }

    case "UPDATE_ALARM": {
      const mins = (message as UpdateAlarmMessage).intervalMinutes;
      console.log(`[Vocabify Timer] Review interval updated to ${mins} minutes`);
      await chrome.storage.sync.set({ reviewIntervalMinutes: mins });
      await scheduleNextReview();
      return { success: true };
    }

    case "GET_TIMER_STATE": {
      const data = await chrome.storage.session.get(TIMER_STATE_KEY) as Record<string, { nextReviewAt: number } | undefined>;
      const timer = data[TIMER_STATE_KEY];
      console.log("[Vocabify Timer] GET_TIMER_STATE →", timer);
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

    case "GET_COLLOCATIONS": {
      try {
        const { getCollocationsForWord } = await import("../src/lib/collocation-engine");
        const collocations = await getCollocationsForWord(message.word);
        return { success: true, collocations };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "SAVE_COLLOCATION": {
      try {
        await convex.mutation((api as any).collocations.save, {
          deviceId,
          collocation: message.collocation,
          words: message.words,
          category: message.category,
          level: message.level,
          sourceContext: message.sourceContext,
        });
        return { success: true };
      } catch (e) {
        return { success: false, error: String(e) };
      }
    }

    case "DISCOVER_COLLOCATIONS": {
      try {
        const { discoverCollocations } = await import("../src/lib/collocation-engine");
        const collocations = await discoverCollocations(message.word);
        return { success: true, collocations };
      } catch (e) {
        return { success: false, error: String(e) };
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

  }
}
