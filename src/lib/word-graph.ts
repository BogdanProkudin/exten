import { getAllCollocationsForWord } from "./phrase-detector";

export interface WordNode {
  id: string;
  word: string;
  state: string; // FSRS state for color coding
  strength: number; // 0-100
  isExploration?: boolean; // temporary unsaved exploration node
  x?: number;
  y?: number;
}

export interface WordEdge {
  source: string;
  target: string;
  type: "synonym" | "antonym" | "collocation" | "family";
}

interface WordData {
  word: string;
  lemma?: string;
  fsrsState?: string;
  status: string;
  addedAt?: number;
}

interface EnrichmentData {
  synonyms: string[];
  antonyms: string[];
}

interface ExplorationData {
  word: string;
  enrichment: EnrichmentData;
}

/**
 * Build a full vocabulary network from ALL saved words.
 * Edges connect words that are synonyms, antonyms, share a lemma, or are collocations.
 * Optionally includes a temporary exploration node (unsaved word being explored).
 */
export function buildFullNetwork(
  savedWords: WordData[],
  enrichments: Map<string, EnrichmentData>,
  strengthMap: Map<string, number>,
  explorationNode?: ExplorationData | null,
  maxNodes: number = 100,
): { nodes: WordNode[]; edges: WordEdge[] } {
  const nodes: WordNode[] = [];
  const edges: WordEdge[] = [];
  const edgeKeys = new Set<string>();
  const nodeSet = new Set<string>();

  // Build lookup maps
  const wordToData = new Map<string, WordData>();
  const lemmaIndex = new Map<string, string[]>();

  for (const w of savedWords) {
    const lower = w.word.toLowerCase();
    wordToData.set(lower, w);
    if (w.lemma) {
      const existing = lemmaIndex.get(w.lemma) ?? [];
      existing.push(lower);
      lemmaIndex.set(w.lemma, existing);
    }
  }

  // Node selection — if too many words, pick the most connected + recent
  let selectedWords: WordData[];
  if (savedWords.length <= maxNodes) {
    selectedWords = savedWords;
  } else {
    const scored = savedWords.map((w) => {
      const lower = w.word.toLowerCase();
      let connectivity = 0;
      // Count enrichment connections to other saved words
      const enrichment = enrichments.get(lower);
      if (enrichment) {
        for (const syn of enrichment.synonyms) {
          if (wordToData.has(syn.toLowerCase())) connectivity++;
        }
        for (const ant of enrichment.antonyms) {
          if (wordToData.has(ant.toLowerCase())) connectivity++;
        }
      }
      // Count lemma peers
      if (w.lemma) {
        const peers = lemmaIndex.get(w.lemma);
        if (peers) connectivity += peers.length - 1;
      }
      return { word: w, connectivity, addedAt: w.addedAt ?? 0 };
    });
    scored.sort((a, b) => b.connectivity - a.connectivity || b.addedAt - a.addedAt);
    selectedWords = scored.slice(0, maxNodes).map((s) => s.word);
  }

  // Add nodes
  for (const w of selectedWords) {
    const lower = w.word.toLowerCase();
    if (nodeSet.has(lower)) continue;
    nodeSet.add(lower);
    nodes.push({
      id: lower,
      word: lower,
      state: w.fsrsState ?? w.status ?? "new",
      strength: strengthMap.get(lower) ?? 0,
    });
  }

  // Edge helpers
  function addEdge(source: string, target: string, type: WordEdge["type"]) {
    if (source === target) return;
    if (!nodeSet.has(source) || !nodeSet.has(target)) return;
    const key = source < target ? `${source}|${target}` : `${target}|${source}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, type });
  }

  // Lemma families
  for (const [, peers] of lemmaIndex) {
    const inGraph = peers.filter((p) => nodeSet.has(p));
    for (let i = 0; i < inGraph.length; i++) {
      for (let j = i + 1; j < inGraph.length; j++) {
        addEdge(inGraph[i], inGraph[j], "family");
      }
    }
  }

  // Synonym & antonym edges from enrichment (bidirectional confirmation required)
  for (const [word, enrichment] of enrichments) {
    if (!nodeSet.has(word)) continue;
    for (const syn of enrichment.synonyms) {
      const synLower = syn.toLowerCase();
      if (!nodeSet.has(synLower)) continue;
      // Only add edge if the other word also lists this word as a synonym
      const otherEnrichment = enrichments.get(synLower);
      if (
        otherEnrichment &&
        otherEnrichment.synonyms.some((s) => s.toLowerCase() === word)
      ) {
        addEdge(word, synLower, "synonym");
      }
    }
    for (const ant of enrichment.antonyms) {
      const antLower = ant.toLowerCase();
      if (!nodeSet.has(antLower)) continue;
      const otherEnrichment = enrichments.get(antLower);
      if (
        otherEnrichment &&
        otherEnrichment.antonyms.some((a) => a.toLowerCase() === word)
      ) {
        addEdge(word, antLower, "antonym");
      }
    }
  }

  // Collocation edges
  for (const lower of nodeSet) {
    const cols = getAllCollocationsForWord(lower);
    for (const col of cols) {
      const colWords = col.split(/\s+/);
      for (const cw of colWords) {
        const cwLower = cw.toLowerCase();
        if (cwLower !== lower && nodeSet.has(cwLower)) {
          addEdge(lower, cwLower, "collocation");
        }
      }
    }
  }

  // Exploration node (temporary unsaved word)
  if (explorationNode) {
    const expLower = explorationNode.word.toLowerCase();
    if (!nodeSet.has(expLower)) {
      nodeSet.add(expLower);
      nodes.push({
        id: expLower,
        word: expLower,
        state: "unknown",
        strength: 0,
        isExploration: true,
      });

      for (const syn of explorationNode.enrichment.synonyms) {
        if (nodeSet.has(syn.toLowerCase())) {
          addEdge(expLower, syn.toLowerCase(), "synonym");
        }
      }
      for (const ant of explorationNode.enrichment.antonyms) {
        if (nodeSet.has(ant.toLowerCase())) {
          addEdge(expLower, ant.toLowerCase(), "antonym");
        }
      }
    }
  }

  return { nodes, edges };
}
