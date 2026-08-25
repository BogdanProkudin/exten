// Stops the host page from seeing keys typed into one of our overlays.
//
// Shadow DOM alone does not do this. WXT's `isolateEvents` calls
// stopPropagation on the shadow root, which only helps in the bubble phase —
// capture-phase listeners higher up the tree have already run by then.
// Measured on a YouTube watch page: with shadow isolation alone, typing "mkt"
// into an overlay input still started playback (k) and flipped theater mode
// (t). A capture-phase listener on `window` sits above every listener on
// `document` and below, so it gets there first.
//
// stopImmediatePropagation kills the event for everyone downstream, including
// listeners inside our own shadow tree — so the overlay's own shortcut handler
// has to run here rather than on an element deeper in the path. The default
// action is untouched, so characters still land in the focused input.

const SHIELDED_EVENTS = ["keydown", "keyup", "keypress"] as const;

export interface KeyShieldOptions {
  /** The shadow host to shield. Events not originating inside it are ignored. */
  getHost: () => Element | null;
  /** Runs for keydown events from the overlay, before the page is cut off. */
  onKeyDown?: (e: KeyboardEvent) => void;
}

/** Installs the shield. Returns a function that removes it. */
export function installKeyShield({ getHost, onKeyDown }: KeyShieldOptions): () => void {
  const listener = (event: Event) => {
    const host = getHost();
    if (!host) return;

    const e = event as KeyboardEvent;
    if (!e.composedPath().includes(host)) return; // the page's own typing

    // Only a real keypress may drive the overlay. A page can find our host and
    // dispatch synthetic key events at it, which would let it answer review
    // cards on the user's behalf and quietly corrupt their FSRS schedule.
    // Still stop propagation either way — a forged event has no business
    // travelling on to the page as if it came from our UI.
    if (e.isTrusted && e.type === "keydown") onKeyDown?.(e);
    e.stopImmediatePropagation();
  };

  for (const type of SHIELDED_EVENTS) {
    window.addEventListener(type, listener, true);
  }

  return () => {
    for (const type of SHIELDED_EVENTS) {
      window.removeEventListener(type, listener, true);
    }
  };
}

/**
 * The shadow host containing `el`, or null when it is not in a shadow tree.
 *
 * Duck-typed on `.host` rather than `instanceof ShadowRoot`: a content script
 * runs in an isolated world, so DOM interface constructors are not guaranteed
 * to be the same object the page's nodes were built from and `instanceof` can
 * return false for a genuine ShadowRoot. `getRootNode()` returns either a
 * Document (no `host`) or a ShadowRoot (always has one).
 */
export function shadowHostOf(el: Element | null): Element | null {
  if (!el) return null;
  const root = el.getRootNode() as Node & { host?: Element };
  return root?.host ?? null;
}

/** The focused element within `el`'s root, shadow tree or document alike. */
export function activeElementIn(el: Element | null): Element | null {
  if (!el) return null;
  const root = el.getRootNode() as Node & { activeElement?: Element | null };
  return root?.activeElement ?? null;
}
