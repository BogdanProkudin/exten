const ABBREVIATIONS = [
  "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.",
  "e.g.", "i.e.", "etc.", "vs.", "approx.", "dept.",
  "est.", "vol.", "fig.", "incl.", "govt.", "corp.",
];

const PLACEHOLDER = "\u0000";

export function extractSentence(text: string, word: string): string {
  // Normalize whitespace
  let normalized = text.replace(/\s+/g, " ").trim();

  // Protect abbreviations from false sentence splits
  for (const abbr of ABBREVIATIONS) {
    normalized = normalized.replaceAll(abbr, abbr.replaceAll(".", PLACEHOLDER));
  }

  // Split on sentence boundaries: . ? ! followed by whitespace or end
  const sentences = normalized.split(/(?<=[.?!])\s+/);

  // Restore placeholders
  const restored = sentences.map((s) => s.replaceAll(PLACEHOLDER, "."));

  // Find sentence containing the word (case-insensitive whole-word match)
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const match = restored.find((s) => pattern.test(s));

  let result = match || restored[0] || text.slice(0, 200);

  // Truncate to 200 chars
  if (result.length > 200) {
    result = result.slice(0, 197) + "...";
  }

  return result;
}

export function highlightWord(
  sentence: string,
  word: string,
): (string | { highlight: string })[] {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(\\b${escaped}\\b)`, "gi");
  const parts: (string | { highlight: string })[] = [];
  let lastIndex = 0;

  for (const match of sentence.matchAll(regex)) {
    if (match.index! > lastIndex) {
      parts.push(sentence.slice(lastIndex, match.index));
    }
    parts.push({ highlight: match[0] });
    lastIndex = match.index! + match[0].length;
  }
  if (lastIndex < sentence.length) {
    parts.push(sentence.slice(lastIndex));
  }
  return parts;
}
