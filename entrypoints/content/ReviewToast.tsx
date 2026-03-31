import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useEntranceAnimation,
  useExitAnimation,
  DURATION,
  EASING,
} from "../../src/lib/motion";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";
import { isSpeechRecognitionSupported, startListening, type SpeechResult } from "../../src/lib/speech-recognition";
import { generatePhraseBlank } from "../../src/lib/phrase-review";
import { buildChallenge, resultToFSRSRating, type Challenge, type ChallengeType } from "../../src/lib/review-challenge";
import { isAcceptableAnswer } from "../../src/lib/answer-match";
import { speak } from "../../src/lib/tts";

interface ReviewWord {
  _id: string;
  word: string;
  translation: string;
  example: string;
  type?: "word" | "phrase" | "sentence";
  fsrsState?: string;
  fsrsReps?: number;
  fsrsLapses?: number;
  fsrsStability?: number;
  fsrsDifficulty?: number;
  fsrsLastReview?: number;
  fsrsScheduledDays?: number;
  fsrsElapsedDays?: number;
  reviewCount?: number;
  status?: string;
  intervalDays?: number;
  consecutiveCorrect?: number;
  forgotCount?: number;
  lastReviewed?: number;
}

interface ReviewToastProps {
  word: ReviewWord;
  onClose: () => void;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// Shared button style helper
function ratingBtnStyle(bg: string, color: string, ring: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "12px 6px",
    fontSize: "13px",
    fontWeight: 600,
    border: "none",
    borderRadius: "12px",
    background: bg,
    color,
    cursor: "pointer",
    transition: "all 150ms",
    fontFamily: FONT,
    boxShadow: `inset 0 0 0 1px ${ring}`,
  };
}

export function ReviewToast({ word, onClose }: ReviewToastProps) {
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [answerType, setAnswerType] = useState<"remembered" | "forgot" | null>(null);
  const [tipVisible, setTipVisible] = useState(false);
  const [tipText, setTipText] = useState("");
  const [tipId, setTipId] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechResult, setSpeechResult] = useState<SpeechResult | null>(null);
  const visible = useEntranceAnimation();

  const wordType = word.type ?? "word";

  // For phrases: generate fill-in-the-blank
  const phraseBlank = useMemo(
    () => (wordType === "phrase" ? generatePhraseBlank(word.word) : null),
    [word.word, wordType],
  );

  // Smart review mode
  const [smartMode, setSmartMode] = useState(false);
  const [distractors, setDistractors] = useState<any[]>([]);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [smartSelected, setSmartSelected] = useState<number | null>(null);
  const [smartInput, setSmartInput] = useState("");
  const [smartShowResult, setSmartShowResult] = useState(false);
  const [smartCorrect, setSmartCorrect] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(["reviewMode"]).then((data: Record<string, unknown>) => {
      const isSmartMode = data.reviewMode !== "classic" && wordType !== "sentence";
      setSmartMode(isSmartMode);
      if (isSmartMode) {
        chrome.runtime.sendMessage({ type: "GET_DISTRACTORS", wordId: word._id }, (resp) => {
          if (!mountedRef.current) return;
          if (resp?.distractors && Array.isArray(resp.distractors)) {
            setDistractors(resp.distractors);
            const ch = buildChallenge(word, resp.distractors);
            setChallenge(ch);
          }
        });
      }
    });
  }, [word._id, wordType]);

  useEffect(() => {
    (async () => {
      if (await shouldShowTip("tip_keyboard_review")) {
        setTipText(
          smartMode
            ? "1-4 to select \u00b7 Enter to check"
            : wordType === "word"
              ? "Space to reveal \u00b7 1-4 to rate"
              : "Space to reveal \u00b7 \u2190 forgot \u00b7 \u2192 remembered",
        );
        setTipId("tip_keyboard_review");
        setTipVisible(true);
        markTipSeen("tip_keyboard_review");
      } else if (await shouldShowTip("tip_dnd")) {
        setTipText("Too many reviews? Pause from the extension popup");
        setTipId("tip_dnd");
        setTipVisible(true);
        markTipSeen("tip_dnd");
      }
    })();
  }, []);

  const { isClosing, triggerClose: rawTriggerClose } = useExitAnimation(onClose, DURATION.exit);

  const triggerClose = useCallback(() => {
    incrementCounter("toastDismissedToday");
    rawTriggerClose();
  }, [rawTriggerClose]);

  const handleSmartResult = useCallback((correct: boolean, challengeType: ChallengeType) => {
    if (smartShowResult) return;
    setSmartShowResult(true);
    setSmartCorrect(correct);
    setAnswerType(correct ? "remembered" : "forgot");
    incrementCounter("reviewsCompleted");
    const rating = resultToFSRSRating(challengeType, correct);
    chrome.runtime.sendMessage({ type: "REVIEW_RESULT", wordId: word._id, rating });
    setTimeout(triggerClose, correct ? 800 : 1200);
  }, [smartShowResult, word._id, triggerClose]);

  // Binary answer handler (for phrases/sentences)
  const handleBinaryAnswer = useCallback(
    async (remembered: boolean) => {
      if (answered) return;
      setAnswered(true);
      setAnswerType(remembered ? "remembered" : "forgot");
      incrementCounter("reviewsCompleted");
      await chrome.runtime.sendMessage({
        type: "REVIEW_RESULT",
        wordId: word._id,
        remembered,
      });
      setTimeout(triggerClose, 800);
    },
    [answered, word._id, triggerClose],
  );

  // 4-rating handler (for words)
  const handleRatingAnswer = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (answered) return;
      setAnswered(true);
      setAnswerType(rating >= 3 ? "remembered" : "forgot");
      incrementCounter("reviewsCompleted");
      await chrome.runtime.sendMessage({
        type: "REVIEW_RESULT",
        wordId: word._id,
        rating,
      });
      setTimeout(triggerClose, 800);
    },
    [answered, word._id, triggerClose],
  );

  const handleSpeak = useCallback(async () => {
    if (isListening) return;
    setIsListening(true);
    setSpeechResult(null);
    try {
      const result = await startListening(word.word);
      setSpeechResult(result);
    } catch (e) {
      setSpeechResult({ transcript: (e as Error).message, confidence: 0, isMatch: false });
    } finally {
      setIsListening(false);
    }
  }, [isListening, word.word]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); triggerClose(); return; }

      // Smart mode keyboard
      if (smartMode && challenge) {
        if (smartShowResult) return;
        const isMC = challenge.type === "mc-word-to-translation" || challenge.type === "mc-translation-to-word";
        if (isMC && challenge.options) {
          const num = parseInt(e.key);
          if (num >= 1 && num <= challenge.options.length) {
            e.preventDefault();
            setSmartSelected(num - 1);
            handleSmartResult(num - 1 === challenge.correctIndex, challenge.type);
          }
        } else if (e.key === "Enter" && smartInput.trim()) {
          e.preventDefault();
          const correct = isAcceptableAnswer(smartInput, challenge.correctAnswer);
          handleSmartResult(correct, challenge.type);
        }
        return;
      }

      // Classic mode keyboard
      if (answered) return;
      if (e.key === " " && !revealed) { e.preventDefault(); setRevealed(true); return; }
      if (!revealed) return;

      if (wordType === "word") {
        if (e.key === "1") { e.preventDefault(); handleRatingAnswer(1); }
        else if (e.key === "2") { e.preventDefault(); handleRatingAnswer(2); }
        else if (e.key === "3") { e.preventDefault(); handleRatingAnswer(3); }
        else if (e.key === "4") { e.preventDefault(); handleRatingAnswer(4); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); handleRatingAnswer(1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); handleRatingAnswer(3); }
      } else {
        if (e.key === "ArrowLeft") { e.preventDefault(); handleBinaryAnswer(false); }
        else if (e.key === "ArrowRight") { e.preventDefault(); handleBinaryAnswer(true); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answered, revealed, handleBinaryAnswer, handleRatingAnswer, triggerClose, wordType, smartMode, challenge, smartShowResult, smartInput, handleSmartResult]);

  const show = visible && !isClosing;

  const cardBorderColor = answerType === "remembered"
    ? "#86efac"
    : answerType === "forgot"
      ? "#fca5a5"
      : "#e5e7eb";

  const typeLabel = smartMode && challenge
    ? (challenge.type.startsWith("mc-") ? "Quick Challenge" : "Type Challenge")
    : wordType === "phrase" ? "Phrase Review" : wordType === "sentence" ? "Sentence Review" : "Quick Review";

  // Render answer buttons based on type
  const renderAnswerButtons = () => {
    if (answered) return null;

    if (wordType === "word") {
      // 4 FSRS rating buttons
      return (
        <div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => handleRatingAnswer(1)} style={ratingBtnStyle("#fef2f2", "#dc2626", "#fecaca")}
              onMouseEnter={(e) => { (e.currentTarget).style.background = "#fee2e2"; }}
              onMouseLeave={(e) => { (e.currentTarget).style.background = "#fef2f2"; }}
            >Again</button>
            <button onClick={() => handleRatingAnswer(2)} style={ratingBtnStyle("#fff7ed", "#ea580c", "#fed7aa")}
              onMouseEnter={(e) => { (e.currentTarget).style.background = "#ffedd5"; }}
              onMouseLeave={(e) => { (e.currentTarget).style.background = "#fff7ed"; }}
            >Hard</button>
            <button onClick={() => handleRatingAnswer(3)} style={ratingBtnStyle("#f0fdf4", "#16a34a", "#bbf7d0")}
              onMouseEnter={(e) => { (e.currentTarget).style.background = "#dcfce7"; }}
              onMouseLeave={(e) => { (e.currentTarget).style.background = "#f0fdf4"; }}
            >Good</button>
            <button onClick={() => handleRatingAnswer(4)} style={ratingBtnStyle("#eff6ff", "#2563eb", "#bfdbfe")}
              onMouseEnter={(e) => { (e.currentTarget).style.background = "#dbeafe"; }}
              onMouseLeave={(e) => { (e.currentTarget).style.background = "#eff6ff"; }}
            >Easy</button>
          </div>
          <p style={{
            fontSize: "11px", color: "#9ca3af", textAlign: "center", marginTop: "10px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <span style={{ display: "inline-block", padding: "2px 6px", background: "#f3f4f6", borderRadius: "4px", fontSize: "10px", fontFamily: "monospace", color: "#6b7280", border: "1px solid #e5e7eb" }}>{n}</span>
                {["Again", "Hard", "Good", "Easy"][n - 1]}
              </span>
            ))}
          </p>
        </div>
      );
    }

    // Binary buttons for phrases/sentences
    return (
      <div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => handleBinaryAnswer(false)} style={ratingBtnStyle("#fef2f2", "#dc2626", "#fecaca")}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#fee2e2"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "#fef2f2"; }}
          >Forgot</button>
          <button onClick={() => handleBinaryAnswer(true)} style={ratingBtnStyle("#f0fdf4", "#16a34a", "#bbf7d0")}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#dcfce7"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "#f0fdf4"; }}
          >Got it</button>
        </div>
        <p style={{
          fontSize: "11px", color: "#9ca3af", textAlign: "center", marginTop: "10px",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ display: "inline-block", padding: "2px 6px", background: "#f3f4f6", borderRadius: "4px", fontSize: "10px", fontFamily: "monospace", color: "#6b7280", border: "1px solid #e5e7eb" }}>&larr;</span>
            Forgot
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            Got it
            <span style={{ display: "inline-block", padding: "2px 6px", background: "#f3f4f6", borderRadius: "4px", fontSize: "10px", fontFamily: "monospace", color: "#6b7280", border: "1px solid #e5e7eb" }}>&rarr;</span>
          </span>
        </p>
      </div>
    );
  };

  // Render the card body based on type
  const renderCardBody = () => {
    if (wordType === "phrase" && phraseBlank) {
      // Phrase: fill-in-the-blank
      return (
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ marginBottom: "6px" }}>
            <h2 style={{
              fontSize: "26px", fontWeight: 700, color: "#111827", margin: 0,
              letterSpacing: "-0.02em", lineHeight: 1.3,
            }}>
              {!revealed ? phraseBlank.display : phraseBlank.fullPhrase}
            </h2>
          </div>
          <span style={{
            display: "inline-block", padding: "2px 8px", background: "#f0fdfa", color: "#0d9488",
            borderRadius: "6px", fontSize: "11px", fontWeight: 500, marginTop: "4px",
          }}>phrase</span>
        </div>
      );
    }

    if (wordType === "sentence") {
      return (
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <p style={{
            fontSize: "12px", fontWeight: 500, color: "#9ca3af", margin: 0,
            marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            Recall the English sentence
          </p>
          <p style={{
            fontSize: "16px", fontWeight: 500, color: "#374151", margin: 0,
            lineHeight: 1.6,
          }}>
            {word.translation}
          </p>
        </div>
      );
    }

    // Default: word
    return (
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "6px" }}>
          <h2 style={{
            fontSize: "28px", fontWeight: 700, color: "#111827", margin: 0,
            letterSpacing: "-0.02em", lineHeight: 1.2,
          }}>
            {word.word}
          </h2>
          <button
            onClick={() => { speak(word.word); }}
            style={{
              width: "32px", height: "32px", display: "flex", alignItems: "center",
              justifyContent: "center", borderRadius: "50%", border: "none",
              background: "transparent", cursor: "pointer", color: "#9ca3af",
              transition: "all 150ms", fontFamily: FONT,
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.background = "#f3f4f6"; (e.currentTarget).style.color = "#3b82f6"; }}
            onMouseLeave={(e) => { (e.currentTarget).style.background = "transparent"; (e.currentTarget).style.color = "#9ca3af"; }}
            title="Pronounce"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          </button>
        </div>
        {word.example && (
          <p style={{ fontSize: "13px", color: "#6b7280", margin: 0, lineHeight: 1.6, fontStyle: "italic" }}>
            &ldquo;{word.example}&rdquo;
          </p>
        )}
      </div>
    );
  };

  // Render revealed section based on type
  const renderRevealedContent = () => {
    if (wordType === "phrase" && phraseBlank) {
      return (
        <div style={{ animation: "rvFadeIn 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
          <div style={{
            textAlign: "center", padding: "14px 16px", marginBottom: "16px",
            background: "#f9fafb", borderRadius: "12px",
          }}>
            <p style={{ fontSize: "16px", fontWeight: 600, color: "#374151", margin: 0, marginBottom: "4px" }}>
              {phraseBlank.blankedWord}
            </p>
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
              {word.translation}
            </p>
          </div>
          {renderAnswerButtons()}
        </div>
      );
    }

    // Sentence: show English original; Word: show translation
    return (
      <div style={{ animation: "rvFadeIn 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
        <div style={{
          textAlign: "center", padding: "14px 16px", marginBottom: "16px",
          background: "#f9fafb", borderRadius: "12px",
        }}>
          <p style={{ fontSize: wordType === "sentence" ? "15px" : "18px", fontWeight: 600, color: "#374151", margin: 0, lineHeight: wordType === "sentence" ? 1.6 : undefined }}>
            {wordType === "sentence" ? `\u201C${word.word}\u201D` : word.translation}
          </p>
        </div>
        {renderAnswerButtons()}

        {/* Pronunciation — only for words */}
        {wordType === "word" && !answered && isSpeechRecognitionSupported() && (
          <div style={{ textAlign: "center", marginTop: "14px" }}>
            <button
              onClick={handleSpeak}
              disabled={isListening}
              style={{
                background: isListening ? "#dbeafe" : "#f9fafb",
                border: "1px solid #e5e7eb", borderRadius: "10px",
                padding: "8px 14px", fontSize: "12px",
                cursor: isListening ? "default" : "pointer",
                display: "inline-flex", alignItems: "center", gap: "6px",
                color: isListening ? "#3b82f6" : "#6b7280",
                transition: "all 150ms", fontFamily: FONT,
              }}
            >
              {isListening ? (
                <span style={{ animation: "rvPulse 1s ease-in-out infinite" }}>&#127908;</span>
              ) : speechResult ? (
                speechResult.isMatch ? "\u2705" : "\u274C"
              ) : (
                "&#127908;"
              )}
              <span>{isListening ? "Listening..." : speechResult ? speechResult.transcript : "Practice pronunciation"}</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes rvBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rvCardEnter {
          from { opacity: 0; transform: translate(-50%, -44%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes rvCardExit {
          from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          to { opacity: 0; transform: translate(-50%, -52%) scale(0.97); }
        }
        @keyframes rvFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rvBounce {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); opacity: 1; }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes rvRemembered {
          0% { border-color: #e5e7eb; }
          40% { border-color: #86efac; background: #f0fdf4; }
          100% { border-color: #86efac; }
        }
        @keyframes rvForgot {
          0% { border-color: #e5e7eb; }
          40% { border-color: #fca5a5; background: #fef2f2; }
          100% { border-color: #fca5a5; }
        }
        @keyframes rvPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.2)",
          backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
          zIndex: 2147483646,
          animation: show ? "rvBackdrop 250ms ease both" : undefined,
          opacity: show ? 1 : 0,
          transition: isClosing ? "opacity 200ms ease" : undefined,
          pointerEvents: "auto",
        }}
        onClick={triggerClose}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-label={`Review: ${word.word}`}
        aria-live="polite"
        style={{
          position: "fixed", top: "50%", left: "50%",
          zIndex: 2147483647, pointerEvents: "auto",
          width: wordType === "sentence" ? "480px" : "420px", maxWidth: "92vw",
          fontFamily: FONT, fontSize: "16px",
          animation: isClosing
            ? "rvCardExit 200ms ease both"
            : show ? "rvCardEnter 350ms cubic-bezier(0.16, 1, 0.3, 1) both" : undefined,
          opacity: show || isClosing ? undefined : 0,
        }}
      >
        <div
          style={{
            background: "#fff", borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
            border: `1px solid ${cardBorderColor}`,
            position: "relative", overflow: "hidden",
            transition: "border-color 300ms ease, background 300ms ease",
            animation: answerType === "remembered"
              ? "rvRemembered 600ms ease both"
              : answerType === "forgot" ? "rvForgot 600ms ease both" : undefined,
          }}
        >
          {/* Top accent bar */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "3px",
            background: "linear-gradient(90deg, #6366f1, #3b82f6, #06b6d4)",
            borderRadius: "16px 16px 0 0",
          }} />

          {/* Answer overlay emoji */}
          {answerType && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              zIndex: 10, pointerEvents: "none",
            }}>
              <span style={{
                fontSize: "56px", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.1))",
                animation: "rvBounce 400ms cubic-bezier(0.4, 0, 0.2, 1) both",
              }}>
                {answerType === "remembered" ? "\u2705" : "\u{1F4AA}"}
              </span>
            </div>
          )}

          <div style={{ padding: "20px", opacity: answerType ? 0.15 : 1, transition: "opacity 300ms ease" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <span style={{
                fontSize: "11px", fontWeight: 600, color: "#6366f1",
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>
                {typeLabel}
              </span>
              <button
                onClick={triggerClose}
                style={{
                  width: "28px", height: "28px", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  borderRadius: "8px", border: "none", background: "#f5f5f5",
                  cursor: "pointer", color: "#6b7280", fontSize: "14px",
                  transition: "all 150ms", fontFamily: FONT,
                }}
                onMouseEnter={(e) => { (e.currentTarget).style.background = "#e5e7eb"; (e.currentTarget).style.color = "#374151"; }}
                onMouseLeave={(e) => { (e.currentTarget).style.background = "#f5f5f5"; (e.currentTarget).style.color = "#6b7280"; }}
              >
                &#x2715;
              </button>
            </div>

            {/* Smart challenge mode */}
            {smartMode && challenge ? (() => {
              const isMC = challenge.type === "mc-word-to-translation" || challenge.type === "mc-translation-to-word";
              const promptLabel = challenge.type === "mc-word-to-translation" ? "What does this mean?"
                : challenge.type === "mc-translation-to-word" ? "Which word matches?"
                : challenge.type === "type-translation" ? "Type the meaning:"
                : "Type the word:";

              return (
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px", fontFamily: FONT }}>{promptLabel}</p>
                  <p style={{ fontSize: "22px", fontWeight: 700, color: "#111827", margin: "0 0 20px", fontFamily: FONT, lineHeight: 1.3 }}>
                    {challenge.prompt}
                  </p>

                  {isMC && challenge.options ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {challenge.options.map((opt, i) => {
                        let bg = "#fff"; let border = "#e5e7eb"; let color = "#374151";
                        if (smartShowResult) {
                          if (i === challenge.correctIndex) { bg = "#f0fdf4"; border = "#86efac"; color = "#15803d"; }
                          else if (i === smartSelected) { bg = "#fef2f2"; border = "#fca5a5"; color = "#dc2626"; }
                          else { bg = "#f9fafb"; border = "#e5e7eb"; color = "#9ca3af"; }
                        }
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if (smartShowResult) return;
                              setSmartSelected(i);
                              handleSmartResult(i === challenge.correctIndex, challenge.type);
                            }}
                            disabled={smartShowResult}
                            style={{
                              padding: "10px 14px", fontSize: "14px", fontWeight: 500,
                              border: `1px solid ${border}`, borderRadius: "10px",
                              background: bg, color, cursor: smartShowResult ? "default" : "pointer",
                              transition: "all 150ms", fontFamily: FONT, textAlign: "left",
                              display: "flex", alignItems: "center", gap: "8px",
                            }}
                          >
                            <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "monospace", width: "16px", flexShrink: 0 }}>{i + 1}</span>
                            {opt}
                          </button>
                        );
                      })}
                      {smartShowResult && (
                        <p style={{ fontSize: "13px", fontWeight: 600, marginTop: "4px", color: smartCorrect ? "#15803d" : "#dc2626", fontFamily: FONT }}>
                          {smartCorrect ? "Correct!" : `Answer: ${challenge.correctAnswer}`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={smartInput}
                        onChange={(e) => setSmartInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && smartInput.trim() && !smartShowResult) {
                            e.preventDefault();
                            const correct = isAcceptableAnswer(smartInput, challenge.correctAnswer);
                            handleSmartResult(correct, challenge.type);
                          }
                        }}
                        disabled={smartShowResult}
                        placeholder={challenge.type === "type-translation" ? "Type translation..." : "Type the word..."}
                        autoFocus
                        style={{
                          width: "100%", padding: "12px 14px", fontSize: "16px",
                          border: `1px solid ${smartShowResult ? (smartCorrect ? "#86efac" : "#fca5a5") : "#e5e7eb"}`,
                          borderRadius: "10px", textAlign: "center", fontFamily: FONT,
                          background: smartShowResult ? (smartCorrect ? "#f0fdf4" : "#fef2f2") : "#fff",
                          outline: "none", boxSizing: "border-box",
                          textDecoration: smartShowResult && !smartCorrect ? "line-through" : "none",
                          color: smartShowResult && !smartCorrect ? "#9ca3af" : "#111827",
                        }}
                      />
                      {!smartShowResult && (
                        <button
                          onClick={() => {
                            if (!smartInput.trim()) return;
                            const correct = isAcceptableAnswer(smartInput, challenge.correctAnswer);
                            handleSmartResult(correct, challenge.type);
                          }}
                          disabled={!smartInput.trim()}
                          style={{
                            marginTop: "10px", padding: "10px 24px", fontSize: "14px", fontWeight: 600,
                            border: "none", borderRadius: "10px",
                            background: smartInput.trim() ? "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)" : "#e5e7eb",
                            color: smartInput.trim() ? "#fff" : "#9ca3af",
                            cursor: smartInput.trim() ? "pointer" : "default",
                            transition: "all 200ms", fontFamily: FONT,
                          }}
                        >
                          Check
                        </button>
                      )}
                      {smartShowResult && (
                        <p style={{ fontSize: "13px", fontWeight: 600, marginTop: "8px", color: smartCorrect ? "#15803d" : "#dc2626", fontFamily: FONT }}>
                          {smartCorrect ? "Correct!" : `Answer: ${challenge.correctAnswer}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })() : (
              <>
                {/* Classic card body */}
                {renderCardBody()}

                {!revealed ? (
                  <div>
                    <button
                      onClick={() => setRevealed(true)}
                      style={{
                        width: "100%", padding: "14px", fontSize: "14px", fontWeight: 600,
                        border: "none", borderRadius: "12px",
                        background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                        color: "#fff", cursor: "pointer", transition: "all 200ms",
                        fontFamily: FONT, boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget).style.boxShadow = "0 4px 16px rgba(99,102,241,0.35)";
                        (e.currentTarget).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget).style.boxShadow = "0 2px 8px rgba(99,102,241,0.25)";
                        (e.currentTarget).style.transform = "translateY(0)";
                      }}
                    >
                      {wordType === "sentence" ? "Reveal English" : wordType === "phrase" ? "Reveal Answer" : "Reveal Translation"}
                    </button>
                    <p style={{
                      fontSize: "11px", color: "#9ca3af", textAlign: "center", marginTop: "10px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                    }}>
                      <span style={{
                        display: "inline-block", padding: "2px 6px", background: "#f3f4f6",
                        borderRadius: "4px", fontSize: "10px", fontFamily: "monospace",
                        color: "#6b7280", border: "1px solid #e5e7eb",
                      }}>Space</span>
                      to reveal
                    </p>
                  </div>
                ) : (
                  renderRevealedContent()
                )}
              </>
            )}

            {/* Tip */}
            {tipVisible && (
              <div style={{
                marginTop: "16px", padding: "8px 14px", background: "#eff6ff",
                borderLeft: "3px solid #3b82f6", borderRadius: "6px",
                fontSize: "12px", color: "#1e40af", lineHeight: 1.5,
                display: "flex", alignItems: "center", gap: "8px",
                animation: "rvFadeIn 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
              }}>
                <span style={{ flex: 1 }}>{tipText}</span>
                <button
                  onClick={() => { setTipVisible(false); dismissTipForever(tipId); }}
                  style={{ color: "#1e40af", background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: 0, flexShrink: 0, fontFamily: FONT }}
                >
                  &#x2715;
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
