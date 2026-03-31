export interface DetectedPhrase {
  phrase: string;
  type: "phrasal_verb" | "collocation" | "idiom";
}

export interface CollocationMetaEntry {
  category: string;
  level?: string;
  strength?: "strong" | "medium" | "weak";
}

const PHRASAL_VERBS: Record<string, string[]> = {
  "break": ["break down", "break up", "break in", "break out", "break through", "break off", "break away", "break into"],
  "bring": ["bring up", "bring about", "bring back", "bring down", "bring out", "bring in", "bring along", "bring forward"],
  "call": ["call off", "call up", "call out", "call back", "call for", "call on", "call in", "call upon"],
  "carry": ["carry on", "carry out", "carry over", "carry away", "carry through", "carry off"],
  "come": ["come up", "come across", "come along", "come about", "come back", "come down", "come in", "come out", "come over", "come around", "come through", "come up with"],
  "cut": ["cut down", "cut off", "cut out", "cut back", "cut in", "cut up", "cut across", "cut through"],
  "do": ["do away with", "do over", "do without", "do up"],
  "drop": ["drop off", "drop out", "drop in", "drop by", "drop behind"],
  "fall": ["fall apart", "fall behind", "fall down", "fall off", "fall out", "fall through", "fall back", "fall for"],
  "figure": ["figure out", "figure in"],
  "fill": ["fill in", "fill out", "fill up"],
  "find": ["find out"],
  "get": ["get along", "get around", "get away", "get back", "get by", "get down", "get in", "get off", "get on", "get out", "get over", "get through", "get up", "get rid of", "get away with", "get along with"],
  "give": ["give away", "give back", "give in", "give off", "give out", "give up", "give rise to"],
  "go": ["go ahead", "go along", "go away", "go back", "go down", "go off", "go on", "go out", "go over", "go through", "go up", "go along with", "go without"],
  "hang": ["hang on", "hang out", "hang up", "hang around", "hang back"],
  "hold": ["hold back", "hold on", "hold out", "hold up", "hold off", "hold together"],
  "keep": ["keep away", "keep back", "keep on", "keep out", "keep up", "keep up with", "keep track of"],
  "kick": ["kick off", "kick out", "kick back", "kick in"],
  "lay": ["lay off", "lay out", "lay down"],
  "let": ["let down", "let in", "let off", "let out", "let go of"],
  "live": ["live up to", "live with", "live on"],
  "look": ["look after", "look ahead", "look around", "look at", "look back", "look down on", "look for", "look forward to", "look into", "look out", "look over", "look up", "look up to"],
  "make": ["make out", "make up", "make up for", "make do with", "make off with"],
  "pass": ["pass away", "pass out", "pass on", "pass up", "pass by"],
  "pay": ["pay back", "pay off", "pay up"],
  "pick": ["pick out", "pick up", "pick on", "pick apart"],
  "point": ["point out", "point to"],
  "pull": ["pull apart", "pull down", "pull in", "pull off", "pull out", "pull over", "pull through", "pull up", "pull together"],
  "put": ["put away", "put back", "put down", "put forward", "put off", "put on", "put out", "put up", "put up with", "put together"],
  "rule": ["rule out"],
  "run": ["run across", "run away", "run down", "run into", "run off", "run out", "run over", "run through"],
  "set": ["set aside", "set back", "set off", "set out", "set up", "set in"],
  "show": ["show off", "show up"],
  "shut": ["shut down", "shut off", "shut out", "shut up"],
  "sort": ["sort out"],
  "stand": ["stand by", "stand for", "stand out", "stand up", "stand up for"],
  "stick": ["stick to", "stick out", "stick with", "stick around"],
  "take": ["take after", "take apart", "take away", "take back", "take down", "take in", "take off", "take on", "take out", "take over", "take up", "take up with"],
  "throw": ["throw away", "throw out", "throw up", "throw in"],
  "turn": ["turn around", "turn away", "turn back", "turn down", "turn in", "turn into", "turn off", "turn on", "turn out", "turn over", "turn up"],
  "wear": ["wear off", "wear out", "wear down"],
  "wind": ["wind up", "wind down"],
  "work": ["work out", "work on", "work up", "work through"],
  "wrap": ["wrap up"],
};

// Expanded collocations organized by category (~500)
const COLLOCATIONS_BY_CATEGORY: Record<string, string[]> = {
  // Verb + Noun (~150)
  "verb + noun": [
    "make a decision", "make a mistake", "make progress", "make sense", "make an effort",
    "make a difference", "make a living", "make a choice", "make a promise", "make a plan",
    "make an appointment", "make a suggestion", "make a complaint", "make a comment",
    "make an impression", "make money", "make friends", "make room", "make peace", "make war",
    "take a break", "take a chance", "take a look", "take care", "take place",
    "take a risk", "take action", "take advantage", "take a seat", "take a step",
    "take a shower", "take a walk", "take a photo", "take notes", "take turns",
    "take responsibility", "take time", "take part",
    "do homework", "do a favor", "do business", "do research", "do damage",
    "do the dishes", "do the laundry", "do exercise", "do justice", "do harm",
    "have a good time", "have a conversation", "have an idea", "have a problem",
    "have lunch", "have a meeting", "have a drink", "have fun", "have an argument",
    "have a baby", "have a headache", "have a dream", "have a word",
    "pay attention", "pay a visit", "pay a compliment", "pay the price", "pay respect",
    "keep in mind", "keep a secret", "keep track", "keep pace", "keep a promise",
    "keep quiet", "keep a diary", "keep an eye on", "keep company", "keep control",
    "come to terms", "come to an end", "come into play", "come to a conclusion",
    "come to mind", "come to light", "come to grips with",
    "raise concerns", "raise awareness", "raise questions", "raise funds",
    "reach a decision", "reach an agreement", "reach a conclusion", "reach a compromise",
    "run a business", "run a risk", "run an errand", "run a fever",
    "catch fire", "catch a cold", "catch someone's attention", "catch a glimpse",
    "break a record", "break the law", "break a habit", "break the ice",
    "hold a meeting", "hold a position", "hold a grudge", "hold your breath",
    "draw attention", "draw a conclusion", "draw a distinction", "draw a line",
    "set a goal", "set an example", "set a standard", "set a record",
    "give a speech", "give advice", "give permission", "give way", "give birth",
    "face a challenge", "face the facts", "face the consequences",
    "meet a deadline", "meet expectations", "meet a requirement",
    "play a role", "play a part", "play a trick",
    "place an order", "place emphasis", "place a bet",
    "serve a purpose", "serve time", "serve a sentence",
    "strike a balance", "strike a deal", "strike a chord",
  ],

  // Adjective + Noun (~150)
  "adjective + noun": [
    "heavy rain", "heavy traffic", "heavy workload", "heavy burden", "heavy fine",
    "heavy heart", "heavy drinking", "heavy smoker", "heavy schedule", "heavy emphasis",
    "strong argument", "strong evidence", "strong opinion", "strong influence",
    "strong bond", "strong impression", "strong desire", "strong feeling",
    "strong wind", "strong coffee", "strong accent", "strong commitment",
    "deep breath", "deep sleep", "deep impact", "deep concern",
    "deep understanding", "deep roots", "deep water", "deep thought",
    "steep learning curve", "steep price", "steep decline", "steep hill",
    "bitter cold", "bitter disappointment", "bitter enemy", "bitter experience",
    "broad daylight", "broad range", "broad smile", "broad spectrum",
    "close friend", "close relationship", "close attention", "close call",
    "common ground", "common sense", "common knowledge", "common mistake",
    "critical thinking", "critical role", "critical mass", "critical condition",
    "fair share", "fair play", "fair deal", "fair trade",
    "false alarm", "false impression", "false hope", "false sense",
    "fresh start", "fresh air", "fresh perspective",
    "full speed", "full extent", "full potential", "full circle",
    "great deal", "great achievement", "great extent",
    "high priority", "high standard", "high quality", "high expectation",
    "high risk", "high demand", "high pressure", "high profile",
    "key factor", "key issue", "key role", "key element",
    "long run", "long term", "long way", "long shot",
    "main reason", "main point", "main goal", "main concern",
    "narrow escape", "narrow margin", "narrow view",
    "old habit", "old friend", "old fashioned",
    "open mind", "open question", "open door",
    "poor performance", "poor quality", "poor condition",
    "quick fix", "quick look", "quick glance",
    "raw material", "raw data", "raw deal",
    "rough estimate", "rough idea", "rough patch",
    "sharp decline", "sharp rise", "sharp contrast", "sharp mind",
    "short notice", "short supply", "short term",
    "slight chance", "slight difference", "slight delay",
    "smooth transition", "smooth operation", "smooth surface",
    "sole purpose", "sole responsibility", "sole survivor",
    "tight budget", "tight deadline", "tight schedule",
    "vast majority", "vast amount", "vast experience",
    "vital importance", "vital role", "vital information",
    "wide range", "wide variety", "wide gap",
    "wrong impression", "wrong direction", "wrong track",
  ],

  // Verb + Adverb (~50)
  "verb + adverb": [
    "strongly recommend", "strongly disagree", "strongly believe", "strongly suggest",
    "strongly oppose", "strongly support", "strongly encourage",
    "deeply regret", "deeply concerned", "deeply moved", "deeply rooted",
    "deeply affected", "deeply grateful",
    "fully understand", "fully aware", "fully committed", "fully equipped",
    "fully support", "fully recovered",
    "highly recommend", "highly skilled", "highly effective", "highly unlikely",
    "highly motivated", "highly valued",
    "totally agree", "totally different", "totally unacceptable",
    "widely known", "widely used", "widely regarded", "widely available",
    "seriously consider", "seriously injured", "seriously concerned",
    "greatly appreciate", "greatly improved", "greatly reduced",
    "closely related", "closely linked", "closely monitored",
    "bitterly disappointed", "bitterly cold",
    "flatly refused", "flatly denied",
    "firmly believe", "firmly established",
    "readily available", "readily accepted",
    "sincerely apologize", "sincerely hope",
  ],

  // Adverb + Adjective (~50)
  "adverb + adjective": [
    "highly unlikely", "highly competitive", "highly effective", "highly recommended",
    "highly sensitive", "highly skilled", "highly successful",
    "perfectly clear", "perfectly fine", "perfectly normal", "perfectly safe",
    "perfectly acceptable", "perfectly legitimate",
    "absolutely essential", "absolutely certain", "absolutely right",
    "absolutely necessary", "absolutely delighted",
    "completely different", "completely wrong", "completely free",
    "completely satisfied", "completely unaware",
    "entirely different", "entirely new", "entirely possible",
    "extremely important", "extremely difficult", "extremely useful",
    "extremely dangerous", "extremely rare",
    "fairly common", "fairly simple", "fairly obvious",
    "genuinely interested", "genuinely concerned", "genuinely surprised",
    "painfully obvious", "painfully slow", "painfully aware",
    "particularly interested", "particularly important", "particularly useful",
    "remarkably similar", "remarkably well", "remarkably different",
    "ridiculously easy", "ridiculously expensive",
    "surprisingly good", "surprisingly easy", "surprisingly difficult",
    "utterly wrong", "utterly ridiculous", "utterly impossible",
  ],

  // Noun + Noun (~50)
  "noun + noun": [
    "traffic jam", "climate change", "brain drain", "blood pressure",
    "birth rate", "crime rate", "death toll", "generation gap",
    "heart attack", "immune system", "income tax", "junk food",
    "life expectancy", "living standard", "market share", "minimum wage",
    "nature reserve", "nerve cell", "news coverage", "nuclear power",
    "opinion poll", "peer pressure", "power plant", "price range",
    "quality control", "rush hour", "safety net", "search engine",
    "self esteem", "side effect", "solar panel", "stock market",
    "stress level", "success rate", "supply chain", "tax return",
    "time frame", "time management", "trade deficit", "turning point",
    "unemployment rate", "welfare state", "wind farm", "working conditions",
    "carbon footprint", "comfort zone", "knowledge base",
    "learning curve", "role model", "team spirit",
  ],

  // Preposition phrases (~50)
  "preposition phrase": [
    "in terms of", "in order to", "in spite of", "in addition to",
    "in favor of", "in charge of", "in case of", "in front of",
    "in light of", "in place of", "in search of", "in view of",
    "in the long run", "in the meantime", "in the first place",
    "on the other hand", "on behalf of", "on purpose",
    "on the whole", "on the contrary", "on the verge of",
    "on account of", "on the basis of",
    "by the way", "by no means", "by all means",
    "by and large", "by far", "by chance",
    "at the same time", "at first glance", "at any rate",
    "at all costs", "at the expense of", "at the mercy of",
    "at a loss", "at stake", "at random",
    "from time to time", "from scratch", "from now on",
    "as a matter of fact", "as a result", "as well as",
    "as opposed to", "as far as", "as long as",
    "for the sake of", "for the time being", "for good",
    "with regard to", "with respect to", "with the exception of",
  ],

  // Fixed expressions
  "fixed expression": [
    "sooner or later", "once in a while", "all of a sudden",
    "pros and cons", "ups and downs", "trial and error",
    "back and forth", "more or less", "now and then",
    "first and foremost", "safe and sound", "sick and tired",
    "time and again", "again and again", "over and over",
    "step by step", "one by one", "side by side",
    "little by little", "bit by bit", "day by day",
    "here and there", "far and wide", "near and far",
  ],
};

// Build flat COLLOCATIONS array and metadata map
const COLLOCATIONS: string[] = [];
export const COLLOCATION_META: Map<string, CollocationMetaEntry> = new Map();

for (const [category, phrases] of Object.entries(COLLOCATIONS_BY_CATEGORY)) {
  for (const phrase of phrases) {
    COLLOCATIONS.push(phrase);
    COLLOCATION_META.set(phrase, { category });
  }
}

// Build lookup Sets for O(1) detection
const PHRASAL_VERB_SET: Set<string> = new Set();
for (const verbs of Object.values(PHRASAL_VERBS)) {
  for (const pv of verbs) {
    PHRASAL_VERB_SET.add(pv);
  }
}

const COLLOCATION_SET: Set<string> = new Set(COLLOCATIONS);

// Word-to-collocation index for fast reverse lookups
const WORD_TO_COLLOCATIONS: Map<string, string[]> = new Map();
for (const col of COLLOCATIONS) {
  const words = col.split(/\s+/);
  for (const w of words) {
    const existing = WORD_TO_COLLOCATIONS.get(w);
    if (existing) {
      existing.push(col);
    } else {
      WORD_TO_COLLOCATIONS.set(w, [col]);
    }
  }
}

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Detect if a multi-word selection is a known phrase.
 */
export function detectPhrase(text: string): DetectedPhrase | null {
  const lower = normalize(text);

  if (COLLOCATION_SET.has(lower)) {
    return { phrase: lower, type: "collocation" };
  }

  if (PHRASAL_VERB_SET.has(lower)) {
    return { phrase: lower, type: "phrasal_verb" };
  }

  return null;
}

/**
 * Check if a word commonly appears in phrasal verbs.
 */
export function getPhrasalVerbs(verb: string): string[] {
  const lower = verb.toLowerCase().trim();
  return PHRASAL_VERBS[lower] || [];
}

/**
 * Get all collocations containing a specific word.
 */
export function getAllCollocationsForWord(word: string): string[] {
  const lower = word.toLowerCase().trim();
  return WORD_TO_COLLOCATIONS.get(lower) ?? [];
}

/**
 * Scan a sentence for all known phrases (phrasal verbs + collocations).
 */
export function detectPhrasesInSentence(sentence: string): (DetectedPhrase & { startIdx: number; endIdx: number })[] {
  const words = normalize(sentence).split(/\s+/);
  const results: (DetectedPhrase & { startIdx: number; endIdx: number })[] = [];
  const seen = new Set<string>();

  for (let windowSize = 6; windowSize >= 2; windowSize--) {
    for (let i = 0; i <= words.length - windowSize; i++) {
      const candidate = words.slice(i, i + windowSize).join(" ");
      if (seen.has(candidate)) continue;

      if (PHRASAL_VERB_SET.has(candidate)) {
        results.push({ phrase: candidate, type: "phrasal_verb", startIdx: i, endIdx: i + windowSize - 1 });
        seen.add(candidate);
      } else if (COLLOCATION_SET.has(candidate)) {
        results.push({ phrase: candidate, type: "collocation", startIdx: i, endIdx: i + windowSize - 1 });
        seen.add(candidate);
      }
    }
  }

  return results;
}
