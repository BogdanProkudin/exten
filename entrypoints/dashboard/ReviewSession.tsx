import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ReviewChallenge } from "./ReviewChallenge";
import { buildChallenge, resultToFSRSRating, type Challenge, type ChallengeType } from "../../src/lib/review-challenge";

type WordDoc = Doc<"words">;

// --- XP Calculation ---

const XP_TABLE: Record<string, number> = {
  "mc-word-to-translation": 5,
  "mc-translation-to-word": 8,
  "type-translation": 10,
  "type-word": 15,
};

function calculateXP(challengeType: string, correct: boolean, usedHint: boolean): number {
  if (!correct) return 0;
  let xp = XP_TABLE[challengeType] || 5;
  if (usedHint) xp = Math.max(1, xp - 5);
  return xp;
}

// --- Sound effects (Web Audio API) ---

let _audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

function playCorrectSound() {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(523, ctx.currentTime);
    o.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    o.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.4);
  } catch {}
}

function playWrongSound() {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "triangle";
    o.frequency.setValueAtTime(330, ctx.currentTime);
    o.frequency.setValueAtTime(277, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.3);
  } catch {}
}

// --- Sub-components ---

function SessionTopBar({ streak, xpEarned }: { streak: number; xpEarned: number }) {
  const [xpAnim, setXpAnim] = useState(false);
  const prevXp = useRef(xpEarned);

  useEffect(() => {
    if (xpEarned > prevXp.current) {
      setXpAnim(true);
      const t = setTimeout(() => setXpAnim(false), 300);
      prevXp.current = xpEarned;
      return () => clearTimeout(t);
    }
  }, [xpEarned]);

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-1.5 bg-orange-50 text-orange-600 px-3 py-1.5 rounded-full text-sm font-semibold">
        <span className="text-base">🔥</span>
        <span>{streak} day{streak !== 1 ? "s" : ""}</span>
      </div>
      <span className="text-sm text-gray-400 font-medium">Review session</span>
      <div className={`flex items-center gap-1.5 bg-green-50 text-green-600 px-3 py-1.5 rounded-full text-sm font-semibold transition-transform duration-200 ${xpAnim ? "scale-125" : "scale-100"}`}>
        <span>+{xpEarned}</span>
        <span className="text-base">⭐</span>
      </div>
    </div>
  );
}

function ProgressDots({ total, current, results }: { total: number; current: number; results: ("correct" | "wrong" | null)[] }) {
  if (total > 12) {
    const done = results.filter((r) => r !== null).length;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <span className="text-sm text-gray-400 font-medium">{current + 1}/{total}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mb-6">
      {/* Dots — perfectly centered */}
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const result = results[i];
          const isCurrent = i === current;
          let dotClass = "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300";
          if (result === "correct") dotClass += " bg-green-500 text-white";
          else if (result === "wrong") dotClass += " bg-red-400 text-white";
          else if (isCurrent) dotClass += " bg-indigo-500 text-white ring-4 ring-indigo-200";
          else dotClass += " bg-gray-200 text-gray-400";
          return (
            <div key={i} className={dotClass}>
              {result === "correct" ? "✓" : result === "wrong" ? "✗" : i + 1}
            </div>
          );
        })}
      </div>
      {/* Counter — positioned absolutely so it doesn't shift the dots */}
      <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">{current + 1}/{total}</span>
    </div>
  );
}

function SessionComplete({ correct, wrong, xpEarned, onContinue }: {
  correct: number; wrong: number; xpEarned: number;
  onContinue: () => void;
}) {
  const allWrong = correct === 0 && wrong > 0;
  const allCorrect = wrong === 0 && correct > 0;

  return (
    <div className="max-w-lg mx-auto text-center" style={{ animation: "fadeInUp 300ms ease-out both" }}>
      <div className="py-6">
        <div className="text-5xl mb-3">{allCorrect ? "🎉" : allWrong ? "💪" : "✨"}</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {allCorrect ? "Perfect!" : allWrong ? "Keep practicing!" : "Session complete!"}
        </h2>
        <p className="text-gray-500">
          {allWrong
            ? "These words will come back for review soon."
            : `You reviewed ${correct + wrong} words`}
        </p>
      </div>
      {!allWrong && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-50 rounded-xl p-4 animate-stat-reveal stagger-1">
            <div className="text-3xl font-bold text-green-600">{correct}</div>
            <div className="text-xs text-green-700">Correct</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 animate-stat-reveal stagger-2">
            <div className="text-3xl font-bold text-red-500">{wrong}</div>
            <div className="text-xs text-red-600">Mistakes</div>
          </div>
          <div className="bg-indigo-50 rounded-xl p-4 animate-stat-reveal stagger-3">
            <div className="text-3xl font-bold text-indigo-600">+{xpEarned}</div>
            <div className="text-xs text-indigo-700">XP earned</div>
          </div>
        </div>
      )}
      <button onClick={onContinue} className="w-full py-3 rounded-xl bg-indigo-500 text-white font-semibold btn-spring hover:bg-indigo-600">
        Continue
      </button>
    </div>
  );
}

function HintButton({ onHint, usedHint }: { onHint: () => void; usedHint: boolean }) {
  if (usedHint) return <p className="text-xs text-gray-400 text-center mt-3">Hint used</p>;
  return (
    <button onClick={onHint} className="block mx-auto mt-3 text-xs text-indigo-400 hover:text-indigo-600 transition-colors">
      💡 Show hint (-5 XP)
    </button>
  );
}

// SVG checkmark that draws itself
function AnimatedCheck() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="mx-auto">
      {/* Background circle — fills in */}
      <circle cx="40" cy="40" r="36" stroke="#e0e7ff" strokeWidth="3" fill="none" />
      <circle
        cx="40" cy="40" r="36" stroke="#6366f1" strokeWidth="3" fill="none"
        strokeLinecap="round"
        strokeDasharray="226"
        strokeDashoffset="226"
        style={{ animation: "drawCircle 600ms cubic-bezier(0.65, 0, 0.35, 1) 100ms forwards" }}
      />
      {/* Checkmark — draws after circle */}
      <path
        d="M24 42 L35 53 L56 28"
        stroke="#6366f1"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="50"
        strokeDashoffset="50"
        style={{ animation: "drawCheck 400ms cubic-bezier(0.65, 0, 0.35, 1) 550ms forwards" }}
      />
      {/* Subtle glow pulse behind */}
      <circle
        cx="40" cy="40" r="38" fill="none"
        stroke="rgba(99,102,241,0.15)"
        strokeWidth="6"
        style={{ animation: "checkGlow 1s ease-out 800ms both" }}
      />
    </svg>
  );
}

export function NoWordsView({ streak, totalWords, learningCount, masteredCount, isSentenceMode }: {
  streak: number;
  totalWords: number;
  learningCount: number;
  masteredCount: number;
  isSentenceMode?: boolean;
}) {
  const itemLabel = isSentenceMode ? "sentence" : "word";
  const itemLabelPlural = isSentenceMode ? "sentences" : "words";
  if (totalWords === 0) {
    return (
      <div className="max-w-sm mx-auto text-center py-16 animate-tab-switch">
        <div className="text-4xl mb-4">{isSentenceMode ? "📝" : "📖"}</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          {isSentenceMode ? "No sentences yet" : "Start your vocabulary journey"}
        </h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          {isSentenceMode
            ? "Select a sentence on any webpage to save it. Sentences appear here for review."
            : "Select any word on a webpage to save it. Words appear here for review."}
        </p>
        <button
          onClick={() => window.location.hash = isSentenceMode ? "sentences" : "vocabulary"}
          className="px-5 py-2.5 text-sm font-medium rounded-xl bg-indigo-500 text-white btn-spring hover:bg-indigo-600"
        >
          Browse {itemLabelPlural}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto py-10">
      {/* === THE MOMENT: animated checkmark === */}
      <div className="mb-6">
        <AnimatedCheck />
      </div>

      {/* === Heading — appears after check completes === */}
      <div className="text-center mb-8">
        <h2
          className="text-xl font-bold text-gray-900 mb-1"
          style={{ animation: "heroReveal 400ms ease-out 850ms both" }}
        >
          All caught up!
        </h2>
        <p
          className="text-sm text-gray-500"
          style={{ animation: "heroReveal 400ms ease-out 950ms both" }}
        >
          {totalWords} {totalWords !== 1 ? itemLabelPlural : itemLabel} saved · next review coming soon
        </p>
      </div>

      {/* === Stats row — compact, inside one card === */}
      <div
        className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4"
        style={{ animation: "heroReveal 400ms ease-out 1050ms both" }}
      >
        <div className="grid grid-cols-3 divide-x divide-gray-100">
          {([
            { n: totalWords, label: isSentenceMode ? "Sentences" : "Words", color: "text-indigo-600" },
            { n: learningCount, label: "Learning", color: "text-amber-500" },
            { n: masteredCount, label: "Mastered", color: "text-green-600" },
          ] as const).map((s) => (
            <div key={s.label} className="py-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.n}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {streak > 0 && (
          <div className="border-t border-gray-100 py-2.5 text-center bg-gray-50/60">
            <span className="text-xs font-semibold text-amber-600">🔥 {streak} day streak</span>
          </div>
        )}
      </div>

      {/* === Actions === */}
      <div
        className="flex gap-2"
        style={{ animation: "heroReveal 400ms ease-out 1150ms both" }}
      >
        <button
          onClick={() => { (window as any).__vocabifyShowQuiz?.(); }}
          className="flex-1 py-2.5 text-xs font-medium text-gray-600 bg-white rounded-xl border border-gray-200 btn-spring hover:border-indigo-200 hover:text-indigo-600"
        >
          🎯 Quiz
        </button>
        <button
          onClick={() => { (window as any).__vocabifyShowWriting?.(); }}
          className="flex-1 py-2.5 text-xs font-medium text-gray-600 bg-white rounded-xl border border-gray-200 btn-spring hover:border-indigo-200 hover:text-indigo-600"
        >
          ✍️ Practice
        </button>
        <button
          onClick={() => { window.location.hash = "vocabulary"; }}
          className="flex-1 py-2.5 text-xs font-medium text-gray-600 bg-white rounded-xl border border-gray-200 btn-spring hover:border-indigo-200 hover:text-indigo-600"
        >
          📚 Words
        </button>
      </div>
    </div>
  );
}

// --- Main Session Component ---

interface ReviewSessionProps {
  deviceId: string;
  sessionWords: WordDoc[];
  allWordsForDistractors: any[];
  streak: number;
  onContinue: () => void;
  updateReview: (args: any) => Promise<any>;
  addXP: (args: any) => Promise<any>;
}

type SessionPhase = "challenge" | "feedback" | "complete";

interface FeedbackState {
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  xpGained: number;
  word: WordDoc;
}

export function ReviewSession({
  deviceId,
  sessionWords: initialWords,
  allWordsForDistractors,
  streak,
  onContinue,
  updateReview,
  addXP,
}: ReviewSessionProps) {
  const [sessionWords, setSessionWords] = useState(initialWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<("correct" | "wrong" | null)[]>(() => initialWords.map(() => null));
  const [xpEarned, setXpEarned] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("challenge");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [usedHints, setUsedHints] = useState<Set<number>>(new Set());
  const [eliminatedOptions, setEliminatedOptions] = useState<number[] | undefined>(undefined);
  const [hintChars, setHintChars] = useState<string | undefined>(undefined);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const challengeKeyRef = useRef(0);

  // Refs to avoid stale closures in callbacks
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const sessionWordsRef = useRef(sessionWords);
  sessionWordsRef.current = sessionWords;

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  // Stable key based on actual word IDs — only resets when the word set truly changes
  // (e.g., "Continue" loads new words, "Review mistakes" loads different words)
  // Does NOT reset when parent re-renders with same words
  const wordsKey = useMemo(
    () => initialWords.map(w => w._id).join(","),
    [initialWords]
  );

  // Reset when the word set actually changes
  useEffect(() => {
    setSessionWords(initialWords);
    setCurrentIndex(0);
    setResults(initialWords.map(() => null));
    setXpEarned(0);
    setPhase("challenge");
    setFeedback(null);
    setUsedHints(new Set());
    setEliminatedOptions(undefined);
    setHintChars(undefined);
    challengeKeyRef.current++;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsKey]);

  const currentWord = sessionWords[currentIndex];

  // Build challenge — stays stable across phase changes (no phase dependency)
  const challenge = useMemo(() => {
    if (!currentWord) return null;
    return buildChallenge(currentWord as any, allWordsForDistractors, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord, allWordsForDistractors]);

  // --- Advance to next word (uses refs to avoid stale closures) ---
  const advanceToNext = useCallback(() => {
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }

    const idx = currentIndexRef.current;
    const words = sessionWordsRef.current;

    setEliminatedOptions(undefined);
    setHintChars(undefined);
    setFeedback(null);

    if (idx + 1 >= words.length) {
      // Show complete screen — don't notify parent yet.
      // Parent resets when user clicks "Continue" (onContinue).
      setPhase("complete");
    } else {
      setCurrentIndex(idx + 1);
      setPhase("challenge");
      challengeKeyRef.current++;
    }
  }, []);

  // --- Answer handler ---
  const handleResult = useCallback((correct: boolean, rating: number, userAnswer: string) => {
    if (phase !== "challenge") return; // prevent double-fire

    const hinted = usedHints.has(currentIndex);
    const xp = calculateXP(challenge?.type || "mc-word-to-translation", correct, hinted);

    // Update results (dots turn green/red immediately)
    setResults((prev) => {
      const next = [...prev];
      next[currentIndex] = correct ? "correct" : "wrong";
      return next;
    });

    // Set feedback state — shows feedback UI
    setFeedback({
      correct,
      userAnswer,
      correctAnswer: challenge?.correctAnswer ?? "",
      xpGained: xp,
      word: currentWord!,
    });
    setXpEarned((prev) => prev + xp);
    setPhase("feedback");

    if (correct) playCorrectSound(); else playWrongSound();

    // Send FSRS update (fire-and-forget)
    updateReview({
      id: currentWord!._id as Id<"words">,
      deviceId,
      rating,
    }).catch(() => {});

    // Send XP update
    if (xp > 0) {
      addXP({ deviceId, xp }).catch(() => {});
    }

    // Auto-advance for CORRECT answers after 1.5s
    if (correct) {
      feedbackTimer.current = setTimeout(() => {
        advanceToNext();
      }, 1500);
    }
    // WRONG: no auto-advance — user must click "Got it"
  }, [phase, currentIndex, currentWord, challenge, usedHints, updateReview, addXP, deviceId, advanceToNext]);

  // --- Keyboard for wrong feedback: Enter/→ to continue ---
  // Uses a small delay to prevent the same Enter keypress from both submitting the answer AND advancing
  useEffect(() => {
    if (phase !== "feedback" || !feedback || feedback.correct) return;

    let active = false;
    // Wait 100ms before listening — prevents the Enter that submitted the answer from also advancing
    const enableTimer = setTimeout(() => { active = true; }, 100);

    const handler = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        advanceToNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      clearTimeout(enableTimer);
      window.removeEventListener("keydown", handler);
    };
  }, [phase, feedback, advanceToNext]);

  // --- Hint ---
  const handleHint = useCallback(() => {
    if (!challenge || usedHints.has(currentIndex)) return;

    setUsedHints((prev) => new Set(prev).add(currentIndex));

    const isMC = challenge.type === "mc-word-to-translation" || challenge.type === "mc-translation-to-word";
    if (isMC && challenge.options && challenge.correctIndex !== undefined) {
      const wrongIndices = challenge.options.map((_, i) => i).filter((i) => i !== challenge.correctIndex);
      const toEliminate = wrongIndices.sort(() => Math.random() - 0.5).slice(0, 2);
      setEliminatedOptions(toEliminate);
    } else {
      setHintChars(challenge.correctAnswer.slice(0, 2));
    }
  }, [challenge, currentIndex, usedHints]);

  const correctCount = results.filter((r) => r === "correct").length;
  const wrongCount = results.filter((r) => r === "wrong").length;

  const challengeTypeLabels: Record<string, { label: string; color: string }> = {
    "mc-word-to-translation": { label: "Multiple choice", color: "text-indigo-500" },
    "mc-translation-to-word": { label: "Reverse match", color: "text-purple-500" },
    "type-translation": { label: "Type the meaning", color: "text-teal-500" },
    "type-word": { label: "Recall the word", color: "text-amber-600" },
  };

  // --- Complete screen ---
  if (phase === "complete") {
    return (
      <div>
        <SessionTopBar streak={streak} xpEarned={xpEarned} />
        <SessionComplete
          correct={correctCount}
          wrong={wrongCount}
          xpEarned={xpEarned}
          onContinue={onContinue}
        />
      </div>
    );
  }

  // --- Challenge + Feedback (rendered in the SAME card) ---
  return (
    <div className="max-w-lg mx-auto">
      <SessionTopBar streak={streak} xpEarned={xpEarned} />
      <ProgressDots total={sessionWords.length} current={currentIndex} results={results} />

      {/* Single persistent card — content changes based on phase */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        {/* Challenge type badge — always visible */}
        {challenge && (
          <div className="text-center mb-4">
            <span className={`text-xs font-bold uppercase tracking-wider ${challengeTypeLabels[challenge.type]?.color || "text-gray-500"}`}>
              {challengeTypeLabels[challenge.type]?.label || "Review"}
            </span>
          </div>
        )}

        {/* --- CHALLENGE PHASE: show the question --- */}
        {phase === "challenge" && challenge && (
          <div key={challengeKeyRef.current}>
            <ReviewChallenge
              challenge={challenge}
              onResult={handleResult}
              eliminatedOptions={eliminatedOptions}
              hintChars={hintChars}
            />
            <HintButton onHint={handleHint} usedHint={usedHints.has(currentIndex)} />
          </div>
        )}

        {/* --- FEEDBACK PHASE: show result inside the same card --- */}
        {phase === "feedback" && feedback && (
          <div style={{ animation: "fadeInUp 250ms ease-out both" }}>
            {feedback.correct ? (
              /* --- CORRECT feedback --- */
              <div className="text-center py-6">
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 max-w-sm mx-auto">
                  <div className="text-4xl mb-2">✓</div>
                  <p className="text-green-700 font-bold text-xl mb-1">Correct!</p>
                  <p className="text-green-600 text-sm mb-3">+{feedback.xpGained} XP</p>
                  <div className="border-t border-green-200 pt-3 mt-2">
                    <p className="font-semibold text-gray-800">{feedback.word.word}</p>
                    <p className="text-sm text-gray-500">{feedback.word.translation}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-4">Continuing automatically...</p>
              </div>
            ) : (
              /* --- WRONG feedback --- */
              <div className="text-center py-6">
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-sm mx-auto">
                  <div className="text-4xl mb-2">✗</div>
                  <p className="text-red-700 font-bold text-xl mb-3">Not quite</p>
                  <div className="space-y-1.5 text-sm">
                    {feedback.userAnswer && (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-red-400">You:</span>
                        <span className="text-red-600 line-through">{feedback.userAnswer}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-green-600">Answer:</span>
                      <span className="text-green-700 font-bold text-base">{feedback.correctAnswer}</span>
                    </div>
                  </div>
                  <div className="border-t border-red-200 pt-3 mt-4">
                    <p className="font-semibold text-gray-800">{feedback.word.word}</p>
                    <p className="text-sm text-gray-500">{feedback.word.translation}</p>
                  </div>
                </div>
                <button
                  onClick={advanceToNext}
                  className="mt-4 text-sm text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                >
                  Got it, continue →
                </button>
                <p className="text-xs text-gray-400 mt-2">Press Enter or → to continue</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
