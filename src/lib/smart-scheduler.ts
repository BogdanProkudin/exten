// Smart review timing: idle-based scheduling that shows reviews
// during natural pauses instead of fixed intervals.

export interface SchedulerState {
  lastToastTime: number;
  lastActiveTime: number;
  sessionStart: number;
  idleState: "active" | "idle" | "locked";
  isTyping: boolean;
  isVideoPlaying: boolean;
  tabUrl: string;
}

export interface SchedulerSettings {
  minIntervalMinutes: number; // minimum time between toasts
  maxToastsPerDay: number;
  dndUntil?: number;
}

const RESTRICTED_PREFIXES = ["chrome://", "chrome-extension://", "about:"];

/** Check all blocking conditions except the interval check.
 *  Returns null if nothing blocks, or a reason string if blocked. */
export function getBlockingReason(
  state: SchedulerState,
  settings: SchedulerSettings,
  toastsShownToday: number,
): string | null {
  const now = Date.now();
  if (settings.dndUntil && now < settings.dndUntil) return "dnd";
  if (toastsShownToday >= settings.maxToastsPerDay) return "limit";
  if (state.idleState !== "active") return "idle";
  if (state.sessionStart > 0 && now - state.sessionStart < 5 * 60 * 1000) return "session";
  if (state.isTyping) return "typing";
  if (state.isVideoPlaying) return "video";
  if (state.tabUrl && RESTRICTED_PREFIXES.some((p) => state.tabUrl.startsWith(p))) return "restricted";
  return null;
}

export function shouldShowReview(
  state: SchedulerState,
  settings: SchedulerSettings,
  toastsShownToday: number,
): boolean {
  if (getBlockingReason(state, settings, toastsShownToday)) return false;
  const minIntervalMs = settings.minIntervalMinutes * 60 * 1000;
  if (Date.now() - state.lastToastTime < minIntervalMs) return false;
  return true;
}

export function getDefaultState(): SchedulerState {
  return {
    lastToastTime: 0,
    lastActiveTime: Date.now(),
    sessionStart: Date.now(),
    idleState: "active",
    isTyping: false,
    isVideoPlaying: false,
    tabUrl: "",
  };
}
