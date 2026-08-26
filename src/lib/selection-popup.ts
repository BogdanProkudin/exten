// Decides what the selection popup should do when the user selects text.
//
// Extracted from the mouseup handler because the handler previously bailed
// whenever a popup was open ("don't re-create if popup is already open"). That
// made a growing selection a no-op: select a word, get the word popup, then
// select the whole sentence and nothing happened — the word popup stayed and
// kept showing the word. A new selection has to replace what is showing.

import { classifySelection } from "./language-guard";

export type PopupKind = "word" | "phrase";

export interface PopupDecision {
  /**
   * none  — not translatable, leave whatever is open alone
   * keep  — this exact text is already showing, don't reopen (no flicker, no
   *         second paid API call)
   * show  — open a popup for it, replacing anything currently open
   */
  action: "none" | "keep" | "show";
  kind: PopupKind | null;
  /** Whitespace-normalized text, so callers store and compare one canonical form. */
  text: string;
}

export function decideSelectionPopup(
  selectionText: string,
  openPopupText: string | null,
): PopupDecision {
  const text = selectionText.replace(/\s+/g, " ").trim();

  const kind = classifySelection(text);
  if (kind === "reject") return { action: "none", kind: null, text };

  if (openPopupText !== null && openPopupText === text) {
    return { action: "keep", kind, text };
  }

  return { action: "show", kind, text };
}

/**
 * Length past which a sentence opens with the free translation instead of AI.
 *
 * AI is worth an automatic call on a short sentence: it is a fraction of a cent
 * and arrives quickly. On a long paragraph it is slower and the reader often
 * only wants the gist, so the free chain answers immediately and the popup
 * offers AI as a button.
 */
export const AUTO_AI_MAX_CHARS = 150;

export function shouldAutoUseAi(sentence: string): boolean {
  return sentence.replace(/\s+/g, " ").trim().length <= AUTO_AI_MAX_CHARS;
}
