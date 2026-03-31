/**
 * Fuzzy answer matching for review challenges.
 * Validates typed answers against correct translations with tolerance for typos.
 */

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:'"()[\]{}]+$/g, ""); // strip trailing punctuation
}

export function isAcceptableAnswer(userInput: string, correctAnswer: string): boolean {
  const user = normalize(userInput);
  const correct = normalize(correctAnswer);

  if (!user) return false;

  // Exact match
  if (user === correct) return true;

  // Split on common delimiters for multi-answer translations (e.g. "big, large")
  const alternatives = correct
    .split(/[,;\/]/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const alt of alternatives) {
    // Exact match against any alternative
    if (user === alt) return true;

    // Levenshtein fuzzy match with length-based threshold
    const threshold = alt.length <= 5 ? 1 : alt.length <= 10 ? 2 : 3;
    if (levenshteinDistance(user, alt) <= threshold) return true;
  }

  return false;
}
