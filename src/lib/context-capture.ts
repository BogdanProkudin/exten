import { splitSentences } from "./sentence-split";

// --- Types ---

export interface TextBlock {
  text: string;
  isAnchor: boolean;
}

export interface CandidateSentence {
  text: string;
  score: number;
  source: "anchor" | "nearby";
}

export interface CaptureResult {
  candidates: CandidateSentence[];
  allSentences: string[];
}

// --- Constants ---

const MAX_BLOCKS = 12;
const MAX_CHARS = 20_000;
const MAX_SENTENCES = 120;
const MIN_SENTENCE_LEN = 20;
const MAX_SENTENCE_LEN = 220;

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "PRE", "CODE", "KBD", "SVG", "MATH",
]);

const BLOCK_SELECTORS =
  "p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th, figcaption, dt, dd";

const CONTAINER_SELECTORS =
  "article, main, section, .post-content, .article-body, [role='main']";

// --- Helpers ---

function isInsideSkipTag(el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (SKIP_TAGS.has(cur.tagName)) return true;
    cur = cur.parentElement;
  }
  return false;
}

function isEditableElement(el: Element): boolean {
  if ((el as HTMLElement).isContentEditable) return true;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  return el.closest(
    "[contenteditable], [contenteditable='true'], .CodeMirror, .monaco-editor, .ace_editor, [role='textbox']",
  ) !== null;
}

// --- DOM gathering (sync — call while selection is valid) ---

export function gatherTextBlocks(word: string): TextBlock[] {
  const selection = window.getSelection();
  if (!selection || !selection.anchorNode) return [];

  // Find anchor element
  const parentEl = selection.anchorNode.parentElement;
  if (!parentEl) return [];

  let anchorEl: Element | null =
    parentEl.closest(BLOCK_SELECTORS) ??
    parentEl.closest("div, section, article") ??
    parentEl;

  if (isInsideSkipTag(anchorEl) || isEditableElement(anchorEl)) return [];

  const anchorText = anchorEl.textContent?.trim() ?? "";
  if (!anchorText) return [];

  // Quick check: does the anchor text contain the word?
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordPattern = new RegExp(`\\b${escaped}\\b`, "i");
  if (!wordPattern.test(anchorText)) {
    // Word not in anchor text — still return anchor block for fallback
  }

  // Find scan container
  const container = anchorEl.closest(CONTAINER_SELECTORS) ?? anchorEl.parentElement ?? document.body;

  // Collect blocks in document order
  const allBlocks = Array.from(container.querySelectorAll(BLOCK_SELECTORS));
  const anchorIndex = allBlocks.indexOf(anchorEl);

  const blocks: TextBlock[] = [{ text: anchorText, isAnchor: true }];
  let totalChars = anchorText.length;
  const seenTexts = new Set([anchorText]);

  // Collect before anchor (up to 6)
  const beforeStart = Math.max(0, anchorIndex - 6);
  for (let i = beforeStart; i < anchorIndex && i >= 0; i++) {
    if (blocks.length >= MAX_BLOCKS || totalChars >= MAX_CHARS) break;
    const el = allBlocks[i];
    if (isInsideSkipTag(el) || isEditableElement(el)) continue;
    const text = el.textContent?.trim() ?? "";
    if (!text || seenTexts.has(text)) continue;
    seenTexts.add(text);
    blocks.push({ text, isAnchor: false });
    totalChars += text.length;
  }

  // Collect after anchor (up to 5)
  for (let i = anchorIndex + 1; i < allBlocks.length && i <= anchorIndex + 5; i++) {
    if (blocks.length >= MAX_BLOCKS || totalChars >= MAX_CHARS) break;
    const el = allBlocks[i];
    if (isInsideSkipTag(el) || isEditableElement(el)) continue;
    const text = el.textContent?.trim() ?? "";
    if (!text || seenTexts.has(text)) continue;
    seenTexts.add(text);
    blocks.push({ text, isAnchor: false });
    totalChars += text.length;
  }

  return blocks;
}

// --- Pure computation (safe for requestIdleCallback) ---

export function processBlocks(blocks: TextBlock[], word: string): CaptureResult {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordRegex = new RegExp(`\\b${escaped}\\b`, "gi");
  const urlPattern = /https?:\/\/|www\./i;
  const codeChars = /[{}[\]<>;]/g;

  const allSentences: string[] = [];
  const rawCandidates: CandidateSentence[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const sentences = splitSentences(block.text);

    for (const sentence of sentences) {
      allSentences.push(sentence);
      if (allSentences.length > MAX_SENTENCES) break;

      const trimmed = sentence.trim();
      const lower = trimmed.toLowerCase();

      // Dedupe
      if (seen.has(lower)) continue;

      // Must contain the word
      if (!wordRegex.test(trimmed)) {
        wordRegex.lastIndex = 0;
        continue;
      }
      wordRegex.lastIndex = 0;

      // Length check
      if (trimmed.length < MIN_SENTENCE_LEN || trimmed.length > MAX_SENTENCE_LEN) continue;

      // No URLs
      if (urlPattern.test(trimmed)) continue;

      // No code-like content (more than 3 special chars)
      const codeMatches = trimmed.match(codeChars);
      if (codeMatches && codeMatches.length > 3) continue;

      seen.add(lower);

      // Score
      let score = 0;
      if (block.isAnchor) score += 40;
      if (trimmed.length >= 60 && trimmed.length <= 140) score += 20;

      // Word appears exactly once
      const wordMatches = trimmed.match(wordRegex);
      wordRegex.lastIndex = 0;
      if (wordMatches && wordMatches.length === 1) score += 15;

      // Proper sentence: starts with uppercase, ends with punctuation
      if (/^[A-Z]/.test(trimmed) && /[.?!]$/.test(trimmed)) score += 10;

      // Penalty: excessive parentheses/brackets
      const bracketMatches = trimmed.match(/[()[\]]/g);
      if (bracketMatches && bracketMatches.length >= 3) score -= 30;

      // Penalty: URL (already filtered, but for scoring edge cases)
      if (urlPattern.test(trimmed)) score -= 50;

      // Penalty: high non-letter ratio
      const nonLetterCount = (trimmed.match(/[^a-zA-Z\s]/g) || []).length;
      if (trimmed.length > 0 && nonLetterCount / trimmed.length > 0.3) score -= 40;

      score = Math.max(0, score);

      rawCandidates.push({
        text: trimmed,
        score,
        source: block.isAnchor ? "anchor" : "nearby",
      });
    }
  }

  // Sort by score descending, take top 5
  rawCandidates.sort((a, b) => b.score - a.score);
  const candidates = rawCandidates.slice(0, 5);

  return { candidates, allSentences };
}

// --- Context extraction ---

export function getContextAroundSentence(
  allSentences: string[],
  selected: string,
  count = 1,
): string[] {
  const selectedTrimmed = selected.trim();
  const idx = allSentences.findIndex((s) => s.trim() === selectedTrimmed);
  if (idx === -1) return [];

  const context: string[] = [];

  // Collect before
  for (let i = Math.max(0, idx - count); i < idx; i++) {
    const s = allSentences[i].trim();
    if (s.length >= 10 && s.length <= 220 && s !== selectedTrimmed) {
      context.push(s.length > 220 ? s.slice(0, 217) + "..." : s);
    }
  }

  // Collect after
  for (let i = idx + 1; i <= Math.min(allSentences.length - 1, idx + count); i++) {
    const s = allSentences[i].trim();
    if (s.length >= 10 && s.length <= 220 && s !== selectedTrimmed) {
      context.push(s.length > 220 ? s.slice(0, 217) + "..." : s);
    }
  }

  return context.slice(0, 3);
}
