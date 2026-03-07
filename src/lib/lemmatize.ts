const IRREGULAR_VERBS: Record<string, string> = {
  ran: "run", run: "run", running: "run",
  went: "go", gone: "go", going: "go", goes: "go",
  was: "be", were: "be", been: "be", being: "be", am: "be", is: "be", are: "be",
  had: "have", has: "have", having: "have",
  did: "do", does: "do", done: "do", doing: "do",
  said: "say", says: "say", saying: "say",
  made: "make", makes: "make", making: "make",
  took: "take", taken: "take", takes: "take", taking: "take",
  came: "come", comes: "come", coming: "come",
  saw: "see", seen: "see", sees: "see", seeing: "see",
  knew: "know", known: "know", knows: "know", knowing: "know",
  got: "get", gotten: "get", gets: "get", getting: "get",
  gave: "give", given: "give", gives: "give", giving: "give",
  found: "find", finds: "find", finding: "find",
  thought: "think", thinks: "think", thinking: "think",
  told: "tell", tells: "tell", telling: "tell",
  felt: "feel", feels: "feel", feeling: "feel",
  left: "leave", leaves: "leave", leaving: "leave",
  brought: "bring", brings: "bring", bringing: "bring",
  began: "begin", begun: "begin", begins: "begin", beginning: "begin",
  kept: "keep", keeps: "keep", keeping: "keep",
  held: "hold", holds: "hold", holding: "hold",
  wrote: "write", written: "write", writes: "write", writing: "write",
  stood: "stand", stands: "stand", standing: "stand",
  heard: "hear", hears: "hear", hearing: "hear",
  let: "let", lets: "let", letting: "let",
  meant: "mean", means: "mean", meaning: "mean",
  met: "meet", meets: "meet", meeting: "meet",
  paid: "pay", pays: "pay", paying: "pay",
  sat: "sit", sits: "sit", sitting: "sit",
  spoke: "speak", spoken: "speak", speaks: "speak", speaking: "speak",
  led: "lead", leads: "lead", leading: "lead",
  read: "read", reads: "read", reading: "read",
  grew: "grow", grown: "grow", grows: "grow", growing: "grow",
  lost: "lose", loses: "lose", losing: "lose",
  fell: "fall", fallen: "fall", falls: "fall", falling: "fall",
  sent: "send", sends: "send", sending: "send",
  built: "build", builds: "build", building: "build",
  understood: "understand", understands: "understand", understanding: "understand",
  caught: "catch", catches: "catch", catching: "catch",
  broke: "break", broken: "break", breaks: "break", breaking: "break",
  drove: "drive", driven: "drive", drives: "drive", driving: "drive",
  bought: "buy", buys: "buy", buying: "buy",
  wore: "wear", worn: "wear", wears: "wear", wearing: "wear",
  chose: "choose", chosen: "choose", chooses: "choose", choosing: "choose",
  sang: "sing", sung: "sing", sings: "sing", singing: "sing",
  swam: "swim", swum: "swim", swims: "swim", swimming: "swim",
  threw: "throw", thrown: "throw", throws: "throw", throwing: "throw",
  taught: "teach", teaches: "teach", teaching: "teach",
  ate: "eat", eaten: "eat", eats: "eat", eating: "eat",
  drew: "draw", drawn: "draw", draws: "draw", drawing: "draw",
  lay: "lie", lain: "lie", lies: "lie", lying: "lie",
  rose: "rise", risen: "rise", rises: "rise", rising: "rise",
  children: "child", men: "man", women: "woman", people: "person",
  mice: "mouse", teeth: "tooth", feet: "foot", geese: "goose",
};

export function lemmatize(word: string): string {
  const lower = word.toLowerCase();

  // Check irregular forms
  if (IRREGULAR_VERBS[lower]) return IRREGULAR_VERBS[lower];

  // Suffix rules (most specific first)
  // -ies -> -y (carries->carry)
  if (lower.endsWith("ies") && lower.length > 4) {
    return lower.slice(0, -3) + "y";
  }
  // -ied -> -y (carried->carry)
  if (lower.endsWith("ied") && lower.length > 4) {
    return lower.slice(0, -3) + "y";
  }
  // -ves -> -f (wolves->wolf)
  if (lower.endsWith("ves") && lower.length > 4) {
    return lower.slice(0, -3) + "f";
  }
  // -ing -> strip, handle doubled consonant (running->run)
  if (lower.endsWith("ing") && lower.length > 4) {
    const stem = lower.slice(0, -3);
    // Doubled consonant: running->runn->run
    if (
      stem.length >= 2 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      /[bcdfghjklmnpqrstvwxyz]/.test(stem[stem.length - 1])
    ) {
      return stem.slice(0, -1);
    }
    // Silent e: making->mak->make
    if (stem.length >= 2 && /[bcdfghjklmnpqrstvwxyz]/.test(stem[stem.length - 1])) {
      const withE = stem + "e";
      if (/[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(stem)) {
        return withE;
      }
    }
    return stem;
  }
  // -ed -> strip, handle doubled consonant (stopped->stop)
  if (lower.endsWith("ed") && lower.length > 3) {
    const stem = lower.slice(0, -2);
    // Doubled consonant: stopped->stopp->stop
    if (
      stem.length >= 2 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      /[bcdfghjklmnpqrstvwxyz]/.test(stem[stem.length - 1])
    ) {
      return stem.slice(0, -1);
    }
    // Check for silent-e words: e.g., "used" -> "use" (stem = "us", + "e")
    if (stem.length >= 2 && /[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(stem)) {
      return stem + "e";
    }
    return stem;
  }
  // -es -> strip (boxes->box)
  if (lower.endsWith("es") && lower.length > 3) {
    if (/(?:sh|ch|x|z|s)es$/.test(lower)) {
      return lower.slice(0, -2);
    }
    return lower.slice(0, -2);
  }
  // -s -> strip (cats->cat), but not -ss (boss)
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 3) {
    return lower.slice(0, -1);
  }

  return lower;
}
