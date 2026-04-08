import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buildFullNetwork, type WordNode, type WordEdge } from "../../src/lib/word-graph";
import { forceLayout, interpolatePositions } from "../../src/lib/force-layout";
import { computeStrength } from "../../src/lib/memory-strength";
import { getEnrichmentBatch, getWordEnrichment, type WordEnrichment } from "../../src/lib/word-enrichment";
import { prefersReducedMotion } from "../../src/lib/motion";

interface WordMapProps {
  deviceId: string;
  onClose: () => void;
}

// ─── Visual constants ──────────────────────────────────────

function strengthColor(strength: number): string {
  if (strength >= 70) return "#22c55e";
  if (strength >= 40) return "#eab308";
  return "#ef4444";
}

const STATE_COLORS: Record<string, string> = {
  new: "#ef4444",
  learning: "#eab308",
  relearning: "#ef4444",
  review: "#22c55e",
  known: "#22c55e",
  unknown: "#9ca3af",
};

const EDGE_COLORS: Record<string, string> = {
  synonym: "#93c5fd",
  antonym: "#fca5a5",
  family: "#c4b5fd",
};

const EDGE_LABELS: Record<string, string> = {
  synonym: "Synonym",
  antonym: "Antonym",
  family: "Word family",
};

const ANIM_DURATION = 400;

function nodeSize(node: WordNode, edgeCount: number): { w: number; h: number } {
  if (node.isExploration) return { w: 120, h: 52 };
  if (edgeCount >= 4) return { w: 145, h: 64 };
  if (edgeCount >= 2) return { w: 130, h: 58 };
  return { w: 115, h: 50 };
}

// ─── Detail Panel (sidebar) ──────────────────────────────────

interface DetailPanelProps {
  node: WordNode;
  translation?: string;
  enrichment?: WordEnrichment | null;
  strength: number;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  onWordClick: (word: string) => void;
}

function WordDetailPanel({
  node,
  translation,
  enrichment,
  strength,
  onClose,
  onSave,
  saving,
  onWordClick,
}: DetailPanelProps) {
  const isSaved = node.state !== "unknown";
  const color = strengthColor(strength);
  const firstDef = enrichment?.definitions?.[0];

  return (
    <div
      className="absolute right-0 top-0 z-30 flex h-full w-[280px] flex-col border-l border-gray-200 bg-white shadow-xl"
      style={{ animation: "slideInRight 0.2s ease-out" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className={`text-base font-semibold text-gray-900 ${node.isExploration ? "italic" : ""}`}>
            {node.word}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {enrichment?.phonetic && (
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-xs text-gray-400">{enrichment.phonetic}</span>
            {enrichment.phoneticAudio && (
              <button
                onClick={() => new Audio(enrichment.phoneticAudio!).play()}
                className="text-gray-400 transition hover:text-blue-500"
                title="Play pronunciation"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Translation */}
        {translation ? (
          <p className="mb-2 text-sm font-medium text-gray-700">{translation}</p>
        ) : node.isExploration ? (
          <p className="mb-2 text-xs text-gray-400">Loading translation...</p>
        ) : null}

        {/* Definition */}
        {firstDef && (
          <p className="mb-3 text-xs leading-relaxed text-gray-500">
            <span className="font-medium text-gray-400">{firstDef.partOfSpeech}.</span>{" "}
            {firstDef.definition}
          </p>
        )}

        {/* Strength bar (saved words only) */}
        {isSaved && (
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-gray-500">Strength</span>
              <span className="font-medium" style={{ color }}>
                {Math.round(strength)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${strength}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )}

        {/* Status badge */}
        {isSaved && (
          <div className="mb-3">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: STATE_COLORS[node.state] + "18",
                color: STATE_COLORS[node.state],
              }}
            >
              {node.state}
            </span>
          </div>
        )}

        {/* Synonyms */}
        {enrichment && enrichment.synonyms.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium text-gray-400">Synonyms</p>
            <div className="flex flex-wrap gap-1">
              {enrichment.synonyms.slice(0, 6).map((syn) => (
                <button
                  key={syn}
                  onClick={() => onWordClick(syn)}
                  className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600 transition hover:bg-blue-100"
                >
                  {syn}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Antonyms */}
        {enrichment && enrichment.antonyms.length > 0 && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-medium text-gray-400">Antonyms</p>
            <div className="flex flex-wrap gap-1">
              {enrichment.antonyms.slice(0, 4).map((ant) => (
                <button
                  key={ant}
                  onClick={() => onWordClick(ant)}
                  className="rounded-md bg-red-50 px-1.5 py-0.5 text-xs text-red-600 transition hover:bg-red-100"
                >
                  {ant}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Save button for unsaved/exploration words */}
        {!isSaved && (
          <button
            onClick={onSave}
            disabled={saving}
            className="mt-2 w-full rounded-lg bg-blue-500 py-2 text-xs font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Word"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export default function WordMap({ deviceId, onClose }: WordMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphAreaRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 500 });

  // Data
  const [enrichments, setEnrichments] = useState<
    Map<string, { synonyms: string[]; antonyms: string[] }>
  >(new Map());
  const [fullEnrichments, setFullEnrichments] = useState<Map<string, WordEnrichment>>(new Map());
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [datamuseSuggestions, setDatamuseSuggestions] = useState<string[]>([]);

  // Node interaction
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Exploration
  const [explorationNode, setExplorationNode] = useState<{
    word: string;
    enrichment: { synonyms: string[]; antonyms: string[] } | null;
    translation: string | null;
    fullEnrichment: WordEnrichment | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail panel open state
  const [detailOpen, setDetailOpen] = useState(false);

  // Performance
  const [showAll, setShowAll] = useState(false);

  // Animation
  const [animProgress, setAnimProgress] = useState(1);
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const targetPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const prevNodeIds = useRef<Set<string>>(new Set());
  const animFrameRef = useRef<number>(0);

  // Zoom/pan
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Drag & drop
  const draggedNodeId = useRef<string | null>(null);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const userPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartScreen = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const [dragTick, setDragTick] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);

  // Layout position cache for incremental updates
  const prevPositionMap = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Stable graph data refs
  const currentNodes = useRef<(WordNode & { x: number; y: number })[]>([]);
  const currentEdges = useRef<WordEdge[]>([]);
  const removedNodes = useRef<(WordNode & { x: number; y: number })[]>([]);

  // ─── Data loading ───────────────────────────────────────

  const {
    results: words,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(api.words.list, { deviceId }, { initialNumItems: 200 });

  useEffect(() => {
    if (paginationStatus === "CanLoadMore") loadMore(200);
  }, [paginationStatus, loadMore]);

  // Responsive sizing
  useEffect(() => {
    function updateSize() {
      if (graphAreaRef.current) {
        const rect = graphAreaRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(400, rect.width),
          height: Math.max(300, rect.height),
        });
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // ─── Progressive enrichment loading ─────────────────────

  useEffect(() => {
    if (words.length === 0) return;
    let cancelled = false;
    const allWords = [...new Set(words.map((w) => w.word.toLowerCase()))];
    setEnrichProgress({ done: 0, total: allWords.length });

    (async () => {
      const BATCH_SIZE = 20;
      const accumulated = new Map<string, { synonyms: string[]; antonyms: string[] }>();
      const accumulatedFull = new Map<string, WordEnrichment>();

      for (let i = 0; i < allWords.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = allWords.slice(i, i + BATCH_SIZE);
        const results = await getEnrichmentBatch(batch);

        for (const [key, val] of results) {
          accumulated.set(key, { synonyms: val.synonyms, antonyms: val.antonyms });
          accumulatedFull.set(key, val);
        }

        if (cancelled) return;
        setEnrichments(new Map(accumulated));
        setFullEnrichments(new Map(accumulatedFull));
        setEnrichProgress({ done: Math.min(i + BATCH_SIZE, allWords.length), total: allWords.length });
      }
    })();

    return () => { cancelled = true; };
  }, [words]);

  // ─── Derived data ───────────────────────────────────────

  const strengthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of words) map.set(w.word.toLowerCase(), computeStrength(w));
    return map;
  }, [words]);

  const translationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of words) map.set(w.word.toLowerCase(), w.translation);
    return map;
  }, [words]);

  const savedWordSet = useMemo(
    () => new Set(words.map((w) => w.word.toLowerCase())),
    [words],
  );

  const savedWordData = useMemo(
    () => words
      .map((w) => ({
        word: w.word,
        lemma: w.lemma,
        fsrsState: w.fsrsState,
        status: w.status,
        addedAt: w.addedAt,
      })),
    [words],
  );

  const maxNodes = useMemo(() => {
    if (showAll) return Infinity;
    if (words.length <= 200) return Infinity;
    return 100;
  }, [words.length, showAll]);

  // ─── Search ─────────────────────────────────────────────

  const searchResults = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return words
      .filter((w) =>
        w.word.toLowerCase().includes(q) ||
        w.lemma?.toLowerCase().includes(q) ||
        w.translation?.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [searchQuery, words]);

  // Datamuse suggestions (debounced)
  useEffect(() => {
    if (searchQuery.length < 2) { setDatamuseSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.datamuse.com/sug?s=${encodeURIComponent(searchQuery)}&max=5`,
        );
        const data: { word: string }[] = await res.json();
        setDatamuseSuggestions(
          data
            .map((d) => d.word)
            .filter((w) => !savedWordSet.has(w.toLowerCase())),
        );
      } catch {
        setDatamuseSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, savedWordSet]);

  const handleSearchSelectSaved = useCallback(
    (word: string) => {
      const lower = word.toLowerCase();
      setSelectedNode(lower);
      setDetailOpen(true);
      setSearchQuery("");
      setSearchOpen(false);
      setExplorationNode(null);

      const pos = prevPositionMap.current.get(lower);
      if (pos) {
        setViewTransform({
          x: dimensions.width / 2 - pos.x,
          y: dimensions.height / 2 - pos.y,
          scale: 1.2,
        });
      }
    },
    [dimensions],
  );

  const handleSearchSelectUnsaved = useCallback(async (word: string) => {
    setSearchQuery("");
    setSearchOpen(false);
    setExplorationNode({ word, enrichment: null, translation: null, fullEnrichment: null });
    setSelectedNode(word.toLowerCase());
    setDetailOpen(true);

    const [enrichResult, transResult] = await Promise.allSettled([
      getWordEnrichment(word),
      chrome.runtime.sendMessage({ type: "TRANSLATE_WORD", word }),
    ]);

    const enrichment = enrichResult.status === "fulfilled" ? enrichResult.value : null;
    const translation = transResult.status === "fulfilled" ? transResult.value?.translation : null;

    setExplorationNode({
      word,
      enrichment: enrichment
        ? { synonyms: enrichment.synonyms, antonyms: enrichment.antonyms }
        : { synonyms: [], antonyms: [] },
      translation,
      fullEnrichment: enrichment,
    });
  }, []);

  // ─── Graph + Layout ─────────────────────────────────────

  const explorationData = useMemo(() => {
    if (!explorationNode?.enrichment) return null;
    return { word: explorationNode.word, enrichment: explorationNode.enrichment };
  }, [explorationNode]);

  const graphData = useMemo(() => {
    if (words.length === 0) {
      return { nodes: [] as WordNode[], edges: [] as WordEdge[], posMap: new Map<string, { x: number; y: number }>() };
    }

    const { nodes, edges } = buildFullNetwork(
      savedWordData,
      enrichments,
      strengthMap,
      explorationData,
      maxNodes,
    );

    if (nodes.length === 0) {
      return { nodes: [], edges: [], posMap: new Map<string, { x: number; y: number }>() };
    }

    const isIncremental = prevPositionMap.current.size > 0;
    let iterations: number;
    if (!isIncremental) {
      iterations = nodes.length <= 80 ? 120 : 60;
    } else {
      iterations = 30;
    }

    const seededNodes = nodes.map((n) => {
      const userPos = userPositions.current.get(n.id);
      if (userPos) return { ...n, x: userPos.x, y: userPos.y };
      const prev = prevPositionMap.current.get(n.id);
      if (prev) return { ...n, x: prev.x, y: prev.y };

      const neighborEdges = edges.filter((e) => e.source === n.id || e.target === n.id);
      const neighborPositions = neighborEdges
        .map((e) => prevPositionMap.current.get(e.source === n.id ? e.target : e.source))
        .filter(Boolean) as { x: number; y: number }[];

      if (neighborPositions.length > 0) {
        const avgX = neighborPositions.reduce((s, p) => s + p.x, 0) / neighborPositions.length;
        const avgY = neighborPositions.reduce((s, p) => s + p.y, 0) / neighborPositions.length;
        return { ...n, x: avgX + (Math.random() - 0.5) * 40, y: avgY + (Math.random() - 0.5) * 40 };
      }

      return n;
    });

    const positions = forceLayout(seededNodes, edges, {
      width: dimensions.width,
      height: dimensions.height,
      iterations,
    });

    const posMap = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
    prevPositionMap.current = posMap;
    for (const [id, pos] of userPositions.current) {
      if (posMap.has(id)) prevPositionMap.current.set(id, pos);
    }
    return { nodes, edges, posMap };
  }, [savedWordData, enrichments, strengthMap, explorationData, maxNodes, dimensions, words.length, layoutVersion]);

  // Pre-compute edge counts
  const edgeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of graphData.edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
    return counts;
  }, [graphData.edges]);

  // ─── Animation ──────────────────────────────────────────

  useEffect(() => {
    const { nodes, edges, posMap } = graphData;

    const oldPositions = new Map<string, { x: number; y: number }>();
    for (const n of currentNodes.current) {
      oldPositions.set(n.id, { x: n.x, y: n.y });
    }
    prevPositions.current = oldPositions;
    targetPositions.current = posMap;
    for (const [id, pos] of userPositions.current) {
      if (targetPositions.current.has(id)) {
        targetPositions.current.set(id, pos);
        prevPositions.current.set(id, pos);
      }
    }

    const newNodeIds = new Set(nodes.map((n) => n.id));
    removedNodes.current = currentNodes.current.filter((n) => !newNodeIds.has(n.id));
    prevNodeIds.current = new Set(oldPositions.keys());

    currentNodes.current = nodes.map((n) => {
      const pos = posMap.get(n.id);
      return { ...n, x: pos?.x ?? dimensions.width / 2, y: pos?.y ?? dimensions.height / 2 };
    });
    currentEdges.current = edges;

    if (prefersReducedMotion() || oldPositions.size === 0) {
      setAnimProgress(1);
      return;
    }

    cancelAnimationFrame(animFrameRef.current);
    setAnimProgress(0);
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / ANIM_DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimProgress(eased);
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [graphData, dimensions]);

  const displayData = useMemo(() => {
    const interpolated = interpolatePositions(
      prevPositions.current,
      targetPositions.current,
      animProgress,
    );

    const displayNodes = currentNodes.current.map((n) => {
      const userPos = userPositions.current.get(n.id);
      const pos = userPos ?? interpolated.get(n.id);
      const isNew = !prevNodeIds.current.has(n.id);
      return {
        ...n,
        x: pos?.x ?? n.x,
        y: pos?.y ?? n.y,
        animOpacity: isNew ? animProgress : 1,
      };
    });

    if (animProgress < 1) {
      for (const rn of removedNodes.current) {
        displayNodes.push({ ...rn, animOpacity: 1 - animProgress });
      }
    }

    return { nodes: displayNodes, edges: currentEdges.current };
  }, [animProgress, dragTick]);

  // ─── Node interaction ───────────────────────────────────

  const handleNodeClick = useCallback(
    (node: WordNode & { x: number; y: number }) => {
      setSelectedNode(node.id);
      setDetailOpen(true);
    },
    [],
  );

  const svgRef = useRef<SVGSVGElement>(null);

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, node: WordNode & { x: number; y: number }) => {
      e.stopPropagation();
      e.preventDefault();
      draggedNodeId.current = node.id;
      dragStartScreen.current = { x: e.clientX, y: e.clientY };
      hasDragged.current = false;
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const graphX = (e.clientX - rect.left - viewTransform.x) / viewTransform.scale;
      const graphY = (e.clientY - rect.top - viewTransform.y) / viewTransform.scale;
      dragOffset.current = { x: graphX - node.x, y: graphY - node.y };
    },
    [viewTransform],
  );

  const handleNodeTouchStart = useCallback(
    (e: React.TouchEvent, node: WordNode & { x: number; y: number }) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      e.stopPropagation();
      draggedNodeId.current = node.id;
      dragStartScreen.current = { x: touch.clientX, y: touch.clientY };
      hasDragged.current = false;
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const graphX = (touch.clientX - rect.left - viewTransform.x) / viewTransform.scale;
      const graphY = (touch.clientY - rect.top - viewTransform.y) / viewTransform.scale;
      dragOffset.current = { x: graphX - node.x, y: graphY - node.y };
    },
    [viewTransform],
  );

  // ─── Detail panel data ──────────────────────────────────

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    const node = displayData.nodes.find((n) => n.id === selectedNode);
    if (!node) return null;

    const isExploration = node.isExploration;
    const translation = isExploration
      ? explorationNode?.translation ?? undefined
      : translationMap.get(node.id);
    const enrichment = isExploration
      ? explorationNode?.fullEnrichment ?? undefined
      : fullEnrichments.get(node.id) ?? undefined;
    const strength = strengthMap.get(node.id) ?? 0;

    return { node, translation, enrichment, strength };
  }, [selectedNode, displayData.nodes, explorationNode, translationMap, fullEnrichments, strengthMap]);

  // Save word from detail panel
  const handleSaveWord = useCallback(async () => {
    const word = selectedNode;
    if (!word || saving) return;
    setSaving(true);
    try {
      let translation = explorationNode?.translation;
      if (!translation) {
        const res = await chrome.runtime.sendMessage({ type: "TRANSLATE_WORD", word });
        translation = res?.translation;
      }
      if (translation) {
        await chrome.runtime.sendMessage({ type: "SAVE_WORD", word, translation });
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
      setExplorationNode(null);
      setSelectedNode(null);
      setDetailOpen(false);
    }
  }, [selectedNode, saving, explorationNode]);

  // Handle clicking synonym/antonym in detail panel
  const handleDetailWordClick = useCallback(
    (word: string) => {
      const lower = word.toLowerCase();
      if (savedWordSet.has(lower)) {
        handleSearchSelectSaved(lower);
      } else {
        handleSearchSelectUnsaved(lower);
      }
    },
    [savedWordSet, handleSearchSelectSaved, handleSearchSelectUnsaved],
  );

  // ─── Zoom & Pan ─────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setViewTransform((prev) => {
      const newScale = Math.max(0.3, Math.min(3, prev.scale * delta));
      const svg = (e.target as Element).closest("svg");
      if (!svg) return { ...prev, scale: newScale };
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      return {
        scale: newScale,
        x: mx - (mx - prev.x) * (newScale / prev.scale),
        y: my - (my - prev.y) * (newScale / prev.scale),
      };
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as Element).closest("foreignObject")) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX - viewTransform.x, y: e.clientY - viewTransform.y };
      setSelectedNode(null);
      setDetailOpen(false);
    },
    [viewTransform],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggedNodeId.current) {
      const dx = e.clientX - dragStartScreen.current.x;
      const dy = e.clientY - dragStartScreen.current.y;
      if (!hasDragged.current && Math.abs(dx) + Math.abs(dy) > 5) {
        hasDragged.current = true;
        setDraggedNode(draggedNodeId.current);
      }
      if (hasDragged.current) {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        const graphX = (e.clientX - rect.left - viewTransform.x) / viewTransform.scale - dragOffset.current.x;
        const graphY = (e.clientY - rect.top - viewTransform.y) / viewTransform.scale - dragOffset.current.y;
        userPositions.current.set(draggedNodeId.current, { x: graphX, y: graphY });
        setDragTick((t) => t + 1);
      }
      return;
    }
    if (!isPanning.current) return;
    setViewTransform((prev) => ({
      ...prev,
      x: e.clientX - panStart.current.x,
      y: e.clientY - panStart.current.y,
    }));
  }, [viewTransform]);

  const handleMouseUp = useCallback(() => {
    if (draggedNodeId.current) {
      if (!hasDragged.current) {
        const node = currentNodes.current.find((n) => n.id === draggedNodeId.current);
        if (node) handleNodeClick(node);
      }
      draggedNodeId.current = null;
      setDraggedNode(null);
      return;
    }
    isPanning.current = false;
  }, [handleNodeClick]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest("foreignObject")) return;
    setViewTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedNode) {
          setSelectedNode(null);
          setDetailOpen(false);
        } else if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery("");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNode, searchOpen, onClose]);

  // ─── Connected node set ───────────────────────────────────

  const connectedToSelected = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const set = new Set<string>();
    set.add(selectedNode);
    for (const e of displayData.edges) {
      if (e.source === selectedNode) set.add(e.target);
      if (e.target === selectedNode) set.add(e.source);
    }
    return set;
  }, [selectedNode, displayData.edges]);

  // ─── Render ─────────────────────────────────────────────

  const isLoading = enrichProgress.total > 0 && enrichProgress.done < enrichProgress.total;

  // Effective graph width shrinks when detail panel is open
  const graphWidth = detailOpen && selectedNodeData ? dimensions.width - 280 : dimensions.width;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <div className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Vocabulary Network</h2>
              <p className="text-xs text-gray-400">
                {words.length} words
                {words.length > maxNodes && !showAll && ` (showing top ${maxNodes})`}
                {isLoading && (
                  <span className="ml-2 text-blue-500">
                    Loading connections... {enrichProgress.done}/{enrichProgress.total}
                  </span>
                )}
              </p>
            </div>

            {words.length > 200 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200"
              >
                Show all
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative ml-4">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search any word..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(e.target.value.length >= 2);
                }}
                onFocus={() => { if (searchQuery.length >= 2) setSearchOpen(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (searchResults.length > 0) handleSearchSelectSaved(searchResults[0].word);
                    else if (datamuseSuggestions.length > 0) handleSearchSelectUnsaved(datamuseSuggestions[0]);
                  }
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                    setSearchQuery("");
                    searchInputRef.current?.blur();
                  }
                }}
                className="w-64 rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 transition focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>

            {/* Search dropdown */}
            {searchOpen && (searchResults.length > 0 || datamuseSuggestions.length > 0) && (
              <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {searchResults.length > 0 && (
                  <>
                    <div className="border-b px-3 py-1.5 text-xs font-medium text-gray-400">Your words</div>
                    {searchResults.map((result) => {
                      const strength = computeStrength(result);
                      const stateColor = STATE_COLORS[result.fsrsState ?? result.status] ?? STATE_COLORS.unknown;
                      return (
                        <button
                          key={result._id}
                          onClick={() => handleSearchSelectSaved(result.word)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-gray-50"
                        >
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: stateColor }} />
                          <span className="flex-1 truncate">
                            <span className="font-medium text-gray-900">{result.word}</span>
                            {result.translation && <span className="ml-2 text-gray-400">{result.translation}</span>}
                          </span>
                          <span className="text-xs text-gray-400">{Math.round(strength)}%</span>
                        </button>
                      );
                    })}
                  </>
                )}

                {datamuseSuggestions.length > 0 && (
                  <>
                    <div className="border-b border-t px-3 py-1.5 text-xs font-medium text-gray-400">Suggestions</div>
                    {datamuseSuggestions.map((word) => (
                      <button
                        key={word}
                        onClick={() => handleSearchSelectUnsaved(word)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-gray-50"
                      >
                        <span className="h-2 w-2 flex-shrink-0 rounded-full border border-gray-300" />
                        <span className="flex-1 truncate italic text-gray-600">{word}</span>
                        <span className="text-xs text-gray-400">explore</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="ml-3 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Graph area */}
        <div ref={graphAreaRef} className="relative flex-1 overflow-hidden">
          {displayData.nodes.length === 0 && !isLoading && (
            <div className="flex h-full items-center justify-center">
              {words.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/50 px-10 py-8">
                  <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <p className="text-sm font-medium text-gray-500">Your word network is empty</p>
                  <p className="max-w-[240px] text-center text-xs text-gray-400">
                    Save words while browsing and watch your vocabulary map grow
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading your vocabulary network...</p>
              )}
            </div>
          )}

          {displayData.nodes.length > 0 && (
            <>
              <svg
                ref={svgRef}
                width={graphWidth}
                height={dimensions.height}
                className="block"
                style={{ cursor: draggedNode ? "grabbing" : isPanning.current ? "grabbing" : "grab" }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchMove={(e) => {
                  if (!draggedNodeId.current || e.touches.length !== 1) return;
                  const touch = e.touches[0];
                  const dx = touch.clientX - dragStartScreen.current.x;
                  const dy = touch.clientY - dragStartScreen.current.y;
                  if (!hasDragged.current && Math.abs(dx) + Math.abs(dy) > 5) {
                    hasDragged.current = true;
                    setDraggedNode(draggedNodeId.current);
                  }
                  if (hasDragged.current) {
                    const svgEl = svgRef.current;
                    if (!svgEl) return;
                    const rect = svgEl.getBoundingClientRect();
                    const graphX = (touch.clientX - rect.left - viewTransform.x) / viewTransform.scale - dragOffset.current.x;
                    const graphY = (touch.clientY - rect.top - viewTransform.y) / viewTransform.scale - dragOffset.current.y;
                    userPositions.current.set(draggedNodeId.current!, { x: graphX, y: graphY });
                    setDragTick((t) => t + 1);
                  }
                }}
                onTouchEnd={() => {
                  if (draggedNodeId.current) {
                    if (!hasDragged.current) {
                      const node = currentNodes.current.find((n) => n.id === draggedNodeId.current);
                      if (node) handleNodeClick(node);
                    }
                    draggedNodeId.current = null;
                    setDraggedNode(null);
                  }
                }}
                onDoubleClick={handleDoubleClick}
              >
                {/* Dot grid background (stays fixed, not affected by zoom/pan) */}
                <defs>
                  <pattern id="dot-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="0.7" fill="#94a3b8" opacity="0.2" />
                  </pattern>
                </defs>
                <rect width={graphWidth} height={dimensions.height} fill="#fafbfc" />
                <rect width={graphWidth} height={dimensions.height} fill="url(#dot-grid)" />

                <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}>
                  {/* Edges — curved bezier */}
                  {displayData.edges.map((edge, i) => {
                    const source = displayData.nodes.find((n) => n.id === edge.source);
                    const target = displayData.nodes.find((n) => n.id === edge.target);
                    if (!source || !target) return null;

                    const isExploration = source.isExploration || target.isExploration;
                    const isHighlighted = selectedNode && (edge.source === selectedNode || edge.target === selectedNode);
                    const edgeColor = isExploration ? "#d1d5db" : (EDGE_COLORS[edge.type] ?? "#d1d5db");

                    // Quadratic bezier control point
                    const dx = target.x - source.x;
                    const dy = target.y - source.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const nx = -(dy / dist);
                    const ny = dx / dist;
                    const offset = Math.min(dist * 0.12, 25);
                    const mx = (source.x + target.x) / 2 + nx * offset;
                    const my = (source.y + target.y) / 2 + ny * offset;

                    const opacity = isHighlighted ? 0.7 : selectedNode ? 0.1 : isExploration ? 0.3 : 0.4;

                    return (
                      <path
                        key={`edge-${i}`}
                        d={`M ${source.x} ${source.y} Q ${mx} ${my} ${target.x} ${target.y}`}
                        fill="none"
                        stroke={edgeColor}
                        strokeWidth={isHighlighted ? 2 : 1.2}
                        strokeDasharray={isExploration ? "4 4" : undefined}
                        opacity={opacity}
                      />
                    );
                  })}

                  {/* Nodes — card style via foreignObject */}
                  {displayData.nodes.map((node) => {
                    const isSelected = node.id === selectedNode;
                    const isHovered = node.id === hoveredNode;
                    const isSaved = node.state !== "unknown";
                    const isExploration = node.isExploration;
                    const strength = node.strength;
                    const color = isSaved ? strengthColor(strength) : STATE_COLORS.unknown;
                    const ec = edgeCounts.get(node.id) ?? 0;
                    const size = nodeSize(node, ec);

                    // Dimming logic
                    const isConnected = connectedToSelected.has(node.id);
                    const baseOpacity = node.animOpacity ?? 1;
                    const dimOpacity = selectedNode && !isConnected ? 0.3 : 1;

                    const translation = isExploration
                      ? explorationNode?.translation ?? undefined
                      : translationMap.get(node.id);

                    const isDragging = draggedNode === node.id;
                    const dragDimOpacity = draggedNode && draggedNode !== node.id ? 0.7 : 1;

                    return (
                      <foreignObject
                        key={node.id}
                        x={node.x - size.w / 2}
                        y={node.y - size.h / 2}
                        width={size.w}
                        height={size.h}
                        className={isDragging ? "cursor-grabbing" : "cursor-grab"}
                        style={{ opacity: baseOpacity * dimOpacity * dragDimOpacity }}
                        onMouseDown={(e) => { e.stopPropagation(); handleNodeMouseDown(e, node); }}
                        onTouchStart={(e) => handleNodeTouchStart(e, node)}
                        onMouseEnter={() => { if (!draggedNodeId.current) setHoveredNode(node.id); }}
                        onMouseLeave={() => setHoveredNode(null)}
                      >
                        <div
                          style={{
                            width: size.w,
                            height: size.h,
                            borderRadius: 10,
                            background: isExploration ? "rgba(255,255,255,0.85)" : "#fff",
                            border: isExploration
                              ? "1px dashed #d1d5db"
                              : isSelected
                                ? "2px solid #6366f1"
                                : "1px solid #e5e7eb",
                            boxShadow: isDragging
                              ? "0 8px 24px rgba(0,0,0,0.18)"
                              : isSelected
                                ? "0 0 0 2px #6366f1, 0 4px 12px rgba(0,0,0,0.1)"
                                : isExploration
                                  ? "none"
                                  : isHovered
                                    ? "0 4px 12px rgba(0,0,0,0.1)"
                                    : "0 1px 3px rgba(0,0,0,0.06)",
                            transform: isDragging ? "scale(1.05)" : isHovered && !isSelected ? "scale(1.03)" : "scale(1)",
                            transition: isDragging ? "none" : "box-shadow 0.15s ease, transform 0.15s ease",
                            display: "flex",
                            flexDirection: "column" as const,
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px 8px",
                            overflow: "hidden",
                          }}
                        >
                          {/* Word */}
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#111827",
                              fontStyle: isExploration ? "italic" : "normal",
                              maxWidth: size.w - 16,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap" as const,
                              lineHeight: "1.2",
                            }}
                          >
                            {node.word}
                          </div>

                          {/* Translation */}
                          {translation && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#6b7280",
                                maxWidth: size.w - 16,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap" as const,
                                lineHeight: "1.2",
                                marginTop: 2,
                              }}
                            >
                              {translation}
                            </div>
                          )}

                          {/* Strength bar */}
                          {isSaved && strength > 0 && (
                            <div
                              style={{
                                width: size.w - 24,
                                height: 3,
                                borderRadius: 2,
                                backgroundColor: "#f3f4f6",
                                marginTop: 4,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${strength}%`,
                                  height: "100%",
                                  borderRadius: 2,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </foreignObject>
                    );
                  })}
                </g>
              </svg>

              {/* Detail panel — sidebar */}
              {detailOpen && selectedNodeData && (
                <WordDetailPanel
                  node={selectedNodeData.node}
                  translation={selectedNodeData.translation}
                  enrichment={selectedNodeData.enrichment}
                  strength={selectedNodeData.strength}
                  onClose={() => { setSelectedNode(null); setDetailOpen(false); }}
                  onSave={handleSaveWord}
                  saving={saving}
                  onWordClick={handleDetailWordClick}
                />
              )}

              {/* Legend — floating pill */}
              <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-gray-200 bg-white/90 px-4 py-2 shadow-sm backdrop-blur-sm">
                {Object.entries(EDGE_LABELS).map(([type, label]) => (
                  <span key={type} className="flex items-center gap-1" style={{ fontSize: 10 }}>
                    <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: EDGE_COLORS[type] }} />
                    <span className="text-gray-500">{label}</span>
                  </span>
                ))}
              </div>

              {/* Zoom controls */}
              <div className="absolute bottom-4 right-4 flex flex-col gap-1">
                <button
                  onClick={() => setViewTransform((p) => ({ ...p, scale: Math.min(3, p.scale * 1.2) }))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-600 shadow-sm transition hover:bg-gray-50"
                  title="Zoom in"
                >+</button>
                <button
                  onClick={() => setViewTransform((p) => ({ ...p, scale: Math.max(0.3, p.scale * 0.8) }))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-600 shadow-sm transition hover:bg-gray-50"
                  title="Zoom out"
                >−</button>
                <button
                  onClick={() => setViewTransform({ x: 0, y: 0, scale: 1 })}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs text-gray-600 shadow-sm transition hover:bg-gray-50"
                  title="Reset zoom"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    userPositions.current.clear();
                    prevPositionMap.current = new Map();
                    setLayoutVersion((v) => v + 1);
                    setViewTransform({ x: 0, y: 0, scale: 1 });
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-xs text-gray-600 shadow-sm transition hover:bg-gray-50"
                  title="Reset node positions"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
