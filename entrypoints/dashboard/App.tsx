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
import { generatePhraseBlank } from "../../src/lib/phrase-review";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";
import { ImportExport } from "./ImportExport";
import { speak } from "../../src/lib/tts";
import { SettingsTab } from "./SettingsTab";
import { QuizMode } from "./QuizMode";
import { WordOfTheDay } from "./WordOfTheDay";
import { WritingPractice } from "./WritingPractice";
import WordMap from "./WordMap";
import { DailyGoalRing } from "./DailyGoalRing";
import { SentencesTab } from "./SentencesList";
import { ReviewSession, NoWordsView } from "./ReviewSession";
import { OwlAvatar } from "../../src/components/OwlAvatar";

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
  const [activeTab, setActiveTab] = useState<"review" | "vocabulary" | "sentences" | "hard" | "stats" | "settings">(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "review" || hash === "vocabulary" || hash === "sentences" || hash === "hard" || hash === "stats" || hash === "settings") return hash;
    const params = new URLSearchParams(window.location.search);
    return (params.get("tab") as "review" | "vocabulary" | "sentences" | "hard" | "stats" | "settings") || "review";
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
      if (hash === "review" || hash === "vocabulary" || hash === "sentences" || hash === "hard" || hash === "stats" || hash === "settings") {
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
    <div className="min-h-screen" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f0fdf4 100%)" }}>
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
            <LoadingSkeleton />
          ) : (
            <div key={activeTab} role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="animate-tab-switch">
              {activeTab === "review" ? (
                <ReviewTab deviceId={deviceId} />
              ) : activeTab === "sentences" ? (
                <SentencesTab deviceId={deviceId} />
              ) : activeTab === "hard" ? (
                <HardWordsTab deviceId={deviceId} />
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
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex justify-center" style={{ animation: "fadeInUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
      <div className="max-w-lg w-full space-y-4">
        <div className="h-56 bg-white/60 rounded-2xl skeleton-shimmer border border-gray-100" />
        <div className="flex gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 h-16 bg-white/60 rounded-xl skeleton-shimmer border border-gray-100" />
          ))}
        </div>
      </div>
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
      <TabButton active={activeTab === "sentences"} onClick={() => setActiveTab("sentences")} id="sentences">
        📝 Sentences
      </TabButton>
      <TabButton active={activeTab === "hard"} onClick={() => setActiveTab("hard")} id="hard">
        ⭐ Hard
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

function ReviewTab({ deviceId }: { deviceId: string }) {
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

      {/* Filter + review cards — session UI now handles streak/progress */}
      <ReviewContent deviceId={deviceId} streak={dailyProgress?.streak ?? 0} />
    </div>
  );
}

// --- Morphing Blob Toggle (Words / Sentences) ---
function ReviewModeToggle({
  mode, onChange,
}: {
  mode: "words" | "sentences";
  onChange: (m: "words" | "sentences") => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);

  // Position the blob behind the active button
  useEffect(() => {
    const container = containerRef.current;
    const blob = blobRef.current;
    if (!container || !blob) return;

    const activeBtn = container.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!activeBtn) return;

    const cRect = container.getBoundingClientRect();
    const bRect = activeBtn.getBoundingClientRect();

    blob.style.transform = `translateX(${bRect.left - cRect.left}px)`;
    blob.style.width = `${bRect.width}px`;
    blob.style.height = `${bRect.height}px`;
  }, [mode]);

  const options: { label: string; value: "words" | "sentences" }[] = [
    { label: "Words", value: "words" },
    { label: "Sentences", value: "sentences" },
  ];

  return (
    <div className="flex justify-center mb-5">
      <div
        ref={containerRef}
        className="relative flex gap-0.5 rounded-2xl p-1.5"
        style={{
          background: "linear-gradient(135deg, rgba(238,240,255,0.9), rgba(230,235,255,0.7))",
          border: "1px solid rgba(199,210,254,0.4)",
        }}
      >
        {/* Sliding blob */}
        <div
          ref={blobRef}
          className="absolute top-1.5 left-0 rounded-xl pointer-events-none"
          style={{
            background: "linear-gradient(135deg, #fff 0%, #f8f9ff 100%)",
            boxShadow: "0 1px 3px rgba(99,102,241,0.08), 0 4px 12px rgba(99,102,241,0.06)",
            transition: "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1), width 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
        {options.map(({ label, value }) => {
          const isActive = mode === value;
          return (
            <button
              key={value}
              data-active={isActive}
              onClick={() => { if (!isActive) onChange(value); }}
              className={`relative z-[1] px-5 py-2 text-xs font-semibold rounded-xl transition-all duration-300 ${
                isActive ? "text-indigo-700" : "text-gray-400 hover:text-gray-600"
              }`}
              style={{
                letterSpacing: isActive ? "0.02em" : "0",
                transform: isActive ? "scale(1)" : "scale(0.97)",
                transition: "color 250ms, letter-spacing 300ms, transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewContent({ deviceId, streak }: { deviceId: string; streak: number }) {
  const [reviewMode, setReviewMode] = useState<"words" | "sentences">("words");
  const [snapshotWords, setSnapshotWords] = useState<any[] | null>(null);
  const [sessionId, setSessionId] = useState(0);

  // Track all word IDs reviewed this page load to prevent re-showing after FSRS update
  const reviewedIdsRef = useRef<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  const typeFilter = reviewMode === "words" ? ["word", "phrase"] : ["sentence"];
  const isSentenceMode = reviewMode === "sentences";

  const dueWords = useQuery(api.words.getReviewWords, { deviceId, limit: 8, typeFilter, excludeIds: excludedIds });
  const stats = useQuery(api.words.stats, { deviceId });
  const updateReview = useMutation(api.words.updateReview);
  const addXP = useMutation(api.gamification.addReviewXP);
  const allWordsForDistractors = useQuery(api.words.getQuizWords, { deviceId, limit: 50, typeFilter: ["word", "phrase"] });

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

  const handleModeChange = useCallback((mode: "words" | "sentences") => {
    setReviewMode(mode);
    setSnapshotWords(null);
    setSessionId((k) => k + 1);
    // Don't reset reviewedIdsRef — reviewed words stay excluded across mode switches
  }, []);

  // Compute filtered stats from byType breakdown
  const wordsDue = stats?.needReview;
  const totalWords = isSentenceMode
    ? (stats?.byType?.sentences ?? 0)
    : ((stats?.byType?.words ?? 0) + (stats?.byType?.phrases ?? 0));
  const learningCount = isSentenceMode
    ? (stats?.byType?.sentencesLearning ?? 0)
    : (stats?.byType?.wordsLearning ?? 0);
  const masteredCount = isSentenceMode
    ? (stats?.byType?.sentencesKnown ?? 0)
    : (stats?.byType?.wordsKnown ?? 0);

  const isLoading = dueWords === undefined || stats === undefined;

  return (
    <>
      <ReviewModeToggle
        mode={reviewMode}
        onChange={handleModeChange}
      />

      {isLoading ? <LoadingSkeleton /> : (
        <div style={{ minHeight: "60vh" }}>
          {snapshotWords === null || snapshotWords.length === 0 ? (
            <NoWordsView
              streak={streak}
              totalWords={totalWords}
              learningCount={learningCount}
              masteredCount={masteredCount}
              isSentenceMode={isSentenceMode}
            />
          ) : (
            <ReviewSession
              key={sessionId}
              deviceId={deviceId}
              sessionWords={snapshotWords}
              allWordsForDistractors={allWordsForDistractors ?? []}
              streak={streak}
              onContinue={handleSessionComplete}
              updateReview={updateReview}
              addXP={addXP}
            />
          )}
        </div>
      )}
    </>
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
  const hasAnimatedRef = useRef(false); // only animate cards on first load
  const [sortBy, setSortBy] = useState<"recent" | "strength" | "alphabetical">("recent");
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [hardStarTipVisible, setHardStarTipVisible] = useState(false);
  const [vocabTypeFilter, setVocabTypeFilter] = useState<"all" | "word" | "phrase">("all");
  const vocabStats = useQuery(api.words.stats, { deviceId });

  // Track vocab tab opens and check for hard star tip
  useEffect(() => {
    incrementCounter("vocabTabOpenCount");
    shouldShowTip("tip_hard_star").then((show) => {
      if (show) {
        setHardStarTipVisible(true);
        markTipSeen("tip_hard_star");
      }
    });
  }, []);

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
  } = usePaginatedQuery(api.words.list, { deviceId }, { initialNumItems: 50 });

  const searchResults = useQuery(
    api.words.search,
    debouncedSearch.length >= 2 ? { deviceId, term: debouncedSearch } : "skip",
  );
  const removeWord = useMutation(api.words.remove);
  const removeBatch = useMutation(api.words.removeBatch);
  const updateReview = useMutation(api.words.updateReview);
  const setStatus = useMutation(api.words.setStatus);
  const toggleHard = useMutation(api.words.toggleHard);

  // During search: use debounced results when available
  const rawWords = debouncedSearch.length >= 2
    ? (searchResults ?? null)
    : paginatedWords;
  const typeFiltered = rawWords
    ? rawWords.filter((w) => {
        const t = (w as WordDoc).type ?? "word";
        if (t === "sentence") return false; // sentences live in Sentences tab
        if (vocabTypeFilter !== "all" && t !== vocabTypeFilter) return false;
        return true;
      })
    : rawWords;
  const filteredWords = typeFiltered && strengthFilter === "weak"
    ? typeFiltered.filter((w) => computeStrength(w) < 40)
    : typeFiltered;
  const words = filteredWords && sortBy !== "recent"
    ? [...filteredWords].sort((a, b) => {
        if (sortBy === "strength") return computeStrength(a) - computeStrength(b);
        if (sortBy === "alphabetical") return a.word.localeCompare(b.word);
        return 0;
      })
    : filteredWords;
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

  // Mark initial animation as done after first render with words
  useEffect(() => {
    if (words && words.length > 0 && !hasAnimatedRef.current) {
      const t = setTimeout(() => { hasAnimatedRef.current = true; }, 600);
      return () => clearTimeout(t);
    }
  }, [words]);

  const handleDelete = (id: string) => {
    // Start 3s undo timer
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      pendingDeletes.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleStatusChange = async (id: string, newStatus: "new" | "learning" | "known") => {
    await setStatus({ id: id as Id<"words">, deviceId, status: newStatus });
  };

  const statusBadge = (status: string, wordId: string) => {
    const styles: Record<string, string> = {
      new: "bg-blue-100 text-blue-700",
      learning: "bg-amber-100 text-amber-700",
      known: "bg-green-100 text-green-700",
    };
    return (
      <select
        value={status}
        onChange={(e) =>
          handleStatusChange(wordId, e.target.value as "new" | "learning" | "known")
        }
        className={`text-xs px-2 py-0.5 rounded-full font-medium border-none cursor-pointer ${styles[status] || ""}`}
      >
        <option value="new">new</option>
        <option value="learning">learning</option>
        <option value="known">known</option>
      </select>
    );
  };

  return (
    <div>
      {/* Hard star tip */}
      {hardStarTipVisible && (
        <div
          className="mb-4 rounded-xl overflow-hidden"
          style={{
            padding: "10px 16px",
            background: "linear-gradient(135deg, #eef2ff, #e0e7ff)",
            border: "1px solid #c7d2fe",
            fontSize: "13px",
            color: "#4338ca",
            lineHeight: 1.5,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            animation: "heroReveal 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          <span>⭐</span>
          <span style={{ flex: 1 }}>Star tricky words — they&apos;ll get extra review priority</span>
          <button
            onClick={() => {
              setHardStarTipVisible(false);
              dismissTipForever("tip_hard_star");
            }}
            className="text-indigo-400 hover:text-indigo-600 transition-colors"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: 0 }}
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Summary stats bar — excludes sentences (they have their own tab) */}
      {vocabStats?.byType && (
        <div className="flex items-center gap-4 mb-5" style={{ animation: "heroReveal 300ms ease-out both" }}>
          <div className="flex items-center gap-5 text-sm">
            <span className="font-bold text-gray-900">{vocabStats.byType.words + vocabStats.byType.phrases} <span className="font-normal text-gray-400">words</span></span>
            <span className="text-gray-300">|</span>
            <span className="font-semibold text-amber-500">{vocabStats.byType.wordsLearning} <span className="font-normal text-gray-400">learning</span></span>
            <span className="text-gray-300">|</span>
            <span className="font-semibold text-green-500">{vocabStats.byType.wordsKnown} <span className="font-normal text-gray-400">mastered</span></span>
          </div>
        </div>
      )}

      {/* Unified control bar: type filter + search + strength filter */}
      <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-4 shadow-sm" style={{ animation: "heroReveal 300ms ease-out 80ms both" }}>
        <div className="flex items-center gap-3">
          {/* Type pills */}
          {vocabStats?.byType && (
            <div className="flex gap-0.5 bg-gray-100/80 rounded-xl p-1 shrink-0">
              {([
                { label: "All", value: "all" as const, count: vocabStats.byType.words + vocabStats.byType.phrases },
                { label: "Words", value: "word" as const, count: vocabStats.byType.words },
                { label: "Phrases", value: "phrase" as const, count: vocabStats.byType.phrases },
              ] as const).map(({ label, value, count }) => (
                count > 0 || value === "all" ? (
                  <button
                    key={value}
                    onClick={() => setVocabTypeFilter(value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                      vocabTypeFilter === value
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label} {count > 0 && <span className="text-gray-400">({count})</span>}
                  </button>
                ) : null
              ))}
            </div>
          )}

          {/* Search */}
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 bg-gray-50 border-none rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 hover:bg-gray-400 text-white transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>

          {/* Strength filter */}
          <div className="flex gap-0.5 bg-gray-100/80 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setStrengthFilter("all")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                strengthFilter === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStrengthFilter("weak")}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                strengthFilter === "weak" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Weak
            </button>
          </div>
        </div>
      </div>

      {/* Search + strength filter is now inside the unified control bar above */}

      {/* Sort & Batch Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none pr-7"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
          >
            <option value="recent">Most Recent</option>
            <option value="strength">Weakest First</option>
            <option value="alphabetical">A-Z</option>
          </select>
          <button
            onClick={() => {
              setBatchMode(!batchMode);
              if (batchMode) setSelectedWords(new Set());
            }}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all duration-200 ${
              batchMode ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
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
            className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-xl font-medium btn-spring hover:bg-red-100 border border-red-200"
          >
            Delete {selectedWords.size} word{selectedWords.size > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Search result count */}
      {debouncedSearch.length >= 2 && !isSearching && words && words.length > 0 && (
        <p className="text-xs text-gray-500 mb-3" style={{ animation: "fadeInUp 150ms ease-out both" }}>
          {words.length} result{words.length !== 1 ? "s" : ""} for &ldquo;{debouncedSearch}&rdquo;
        </p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100 skeleton-shimmer" />
          ))}
        </div>
      ) : !words || words.length === 0 ? (
        <EmptyState
          icon={searchTerm ? "&#128269;" : "&#128218;"}
          title={searchTerm ? "No results" : "No words saved yet"}
          description={searchTerm
            ? "No words match your search"
            : "Select words on any page to get started!"}
        />
      ) : (
        <>
          {/* Batch select all */}
          {batchMode && (
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={words.length > 0 && selectedWords.size === words.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedWords(new Set(words.map((w) => w._id)));
                    else setSelectedWords(new Set());
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-500"
                />
                Select all
              </label>
            </div>
          )}

          {/* Word cards grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {words.map((word, i) => {
              const isPendingDelete = pendingDeletes.has(word._id);
              const score = computeStrength(word);
              const color = strengthColor(score);
              const isExpanded = expandedRows.has(word._id);
              const contexts = word.contexts ?? (word.example ? [{ sentence: word.example, url: word.sourceUrl, timestamp: word.addedAt }] : []);
              const circumference = 2 * Math.PI * 16;
              const dash = circumference * (score / 100);

              if (isPendingDelete) {
                return (
                  <div key={word._id} className="bg-red-50 rounded-2xl border border-red-200 p-4 flex items-center justify-between">
                    <span className="text-xs text-red-400 line-through">{word.word}</span>
                    <button onClick={() => handleUndo(word._id)} className="text-xs font-semibold text-red-600 hover:text-red-700 btn-spring">Undo</button>
                  </div>
                );
              }

              return (
                <div
                  key={word._id}
                  className={`group bg-white rounded-2xl border border-gray-200 p-4 card-hover relative overflow-hidden ${batchMode && selectedWords.has(word._id) ? "ring-2 ring-indigo-400" : ""}`}
                  style={!hasAnimatedRef.current && i < 12 ? { animation: `statCountUp 350ms cubic-bezier(0.34, 1.56, 0.64, 1) ${Math.min(i * 40, 400)}ms both` } : searchTerm.length >= 2 ? { animation: "fadeInUp 150ms ease-out both" } : undefined}
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
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-base font-bold text-gray-900 truncate leading-tight">{word.word}</h3>
                        <button
                          onClick={(e) => { e.stopPropagation(); speak(word.word); }}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Pronounce"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm text-gray-500 truncate mt-0.5">{word.translation}</p>
                    </div>
                    {/* Mini strength ring */}
                    <div className="relative w-10 h-10 shrink-0 ml-2">
                      <svg width="40" height="40" viewBox="0 0 40 40" className="transform -rotate-90">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                        <circle
                          cx="20" cy="20" r="16" fill="none"
                          stroke={color}
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${dash} ${circumference}`}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>
                        {score}
                      </span>
                    </div>
                  </div>

                  {/* Bottom row: status + actions */}
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      {statusBadge(word.status, word._id)}
                      {(word as WordDoc).type === "phrase" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-teal-50 text-teal-600">phrase</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {/* Expand contexts */}
                      {contexts.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedRows(prev => { const n = new Set(prev); n.has(word._id) ? n.delete(word._id) : n.add(word._id); return n; }); }}
                          className="p-1 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                          title="Show contexts"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
                        </button>
                      )}
                      {/* Star */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleHard({ id: word._id, deviceId }); }}
                        className="p-1 rounded-lg transition-all hover:scale-110 active:scale-90"
                        style={{ color: word.isHard ? "#f59e0b" : "#d1d5db" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={word.isHard ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(word._id); }}
                        className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>

                  {/* Expanded contexts */}
                  {isExpanded && contexts.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100" style={{ animation: "fadeInUp 200ms ease-out both" }}>
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
                className="px-6 py-3 text-xs font-semibold rounded-xl bg-white border border-gray-200 text-gray-600 btn-spring hover:border-indigo-200 hover:text-indigo-600"
              >
                Load more words
              </button>
            </div>
          )}
          {searchTerm.length < 2 && paginationStatus === "LoadingMore" && (
            <div className="text-center mt-6">
              <div className="inline-flex items-center gap-2 text-gray-400 text-sm">
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                Loading...
              </div>
            </div>
          )}
        </>
      )}

      {/* Saved Collocations Section */}
      <SavedCollocations deviceId={deviceId} />
    </div>
  );
}

type CollocationDoc = Doc<"collocations">;

function SavedCollocations({ deviceId }: { deviceId: string }) {
  const collocations = useQuery(api.collocations.getAll, { deviceId });
  const [expanded, setExpanded] = useState(false);

  if (!collocations || collocations.length === 0) return null;

  // Group by base word
  const grouped = new Map<string, CollocationDoc[]>();
  for (const col of collocations) {
    for (const w of col.words) {
      const key = w.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(col);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3"
      >
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms", display: "inline-block" }}>&#9654;</span>
        Saved Collocations ({collocations.length})
      </button>
      {expanded && (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {Array.from(grouped.entries()).slice(0, 20).map(([word, cols]) => (
            <div key={word} className="px-4 py-3">
              <span className="text-xs font-semibold text-gray-900">{word}</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {cols.map((col) => (
                  <span
                    key={col._id}
                    className="text-xs px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: col.mastered ? "#bbf7d0" : "#e5e7eb",
                      background: col.mastered ? "#f0fdf4" : "#f9fafb",
                      color: col.mastered ? "#16a34a" : "#6b7280",
                    }}
                  >
                    {col.collocation}
                    {col.mastered && " *"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Hard Words Tab ---

function HardWordsTab({ deviceId }: { deviceId: string }) {
  const hardWords = useQuery(api.words.getHardWords, { deviceId });
  const updateReview = useMutation(api.words.updateReview);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [flashType, setFlashType] = useState<"got" | "forgot" | null>(null);

  const handleQuickReview = async (wordId: string, remembered: boolean) => {
    setReviewingId(wordId);
    setFlashId(wordId);
    setFlashType(remembered ? "got" : "forgot");
    await updateReview({
      id: wordId as Id<"words">,
      deviceId,
      remembered,
    });
    setTimeout(() => { setFlashId(null); setFlashType(null); }, 500);
    setReviewingId(null);
  };

  if (hardWords === undefined) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="hard-skeleton" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-200/50" />
              <div className="flex-1">
                <div className="h-4 w-28 bg-gray-200/50 rounded-md mb-1.5" />
                <div className="h-3 w-20 bg-gray-200/30 rounded-md" />
              </div>
              <div className="h-6 w-16 bg-gray-200/40 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const filteredHardWords = hardWords.filter(w => ((w as any).type ?? "word") !== "sentence");

  if (filteredHardWords.length === 0) {
    return (
      <div className="relative flex flex-col items-center justify-center py-20 overflow-hidden hard-empty-entrance">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-10 left-1/3 w-44 h-44 rounded-full hard-orb-1" />
          <div className="absolute bottom-10 right-1/3 w-36 h-36 rounded-full hard-orb-2" />
        </div>

        <div className="relative z-10 mb-5 hard-icon-pop">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-50 via-amber-100/80 to-orange-100/60 backdrop-blur-xl border border-amber-200/50 flex items-center justify-center shadow-lg shadow-amber-500/5">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-amber-500">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="absolute inset-0 rounded-2xl border border-amber-300/30 hard-pulse-ring" />
        </div>

        <h3 className="relative z-10 text-xl font-semibold bg-gradient-to-r from-gray-900 via-amber-900 to-gray-900 bg-clip-text text-transparent mb-2">
          No hard words!
        </h3>
        <p className="relative z-10 text-sm text-gray-500 max-w-xs mx-auto text-center leading-relaxed">
          Words you struggle with will appear here for extra practice.
        </p>
      </div>
    );
  }

  // Sort: very hard first, then by forgot count
  const sortedWords = [...filteredHardWords].sort((a, b) => {
    const da = a.difficulty ?? 1;
    const db = b.difficulty ?? 1;
    if (da !== db) return db - da;
    return (b.forgotCount ?? 0) - (a.forgotCount ?? 0);
  });

  const veryHardCount = sortedWords.filter(w => (w.difficulty ?? 1) >= 2.5).length;

  return (
    <div>
      {/* Summary bar */}
      <div className="hard-summary-bar mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="hard-fire-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8 7 4 10 4 14.5C4 18.64 7.58 22 12 22C16.42 22 20 18.64 20 14.5C20 10 16 7 12 2Z" fill="#f59e0b" stroke="#d97706" strokeWidth="1"/>
                <path d="M12 22C14.21 22 16 20.21 16 18C16 15.79 14 14 12 11C10 14 8 15.79 8 18C8 20.21 9.79 22 12 22Z" fill="#fbbf24"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800">{sortedWords.length} hard words</span>
          </div>
          {veryHardCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50/80 border border-red-100/50">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 hard-dot-pulse" />
              <span className="text-xs font-medium text-red-600">{veryHardCount} very hard</span>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            sortedWords.forEach((w, i) => {
              setTimeout(() => { speak(w.word); }, i * 1500);
            });
          }}
          className="hard-listen-all-btn"
          title="Listen to all hard words"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
          <span>Play all</span>
        </button>
      </div>

      {/* Word cards */}
      <div className="space-y-2.5">
        {sortedWords.map((word, i) => {
          const isVeryHard = (word.difficulty ?? 1) >= 2.5;
          const forgotCount = word.forgotCount ?? 0;
          const strength = computeStrength(word);
          const sColor = strengthColor(strength);
          const isFlashing = flashId === word._id;
          const delay = Math.min(i * 50, 350);

          return (
            <div
              key={word._id}
              className={`hard-card ${isFlashing && flashType === "got" ? "hard-card-got" : ""} ${isFlashing && flashType === "forgot" ? "hard-card-forgot" : ""}`}
              style={{ animationDelay: `${delay}ms` }}
            >
              {/* Difficulty accent */}
              <div
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-300"
                style={{
                  background: isVeryHard
                    ? "linear-gradient(to bottom, #ef4444, #f97316)"
                    : "linear-gradient(to bottom, #f59e0b, #fbbf24)",
                  boxShadow: isVeryHard ? "0 0 6px rgba(239,68,68,0.25)" : "0 0 6px rgba(245,158,11,0.2)",
                }}
              />

              <div className="flex items-center gap-3.5 pl-3.5">
                {/* Strength ring */}
                <div className="relative flex-shrink-0" style={{ width: 38, height: 38 }}>
                  <svg width="38" height="38" viewBox="0 0 38 38">
                    <circle cx="19" cy="19" r="15" fill="none" stroke="#e5e7eb" strokeWidth="2.5" opacity="0.4" />
                    <circle cx="19" cy="19" r="15" fill="none" stroke={sColor} strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 15}
                      strokeDashoffset={2 * Math.PI * 15 - (strength / 100) * 2 * Math.PI * 15}
                      style={{ transform: "rotate(-90deg)", transformOrigin: "center", filter: `drop-shadow(0 0 3px ${sColor}40)`, transition: "stroke-dashoffset 800ms cubic-bezier(0.34,1.56,0.64,1)" }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color: sColor }}>{strength}</span>
                </div>

                {/* Word & translation */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-gray-900 truncate">{word.word}</span>
                    <button
                      onClick={() => { speak(word.word); }}
                      className="hard-speak-btn"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 truncate block">{word.translation}</span>
                </div>

                {/* Forgot count + badge */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  {forgotCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-400" title={`Forgotten ${forgotCount} times`}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 8v4l3 3"/>
                        <circle cx="12" cy="12" r="10"/>
                      </svg>
                      <span className="tabular-nums">{forgotCount}x</span>
                    </div>
                  )}

                  <span className={`hard-badge ${isVeryHard ? "hard-badge-very" : "hard-badge-normal"}`}>
                    {isVeryHard ? (
                      <>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 7 4 10 4 14.5C4 18.64 7.58 22 12 22C16.42 22 20 18.64 20 14.5C20 10 16 7 12 2Z"/></svg>
                        Very Hard
                      </>
                    ) : (
                      <>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        Hard
                      </>
                    )}
                  </span>
                </div>

                {/* Quick review buttons */}
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleQuickReview(word._id, false)}
                    disabled={reviewingId === word._id}
                    className="hard-review-btn hard-review-forgot"
                    title="Mark as forgot"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => handleQuickReview(word._id, true)}
                    disabled={reviewingId === word._id}
                    className="hard-review-btn hard-review-got"
                    title="Mark as remembered"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Stats Tab ---

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
  unlocked: boolean;
  unlockedAt?: number;
}

function StatsTab({ deviceId }: { deviceId: string }) {
  const wordStats = useQuery(api.words.stats, { deviceId });
  const insights = useQuery(api.analytics.getInsights, { deviceId });
  const achievements = useQuery(api.gamification.getAchievements, { deviceId });

  if (!wordStats) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="h-4 w-28 bg-gray-200 rounded skeleton-shimmer mb-4" />
          <div className="grid grid-cols-3 gap-4 text-center">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <div className="h-8 w-12 bg-gray-200 rounded skeleton-shimmer mx-auto mb-1" />
                <div className="h-3 w-16 bg-gray-100 rounded skeleton-shimmer mx-auto" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="h-4 w-32 bg-gray-200 rounded skeleton-shimmer mb-4" />
          <div className="h-32 bg-gray-100 rounded skeleton-shimmer" />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="h-4 w-24 bg-gray-200 rounded skeleton-shimmer mb-4" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg skeleton-shimmer" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Lifetime Stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 card-hover" style={{ animation: "fadeInUp 300ms cubic-bezier(0.16, 1, 0.3, 1) both" }}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Lifetime Stats</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="animate-stat-reveal stagger-1">
            <p className="text-2xl font-bold text-blue-600">{wordStats.total}</p>
            <p className="text-xs text-gray-500">Words Saved</p>
          </div>
          <div className="animate-stat-reveal stagger-2">
            <p className="text-2xl font-bold text-green-600">{wordStats.known}</p>
            <p className="text-xs text-gray-500">Mastered</p>
          </div>
          <div className="animate-stat-reveal stagger-3">
            <p className="text-2xl font-bold text-amber-600">{wordStats.learning}</p>
            <p className="text-xs text-gray-500">Learning</p>
          </div>
        </div>
        {wordStats.byType && (
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
            <div className="text-center">
              <p className="text-lg font-bold text-indigo-600">{wordStats.byType.words + wordStats.byType.phrases}</p>
              <p className="text-xs text-gray-500">Words & Phrases</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-cyan-600">{wordStats.byType.sentences}</p>
              <p className="text-xs text-gray-500">Sentences</p>
            </div>
          </div>
        )}
      </div>

      {/* Learning Insights */}
      {insights && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 card-hover" style={{ animation: "tabSwitch 400ms cubic-bezier(0.16, 1, 0.3, 1) 100ms both" }}>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Learning Insights</h3>

          {/* Weekly Activity Chart */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">Words added this week</p>
            <div className="flex items-end gap-1 h-16">
              {insights.weeklyActivity.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-500 rounded-t transition-all"
                    style={{
                      height: `${Math.max(4, (day.count / Math.max(...insights.weeklyActivity.map(d => d.count), 1)) * 48)}px`
                    }}
                  />
                  <span className="text-[10px] text-gray-500 mt-1">{day.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <p className="text-lg font-bold text-gray-900">
                {insights.velocity}
                <span className="text-xs font-normal text-gray-500">/day</span>
              </p>
              <p className="text-xs text-gray-500">Learning pace</p>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <p className="text-lg font-bold text-gray-900">{insights.retentionRate}%</p>
              <p className="text-xs text-gray-500">Mastery rate</p>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <p className="text-lg font-bold text-amber-600">{insights.dueForReview}</p>
              <p className="text-xs text-gray-500">Due for review</p>
            </div>
          </div>

          {/* Hardest Words */}
          {insights.hardestWords.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Challenging words</p>
              <div className="flex flex-wrap gap-1">
                {insights.hardestWords.map((w, i) => (
                  <span key={i} className="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-full">
                    {w.word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Status Breakdown */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">Progress breakdown</p>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden flex">
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${(insights.statusBreakdown.known / insights.totalWords) * 100}%` }}
                title={`Known: ${insights.statusBreakdown.known}`}
              />
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${(insights.statusBreakdown.learning / insights.totalWords) * 100}%` }}
                title={`Learning: ${insights.statusBreakdown.learning}`}
              />
              <div
                className="bg-gray-400 transition-all"
                style={{ width: `${(insights.statusBreakdown.new / insights.totalWords) * 100}%` }}
                title={`New: ${insights.statusBreakdown.new}`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>Known ({insights.statusBreakdown.known})</span>
              <span>Learning ({insights.statusBreakdown.learning})</span>
              <span>New ({insights.statusBreakdown.new})</span>
            </div>
          </div>
        </div>
      )}

      {/* Achievements */}
      {achievements && achievements.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 card-hover" style={{ animation: "tabSwitch 400ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both" }}>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Achievements ({achievements.filter((a: Achievement) => a.unlocked).length}/{achievements.length})
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {achievements.map((a: Achievement, i: number) => (
              <div
                key={a.id}
                className={`p-3 rounded-xl border card-hover ${
                  a.unlocked
                    ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
                    : "bg-gray-50 border-gray-200 opacity-50"
                }`}
                style={{ animation: `statReveal 350ms cubic-bezier(0.34, 1.56, 0.64, 1) ${250 + i * 60}ms both` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xl ${a.unlocked ? "" : "grayscale"}`}>{a.icon}</span>
                  <span className={`text-xs font-medium ${a.unlocked ? "text-amber-600" : "text-gray-400"}`}>
                    +{a.xp} XP
                  </span>
                </div>
                <p className={`text-sm font-semibold ${a.unlocked ? "text-gray-900" : "text-gray-400"}`}>
                  {a.name}
                </p>
                <p className="text-xs text-gray-500">{a.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
