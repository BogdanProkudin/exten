import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useEntranceAnimation,
  useExitAnimation,
  DURATION,
  EASING,
} from "../../src/lib/motion";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";
import { isSpeechRecognitionSupported, startListening, type SpeechResult } from "../../src/lib/speech-recognition";
import { buildChallenge, resultToFSRSRating, type Challenge, type ChallengeType } from "../../src/lib/review-challenge";
import { isAcceptableAnswer } from "../../src/lib/answer-match";
import { speak } from "../../src/lib/tts";

interface ReviewWord {
  _id: string;
  word: string;
  translation: string;
  example: string;
  type?: "word";
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
      const isSmartMode = data.reviewMode !== "classic";
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
  }, [word._id]);

  useEffect(() => {
    (async () => {
      if (await shouldShowTip("tip_keyboard_review")) {
        setTipText(
          smartMode
            ? "1-4 to select · Enter to check"
            : "Space to reveal · 1-4 to rate",
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
    setTimeout(triggerClose, correct ? 800 : 2000);
  }, [smartShowResult, word._id, triggerClose]);

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
      setTimeout(triggerClose, remembered ? 800 : 2000);
    },
    [answered, word._id, triggerClose],
  );

  const handleRatingAnswer = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (answered) return;
      setAnswered(true);
      const forgot = rating < 3;
      setAnswerType(forgot ? "forgot" : "remembered");
      incrementCounter("reviewsCompleted");
      await chrome.runtime.sendMessage({
        type: "REVIEW_RESULT",
        wordId: word._id,
        rating,
      });
      setTimeout(triggerClose, forgot ? 2000 : 800);
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

      if (answered) return;
      if (e.key === " " && !revealed) { e.preventDefault(); setRevealed(true); return; }
      if (!revealed) return;

      if (e.key === "1") { e.preventDefault(); handleRatingAnswer(1); }
      else if (e.key === "2") { e.preventDefault(); handleRatingAnswer(2); }
      else if (e.key === "3") { e.preventDefault(); handleRatingAnswer(3); }
      else if (e.key === "4") { e.preventDefault(); handleRatingAnswer(4); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); handleRatingAnswer(1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); handleRatingAnswer(3); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answered, revealed, handleBinaryAnswer, handleRatingAnswer, triggerClose, smartMode, challenge, smartShowResult, smartInput, handleSmartResult]);

  const show = visible && !isClosing;

  const typeLabel = smartMode && challenge
    ? (challenge.type.startsWith("mc-") ? "Quick Challenge" : "Type Challenge")
    : "Quick Review";

  const typeIcon = smartMode && challenge
    ? (challenge.type.startsWith("mc-")
        ? '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>'
        : '<path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>')
    : '<path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>';

  return (
    <>
      <style>{`
        @keyframes rvBackdrop { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rvCardEnter {
          0% { opacity: 0; transform: translate(-50%, -44%) scale(0.92); filter: blur(8px); }
          40% { opacity: 0.8; filter: blur(2px); }
          70% { transform: translate(-50%, -50.5%) scale(1.01); filter: blur(0px); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); filter: blur(0px); }
        }
        @keyframes rvCardExit {
          from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          to { opacity: 0; transform: translate(-50%, -52%) scale(0.96); filter: blur(4px); }
        }
        @keyframes rvFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rvResultPop {
          0% { opacity: 0; transform: scale(0.3); }
          50% { transform: scale(1.1); }
          70% { transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes rvCorrectGlow {
          0% { border-color: rgba(229,231,235,0.4); box-shadow: 0 8px 40px rgba(0,0,0,0.08); }
          40% { border-color: rgba(34,197,94,0.5); box-shadow: 0 8px 40px rgba(34,197,94,0.15), 0 0 0 4px rgba(34,197,94,0.08); background: rgba(240,253,244,0.95); }
          100% { border-color: rgba(34,197,94,0.4); box-shadow: 0 8px 40px rgba(34,197,94,0.1); }
        }
        @keyframes rvWrongShake {
          0% { border-color: rgba(229,231,235,0.4); }
          15% { transform: translateX(-4px); border-color: rgba(239,68,68,0.5); }
          30% { transform: translateX(3px); background: rgba(254,242,242,0.95); }
          45% { transform: translateX(-2px); }
          60% { transform: translateX(1px); }
          100% { transform: translateX(0); border-color: rgba(239,68,68,0.4); }
        }
        @keyframes rvBorderFlow {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes rvPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes rvOptionEnter {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.25)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          zIndex: 2147483646,
          animation: show ? "rvBackdrop 300ms ease both" : undefined,
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
          width: "420px", maxWidth: "92vw",
          fontFamily: FONT, fontSize: "16px",
          animation: isClosing
            ? "rvCardExit 200ms ease both"
            : show ? "rvCardEnter 450ms cubic-bezier(0.16, 1, 0.3, 1) both" : undefined,
          opacity: show || isClosing ? undefined : 0,
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: "20px",
            boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.9)",
            border: "1.5px solid rgba(229, 231, 235, 0.4)",
            position: "relative", overflow: "hidden",
            transition: "border-color 300ms ease, background 300ms ease, box-shadow 300ms ease",
            animation: answerType === "remembered"
              ? "rvCorrectGlow 600ms ease both"
              : answerType === "forgot" ? "rvWrongShake 500ms cubic-bezier(0.36,0.07,0.19,0.97) both" : undefined,
          }}
        >
          {/* Animated gradient top bar */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "3px",
            background: "linear-gradient(90deg, #6366f1, #818cf8, #a78bfa, #c084fc, #6366f1)",
            backgroundSize: "200% 100%",
            animation: "rvBorderFlow 4s ease infinite",
            borderRadius: "20px 20px 0 0",
          }} />

          {/* Result overlay */}
          {answerType && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "8px",
              zIndex: 10, pointerEvents: "none",
            }}>
              <div style={{ animation: "rvResultPop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
                {answerType === "remembered" ? (
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#22c55e" strokeWidth="3" opacity="0.3" />
                    <circle cx="32" cy="32" r="28" fill="rgba(220,252,231,0.4)" stroke="#22c55e" strokeWidth="3"
                      strokeDasharray="176" strokeDashoffset="176"
                      style={{ animation: "rvDrawCircle 400ms ease-out 100ms forwards" }} />
                    <path d="M20 32 L28 40 L44 24" fill="none" stroke="#22c55e" strokeWidth="3.5"
                      strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray="40" strokeDashoffset="40"
                      style={{ animation: "rvDrawCheck 300ms ease-out 350ms forwards" }} />
                  </svg>
                ) : (
                  <svg width="48" height="48" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="rgba(254,226,226,0.4)" stroke="#ef4444" strokeWidth="3"
                      strokeDasharray="176" strokeDashoffset="176"
                      style={{ animation: "rvDrawCircle 400ms ease-out 100ms forwards" }} />
                    <path d="M22 22 L42 42 M42 22 L22 42" fill="none" stroke="#ef4444" strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray="56" strokeDashoffset="56"
                      style={{ animation: "rvDrawCheck 300ms ease-out 350ms forwards" }} />
                  </svg>
                )}
              </div>
              {answerType === "forgot" && (
                <div style={{
                  textAlign: "center",
                  animation: "rvResultPop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms both",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e1b4b", marginBottom: "2px" }}>
                    {word.word}
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "#4f46e5" }}>
                    {word.translation}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Additional keyframes for SVG draw */}
          {answerType && (
            <style>{`
              @keyframes rvDrawCircle { to { stroke-dashoffset: 0; } }
              @keyframes rvDrawCheck { to { stroke-dashoffset: 0; } }
            `}</style>
          )}

          <div style={{ padding: "22px", opacity: answerType ? 0.12 : 1, transition: "opacity 300ms ease" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "4px 12px", borderRadius: "10px",
                background: "rgba(99, 102, 241, 0.06)", border: "1px solid rgba(99, 102, 241, 0.1)",
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: typeIcon }} />
                <span style={{
                  fontSize: "11px", fontWeight: 700, color: "#6366f1",
                  textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  {typeLabel}
                </span>
              </div>
              <button
                onClick={triggerClose}
                style={{
                  width: "30px", height: "30px", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  borderRadius: "10px", border: "1px solid rgba(229,231,235,0.4)",
                  background: "rgba(249,250,251,0.8)", backdropFilter: "blur(8px)",
                  cursor: "pointer", color: "#9ca3af",
                  transition: "all 200ms", fontFamily: FONT,
                }}
                onMouseEnter={(e) => { (e.currentTarget).style.background = "rgba(243,244,246,0.95)"; (e.currentTarget).style.color = "#374151"; (e.currentTarget).style.transform = "scale(1.05)"; }}
                onMouseLeave={(e) => { (e.currentTarget).style.background = "rgba(249,250,251,0.8)"; (e.currentTarget).style.color = "#9ca3af"; (e.currentTarget).style.transform = "scale(1)"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
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
                  <p style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "6px", fontFamily: FONT, fontWeight: 500 }}>{promptLabel}</p>
                  <p style={{ fontSize: "24px", fontWeight: 700, color: "#111827", margin: "0 0 22px", fontFamily: FONT, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
                    {challenge.prompt}
                  </p>

                  {isMC && challenge.options ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {challenge.options.map((opt, i) => {
                        let bg = "rgba(255,255,255,0.85)";
                        let border = "rgba(229,231,235,0.5)";
                        let color = "#374151";
                        let shadow = "0 2px 6px rgba(0,0,0,0.03)";
                        if (smartShowResult) {
                          if (i === challenge.correctIndex) {
                            bg = "rgba(220,252,231,0.9)"; border = "rgba(34,197,94,0.5)"; color = "#15803d";
                            shadow = "0 0 0 3px rgba(34,197,94,0.1), 0 2px 6px rgba(34,197,94,0.08)";
                          } else if (i === smartSelected) {
                            bg = "rgba(254,226,226,0.9)"; border = "rgba(239,68,68,0.4)"; color = "#dc2626";
                            shadow = "0 0 0 3px rgba(239,68,68,0.08)";
                          } else {
                            bg = "rgba(249,250,251,0.6)"; border = "rgba(229,231,235,0.3)"; color = "#9ca3af";
                          }
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
                              padding: "12px 16px", fontSize: "14px", fontWeight: 500,
                              border: `1.5px solid ${border}`, borderRadius: "14px",
                              background: bg, color, cursor: smartShowResult ? "default" : "pointer",
                              transition: "all 200ms", fontFamily: FONT, textAlign: "left",
                              display: "flex", alignItems: "center", gap: "10px",
                              backdropFilter: "blur(8px)",
                              boxShadow: shadow,
                              animation: `rvOptionEnter 300ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 50}ms both`,
                            }}
                            onMouseEnter={(e) => {
                              if (smartShowResult) return;
                              (e.currentTarget).style.borderColor = "rgba(165,180,252,0.5)";
                              (e.currentTarget).style.transform = "translateY(-1px)";
                              (e.currentTarget).style.boxShadow = "0 4px 14px rgba(99,102,241,0.08)";
                            }}
                            onMouseLeave={(e) => {
                              if (smartShowResult) return;
                              (e.currentTarget).style.borderColor = "rgba(229,231,235,0.5)";
                              (e.currentTarget).style.transform = "translateY(0)";
                              (e.currentTarget).style.boxShadow = "0 2px 6px rgba(0,0,0,0.03)";
                            }}
                          >
                            <span style={{
                              fontSize: "10px", color: "#c4b5fd", fontFamily: "monospace",
                              width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                              borderRadius: "6px", background: "rgba(99,102,241,0.06)", flexShrink: 0,
                              fontWeight: 700,
                            }}>{i + 1}</span>
                            {opt}
                          </button>
                        );
                      })}
                      {smartShowResult && (
                        <p style={{ fontSize: "13px", fontWeight: 700, marginTop: "6px", color: smartCorrect ? "#15803d" : "#dc2626", fontFamily: FONT }}>
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
                          width: "100%", padding: "14px 16px", fontSize: "16px",
                          border: `1.5px solid ${smartShowResult ? (smartCorrect ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.4)") : "rgba(229,231,235,0.5)"}`,
                          borderRadius: "14px", textAlign: "center", fontFamily: FONT,
                          background: smartShowResult ? (smartCorrect ? "rgba(220,252,231,0.9)" : "rgba(254,226,226,0.9)") : "rgba(255,255,255,0.85)",
                          backdropFilter: "blur(8px)",
                          outline: "none", boxSizing: "border-box",
                          textDecoration: smartShowResult && !smartCorrect ? "line-through" : "none",
                          color: smartShowResult && !smartCorrect ? "#9ca3af" : "#111827",
                          boxShadow: smartShowResult
                            ? (smartCorrect ? "0 0 0 3px rgba(34,197,94,0.1)" : "0 0 0 3px rgba(239,68,68,0.08)")
                            : "none",
                          transition: "all 250ms ease",
                        }}
                        onFocus={(e) => {
                          if (!smartShowResult) {
                            (e.currentTarget).style.borderColor = "rgba(99,102,241,0.4)";
                            (e.currentTarget).style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)";
                          }
                        }}
                        onBlur={(e) => {
                          if (!smartShowResult) {
                            (e.currentTarget).style.borderColor = "rgba(229,231,235,0.5)";
                            (e.currentTarget).style.boxShadow = "none";
                          }
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
                            marginTop: "12px", padding: "12px 28px", fontSize: "14px", fontWeight: 600,
                            border: "none", borderRadius: "14px",
                            background: smartInput.trim() ? "linear-gradient(135deg, #6366f1, #7c3aed)" : "rgba(229,231,235,0.5)",
                            color: smartInput.trim() ? "#fff" : "#9ca3af",
                            cursor: smartInput.trim() ? "pointer" : "default",
                            transition: "all 250ms", fontFamily: FONT,
                            boxShadow: smartInput.trim() ? "0 4px 14px rgba(99,102,241,0.25)" : "none",
                          }}
                          onMouseEnter={(e) => { if (smartInput.trim()) { (e.currentTarget).style.transform = "translateY(-1px)"; (e.currentTarget).style.boxShadow = "0 6px 20px rgba(99,102,241,0.3)"; } }}
                          onMouseLeave={(e) => { (e.currentTarget).style.transform = "translateY(0)"; (e.currentTarget).style.boxShadow = smartInput.trim() ? "0 4px 14px rgba(99,102,241,0.25)" : "none"; }}
                        >
                          Check
                        </button>
                      )}
                      {smartShowResult && (
                        <p style={{ fontSize: "13px", fontWeight: 700, marginTop: "10px", color: smartCorrect ? "#15803d" : "#dc2626", fontFamily: FONT }}>
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
                <div style={{ textAlign: "center", marginBottom: "22px" }}>
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
                        justifyContent: "center", borderRadius: "10px", border: "1px solid rgba(229,231,235,0.3)",
                        background: "rgba(249,250,251,0.6)", cursor: "pointer", color: "#9ca3af",
                        transition: "all 200ms", fontFamily: FONT,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget).style.background = "rgba(238,242,255,0.8)"; (e.currentTarget).style.color = "#6366f1"; (e.currentTarget).style.borderColor = "rgba(165,180,252,0.3)"; }}
                      onMouseLeave={(e) => { (e.currentTarget).style.background = "rgba(249,250,251,0.6)"; (e.currentTarget).style.color = "#9ca3af"; (e.currentTarget).style.borderColor = "rgba(229,231,235,0.3)"; }}
                      title="Pronounce"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                    </button>
                  </div>
                  {word.example && (
                    <p style={{ fontSize: "13px", color: "#9ca3af", margin: 0, lineHeight: 1.6, fontStyle: "italic" }}>
                      &ldquo;{word.example}&rdquo;
                    </p>
                  )}
                </div>

                {!revealed ? (
                  <div>
                    <button
                      onClick={() => setRevealed(true)}
                      style={{
                        width: "100%", padding: "14px", fontSize: "14px", fontWeight: 600,
                        border: "none", borderRadius: "14px",
                        background: "linear-gradient(135deg, #6366f1, #7c3aed)",
                        color: "#fff", cursor: "pointer", transition: "all 250ms",
                        fontFamily: FONT, boxShadow: "0 4px 14px rgba(99,102,241,0.25)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget).style.boxShadow = "0 6px 20px rgba(99,102,241,0.35)";
                        (e.currentTarget).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget).style.boxShadow = "0 4px 14px rgba(99,102,241,0.25)";
                        (e.currentTarget).style.transform = "translateY(0)";
                      }}
                    >
                      Reveal Translation
                    </button>
                    <p style={{
                      fontSize: "11px", color: "#c4b5fd", textAlign: "center", marginTop: "10px",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                    }}>
                      <span style={{
                        display: "inline-block", padding: "2px 7px", background: "rgba(99,102,241,0.06)",
                        borderRadius: "6px", fontSize: "10px", fontFamily: "monospace",
                        color: "#818cf8", border: "1px solid rgba(99,102,241,0.1)", fontWeight: 600,
                      }}>Space</span>
                      to reveal
                    </p>
                  </div>
                ) : (
                  <div style={{ animation: "rvFadeIn 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both" }}>
                    <div style={{
                      textAlign: "center", padding: "14px 16px", marginBottom: "16px",
                      background: "rgba(249,250,251,0.7)", borderRadius: "14px",
                      border: "1px solid rgba(229,231,235,0.3)",
                      backdropFilter: "blur(8px)",
                    }}>
                      <p style={{ fontSize: "18px", fontWeight: 600, color: "#374151", margin: 0 }}>
                        {word.translation}
                      </p>
                    </div>

                    {/* 4 rating buttons */}
                    {!answered && (
                      <div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {[
                            { label: "Again", bg: "rgba(254,242,242,0.8)", color: "#dc2626", border: "rgba(254,202,202,0.5)", hoverBg: "rgba(254,226,226,0.9)" },
                            { label: "Hard", bg: "rgba(255,247,237,0.8)", color: "#ea580c", border: "rgba(254,215,170,0.5)", hoverBg: "rgba(255,237,213,0.9)" },
                            { label: "Good", bg: "rgba(240,253,244,0.8)", color: "#16a34a", border: "rgba(187,247,208,0.5)", hoverBg: "rgba(220,252,231,0.9)" },
                            { label: "Easy", bg: "rgba(238,242,255,0.8)", color: "#4f46e5", border: "rgba(165,180,252,0.5)", hoverBg: "rgba(224,231,255,0.9)" },
                          ].map((btn, i) => (
                            <button
                              key={btn.label}
                              onClick={() => handleRatingAnswer((i + 1) as 1 | 2 | 3 | 4)}
                              style={{
                                flex: 1, padding: "12px 6px", fontSize: "13px", fontWeight: 600,
                                border: `1.5px solid ${btn.border}`, borderRadius: "12px",
                                background: btn.bg, color: btn.color,
                                cursor: "pointer", transition: "all 200ms", fontFamily: FONT,
                                backdropFilter: "blur(8px)",
                              }}
                              onMouseEnter={(e) => { (e.currentTarget).style.background = btn.hoverBg; (e.currentTarget).style.transform = "translateY(-1px)"; }}
                              onMouseLeave={(e) => { (e.currentTarget).style.background = btn.bg; (e.currentTarget).style.transform = "translateY(0)"; }}
                            >
                              {btn.label}
                            </button>
                          ))}
                        </div>
                        <p style={{
                          fontSize: "11px", color: "#c4b5fd", textAlign: "center", marginTop: "10px",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                        }}>
                          {[1, 2, 3, 4].map((n) => (
                            <span key={n} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                              <span style={{
                                display: "inline-block", padding: "2px 6px", background: "rgba(99,102,241,0.06)",
                                borderRadius: "5px", fontSize: "10px", fontFamily: "monospace",
                                color: "#818cf8", border: "1px solid rgba(99,102,241,0.1)", fontWeight: 600,
                              }}>{n}</span>
                              <span style={{ color: "#9ca3af" }}>{["Again", "Hard", "Good", "Easy"][n - 1]}</span>
                            </span>
                          ))}
                        </p>
                      </div>
                    )}

                    {/* Pronunciation */}
                    {!answered && isSpeechRecognitionSupported() && (
                      <div style={{ textAlign: "center", marginTop: "14px" }}>
                        <button
                          onClick={handleSpeak}
                          disabled={isListening}
                          style={{
                            background: isListening ? "rgba(219,234,254,0.8)" : "rgba(249,250,251,0.7)",
                            border: "1px solid rgba(229,231,235,0.4)", borderRadius: "12px",
                            padding: "8px 14px", fontSize: "12px",
                            cursor: isListening ? "default" : "pointer",
                            display: "inline-flex", alignItems: "center", gap: "6px",
                            color: isListening ? "#3b82f6" : "#9ca3af",
                            transition: "all 200ms", fontFamily: FONT,
                            backdropFilter: "blur(8px)",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={isListening ? { animation: "rvPulse 1s ease-in-out infinite" } : undefined}>
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                            <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                          </svg>
                          <span>{isListening ? "Listening..." : speechResult ? speechResult.transcript : "Practice pronunciation"}</span>
                          {speechResult && !isListening && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={speechResult.isMatch ? "#22c55e" : "#ef4444"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              {speechResult.isMatch ? <path d="M20 6 9 17l-5-5"/> : <><path d="M18 6 6 18"/><path d="M6 6l12 12"/></>}
                            </svg>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Tip */}
            {tipVisible && (
              <div style={{
                marginTop: "16px", padding: "10px 14px",
                background: "rgba(238,242,255,0.7)", backdropFilter: "blur(8px)",
                border: "1px solid rgba(165,180,252,0.2)", borderRadius: "12px",
                fontSize: "12px", color: "#4f46e5", lineHeight: 1.5,
                display: "flex", alignItems: "center", gap: "8px",
                animation: "rvFadeIn 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
                </svg>
                <span style={{ flex: 1 }}>{tipText}</span>
                <button
                  onClick={() => { setTipVisible(false); dismissTipForever(tipId); }}
                  style={{ color: "#818cf8", background: "none", border: "none", cursor: "pointer", fontSize: "14px", padding: 0, flexShrink: 0, fontFamily: FONT }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
