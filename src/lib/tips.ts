// ── Tips System ──
// Contextual hints that teach users about features at the right moment.
// Max 1 tip per 24 hours. Never during DND. Pure UI layer — no business logic.

export interface TipsStorage {
  tipsSeen: Record<string, number>;      // tipId → timestamp
  lastTipShownAt: number;                // unix ms
  tipCooldownHours: number;              // default: 24
  tipsDismissedForever: string[];        // tipIds user opted out of
  counters: {
    reviewsCompleted: number;
    wordsSaved: number;
    saveContextUsed: boolean;
    scanUsed: boolean;
    explainUsed: boolean;
    badgeClicked: boolean;
    toastDismissedToday: number;
    newtabOpened: boolean;
    vocabTabOpenCount: number;
  };
}

const DEFAULT_TIPS: TipsStorage = {
  tipsSeen: {},
  lastTipShownAt: 0,
  tipCooldownHours: 24,
  tipsDismissedForever: [],
  counters: {
    reviewsCompleted: 0,
    wordsSaved: 0,
    saveContextUsed: false,
    scanUsed: false,
    explainUsed: false,
    badgeClicked: false,
    toastDismissedToday: 0,
    newtabOpened: false,
    vocabTabOpenCount: 0,
  },
};

export async function getTipsData(): Promise<TipsStorage> {
  const data = await chrome.storage.local.get("vocabifyTips") as Record<string, TipsStorage | undefined>;
  return data.vocabifyTips ?? { ...DEFAULT_TIPS };
}

async function saveTipsData(tips: TipsStorage): Promise<void> {
  await chrome.storage.local.set({ vocabifyTips: tips });
}

async function isDndActive(): Promise<boolean> {
  const data = await chrome.storage.sync.get("dndUntil") as Record<string, number | undefined>;
  if (!data.dndUntil) return false;
  return Date.now() < data.dndUntil;
}

export function isUserTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export async function shouldShowTip(tipId: string): Promise<boolean> {
  const tips = await getTipsData();

  // Already seen
  if (tips.tipsSeen[tipId]) return false;

  // Dismissed forever
  if (tips.tipsDismissedForever.includes(tipId)) return false;

  // Cooldown: no tips within 24h of last tip
  const cooldownMs = (tips.tipCooldownHours || 24) * 60 * 60 * 1000;
  if (Date.now() - tips.lastTipShownAt < cooldownMs) return false;

  // DND
  if (await isDndActive()) return false;

  // User typing
  if (isUserTyping()) return false;

  // Check trigger conditions
  const c = tips.counters;
  switch (tipId) {
    case "tip_keyboard_review":
      return c.reviewsCompleted >= 3;
    case "tip_save_context":
      return c.wordsSaved >= 5 && !c.saveContextUsed;
    case "tip_reading_badge":
      return c.badgeClicked === false; // badge shown 3+ times checked at call site
    case "tip_hard_star":
      return c.vocabTabOpenCount >= 2;
    case "tip_scan_page":
      return c.wordsSaved >= 10 && !c.scanUsed;
    case "tip_explain":
      return c.wordsSaved >= 8 && !c.explainUsed;
    case "tip_dnd":
      return c.toastDismissedToday >= 3;
    case "tip_newtab_review":
      return !c.newtabOpened;
    default:
      return false;
  }
}

export async function markTipSeen(tipId: string): Promise<void> {
  const tips = await getTipsData();
  tips.tipsSeen[tipId] = Date.now();
  tips.lastTipShownAt = Date.now();
  await saveTipsData(tips);
}

export async function dismissTipForever(tipId: string): Promise<void> {
  const tips = await getTipsData();
  if (!tips.tipsDismissedForever.includes(tipId)) {
    tips.tipsDismissedForever.push(tipId);
  }
  tips.tipsSeen[tipId] = Date.now();
  tips.lastTipShownAt = Date.now();
  await saveTipsData(tips);
}

export async function incrementCounter(
  key: keyof TipsStorage["counters"],
  value?: number | boolean,
): Promise<void> {
  const tips = await getTipsData();
  if (typeof tips.counters[key] === "number") {
    (tips.counters[key] as number) += typeof value === "number" ? value : 1;
  } else {
    (tips.counters as Record<string, unknown>)[key] = value ?? true;
  }
  await saveTipsData(tips);
}
