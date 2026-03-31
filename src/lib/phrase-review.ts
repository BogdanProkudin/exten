export interface PhraseBlanked {
  display: string; // "make a ___"
  blankedWord: string; // "decision"
  fullPhrase: string; // "make a decision"
}

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "to", "for", "of", "with",
  "by", "from", "up", "out", "off", "down", "over", "into", "onto",
  "as", "is", "it", "and", "or", "but", "so", "if", "be", "do",
  "no", "not", "all", "each", "every", "both", "few", "more",
]);

/**
 * Deterministic hash from a string to pick a word index.
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Generate a fill-in-the-blank exercise from a phrase.
 */
export function generatePhraseBlank(
  phrase: string,
  phraseCategory?: string,
): PhraseBlanked {
  const words = phrase.trim().split(/\s+/);

  if (words.length < 2) {
    return { display: "___", blankedWord: phrase, fullPhrase: phrase };
  }

  let blankIndex: number;

  if (phraseCategory === "phrasal_verb") {
    // Blank the particle (last word)
    blankIndex = words.length - 1;
  } else if (phraseCategory === "collocation") {
    // Blank the most meaningful non-function word
    const contentIndices = words
      .map((w, i) => ({ w: w.toLowerCase(), i }))
      .filter((x) => !FUNCTION_WORDS.has(x.w));

    if (contentIndices.length === 0) {
      blankIndex = words.length - 1;
    } else {
      // Pick the last content word (usually most meaningful in collocations)
      blankIndex = contentIndices[contentIndices.length - 1].i;
    }
  } else {
    // Default: deterministic pick from content words
    const contentIndices = words
      .map((w, i) => ({ w: w.toLowerCase(), i }))
      .filter((x) => !FUNCTION_WORDS.has(x.w));

    if (contentIndices.length === 0) {
      blankIndex = hashCode(phrase) % words.length;
    } else {
      blankIndex = contentIndices[hashCode(phrase) % contentIndices.length].i;
    }
  }

  const blankedWord = words[blankIndex];
  const display = words.map((w, i) => (i === blankIndex ? "___" : w)).join(" ");

  return { display, blankedWord, fullPhrase: phrase };
}
