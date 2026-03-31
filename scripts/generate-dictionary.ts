/**
 * Dictionary generation script.
 *
 * Generates `public/data/dictionary-10k.json` using the OpenAI batch API.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/generate-dictionary.ts
 *
 * Input: top 10K English words (built-in frequency list)
 * Output: JSON array of DictEntry objects
 *
 * This is a one-time script — run once and commit the output file.
 */

import fs from "fs";
import path from "path";

// Top ~500 seed words (expand to 10K by adding frequency lists)
// For now, a starter set — replace with a full frequency list file
const STARTER_WORDS = [
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "I",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her", "she",
  "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
  "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
  "make", "can", "like", "time", "no", "just", "him", "know", "take", "people",
  "into", "year", "your", "good", "some", "could", "them", "see", "other", "than",
  "then", "now", "look", "only", "come", "its", "over", "think", "also", "back",
  "after", "use", "two", "how", "our", "work", "first", "well", "way", "even",
  "new", "want", "because", "any", "these", "give", "day", "most", "us",
];

interface DictEntry {
  word: string;
  definitions: { pos: string; def: string; example?: string }[];
  phonetic?: string;
  commonMistakes?: string;
  level: string;
}

async function generateWithOpenAI(words: string[]): Promise<DictEntry[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Set OPENAI_API_KEY environment variable");
    process.exit(1);
  }

  const results: DictEntry[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(words.length / BATCH_SIZE)}`);

    const prompt = `For each word below, provide a JSON object with:
- word: the word
- definitions: array of {pos: part of speech, def: definition, example: example sentence} (1-3 definitions)
- phonetic: IPA pronunciation
- commonMistakes: common learner mistake (1 sentence)
- level: CEFR level (A1/A2/B1/B2/C1/C2)

Words: ${batch.join(", ")}

Return a JSON array. No markdown, just JSON.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
          max_tokens: 4000,
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
      if (Array.isArray(parsed)) {
        results.push(...parsed);
      }
    } catch (e) {
      console.error(`Batch failed:`, e);
    }

    // Rate limit: 500ms between batches
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

async function main() {
  const outPath = path.join(__dirname, "..", "public", "data", "dictionary-10k.json");

  // Check if output already exists
  if (fs.existsSync(outPath)) {
    const existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    console.log(`Dictionary already exists with ${existing.length} entries. Delete to regenerate.`);
    return;
  }

  console.log(`Generating dictionary for ${STARTER_WORDS.length} words...`);
  const entries = await generateWithOpenAI(STARTER_WORDS);

  fs.writeFileSync(outPath, JSON.stringify(entries, null, 2));
  console.log(`Written ${entries.length} entries to ${outPath}`);
}

main().catch(console.error);
