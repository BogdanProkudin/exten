import { useState, useRef, useEffect, useCallback } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { computeStrength, strengthColor } from "../../src/lib/memory-strength";
import { speak } from "../../src/lib/tts";

type WordDoc = Doc<"words">;

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/* ── Circular strength ring ── */
function StrengthRing({ strength, color }: { strength: number; color: string }) {
  const r = 11;
  const circ = 2 * Math.PI * r;
  const offset = circ - (strength / 100) * circ;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 30, height: 30 }}>
      <svg width="30" height="30" className="sentence-ring-svg">
        <circle cx="15" cy="15" r={r} fill="none" stroke="currentColor" strokeWidth="2.5"
          className="text-gray-200/60" />
        <circle cx="15" cy="15" r={r} fill="none" stroke={color} strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className="sentence-ring-fill"
          style={{ transform: "rotate(-90deg)", transformOrigin: "center",
            filter: `drop-shadow(0 0 3px ${color}40)` }} />
      </svg>
      <span className="absolute text-[9px] font-bold" style={{ color }}>{strength}</span>
    </div>
  );
}

/* ── Animated empty state ── */
function EmptyState() {
  return (
    <div className="relative flex flex-col items-center justify-center py-20 overflow-hidden sentence-empty-entrance">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-8 left-1/4 w-48 h-48 rounded-full sentence-orb-1" />
        <div className="absolute bottom-8 right-1/4 w-36 h-36 rounded-full sentence-orb-2" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full sentence-orb-3" />
      </div>

      {/* Floating decorative elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-12 left-[20%] sentence-float-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400/20 to-blue-400/20 backdrop-blur-sm border border-indigo-200/30 flex items-center justify-center text-xs">A</div>
        </div>
        <div className="absolute top-20 right-[22%] sentence-float-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400/20 to-purple-400/20 backdrop-blur-sm border border-violet-200/30" />
        </div>
        <div className="absolute bottom-16 left-[30%] sentence-float-3">
          <div className="w-10 h-3 rounded-full bg-gradient-to-r from-blue-400/15 to-indigo-400/15 backdrop-blur-sm border border-blue-200/20" />
        </div>
        <div className="absolute bottom-24 right-[28%] sentence-float-1" style={{ animationDelay: "1.5s" }}>
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan-400/15 to-blue-400/15 backdrop-blur-sm border border-cyan-200/20 flex items-center justify-center text-[10px] text-cyan-500/50">B</div>
        </div>
      </div>

      {/* Main icon */}
      <div className="relative z-10 mb-6 sentence-icon-pop">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-blue-500/10 to-violet-500/10 backdrop-blur-xl border border-indigo-200/40 flex items-center justify-center shadow-lg shadow-indigo-500/5">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-indigo-500">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-2xl border border-indigo-300/30 sentence-pulse-ring" />
      </div>

      <h3 className="relative z-10 text-xl font-semibold bg-gradient-to-r from-gray-900 via-indigo-900 to-gray-900 bg-clip-text text-transparent mb-2">
        No sentences yet
      </h3>
      <p className="relative z-10 text-sm text-gray-500 max-w-xs mx-auto text-center leading-relaxed">
        Select a sentence on any webpage and save it to start building your collection.
      </p>

      {/* Hint arrow */}
      <div className="relative z-10 mt-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100/50 sentence-hint-bounce">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-indigo-400">
          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-xs font-medium text-indigo-500">Highlight text on any page to save</span>
      </div>
    </div>
  );
}

interface SentenceCardProps {
  sentence: WordDoc;
  onDelete: (id: string) => void;
  onToggleHard: (id: string) => void;
  pendingDelete: boolean;
  onUndoDelete: (id: string) => void;
  index: number;
}

function SentenceCard({ sentence, onDelete, onToggleHard, pendingDelete, onUndoDelete, index }: SentenceCardProps) {
  const strength = computeStrength(sentence);
  const color = strengthColor(strength);
  const source = sentence.contexts?.[0]?.url;
  const [isHovered, setIsHovered] = useState(false);
  const [justAppeared, setJustAppeared] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setJustAppeared(false), 600 + index * 60);
    return () => clearTimeout(t);
  }, [index]);

  if (pendingDelete) {
    return (
      <div className="w-full px-5 py-3.5 rounded-2xl border border-gray-200/60 bg-gray-50/80 backdrop-blur-sm flex items-center justify-between sentence-undo-enter">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-400">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-sm text-gray-500">Sentence removed</span>
        </div>
        <button
          onClick={() => onUndoDelete(sentence._id)}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors px-3 py-1 rounded-lg hover:bg-indigo-50"
        >
          Undo
        </button>
      </div>
    );
  }

  const delay = Math.min(index * 60, 400);

  return (
    <div
      className="sentence-card-wrapper"
      style={{
        animationDelay: justAppeared ? `${delay}ms` : "0ms",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Gradient accent left edge */}
      <div
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-300"
        style={{
          background: `linear-gradient(to bottom, ${color}, ${color}60)`,
          opacity: isHovered ? 1 : 0.5,
          boxShadow: isHovered ? `0 0 8px ${color}30` : "none",
        }}
      />

      <div className="pl-4">
        {/* English sentence */}
        <p className="text-[15px] font-medium text-gray-900 leading-relaxed mb-1.5 tracking-[-0.01em]">
          <span className="text-indigo-300/70">&ldquo;</span>
          {sentence.word}
          <span className="text-indigo-300/70">&rdquo;</span>
        </p>

        {/* Translation */}
        <p className="text-sm text-gray-500 leading-relaxed mb-3">
          {sentence.translation}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-xs text-gray-400">
            {source && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50/80 border border-gray-100/60" title={source}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                {getHostname(source)}
              </span>
            )}
            <span className="tabular-nums">{new Date(sentence.addedAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Strength ring */}
            <StrengthRing strength={strength} color={color} />

            {/* Listen */}
            <button
              onClick={() => { speak(sentence.word); }}
              className="sentence-action-btn group"
              title="Listen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-indigo-500 transition-colors">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            </button>

            {/* Hard star */}
            <button
              onClick={() => onToggleHard(sentence._id)}
              className={`sentence-action-btn transition-all duration-200 ${sentence.isHard ? "text-amber-500 hover:text-amber-600 scale-110" : "text-gray-300 hover:text-amber-400"}`}
              title={sentence.isHard ? "Unmark as hard" : "Mark as hard"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={sentence.isHard ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
                style={sentence.isHard ? { filter: "drop-shadow(0 0 4px rgba(245,158,11,0.4))" } : {}}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>

            {/* Delete */}
            <button
              onClick={() => onDelete(sentence._id)}
              className="sentence-action-btn text-gray-300 hover:text-red-500 hover:bg-red-50/80"
              title="Delete"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SentencesTab({ deviceId }: { deviceId: string }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "strength">("recent");
  const [pendingDeletes, setPendingDeletes] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // Debounce search — 300ms delay so skeleton has time to show
  useEffect(() => {
    if (searchTerm.length < 2) {
      setDebouncedSearch("");
      return;
    }
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const {
    results: paginatedWords,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(api.words.list, { deviceId }, { initialNumItems: 100 });

  const searchResults = useQuery(
    api.words.search,
    debouncedSearch.length >= 2 ? { deviceId, term: debouncedSearch } : "skip",
  );

  const removeWord = useMutation(api.words.remove);
  const removeBatch = useMutation(api.words.removeBatch);
  const toggleHard = useMutation(api.words.toggleHard);

  // During search: use debounced results when available
  const rawWords = debouncedSearch.length >= 2
    ? (searchResults ?? null)
    : paginatedWords;

  // Filter to sentences only
  const sentences = rawWords
    ? rawWords.filter((w) => (w as WordDoc).type === "sentence")
    : undefined;

  const sorted = sentences && sortBy === "strength"
    ? [...sentences].sort((a, b) => computeStrength(a) - computeStrength(b))
    : sentences;

  const isFirstLoad = paginationStatus === "LoadingFirstPage" && searchTerm.length < 2;
  // Show skeleton while debounce hasn't caught up OR while query is loading
  const isSearching = searchTerm.length >= 2 && (searchTerm !== debouncedSearch || searchResults === undefined);
  // Timeout: stop showing skeleton after 8s to avoid infinite loading
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!isFirstLoad) { setLoadingTimedOut(false); return; }
    const t = setTimeout(() => setLoadingTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [isFirstLoad]);
  const isLoading = (isFirstLoad && !loadingTimedOut) || isSearching;

  const handleDelete = (id: string) => {
    const timeout = setTimeout(async () => {
      await removeWord({ id: id as any, deviceId });
      setPendingDeletes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
    setPendingDeletes((prev) => new Map(prev).set(id, timeout));
  };

  const handleUndoDelete = (id: string) => {
    const timeout = pendingDeletes.get(id);
    if (timeout) clearTimeout(timeout);
    setPendingDeletes((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleToggleHard = (id: string) => {
    toggleHard({ id: id as any, deviceId });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    await removeBatch({ ids: Array.from(selectedIds) as any[], deviceId });
    setSelectedIds(new Set());
    setBatchMode(false);
  };

  return (
    <div className="sentence-tab-root">
      {/* ── Search + sort + batch controls ── */}
      <div className="mb-5 flex gap-3 items-center">
        {/* Search input with animated border */}
        <div className={`sentence-search-wrap flex-1 ${searchFocused ? "focused" : ""}`}>
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 transition-colors" style={searchFocused ? { color: "#6366f1" } : {}}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search sentences..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full pl-10 pr-4 py-2.5 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Sort toggle with sliding indicator */}
        <div className="sentence-sort-toggle relative flex p-1 rounded-xl">
          <div
            className="sentence-sort-slider absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              left: sortBy === "recent" ? "4px" : "50%",
              width: "calc(50% - 4px)",
            }}
          />
          <button
            onClick={() => setSortBy("recent")}
            className={`relative z-10 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 ${sortBy === "recent" ? "text-indigo-700" : "text-gray-400 hover:text-gray-600"}`}
          >
            Recent
          </button>
          <button
            onClick={() => setSortBy("strength")}
            className={`relative z-10 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 ${sortBy === "strength" ? "text-indigo-700" : "text-gray-400 hover:text-gray-600"}`}
          >
            Weakest
          </button>
        </div>

        {/* Batch select */}
        <button
          onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
          className={`sentence-select-btn ${batchMode ? "active" : ""}`}
        >
          {batchMode ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
              Cancel
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              Select
            </>
          )}
        </button>
      </div>

      {/* ── Batch delete bar ── */}
      {batchMode && selectedIds.size > 0 && (
        <div className="sentence-batch-bar mb-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-xs font-bold text-red-600">{selectedIds.size}</span>
            </div>
            <span className="text-sm font-medium text-red-700">sentences selected</span>
          </div>
          <button
            onClick={handleBatchDelete}
            className="px-4 py-1.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 transition-all shadow-sm shadow-red-500/20 hover:shadow-red-500/30 btn-spring"
          >
            Delete all
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="sentence-skeleton" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="h-4 w-3/4 bg-gray-200/60 rounded-md mb-2" />
              <div className="h-3 w-1/2 bg-gray-200/40 rounded-md mb-3" />
              <div className="flex justify-between">
                <div className="h-3 w-24 bg-gray-200/40 rounded-md" />
                <div className="h-3 w-16 bg-gray-200/40 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : !sorted || sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2.5">
          {sorted.map((s, i) => (
            <div key={s._id} className="flex items-start gap-3">
              {batchMode && (
                <label className="sentence-checkbox-wrap mt-5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s._id)}
                    onChange={(e) => {
                      const next = new Set(selectedIds);
                      e.target.checked ? next.add(s._id) : next.delete(s._id);
                      setSelectedIds(next);
                    }}
                    className="sr-only"
                  />
                  <div className={`sentence-checkbox ${selectedIds.has(s._id) ? "checked" : ""}`}>
                    {selectedIds.has(s._id) && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                </label>
              )}
              <div className="flex-1">
                <SentenceCard
                  sentence={s as WordDoc}
                  onDelete={handleDelete}
                  onToggleHard={handleToggleHard}
                  pendingDelete={pendingDeletes.has(s._id)}
                  onUndoDelete={handleUndoDelete}
                  index={i}
                />
              </div>
            </div>
          ))}

          {/* Load more */}
          {searchTerm.length < 2 && paginationStatus === "CanLoadMore" && (
            <button
              onClick={() => loadMore(50)}
              className="sentence-load-more group"
            >
              <span>Load more</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="transition-transform group-hover:translate-y-0.5">
                <path d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
