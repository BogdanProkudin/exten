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
  "work", "year",
]);

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT"]);

export function extractPageWords(): string[] {
  const words = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) continue;
    if (SKIP_TAGS.has(parent.tagName)) continue;

    // Skip hidden elements
    try {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;
    } catch {
      continue;
    }

    const text = node.textContent || "";
    const tokens = text.split(/[^a-zA-Z]+/);
    for (const token of tokens) {
      if (token.length < 4) continue;
      const lower = token.toLowerCase();
      if (!STOP_WORDS.has(lower)) {
        words.add(lower);
      }
    }
  }

  return Array.from(words);
}
