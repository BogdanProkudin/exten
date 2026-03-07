import { useState, useEffect, useCallback } from "react";
import {
  useEntranceAnimation,
  useExitAnimation,
  DURATION,
  EASING,
} from "../../src/lib/motion";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";

interface ReviewWord {
  _id: string;
  word: string;
  translation: string;
  example: string;
}

interface ReviewToastProps {
  word: ReviewWord;
  onClose: () => void;
}

export function ReviewToast({ word, onClose }: ReviewToastProps) {
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [answerFlash, setAnswerFlash] = useState<"green" | "red" | null>(null);
  const [tipVisible, setTipVisible] = useState(false);
  const [tipText, setTipText] = useState("");
  const [tipId, setTipId] = useState("");
  const visible = useEntranceAnimation();

  // Check for tips
  useEffect(() => {
    (async () => {
      // Try keyboard tip first, then DND tip
      if (await shouldShowTip("tip_keyboard_review")) {
        setTipText("Keyboard shortcuts: Space to reveal, \u2190 forgot, \u2192 remembered");
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

  const handleAnswer = useCallback(
    async (remembered: boolean) => {
      if (answered) return;
      setAnswered(true);
      setAnswerFlash(remembered ? "green" : "red");
      incrementCounter("reviewsCompleted");
      await chrome.runtime.sendMessage({
        type: "REVIEW_RESULT",
        wordId: word._id,
        remembered,
      });
      setTimeout(triggerClose, 600);
    },
    [answered, word._id, triggerClose],
  );

  // Keyboard shortcuts: Space=reveal, ArrowLeft=forgot, ArrowRight=remembered, Escape=close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        triggerClose();
        return;
      }
      if (answered) return;

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
  }, [answered, revealed, handleAnswer, triggerClose]);

  const showState = visible && !isClosing;

  return (
    <div
      className="fixed bottom-5 right-5 z-[2147483647] pointer-events-auto"
      role="dialog"
      aria-label={`Review: ${word.word}`}
      aria-live="polite"
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-[300px]"
        style={{
          transform: showState ? "translateX(0)" : "translateX(100%)",
          opacity: showState ? 1 : 0,
          transition: [
            `transform ${isClosing ? DURATION.exit : DURATION.entrance}ms ${isClosing ? EASING.accelerate : EASING.panel}`,
            `opacity ${isClosing ? DURATION.exit : DURATION.entrance}ms ${isClosing ? EASING.accelerate : EASING.decelerate}`,
          ].join(", "),
          animation: answerFlash === "green"
            ? "greenFlash 500ms ease"
            : answerFlash === "red"
              ? "redFlash 500ms ease"
              : undefined,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">
            Quick Review
          </span>
          <button
            onClick={triggerClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <p className="text-lg font-semibold text-gray-900 mb-1">{word.word}</p>

        {word.example && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-2 italic">
            {word.example}
          </p>
        )}

        {!revealed ? (
          <div>
            <button
              onClick={() => setRevealed(true)}
              className="w-full text-sm font-medium py-2 px-3 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Reveal Translation
            </button>
            <p className="text-xs text-gray-500 text-center mt-1">
              Press Space
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
              }}
            >
              <p className="text-sm text-gray-700 mb-3 p-2 bg-gray-50 rounded-lg">
                {word.translation}
              </p>
            </div>

            {!answered ? (
              <div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAnswer(false)}
                    className="flex-1 text-sm font-medium py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  >
                    Forgot
                  </button>
                  <button
                    onClick={() => handleAnswer(true)}
                    className="flex-1 text-sm font-medium py-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                  >
                    Remembered
                  </button>
                </div>
                <p className="text-xs text-gray-500 text-center mt-1">
                  ← / →
                </p>
              </div>
            ) : (
              <p
                className="text-center text-sm text-green-600 font-medium"
                style={{
                  animation: "fadeInUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
                }}
              >
                Got it!
              </p>
            )}
          </>
        )}

        {/* Contextual tip */}
        {tipVisible && (
          <TipBanner
            text={tipText}
            onDismiss={() => setTipVisible(false)}
            onDismissForever={() => {
              setTipVisible(false);
              dismissTipForever(tipId);
            }}
          />
        )}
      </div>
    </div>
  );
}

function TipBanner({
  text,
  onDismiss,
  onDismissForever,
}: {
  text: string;
  onDismiss: () => void;
  onDismissForever: () => void;
}) {
  return (
    <div
      style={{
        marginTop: "8px",
        padding: "6px 10px",
        background: "#EFF6FF",
        borderLeft: "3px solid #3b82f6",
        borderRadius: "4px",
        fontSize: "11px",
        color: "#1E40AF",
        lineHeight: 1.4,
        display: "flex",
        alignItems: "flex-start",
        gap: "6px",
        animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
      }}
    >
      <span style={{ flex: 1 }}>{text}</span>
      <button
        onClick={onDismiss}
        style={{
          color: "#1E40AF",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "13px",
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
        title="Dismiss"
      >
        &#x2715;
      </button>
    </div>
  );
}
