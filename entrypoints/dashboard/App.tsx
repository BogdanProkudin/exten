import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Fragment,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Id, Doc } from "../../convex/_generated/dataModel";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { computeStrength, strengthColor } from "../../src/lib/memory-strength";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";
import { ImportExport } from "./ImportExport";
import { speak } from "../../src/lib/tts";
import { SettingsTab } from "./SettingsTab";
import { QuizMode } from "./QuizMode";
import { WordOfTheDay } from "./WordOfTheDay";
import { WritingPractice } from "./WritingPractice";
import WordMap from "./WordMap";
import { DailyGoalRing } from "./DailyGoalRing";
import { ReviewSession, NoWordsView } from "./ReviewSession";
import { OwlAvatar } from "../../src/components/OwlAvatar";
// DashboardBackground removed — clean CSS gradient only
import { LevelUpCelebration } from "./LevelUpCelebration";

// Word document type from Convex schema
type WordDoc = Doc<"words">;

// --- Sound effects (Web Audio API, no files needed) ---

let _audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

function playRememberedSound() {
  try {
    const ctx = getAudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    // Two-tone ascending "ding"
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(520, ctx.currentTime);
    o1.connect(gain);
    o1.start(ctx.currentTime);
    o1.stop(ctx.currentTime + 0.12);

    const gain2 = ctx.createGain();
    gain2.connect(ctx.destination);
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(700, ctx.currentTime + 0.1);
    o2.connect(gain2);
    o2.start(ctx.currentTime + 0.1);
    o2.stop(ctx.currentTime + 0.35);
  } catch {}
}

function playForgotSound() {
  try {
    const ctx = getAudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(300, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
    o.connect(gain);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.25);
  } catch {}
}

// --- Helpers ---

function highlightWord(sentence: string, word: string): ReactNode {
  try {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(\\b${escaped}\\b)`, "gi");
    const parts = sentence.split(regex);
    if (parts.length === 1) return sentence;
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="bg-yellow-200 text-gray-900 rounded-sm px-0.5 not-italic font-medium">
          {part}
        </mark>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    );
  } catch {
    return sentence;
  }
}

// --- Main App ---
function NewTabReviewTimer() {
  const [nextReviewAt, setNextReviewAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  // Fetch on mount + listen for storage changes
  useEffect(() => {
    // Get initial state
    chrome.runtime.sendMessage({ type: "GET_TIMER_STATE" }).then((res: Record<string, unknown>) => {
      if (res?.nextReviewAt) setNextReviewAt(res.nextReviewAt as number);
    }).catch(() => {});

    // Listen for timer resets via storage changes
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const timerValue = changes.vocabifyTimerState?.newValue as { nextReviewAt?: number } | undefined;
      if (area === "session" && timerValue?.nextReviewAt) {
        setNextReviewAt(timerValue.nextReviewAt);
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // Local countdown
  useEffect(() => {
    if (!nextReviewAt) return;
    setRemainingMs(Math.max(0, nextReviewAt - Date.now()));
    const interval = setInterval(() => {
      const ms = nextReviewAt - Date.now();
      setRemainingMs(Math.max(0, ms));
    }, 1000);
    return () => clearInterval(interval);
  }, [nextReviewAt]);

  if (!nextReviewAt) return null;
  if (remainingMs <= 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-500 font-medium">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
        </span>
        Review incoming...
      </div>
    );
  }

  const s = Math.ceil(remainingMs / 1000);
  const time = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const isUrgent = s <= 10;

  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium tabular-nums ${isUrgent ? "text-amber-500" : "text-gray-400"}`}>
      <span className="text-[10px]">⏱</span>
      next in {time}
    </div>
  );
}

export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"review" | "vocabulary" | "stats" | "settings">(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "review" || hash === "vocabulary" || hash === "stats" || hash === "settings") return hash;
    const params = new URLSearchParams(window.location.search);
    return (params.get("tab") as "review" | "vocabulary" | "stats" | "settings") || "review";
  });
  const [showImportExport, setShowImportExport] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showWriting, setShowWriting] = useState(false);
  const [showWordMap, setShowWordMap] = useState(false);

  // Tab routing via hash
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "review" || hash === "vocabulary" || hash === "stats" || hash === "settings") {
        setActiveTab(hash);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" }).then((res) => {
      if (res?.deviceId) setDeviceId(res.deviceId);
    }).catch(() => {
      // Retry after 1s if background script wasn't ready
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" }).then((res) => {
          if (res?.deviceId) setDeviceId(res.deviceId);
        }).catch(() => {});
      }, 1000);
    });
  }, []);

  // Time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 6) return { text: "Burning the midnight oil?", emoji: "🌙" };
    if (hour < 12) return { text: "Good morning", emoji: "☀️" };
    if (hour < 17) return { text: "Good afternoon", emoji: "🌤️" };
    if (hour < 21) return { text: "Good evening", emoji: "🌆" };
    return { text: "Late night learning", emoji: "🌙" };
  };
  const greeting = getGreeting();

  return (
    <div className="min-h-screen relative" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f0fdf4 100%)" }}>
      <div className="relative">
      <header className="sticky top-0 z-10 border-b border-gray-200/60" style={{ background: "rgba(255, 255, 255, 0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", animation: "fadeInUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <OwlAvatar size={44} />
            <div>
              <h1 className="text-base font-semibold text-gray-900 leading-tight">Vocabify</h1>
              <p className="text-xs text-gray-400">{greeting.emoji} {greeting.text}</p>
            </div>
          </div>
          <TabNavBar activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowQuiz(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 transition-all text-xs font-medium"
              title="Quiz Mode"
            >
              🎯 Quiz
            </button>
<button
              onClick={() => setShowWordMap(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-cyan-50 text-gray-500 hover:text-cyan-600 transition-all text-xs font-medium"
              title="Word Map"
            >
              🗺️ Map
            </button>
            <button
              onClick={() => setShowWriting(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-purple-50 text-gray-500 hover:text-purple-600 transition-all text-xs font-medium"
              title="Writing Practice"
            >
              🏋️ Practice
            </button>
            <button
              onClick={() => setShowImportExport(true)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Import / Export"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <ErrorBoundary>
          {!deviceId ? (
            <ReviewLoadingSpinner />
          ) : (
            <div key={activeTab} role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="animate-tab-switch">
              {activeTab === "review" ? (
                <ReviewTab deviceId={deviceId} onShowQuiz={() => setShowQuiz(true)} onShowWriting={() => setShowWriting(true)} />
              ) : activeTab === "stats" ? (
                <StatsTab deviceId={deviceId} />
              ) : activeTab === "settings" ? (
                <SettingsTab deviceId={deviceId} />
              ) : (
                <VocabularyTab deviceId={deviceId} />
              )}
            </div>
          )}
        </ErrorBoundary>
      </main>
      
      {/* Import/Export Modal */}
      {showImportExport && deviceId && (
        <ImportExport
          deviceId={deviceId}
          onClose={() => setShowImportExport(false)}
        />
      )}
      
      {/* Quiz Mode Modal */}
      {showQuiz && deviceId && (
        <QuizMode
          deviceId={deviceId}
          onClose={() => setShowQuiz(false)}
        />
      )}
      
      {/* Writing Practice Modal */}
      {showWriting && deviceId && (
        <WritingPractice
          deviceId={deviceId}
          onClose={() => setShowWriting(false)}
        />
      )}


      {/* Word Relationship Map */}
      {showWordMap && deviceId && (
        <WordMap
          deviceId={deviceId}
          onClose={() => setShowWordMap(false)}
        />
      )}
      </div>{/* close z-10 wrapper */}
    </div>
  );
}

function ReviewLoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  id,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  id: string;
}) {
  return (
    <button
      id={`tab-${id}`}
      role="tab"
      aria-selected={active}
      data-tab-active={active}
      onClick={onClick}
      className={`relative z-[1] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors duration-200 ${
        active
          ? "text-gray-900"
          : "text-gray-500 hover:text-gray-700"
      }`}
      style={{
        transform: active ? "scale(1)" : "scale(0.97)",
        transition: "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), color 200ms ease",
      }}
    >
      {children}
    </button>
  );
}

function TabNavBar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: any) => void }) {
  const navRef = useRef<HTMLElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const blob = blobRef.current;
    if (!nav || !blob) return;

    const activeBtn = nav.querySelector('[data-tab-active="true"]') as HTMLElement | null;
    if (!activeBtn) return;

    const nRect = nav.getBoundingClientRect();
    const bRect = activeBtn.getBoundingClientRect();

    blob.style.transform = `translateX(${bRect.left - nRect.left}px)`;
    blob.style.width = `${bRect.width}px`;
    blob.style.height = `${bRect.height}px`;
  }, [activeTab]);

  return (
    <nav ref={navRef} className="relative flex gap-0.5 bg-gray-100/80 rounded-xl p-1" role="tablist" aria-label="Dashboard tabs">
      {/* Sliding blob */}
      <div
        ref={blobRef}
        className="absolute top-1 left-0 rounded-lg pointer-events-none"
        style={{
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
          transition: "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1), width 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
      <TabButton active={activeTab === "review"} onClick={() => setActiveTab("review")} id="review">
        📖 Review
      </TabButton>
      <TabButton active={activeTab === "vocabulary"} onClick={() => setActiveTab("vocabulary")} id="vocabulary">
        📚 Words
      </TabButton>
      <TabButton active={activeTab === "stats"} onClick={() => setActiveTab("stats")} id="stats">
        📊 Stats
      </TabButton>
      <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")} id="settings">
        ⚙️ Settings
      </TabButton>
    </nav>
  );
}

// --- Review Tab ---

function ReviewTab({ deviceId, onShowQuiz, onShowWriting }: { deviceId: string; onShowQuiz: () => void; onShowWriting: () => void }) {
  const [tipVisible, setTipVisible] = useState(false);
  const dailyProgress = useQuery(api.gamification.getDailyProgress, { deviceId });

  // Track newtab open and check for tip
  useEffect(() => {
    incrementCounter("newtabOpened", true);
    shouldShowTip("tip_newtab_review").then((show) => {
      if (show) {
        setTipVisible(true);
        markTipSeen("tip_newtab_review");
      }
    });
  }, []);

  return (
    <div>
      {/* Tip banner */}
      {tipVisible && (
        <div
          className="max-w-md mx-auto mb-4"
          style={{
            padding: "8px 14px",
            background: "#EFF6FF",
            borderLeft: "3px solid #3b82f6",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#1E40AF",
            lineHeight: 1.5,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
          }}
        >
          <span style={{ flex: 1 }}>Review your vocabulary here. Space + arrows for speed</span>
          <button
            onClick={() => {
              setTipVisible(false);
              dismissTipForever("tip_newtab_review");
            }}
            style={{
              color: "#1E40AF",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
            }}
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Filter + review cards */}
      <ReviewContent deviceId={deviceId} dailyProgress={dailyProgress} onShowQuiz={onShowQuiz} onShowWriting={onShowWriting} />
    </div>
  );
}

function ReviewContent({ deviceId, dailyProgress, onShowQuiz, onShowWriting }: { deviceId: string; dailyProgress: { streak: number } | undefined; onShowQuiz: () => void; onShowWriting: () => void }) {
  const [snapshotWords, setSnapshotWords] = useState<any[] | null>(null);
  const [sessionId, setSessionId] = useState(0);

  // Track all word IDs reviewed this page load to prevent re-showing after FSRS update
  const reviewedIdsRef = useRef<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const dueWords = useQuery(api.words.getReviewWords, { deviceId, limit: 8, excludeIds: excludedIds });
  const stats = useQuery(api.words.stats, { deviceId });
  const updateReview = useMutation(api.words.updateReview);
  const allWordsForDistractors = useQuery(api.words.getQuizWords, { deviceId, limit: 50 });

  // Snapshot due words when available and no active session
  useEffect(() => {
    if (dueWords && dueWords.length > 0 && snapshotWords === null) {
      setSnapshotWords([...dueWords]);
    }
  }, [dueWords, snapshotWords]);

  const handleSessionComplete = useCallback(() => {
    // Add current session's words to the exclusion set before resetting
    if (snapshotWords) {
      for (const w of snapshotWords) {
        reviewedIdsRef.current.add(w._id);
      }
    }
    // Update state to re-query without reviewed words
    setExcludedIds(Array.from(reviewedIdsRef.current));
    setSnapshotWords(null);
    setSessionId((k) => k + 1);
  }, [snapshotWords]);

  const totalWords = stats?.total ?? 0;
  const learningCount = stats?.wordsLearning ?? 0;
  const masteredCount = stats?.wordsKnown ?? 0;

  const isLoading = dueWords === undefined || stats === undefined || dailyProgress === undefined;
  const streak = dailyProgress?.streak ?? 0;

  if (isLoading) {
    return <ReviewLoadingSpinner />;
  }

  return (
    <div style={{ minHeight: "60vh" }}>
      {snapshotWords === null || snapshotWords.length === 0 ? (
        <NoWordsView
          totalWords={totalWords}
          learningCount={learningCount}
          masteredCount={masteredCount}
          streak={streak}
          onShowQuiz={onShowQuiz}
          onShowWriting={onShowWriting}
        />
      ) : (
        <ReviewSession
          key={sessionId}
          deviceId={deviceId}
          sessionWords={snapshotWords}
          allWordsForDistractors={allWordsForDistractors ?? []}
          onContinue={handleSessionComplete}
          updateReview={updateReview}
          streak={streak}
        />
      )}
    </div>
  );
}

function EmptyState({ icon, title, description, cta }: { icon: string; title: string; description: string; cta?: ReactNode }) {
  return (
    <div className="text-center py-12">
      <div
        className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center"
        style={{ fontSize: "36px", lineHeight: 1, animation: "bounceScale 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
      >
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2" style={{ animation: "fadeInUp 300ms ease-out 100ms both" }}>{title}</h2>
      <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed" style={{ animation: "fadeInUp 300ms ease-out 180ms both" }}>{description}</p>
      {cta && <div className="mt-5" style={{ animation: "fadeInUp 300ms ease-out 260ms both" }}>{cta}</div>}
    </div>
  );
}

function MiniStat({ label, value, color = "blue" }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-600", ring: "ring-blue-100" },
    green: { bg: "bg-green-50", text: "text-green-600", ring: "ring-green-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", ring: "ring-purple-100" },
  };
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`flex-1 ${c.bg} rounded-xl p-4 ring-1 ${c.ring} text-center transition-transform hover:scale-105`}>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 font-medium">{label}</p>
    </div>
  );
}

// --- Vocabulary Tab ---

function VocabularyTab({ deviceId }: { deviceId: string }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pendingDeletes, setPendingDeletes] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [strengthFilter, setStrengthFilter] = useState<"all" | "weak">("all");
  const hasAnimatedRef = useRef(false);
  const [sortBy, setSortBy] = useState<"recent" | "strength" | "alphabetical">("recent");
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const vocabStats = useQuery(api.words.stats, { deviceId });

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
  } = usePaginatedQuery(api.words.list, { deviceId }, { initialNumItems: 50 });

  const searchResults = useQuery(
    api.words.search,
    debouncedSearch.length >= 2 ? { deviceId, term: debouncedSearch } : "skip",
  );
  const removeWord = useMutation(api.words.remove);
  const removeBatch = useMutation(api.words.removeBatch);
  const updateReview = useMutation(api.words.updateReview);
  const setStatus = useMutation(api.words.setStatus);

  const rawWords = debouncedSearch.length >= 2
    ? (searchResults ?? null)
    : paginatedWords;
  const filteredWords = rawWords && strengthFilter === "weak"
    ? rawWords.filter((w) => computeStrength(w) < 40)
    : rawWords;
  const words = filteredWords && sortBy !== "recent"
    ? [...filteredWords].sort((a, b) => {
        if (sortBy === "strength") return computeStrength(a) - computeStrength(b);
        if (sortBy === "alphabetical") return a.word.localeCompare(b.word);
        return 0;
      })
    : filteredWords;
  const isFirstLoad = paginationStatus === "LoadingFirstPage" && searchTerm.length < 2;
  const isSearching = searchTerm.length >= 2 && (searchTerm !== debouncedSearch || searchResults === undefined);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  useEffect(() => {
    if (!isFirstLoad) { setLoadingTimedOut(false); return; }
    const t = setTimeout(() => setLoadingTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [isFirstLoad]);
  const isLoading = (isFirstLoad && !loadingTimedOut) || isSearching;

  useEffect(() => {
    if (words && words.length > 0 && !hasAnimatedRef.current) {
      const t = setTimeout(() => { hasAnimatedRef.current = true; }, 600);
      return () => clearTimeout(t);
    }
  }, [words]);

  const handleDelete = (id: string) => {
    const timer = setTimeout(async () => {
      setPendingDeletes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      await removeWord({ id: id as Id<"words">, deviceId });
    }, 3000);
    setPendingDeletes((prev) => new Map(prev).set(id, timer));
  };

  const handleUndo = (id: string) => {
    const timer = pendingDeletes.get(id);
    if (timer) clearTimeout(timer);
    setPendingDeletes((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      pendingDeletes.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleStatusChange = async (id: string, newStatus: "new" | "learning" | "known") => {
    await setStatus({ id: id as Id<"words">, deviceId, status: newStatus });
  };

  const statusBadge = (status: string, wordId: string) => {
    return (
      <select
        value={status}
        onChange={(e) =>
          handleStatusChange(wordId, e.target.value as "new" | "learning" | "known")
        }
        className={`vocab-status-pill ${status}`}
      >
        <option value="new">new</option>
        <option value="learning">learning</option>
        <option value="known">known</option>
      </select>
    );
  };

  return (
    <div>
      {/* Stats tiles */}
      {vocabStats && (
        <div className="flex items-center gap-3 mb-5" style={{ animation: "heroReveal 300ms ease-out both" }}>
          {[
            {
              value: vocabStats.total,
              label: "Words",
              color: "text-indigo-500",
              iconBg: "bg-indigo-50",
              iconColor: "#6366f1",
              icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
            },
            {
              value: vocabStats.wordsLearning,
              label: "Learning",
              color: "text-amber-500",
              iconBg: "bg-amber-50",
              iconColor: "#f59e0b",
              icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
            },
            {
              value: vocabStats.wordsKnown,
              label: "Mastered",
              color: "text-emerald-500",
              iconBg: "bg-emerald-50",
              iconColor: "#10b981",
              icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
            },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="vocab-stat-mini"
              style={{ animation: `heroReveal 300ms ease-out ${i * 60}ms both` }}
            >
              <div className={`w-7 h-7 rounded-lg ${stat.iconBg} flex items-center justify-center shrink-0`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stat.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={stat.icon} />
                </svg>
              </div>
              <div>
                <span className={`text-sm font-bold tabular-nums ${stat.color}`}>{stat.value}</span>
                <span className="text-[11px] text-gray-400 font-medium ml-1">{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search bar with animated gradient border */}
      <div
        className={`vocab-search-bar p-3 mb-4 ${searchFocused ? "focused" : ""}`}
        style={{ animation: "heroReveal 300ms ease-out 80ms both" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors duration-200" style={searchFocused ? { color: "#6366f1" } : undefined} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              placeholder="Search words..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full pl-9 pr-8 py-2 bg-transparent border-none rounded-lg text-sm focus:outline-none transition-all placeholder:text-gray-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 transition-all cursor-pointer hover:scale-110"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>

          {/* Strength filter segment */}
          <div className="vocab-segment shrink-0">
            <button
              onClick={() => setStrengthFilter("all")}
              className={`vocab-segment-btn cursor-pointer ${strengthFilter === "all" ? "active" : ""}`}
            >
              All
            </button>
            <button
              onClick={() => setStrengthFilter("weak")}
              className={`vocab-segment-btn cursor-pointer ${strengthFilter === "weak" ? "active" : ""}`}
            >
              Weak
            </button>
          </div>
        </div>
      </div>

      {/* Sort & Batch Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Sort chips */}
          {[
            { value: "recent" as const, label: "Recent", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
            { value: "strength" as const, label: "Weakest", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
            { value: "alphabetical" as const, label: "A-Z", icon: "M3 4h13M3 8h9M3 12h5m0 0l4 8m0-8l-4 8" },
          ].map((sort) => (
            <button
              key={sort.value}
              onClick={() => setSortBy(sort.value)}
              className={`vocab-control-chip flex items-center gap-1.5 ${sortBy === sort.value ? "active" : ""}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={sort.icon} />
              </svg>
              {sort.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <button
            onClick={() => {
              setBatchMode(!batchMode);
              if (batchMode) setSelectedWords(new Set());
            }}
            className={`vocab-control-chip flex items-center gap-1.5 ${batchMode ? "active !border-indigo-200 !bg-indigo-50 !text-indigo-600" : ""}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={batchMode ? "M18 6 6 18M6 6l12 12" : "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"} />
            </svg>
            {batchMode ? "Cancel" : "Select"}
          </button>
        </div>
        {batchMode && selectedWords.size > 0 && (
          <button
            onClick={async () => {
              await removeBatch({
                ids: Array.from(selectedWords) as Id<"words">[],
                deviceId,
              });
              setSelectedWords(new Set());
              setBatchMode(false);
            }}
            className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-semibold text-red-600 bg-red-50 border border-red-200 cursor-pointer btn-spring hover:bg-red-100"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete {selectedWords.size}
          </button>
        )}
      </div>

      {/* Search result count */}
      {debouncedSearch.length >= 2 && !isSearching && words && words.length > 0 && (
        <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5" style={{ animation: "fadeInUp 150ms ease-out both" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <span><strong className="text-gray-600">{words.length}</strong> result{words.length !== 1 ? "s" : ""} for &ldquo;{debouncedSearch}&rdquo;</span>
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-[20px] skeleton-shimmer"
              style={{ animationDelay: `${i * 80}ms`, border: "1px solid rgba(229,231,235,0.3)" }}
            />
          ))}
        </div>
      ) : !words || words.length === 0 ? (
        <div className="vocab-empty-state relative">
          {/* Background orbs */}
          <div className="idle-bg-orbs" style={{ inset: "-20px" }}>
            <div className="idle-orb idle-orb-1" />
            <div className="idle-orb idle-orb-2" />
          </div>
          <div className="relative z-10">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background: searchTerm ? "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08))" : "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(34,197,94,0.08))",
                animation: "bounceScale 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={searchTerm ? "#6366f1" : "#10b981"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {searchTerm ? (
                  <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>
                ) : (
                  <><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></>
                )}
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1.5" style={{ animation: "fadeInUp 300ms ease-out 100ms both" }}>
              {searchTerm ? "No results" : "No words saved yet"}
            </h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto" style={{ animation: "fadeInUp 300ms ease-out 180ms both" }}>
              {searchTerm ? "No words match your search" : "Select words on any webpage to start building your vocabulary"}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Batch select all */}
          {batchMode && (
            <div className="vocab-batch-bar mb-3">
              <label className="flex items-center gap-2.5 text-xs text-indigo-600 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={words.length > 0 && selectedWords.size === words.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedWords(new Set(words.map((w) => w._id)));
                    else setSelectedWords(new Set());
                  }}
                  className="w-4 h-4 rounded-md border-indigo-300 text-indigo-500 cursor-pointer"
                />
                Select all ({words.length})
              </label>
            </div>
          )}

          {/* Word cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {words.map((word, i) => {
              const isPendingDelete = pendingDeletes.has(word._id);
              const score = computeStrength(word);
              const color = strengthColor(score);
              const isNew = !word.fsrsReps || word.fsrsReps === 0;
              const isExpanded = expandedRows.has(word._id);
              const contexts = word.contexts ?? (word.example ? [{ sentence: word.example, url: word.sourceUrl, timestamp: word.addedAt }] : []);
              const circumference = 2 * Math.PI * 16;
              const dash = isNew ? 0 : circumference * (score / 100);

              if (isPendingDelete) {
                return (
                  <div key={word._id} className="vocab-undo-card">
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
                      <span className="text-xs text-red-400 line-through font-medium">{word.word}</span>
                    </div>
                    <button onClick={() => handleUndo(word._id)} className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer transition-colors">Undo</button>
                  </div>
                );
              }

              return (
                <div
                  key={word._id}
                  className={`group vocab-word-card ${batchMode && selectedWords.has(word._id) ? "selected" : ""}`}
                  style={
                    !hasAnimatedRef.current && i < 12
                      ? { animation: `vocabCardSlideIn 400ms cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(i * 50, 500)}ms both` }
                      : searchTerm.length >= 2
                        ? { animation: "fadeInUp 150ms ease-out both" }
                        : undefined
                  }
                  onClick={() => {
                    if (batchMode) {
                      setSelectedWords(prev => {
                        const next = new Set(prev);
                        next.has(word._id) ? next.delete(word._id) : next.add(word._id);
                        return next;
                      });
                    }
                  }}
                >
                  {/* Top row: word + strength ring */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 truncate leading-tight">{word.word}</h3>
                      <p className="text-sm text-gray-500 truncate mt-0.5">{word.translation}</p>
                    </div>
                    {/* Strength ring with hover glow */}
                    <div className="relative w-10 h-10 shrink-0 ml-2 vocab-strength-ring" style={{ "--ring-color": isNew ? "rgba(148,163,184,0.2)" : color + "40" } as React.CSSProperties}>
                      <svg width="40" height="40" viewBox="0 0 40 40" className="transform -rotate-90">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(241,245,249,0.8)" strokeWidth="3" />
                        <circle
                          cx="20" cy="20" r="16" fill="none"
                          stroke={isNew ? "#e2e8f0" : color}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${dash} ${circumference}`}
                          style={{ transition: "stroke-dasharray 800ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: isNew ? '#94a3b8' : color }}>
                        {isNew ? "New" : score}
                      </span>
                    </div>
                  </div>

                  {/* Bottom row: status + actions */}
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1">
                      {statusBadge(word.status, word._id)}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {/* Speak */}
                      <button
                        onClick={(e) => { e.stopPropagation(); speak(word.word); }}
                        className="vocab-card-action speak"
                        title="Pronounce"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      </button>
                      {/* Expand contexts */}
                      {contexts.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedRows(prev => { const n = new Set(prev); n.has(word._id) ? n.delete(word._id) : n.add(word._id); return n; }); }}
                          className="vocab-card-action context"
                          title="Show contexts"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
                        </button>
                      )}
                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(word._id); }}
                        className="vocab-card-action delete"
                        title="Delete"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* Batch checkbox */}
                  {batchMode && (
                    <div className="absolute top-3 right-3">
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                        selectedWords.has(word._id)
                          ? "bg-indigo-500 border-indigo-500 shadow-sm shadow-indigo-200"
                          : "border-gray-300 bg-white"
                      }`}>
                        {selectedWords.has(word._id) && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Expanded contexts */}
                  {isExpanded && contexts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100/60" style={{ animation: "fadeInUp 200ms ease-out both" }}>
                      {contexts.map((ctx, ci) => (
                        <p key={ci} className="text-[11px] text-gray-500 italic leading-relaxed mb-1">
                          {highlightWord(ctx.sentence, word.word)}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {searchTerm.length < 2 && paginationStatus === "CanLoadMore" && (
            <div className="text-center mt-6">
              <button
                onClick={() => loadMore(50)}
                className="vocab-load-more"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Load more words
              </button>
            </div>
          )}
          {searchTerm.length < 2 && paginationStatus === "LoadingMore" && (
            <div className="text-center mt-6">
              <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Loading...
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}

// --- Stats Tab ---

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
}

function StatsTab({ deviceId }: { deviceId: string }) {
  const wordStats = useQuery(api.words.stats, { deviceId });
  const insights = useQuery(api.analytics.getInsights, { deviceId });
  const achievements = useQuery(api.gamification.getAchievements, { deviceId });

  if (!wordStats) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-[18px] skeleton-shimmer" style={{ border: "1px solid rgba(229,231,235,0.3)" }} />
          ))}
        </div>
        <div className="h-48 rounded-[20px] skeleton-shimmer" style={{ border: "1px solid rgba(229,231,235,0.3)" }} />
        <div className="h-40 rounded-[20px] skeleton-shimmer" style={{ border: "1px solid rgba(229,231,235,0.3)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero Stats Tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            value: wordStats.total,
            label: "Words Saved",
            color: "blue",
            textColor: "text-indigo-500",
            iconBg: "bg-indigo-50",
            iconColor: "#6366f1",
            icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
            delay: "0ms",
          },
          {
            value: wordStats.known,
            label: "Mastered",
            color: "green",
            textColor: "text-emerald-500",
            iconBg: "bg-emerald-50",
            iconColor: "#10b981",
            icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
            delay: "60ms",
          },
          {
            value: wordStats.learning,
            label: "Learning",
            color: "amber",
            textColor: "text-amber-500",
            iconBg: "bg-amber-50",
            iconColor: "#f59e0b",
            icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
            delay: "120ms",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`stats-hero-tile ${stat.color} stats-enter`}
            style={{ animationDelay: stat.delay }}
          >
            <div className={`stats-icon ${stat.iconBg}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stat.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={stat.icon} />
              </svg>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${stat.textColor}`}>{stat.value}</div>
            <div className="text-[11px] text-gray-400 font-semibold tracking-wide">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Learning Insights */}
      {insights && (
        <div className="stats-section stats-enter" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              Learning Insights
            </h3>
          </div>

          {/* Weekly Activity Chart */}
          <div className="mb-5">
            <p className="text-[11px] text-gray-400 font-medium mb-2 uppercase tracking-wide">This week</p>
            <div className="flex items-end gap-2 h-20">
              {insights.weeklyActivity.map((day, i) => {
                const maxCount = Math.max(...insights.weeklyActivity.map(d => d.count), 1);
                const height = Math.max(6, (day.count / maxCount) * 60);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-gray-500 tabular-nums">{day.count > 0 ? day.count : ""}</span>
                    <div
                      className="stats-chart-bar w-full"
                      style={{
                        height: `${height}px`,
                        background: day.count > 0
                          ? `linear-gradient(180deg, #818cf8, #6366f1)`
                          : "rgba(229,231,235,0.5)",
                      }}
                    />
                    <span className="text-[10px] text-gray-400 font-medium">{day.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              {
                value: `${insights.velocity}`,
                suffix: "/day",
                label: "Learning pace",
                icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
                iconColor: "#6366f1",
              },
              {
                value: `${insights.retentionRate}%`,
                suffix: "",
                label: "Mastery rate",
                icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
                iconColor: "#10b981",
              },
              {
                value: `${insights.dueForReview}`,
                suffix: "",
                label: "Due for review",
                icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
                iconColor: "#f59e0b",
              },
            ].map((metric, i) => (
              <div key={metric.label} className="stats-metric-card" style={{ animation: `statReveal 350ms cubic-bezier(0.34, 1.56, 0.64, 1) ${200 + i * 60}ms both` }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={metric.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-1.5">
                  <path d={metric.icon} />
                </svg>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  {metric.value}
                  {metric.suffix && <span className="text-xs font-normal text-gray-400">{metric.suffix}</span>}
                </p>
                <p className="text-[11px] text-gray-400 font-medium">{metric.label}</p>
              </div>
            ))}
          </div>

          {/* Hardest Words */}
          {insights.hardestWords.length > 0 && (
            <div className="mb-5">
              <p className="text-[11px] text-gray-400 font-medium mb-2 uppercase tracking-wide flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Challenging words
              </p>
              <div className="flex flex-wrap gap-1.5">
                {insights.hardestWords.map((w, i) => (
                  <span key={i} className="stats-hard-pill">
                    {w.word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Progress Breakdown */}
          <div>
            <p className="text-[11px] text-gray-400 font-medium mb-2.5 uppercase tracking-wide">Progress breakdown</p>
            <div className="stats-progress-bar">
              {insights.totalWords > 0 && (
                <>
                  <div
                    className="stats-progress-segment"
                    style={{
                      width: `${(insights.statusBreakdown.known / insights.totalWords) * 100}%`,
                      background: "linear-gradient(90deg, #10b981, #34d399)",
                    }}
                  />
                  <div
                    className="stats-progress-segment"
                    style={{
                      width: `${(insights.statusBreakdown.learning / insights.totalWords) * 100}%`,
                      background: "linear-gradient(90deg, #6366f1, #818cf8)",
                    }}
                  />
                  <div
                    className="stats-progress-segment"
                    style={{
                      width: `${(insights.statusBreakdown.new / insights.totalWords) * 100}%`,
                      background: "rgba(209,213,219,0.6)",
                    }}
                  />
                </>
              )}
            </div>
            <div className="flex justify-between mt-2">
              {[
                { label: "Mastered", count: insights.statusBreakdown.known, color: "#10b981" },
                { label: "Learning", count: insights.statusBreakdown.learning, color: "#6366f1" },
                { label: "New", count: insights.statusBreakdown.new, color: "#9ca3af" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[11px] text-gray-500 font-medium">{item.label}</span>
                  <span className="text-[11px] text-gray-400 tabular-nums">({item.count})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Achievements */}
      {achievements && achievements.length > 0 && (
        <div className="stats-section stats-enter" style={{ animationDelay: "200ms" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
              Achievements
            </h3>
            <span className="text-xs font-semibold text-amber-500 bg-amber-50 px-2.5 py-1 rounded-lg tabular-nums">
              {achievements.filter((a: Achievement) => a.unlocked).length}/{achievements.length}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {achievements.map((a: Achievement, i: number) => (
              <div
                key={a.id}
                className={`stats-achievement ${a.unlocked ? "unlocked" : "locked"}`}
                style={{ animation: `vocabCardSlideIn 400ms cubic-bezier(0.16, 1, 0.3, 1) ${250 + i * 50}ms both` }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-lg ${a.unlocked ? "" : "grayscale opacity-50"}`}>{a.icon}</span>
                  {a.unlocked && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <p className={`text-sm font-semibold leading-tight ${a.unlocked ? "text-gray-900" : "text-gray-400"}`}>
                  {a.name}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{a.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
