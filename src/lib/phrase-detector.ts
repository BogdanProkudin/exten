export interface DetectedPhrase {
  phrase: string;
  type: "phrasal_verb" | "collocation" | "idiom";
}

const PHRASAL_VERBS: Record<string, string[]> = {
  "break": ["break down", "break up", "break in", "break out", "break through", "break off"],
  "bring": ["bring up", "bring about", "bring back", "bring down", "bring out", "bring in"],
  "call": ["call off", "call up", "call out", "call back", "call for", "call on"],
  "carry": ["carry on", "carry out", "carry over", "carry away"],
  "come": ["come up", "come across", "come along", "come about", "come back", "come down", "come in", "come out", "come over"],
  "cut": ["cut down", "cut off", "cut out", "cut back", "cut in"],
  "do": ["do away with", "do over", "do without"],
  "fall": ["fall apart", "fall behind", "fall down", "fall off", "fall out", "fall through"],
  "get": ["get along", "get around", "get away", "get back", "get by", "get down", "get in", "get off", "get on", "get out", "get over", "get through", "get up"],
  "give": ["give away", "give back", "give in", "give off", "give out", "give up"],
  "go": ["go ahead", "go along", "go away", "go back", "go down", "go off", "go on", "go out", "go over", "go through", "go up"],
  "hold": ["hold back", "hold on", "hold out", "hold up"],
  "keep": ["keep away", "keep back", "keep on", "keep out", "keep up"],
  "let": ["let down", "let in", "let off", "let out"],
  "look": ["look after", "look ahead", "look around", "look at", "look back", "look down on", "look for", "look forward to", "look into", "look out", "look over", "look up", "look up to"],
  "make": ["make out", "make up", "make up for"],
  "pick": ["pick out", "pick up"],
  "pull": ["pull apart", "pull down", "pull in", "pull off", "pull out", "pull over", "pull through", "pull up"],
  "put": ["put away", "put back", "put down", "put forward", "put off", "put on", "put out", "put up", "put up with"],
  "run": ["run across", "run away", "run down", "run into", "run off", "run out", "run over"],
  "set": ["set aside", "set back", "set off", "set out", "set up"],
  "show": ["show off", "show up"],
  "shut": ["shut down", "shut off", "shut out", "shut up"],
  "take": ["take after", "take apart", "take away", "take back", "take down", "take in", "take off", "take on", "take out", "take over", "take up"],
  "throw": ["throw away", "throw out", "throw up"],
  "turn": ["turn around", "turn away", "turn back", "turn down", "turn in", "turn into", "turn off", "turn on", "turn out", "turn over", "turn up"],
  "work": ["work out", "work on", "work up"],
};

const COLLOCATIONS: string[] = [
  "make a decision", "make a mistake", "make progress", "make sense", "make an effort",
  "take a break", "take a chance", "take a look", "take care", "take place",
  "do homework", "do a favor", "do business", "do research", "do damage",
  "have a good time", "have a conversation", "have an idea", "have a problem",
  "pay attention", "pay a visit", "pay a compliment",
  "keep in mind", "keep a secret", "keep track", "keep pace",
  "come to terms", "come to an end", "come into play",
  "in terms of", "in order to", "in spite of", "in addition to",
  "as a matter of fact", "as a result", "as well as",
  "on the other hand", "on behalf of", "on purpose",
  "by the way", "by no means", "by all means",
  "at the same time", "at first glance", "at any rate",
  "from time to time", "from scratch", "from now on",
  "sooner or later", "once in a while", "all of a sudden",
  "pros and cons", "ups and downs", "trial and error",
  "back and forth", "more or less", "now and then",
];

// Build lookup Sets for O(1) detection
const PHRASAL_VERB_SET: Set<string> = new Set();
for (const verbs of Object.values(PHRASAL_VERBS)) {
  for (const pv of verbs) {
    PHRASAL_VERB_SET.add(pv);
  }
}

const COLLOCATION_SET: Set<string> = new Set(COLLOCATIONS);

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Detect if a multi-word selection is a known phrase.
 */
export function detectPhrase(text: string): DetectedPhrase | null {
  const lower = normalize(text);

  // Check collocations
  if (COLLOCATION_SET.has(lower)) {
    return { phrase: lower, type: "collocation" };
  }

  // Check phrasal verbs
  if (PHRASAL_VERB_SET.has(lower)) {
    return { phrase: lower, type: "phrasal_verb" };
  }

  return null;
}

/**
 * Check if a word commonly appears in phrasal verbs.
 * Returns the list of phrasal verbs containing this verb.
 */
export function getPhrasalVerbs(verb: string): string[] {
  const lower = verb.toLowerCase().trim();
  return PHRASAL_VERBS[lower] || [];
}
