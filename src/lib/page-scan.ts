import { lemmatize } from "./lemmatize";

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "been", "will", "would", "could",
  "should", "their", "there", "they", "them", "then", "than", "these",
  "those", "what", "when", "where", "which", "while", "were", "your",
  "about", "after", "also", "back", "been", "before", "being", "between",
  "both", "came", "come", "does", "done", "down", "each", "even", "every",
  "first", "from", "give", "goes", "going", "good", "great", "here",
  "high", "into", "just", "know", "last", "like", "long", "look", "made",
  "make", "many", "more", "most", "much", "must", "name", "never", "next",
  "only", "open", "other", "over", "part", "some", "such", "sure", "take",
  "tell", "text", "time", "upon", "very", "want", "well", "went", "were",
  "work", "year", "the", "and", "for", "are", "but", "not", "you", "all",
  "can", "had", "her", "was", "one", "our", "out", "has", "his", "how",
  "its", "may", "new", "now", "old", "see", "way", "who", "did", "get",
  "let", "say", "she", "too", "use",
]);

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "SVG", "MATH", "KBD",
]);

const MAX_TEXT_NODES = 2000;

export function extractPageWords(): string[] {
  const lemmaCounts = new Map<string, number>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let nodeCount = 0;

  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (nodeCount >= MAX_TEXT_NODES) break;

    const parent = node.parentElement;
    if (!parent) continue;
    if (SKIP_TAGS.has(parent.tagName)) continue;

    // Skip contenteditable elements
    if (parent.isContentEditable || parent.closest("[contenteditable]")) continue;

    // Skip hidden elements
    try {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;
    } catch {
      continue;
    }

    nodeCount++;
    const text = node.textContent || "";
    const tokens = text.split(/[^a-zA-Z'-]+/);

    for (const raw of tokens) {
      const token = raw.replace(/^['-]+|['-]+$/g, "");
      if (token.length < 3 || token.length > 45) continue;

      // Skip ALL_CAPS (acronyms/constants)
      if (/^[A-Z]{2,}$/.test(token)) continue;

      // Skip tokens with mixed digits
      if (/\d/.test(token)) continue;

      const lower = token.toLowerCase();
      if (STOP_WORDS.has(lower)) continue;

      const lemma = lemmatize(lower);
      lemmaCounts.set(lemma, (lemmaCounts.get(lemma) || 0) + 1);
    }
  }

  // Sort by frequency (most common on this page first)
  return [...lemmaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([lemma]) => lemma);
}
