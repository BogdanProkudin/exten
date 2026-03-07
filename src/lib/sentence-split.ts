const ABBREVIATIONS = [
  "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Sr.", "Jr.",
  "e.g.", "i.e.", "etc.", "vs.", "approx.", "dept.",
  "est.", "vol.", "fig.", "incl.", "govt.", "corp.",
];

const DOT_PLACEHOLDER = "\u0000";
const ELLIPSIS_PLACEHOLDER = "\u0001\u0001\u0001";

export function splitSentences(text: string): string[] {
  // Normalize whitespace
  let normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  // Protect abbreviations
  for (const abbr of ABBREVIATIONS) {
    normalized = normalized.replaceAll(abbr, abbr.replaceAll(".", DOT_PLACEHOLDER));
  }

  // Protect ellipses
  normalized = normalized.replaceAll("...", ELLIPSIS_PLACEHOLDER);

  // Split on sentence-ending punctuation followed by space
  // Also handle closing quotes after punctuation: ." !" ?"
  const sentences = normalized.split(/(?<=[.?!]["']?)\s+/);

  // Restore placeholders and clean up
  return sentences
    .map((s) =>
      s.replaceAll(DOT_PLACEHOLDER, ".").replaceAll(ELLIPSIS_PLACEHOLDER, "...").trim(),
    )
    .filter((s) => s.length > 0);
}
