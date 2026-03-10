import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  Fragment,
  useEffect,
  useState,
  useCallback,
  useRef,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { computeStrength, strengthColor } from "../../src/lib/memory-strength";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";
import { ImportExport } from "./ImportExport";
import { QuizMode } from "./QuizMode";
import { WordOfTheDay } from "./WordOfTheDay";
import { WritingPractice } from "./WritingPractice";
import { GamificationDashboard } from "./GamificationDashboard";
import { PredictionDashboard } from "./PredictionDashboard";
import { AISettings } from "./AISettings";

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Vocabify] Error boundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">⚠</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
export default function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"review" | "vocabulary" | "hard" | "stats" | "rpg" | "predictions" | "ai">(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "review" || hash === "vocabulary" || hash === "hard" || hash === "stats" || hash === "rpg" || hash === "predictions" || hash === "ai") return hash;
    const params = new URLSearchParams(window.location.search);
    return (params.get("tab") as "review" | "vocabulary" | "hard" | "stats" | "rpg" | "predictions" | "ai") || "review";
  });
  const [showImportExport, setShowImportExport] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showWriting, setShowWriting] = useState(false);

  // Tab routing via hash
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "review" || hash === "vocabulary" || hash === "hard" || hash === "stats") {
        setActiveTab(hash);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" }).then((res) => {
      if (res?.deviceId) setDeviceId(res.deviceId);
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
      <header className="sticky top-0 z-10 border-b border-gray-200/60" style={{ background: "rgba(255, 255, 255, 0.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm shadow-blue-200">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900 leading-tight">Vocabify</h1>
              <p className="text-xs text-gray-400">{greeting.emoji} {greeting.text}</p>
            </div>
          </div>
          <nav className="flex gap-0.5 bg-gray-100/80 rounded-xl p-1" role="tablist" aria-label="Dashboard tabs">
            <TabButton active={activeTab === "review"} onClick={() => setActiveTab("review")} id="review">
              📖 Review
            </TabButton>
            <TabButton active={activeTab === "vocabulary"} onClick={() => setActiveTab("vocabulary")} id="vocabulary">
              📚 Words
            </TabButton>
            <TabButton active={activeTab === "hard"} onClick={() => setActiveTab("hard")} id="hard">
              ⭐ Hard
            </TabButton>
            <TabButton active={activeTab === "stats"} onClick={() => setActiveTab("stats")} id="stats">
              📊 Stats
            </TabButton>
            <TabButton active={activeTab === "rpg"} onClick={() => setActiveTab("rpg")} id="rpg">
              🎮 RPG
            </TabButton>
            <TabButton active={activeTab === "predictions"} onClick={() => setActiveTab("predictions")} id="predictions">
              🔮 Predict
            </TabButton>
            <TabButton active={activeTab === "ai"} onClick={() => setActiveTab("ai")} id="ai">
              🤖 AI Settings
            </TabButton>
          </nav>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowQuiz(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-indigo-50 text-gray-500 hover:text-indigo-600 transition-all text-xs font-medium"
              title="Quiz Mode"
            >
              🎯 Quiz
            </button>
            <button
              onClick={() => setShowWriting(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-purple-50 text-gray-500 hover:text-purple-600 transition-all text-xs font-medium"
              title="Writing Practice"
            >
              ✍️ Write
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
            <div key={activeTab} role="tabpanel" aria-labelledby={`tab-${activeTab}`} style={{ animation: "tabFadeIn 200ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
              {activeTab === "review" ? (
                <ReviewTab deviceId={deviceId} />
              ) : activeTab === "hard" ? (
                <HardWordsTab deviceId={deviceId} />
              ) : activeTab === "stats" ? (
                <StatsTab deviceId={deviceId} />
              ) : activeTab === "rpg" ? (
                <GamificationDashboard deviceId={deviceId} />
              ) : activeTab === "predictions" ? (
                <PredictionDashboard deviceId={deviceId} />
              ) : activeTab === "ai" ? (
                <AISettings />
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
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex justify-center">
      <div className="max-w-lg w-full space-y-4">
        <div className="h-56 bg-white/60 rounded-2xl animate-pulse border border-gray-100" />
        <div className="flex gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-1 h-16 bg-white/60 rounded-xl animate-pulse border border-gray-100" />
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
      onClick={onClick}
      className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
        active
          ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/50"
          : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
      }`}
    >
      {children}
    </button>
  );
}

// --- Review Tab ---

function ReviewTab({ deviceId }: { deviceId: string }) {
  const reviewWordsLive = useQuery(api.words.getReviewWords, {
    deviceId,
    limit: 20,
  });
  const stats = useQuery(api.words.stats, { deviceId });
  const updateReview = useMutation(api.words.updateReview);

  type ReviewWordList = NonNullable<typeof reviewWordsLive>;

  // Snapshot the review queue so reactive updates don't shift cards mid-session.
  // The queue re-syncs from Convex whenever:
  //   - it hasn't been set yet (initial load)
  //   - the session is finished (all cards reviewed)
  const [queue, setQueue] = useState<ReviewWordList | undefined>(undefined);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<"remembered" | "forgot" | null>(null);

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

  // Persist review session
  useEffect(() => {
    chrome.storage.session?.get(["reviewQueue", "reviewIndex"]).then((data: Record<string, unknown>) => {
      if (data.reviewQueue && !queue) {
        const restored = data.reviewQueue as ReviewWordList;
        const idx = (data.reviewIndex as number) || 0;
        // Only restore if there are still cards left
        if (idx < restored.length) {
          setQueue(restored);
          setCurrentIndex(idx);
          setSessionActive(true);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!reviewWordsLive) return;

    if (!sessionActive) {
      // Not mid-review — always sync from live data
      setQueue([...reviewWordsLive]);
      setCurrentIndex(0);
    }
  }, [reviewWordsLive, sessionActive]);

  // Save session state on changes
  useEffect(() => {
    if (queue && sessionActive) {
      chrome.storage.session?.set({
        reviewQueue: queue,
        reviewIndex: currentIndex,
      });
    }
  }, [queue, currentIndex, sessionActive]);

  const currentWord = queue?.[currentIndex];

  const handleAnswer = useCallback(
    async (remembered: boolean) => {
      if (!currentWord || answered) return;
      setAnswered(true);
      setLastAnswer(remembered ? "remembered" : "forgot");
      setSessionActive(true);
      if (remembered) playRememberedSound(); else playForgotSound();

      await updateReview({
        id: currentWord._id as Id<"words">,
        deviceId,
        remembered,
      });

      setTimeout(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (queue && next >= queue.length) {
            setSessionActive(false);
            chrome.storage.session?.remove(["reviewQueue", "reviewIndex"]);
          }
          return next;
        });
        setRevealed(false);
        setAnswered(false);
        setLastAnswer(null);
      }, 600);
    },
    [currentWord, answered, updateReview, deviceId, queue],
  );

  // Keyboard shortcuts: Space=reveal, ArrowLeft=forgot, ArrowRight=remembered
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!currentWord || answered) return;

      if (e.key === " " && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (e.key === "ArrowLeft" && revealed) {
        e.preventDefault();
        handleAnswer(false);
      } else if (e.key === "ArrowRight" && revealed) {
        e.preventDefault();
        handleAnswer(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentWord, answered, revealed, handleAnswer]);

  if (reviewWordsLive === undefined || stats === undefined) {
    return <LoadingSkeleton />;
  }

  if (!queue) {
    return <LoadingSkeleton />;
  }

  return (
    <div>
      {/* Word of the Day */}
      <WordOfTheDay deviceId={deviceId} />
      
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

      {/* Review Card */}
      <div className="flex justify-center mb-8">
        {!currentWord ? (
          <div className="max-w-lg w-full space-y-5">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <EmptyState
                icon="🎉"
                title="You're all caught up!"
                description="No words need review right now. Keep browsing the web and saving words you encounter — they'll appear here when it's time to practice."
                cta={
                  <button
                    onClick={() => {
                      setSessionActive(false);
                      setCurrentIndex(0);
                      setQueue(reviewWordsLive ? [...reviewWordsLive] : undefined);
                      chrome.storage.session?.remove(["reviewQueue", "reviewIndex"]);
                    }}
                    className="px-5 py-2.5 text-sm font-medium rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-sm shadow-blue-200 transition-all hover:shadow-md"
                  >
                    Check Again
                  </button>
                }
              />
            </div>
            
            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => window.location.hash = 'vocabulary'}
                className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group"
              >
                <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">🎯</div>
                <p className="text-xs font-medium text-gray-700">Take a Quiz</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Test your knowledge</p>
              </button>
              <button
                onClick={() => window.location.hash = 'vocabulary'}
                className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:border-purple-200 hover:bg-purple-50/50 transition-all group"
              >
                <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">✍️</div>
                <p className="text-xs font-medium text-gray-700">Practice Writing</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Use words in context</p>
              </button>
              <button
                onClick={() => window.location.hash = 'vocabulary'}
                className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:border-green-200 hover:bg-green-50/50 transition-all group"
              >
                <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">📚</div>
                <p className="text-xs font-medium text-gray-700">Browse Words</p>
                <p className="text-[10px] text-gray-400 mt-0.5">See your vocabulary</p>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative max-w-md w-full" key={currentIndex}>
            {lastAnswer && (
              <div
                className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
                style={{ animation: "fadeInUp 200ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}
              >
                <div
                  className="text-5xl"
                  style={{
                    filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.1))",
                    animation: "checkmarkBounce 400ms cubic-bezier(0.4, 0, 0.2, 1) both",
                  }}
                >
                  {lastAnswer === "remembered" ? "\u2705" : "\u{1F4AA}"}
                </div>
              </div>
            )}
            <div
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full"
              style={{
                transition: "all 400ms cubic-bezier(0.4, 0, 0.2, 1)",
                ...(lastAnswer === "remembered"
                  ? { animation: "cardRemembered 600ms cubic-bezier(0.4, 0, 0.2, 1) both", borderColor: "#86efac" }
                  : lastAnswer === "forgot"
                    ? { animation: "cardForgot 600ms cubic-bezier(0.4, 0, 0.2, 1) both", borderColor: "#fca5a5" }
                    : { animation: "cardEnter 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }),
              }}
            >
            <div className="text-center mb-6">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                {currentIndex + 1} / {queue.length}
              </p>
              <div className="flex items-center justify-center gap-2 mb-3">
                <h2 className="text-3xl font-bold text-gray-900">
                  {currentWord.word}
                </h2>
                <button
                  onClick={() => {
                    const u = new SpeechSynthesisUtterance(currentWord.word);
                    u.lang = "en";
                    u.rate = 0.9;
                    speechSynthesis.speak(u);
                  }}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-blue-500"
                  title="Pronounce"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                </button>
              </div>
              {currentWord.example && (
                <p className="text-sm text-gray-500 italic leading-relaxed">
                  "...{highlightWord(currentWord.example.slice(0, 150), currentWord.word)}..."
                </p>
              )}
            </div>

            {!revealed ? (
              <div>
                <button
                  onClick={() => setRevealed(true)}
                  className="w-full py-3.5 text-sm font-medium rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 shadow-sm shadow-blue-200 transition-all hover:shadow-md active:scale-[0.98]"
                >
                  Reveal Translation
                </button>
                <p className="text-[11px] text-gray-400 text-center mt-2.5 flex items-center justify-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">Space</kbd> to reveal
                </p>
              </div>
            ) : (
              <div>
                <div className="text-center py-3 px-4 mb-4 bg-gray-50 rounded-xl">
                  <p className="text-lg text-gray-800 font-medium">
                    {currentWord.translation}
                  </p>
                </div>
                {!answered && (
                  <div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAnswer(false)}
                        className="flex-1 py-3.5 text-sm font-medium rounded-xl bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-100 transition-all active:scale-[0.98]"
                      >
                        😕 Forgot
                      </button>
                      <button
                        onClick={() => handleAnswer(true)}
                        className="flex-1 py-3.5 text-sm font-medium rounded-xl bg-green-50 text-green-600 hover:bg-green-100 ring-1 ring-green-100 transition-all active:scale-[0.98]"
                      >
                        ✅ Remembered
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 text-center mt-2.5 flex items-center justify-center gap-3">
                      <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">←</kbd> Forgot</span>
                      <span className="flex items-center gap-1">Remembered <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">→</kbd></span>
                    </p>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="flex justify-center gap-3 max-w-lg mx-auto">
          <MiniStat label="Total" value={stats.total} color="blue" />
          <MiniStat label="Learning" value={stats.learning} color="amber" />
          <MiniStat label="Known" value={stats.known} color="green" />
          <MiniStat label="To Review" value={stats.needReview} color="purple" />
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, description, cta }: { icon: string; title: string; description: string; cta?: ReactNode }) {
  return (
    <div className="text-center py-12" style={{ animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
      <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center" style={{ fontSize: "36px", lineHeight: 1 }}>
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">{description}</p>
      {cta && <div className="mt-5">{cta}</div>}
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
  const [pendingDeletes, setPendingDeletes] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [strengthFilter, setStrengthFilter] = useState<"all" | "weak">("all");
  const [sortBy, setSortBy] = useState<"recent" | "strength" | "alphabetical">("recent");
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [hardStarTipVisible, setHardStarTipVisible] = useState(false);

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

  const {
    results: paginatedWords,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(api.words.list, { deviceId }, { initialNumItems: 50 });

  const searchResults = useQuery(
    api.words.search,
    searchTerm.length >= 2 ? { deviceId, term: searchTerm } : "skip",
  );
  const removeWord = useMutation(api.words.remove);
  const removeBatch = useMutation(api.words.removeBatch);
  const updateReview = useMutation(api.words.updateReview);
  const setStatus = useMutation(api.words.setStatus);
  const toggleHard = useMutation(api.words.toggleHard);

  const rawWords = searchTerm.length >= 2 ? searchResults : paginatedWords;
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
  const isLoading =
    searchTerm.length >= 2
      ? searchResults === undefined
      : paginationStatus === "LoadingFirstPage";

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
          className="mb-4"
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
          <span style={{ flex: 1 }}>Star tricky words — they'll get extra review priority</span>
          <button
            onClick={() => {
              setHardStarTipVisible(false);
              dismissTipForever("tip_hard_star");
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

      <div className="mb-4 flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search words..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setStrengthFilter("all")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              strengthFilter === "all"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All Words
          </button>
          <button
            onClick={() => setStrengthFilter("weak")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              strengthFilter === "weak"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Weak (&lt;40)
          </button>
        </div>
      </div>

      {/* Sort & Batch Controls */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              batchMode ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
            className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors"
          >
            Delete {selectedWords.size} word{selectedWords.size > 1 ? "s" : ""}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
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
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {batchMode && (
                    <th className="w-8 px-2 py-3">
                      <input
                        type="checkbox"
                        checked={words !== undefined && words.length > 0 && selectedWords.size === words.length}
                        onChange={(e) => {
                          if (e.target.checked && words) {
                            setSelectedWords(new Set(words.map((w) => w._id)));
                          } else {
                            setSelectedWords(new Set());
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Word
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Translation
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Reviews
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                    Strength
                  </th>
                  <th className="w-10 text-center text-xs font-medium text-gray-500 px-1 py-3">
                    &#9733;
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {words.map((word) => {
                  const isPendingDelete = pendingDeletes.has(word._id);
                  const isExpanded = expandedRows.has(word._id);
                  const contexts = word.contexts ?? (word.example ? [{ sentence: word.example, url: word.sourceUrl, timestamp: word.addedAt }] : []);
                  return (
                    <Fragment key={word._id}>
                    <tr
                      className={`border-b border-gray-50 transition-colors ${
                        isPendingDelete
                          ? "bg-red-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {batchMode && (
                        <td className="px-2 py-3">
                          <input
                            type="checkbox"
                            checked={selectedWords.has(word._id)}
                            onChange={(e) => {
                              setSelectedWords((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(word._id);
                                else next.delete(word._id);
                                return next;
                              });
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td
                        className={`px-4 py-3 text-sm font-medium cursor-pointer select-none ${isPendingDelete ? "text-gray-400 line-through" : "text-gray-900"}`}
                        onClick={() => {
                          setExpandedRows((prev) => {
                            const next = new Set(prev);
                            if (next.has(word._id)) next.delete(word._id);
                            else next.add(word._id);
                            return next;
                          });
                        }}
                      >
                        <span className="mr-1 text-gray-400 text-xs">{isExpanded ? "\u25BE" : "\u25B8"}</span>
                        {word.word}
                      </td>
                      <td className={`px-4 py-3 text-sm ${isPendingDelete ? "text-gray-400" : "text-gray-600"}`}>
                        {word.translation}
                      </td>
                      <td className="px-4 py-3">
                        {!isPendingDelete && statusBadge(word.status, word._id)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {!isPendingDelete && word.reviewCount}
                      </td>
                      <td className="px-4 py-3">
                        {!isPendingDelete && (() => {
                          const score = computeStrength(word);
                          const color = strengthColor(score);
                          return (
                            <div className="flex items-center gap-2">
                              <div
                                style={{
                                  width: "40px",
                                  height: "6px",
                                  borderRadius: "3px",
                                  background: "#e5e7eb",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${score}%`,
                                    height: "100%",
                                    borderRadius: "3px",
                                    background: color,
                                    transition: "width 300ms ease",
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: "11px", color, fontWeight: 600 }}>
                                {score}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-1 py-3 text-center">
                        {!isPendingDelete && (
                          <button
                            onClick={() => toggleHard({ id: word._id, deviceId })}
                            className="text-lg leading-none transition-colors"
                            style={{ color: word.isHard ? "#f59e0b" : "#d1d5db" }}
                            title={word.isHard ? "Unmark as hard" : "Mark as hard"}
                          >
                            &#9733;
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPendingDelete ? (
                          <button
                            onClick={() => handleUndo(word._id)}
                            className="text-red-600 hover:text-red-700 text-xs font-medium transition-colors"
                          >
                            Undo
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(word._id)}
                            className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                            title="Delete word"
                          >
                            &times;
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && contexts.length > 0 && (
                      <tr className="bg-gray-50">
                        <td colSpan={8} className="px-4 py-3" style={{ animation: "fadeInUp 200ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
                          <p className="text-xs font-medium text-gray-500 mb-1">Contexts:</p>
                          <ul className="space-y-1">
                            {contexts.map((ctx, i) => (
                              <li key={i} className="text-xs text-gray-600">
                                <span className="italic">{highlightWord(ctx.sentence, word.word)}</span>
                                {ctx.url && (
                                  <>
                                    {" — "}
                                    <a
                                      href={ctx.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-500 hover:underline"
                                    >
                                      source
                                    </a>
                                  </>
                                )}
                                <span className="text-gray-500 ml-1">
                                  {new Date(ctx.timestamp).toLocaleDateString()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Load More for paginated results */}
          {searchTerm.length < 2 && paginationStatus === "CanLoadMore" && (
            <div className="text-center mt-4">
              <button
                onClick={() => loadMore(50)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Load More
              </button>
            </div>
          )}
          {searchTerm.length < 2 && paginationStatus === "LoadingMore" && (
            <div className="text-center mt-4 text-gray-500 text-sm">
              Loading more...
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Hard Words Tab ---

function HardWordsTab({ deviceId }: { deviceId: string }) {
  const hardWords = useQuery(api.words.getHardWords, { deviceId });
  const updateReview = useMutation(api.words.updateReview);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const handleQuickReview = async (wordId: string, remembered: boolean) => {
    setReviewingId(wordId);
    await updateReview({
      id: wordId as Id<"words">,
      deviceId,
      remembered,
    });
    setReviewingId(null);
  };

  if (hardWords === undefined) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (hardWords.length === 0) {
    return (
      <EmptyState
        icon="&#9733;"
        title="No hard words!"
        description="Words you struggle with will appear here for extra practice."
      />
    );
  }

  const difficultyBadge = (difficulty: number) => {
    if (difficulty >= 2.5) {
      return (
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
          Very Hard
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
        Hard
      </span>
    );
  };

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                Word
              </th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                Translation
              </th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                Forgotten
              </th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">
                Difficulty
              </th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">
                Quick Review
              </th>
            </tr>
          </thead>
          <tbody>
            {hardWords.map((word) => (
              <tr
                key={word._id}
                className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {word.word}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {word.translation}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {word.forgotCount ?? 0}x
                </td>
                <td className="px-4 py-3">
                  {difficultyBadge(word.difficulty ?? 1)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    <button
                      onClick={() => handleQuickReview(word._id, false)}
                      disabled={reviewingId === word._id}
                      className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      Forgot
                    </button>
                    <button
                      onClick={() => handleQuickReview(word._id, true)}
                      disabled={reviewingId === word._id}
                      className="text-xs px-2.5 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                    >
                      Got it
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Stats Tab ---

interface GamificationStats {
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
  level: number;
  dailyXp: number;
  dailyGoalXp: number;
  dailyWordsLearned: number;
  dailyReviewsDone: number;
  totalWordsLearned: number;
  totalReviewsDone: number;
  xpProgress: { current: number; needed: number; progress: number };
}

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
  const gamificationStats = useQuery(api.gamification.getStats, { deviceId });
  const achievements = useQuery(api.gamification.getAchievements, { deviceId });
  const wordStats = useQuery(api.words.stats, { deviceId });
  const insights = useQuery(api.analytics.getInsights, { deviceId });

  if (!gamificationStats || !achievements || !wordStats) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = gamificationStats as GamificationStats;
  const unlockedCount = achievements.filter((a: Achievement) => a.unlocked).length;

  return (
    <div className="space-y-6">
      {/* Level & XP Card */}
      <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-blue-100 text-sm font-medium">Level</p>
            <p className="text-4xl font-bold">{stats.level}</p>
          </div>
          <div className="text-right">
            <p className="text-blue-100 text-sm font-medium">Total XP</p>
            <p className="text-2xl font-bold">{stats.totalXp.toLocaleString()}</p>
          </div>
        </div>
        
        {/* XP Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-blue-100">Progress to Level {stats.level + 1}</span>
            <span className="font-medium">{stats.xpProgress.current}/{stats.xpProgress.needed} XP</span>
          </div>
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${stats.xpProgress.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Streak & Daily Goals */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔥</span>
            <div>
              <p className="text-sm text-gray-500">Current Streak</p>
              <p className="text-2xl font-bold text-gray-900">{stats.currentStreak} days</p>
              <p className="text-xs text-gray-400">Best: {stats.longestStreak} days</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎯</span>
            <div>
              <p className="text-sm text-gray-500">Daily Goal</p>
              <p className="text-2xl font-bold text-gray-900">{stats.dailyXp}/{stats.dailyGoalXp}</p>
              {stats.dailyXp >= stats.dailyGoalXp ? (
                <p className="text-xs text-green-600 font-medium">✓ Complete!</p>
              ) : (
                <p className="text-xs text-gray-400">{stats.dailyGoalXp - stats.dailyXp} XP to go</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lifetime Stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Lifetime Stats</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600">{wordStats.total}</p>
            <p className="text-xs text-gray-500">Words Saved</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{wordStats.known}</p>
            <p className="text-xs text-gray-500">Mastered</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">{stats.totalReviewsDone}</p>
            <p className="text-xs text-gray-500">Reviews</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600">{unlockedCount}</p>
            <p className="text-xs text-gray-500">Achievements</p>
          </div>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Today's Activity</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xl font-bold text-blue-600">{stats.dailyWordsLearned}</p>
            <p className="text-xs text-blue-700">Words Learned</p>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <p className="text-xl font-bold text-green-600">{stats.dailyReviewsDone}</p>
            <p className="text-xs text-green-700">Reviews Done</p>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <p className="text-xl font-bold text-purple-600">{stats.dailyXp}</p>
            <p className="text-xs text-purple-700">XP Earned</p>
          </div>
        </div>
      </div>

      {/* Learning Insights */}
      {insights && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">📊 Learning Insights</h3>
          
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
              <p className="text-xs font-medium text-gray-700 mb-2">🔥 Challenging words</p>
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
              <span>✓ Known ({insights.statusBreakdown.known})</span>
              <span>📚 Learning ({insights.statusBreakdown.learning})</span>
              <span>🆕 New ({insights.statusBreakdown.new})</span>
            </div>
          </div>
        </div>
      )}

      {/* Achievements */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          Achievements ({unlockedCount}/{achievements.length})
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {achievements.map((a: Achievement) => (
            <div
              key={a.id}
              className={`p-3 rounded-xl border transition-all ${
                a.unlocked
                  ? "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
                  : "bg-gray-50 border-gray-200 opacity-50"
              }`}
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
    </div>
  );
}
