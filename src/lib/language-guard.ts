// Language gate for text selections.
//
// Vocabify teaches English, so the popup should only open for English source
// text. Distinguishing English from other Latin-script languages needs a real
// language model, but the overwhelmingly common false positive is a different
// *script* — Cyrillic, CJK, Greek, Arabic. Counting scripts catches that
// instantly and for free.

export type SelectionKind = "word" | "phrase" | "reject";

/** Share of non-Latin letters tolerated before we call the text non-English. */
const NON_LATIN_TOLERANCE = 0.15;

const MIN_LENGTH = 2;
const MAX_LENGTH = 300;
const MAX_WORDS = 40;

// A single word: starts with a Latin letter, then Latin letters, apostrophes or
// hyphens. Digits are excluded on purpose — "covid19" and "h1b" are not
// vocabulary. Accents are allowed because plenty of English vocabulary carries
// them ("café", "naïve", "résumé"); an ASCII-only class would let
// isLikelyEnglish accept those words and then reject them here.
const SINGLE_WORD = /^\p{Script=Latin}[\p{Script=Latin}'’-]*$/u;

export function isLikelyEnglish(text: string): boolean {
  const allLetters = text.match(/\p{L}/gu);
  if (!allLetters) return false;

  const latinLetters = text.match(/\p{Script=Latin}/gu);
  const latinCount = latinLetters ? latinLetters.length : 0;
  const nonLatinRatio = (allLetters.length - latinCount) / allLetters.length;

  return nonLatinRatio <= NON_LATIN_TOLERANCE;
}

export function classifySelection(text: string): SelectionKind {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length < MIN_LENGTH || normalized.length > MAX_LENGTH) {
    return "reject";
  }
  if (!isLikelyEnglish(normalized)) return "reject";

  const words = normalized.split(" ");
  if (words.length === 1) {
    return SINGLE_WORD.test(normalized) ? "word" : "reject";
  }
  if (words.length > MAX_WORDS) return "reject";

  return "phrase";
}
