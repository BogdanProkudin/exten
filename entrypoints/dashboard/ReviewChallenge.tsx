import { useState, useEffect, useRef, useCallback } from "react";
import type { Challenge } from "../../src/lib/review-challenge";
import { resultToFSRSRating } from "../../src/lib/review-challenge";
import { isAcceptableAnswer } from "../../src/lib/answer-match";

interface ReviewChallengeProps {
  challenge: Challenge;
  onResult: (correct: boolean, rating: number, userAnswer: string) => void;
  progress?: string;
  eliminatedOptions?: number[];
  hintChars?: string;
}

export function ReviewChallenge({ challenge, onResult, progress, eliminatedOptions, hintChars }: ReviewChallengeProps) {
  const isMC = challenge.type === "mc-word-to-translation" || challenge.type === "mc-translation-to-word";

  return isMC ? (
    <MCChallenge challenge={challenge} onResult={onResult} progress={progress} eliminatedOptions={eliminatedOptions} />
  ) : (
    <TypeChallenge challenge={challenge} onResult={onResult} progress={progress} hintChars={hintChars} />
  );
}

// --- Multiple Choice ---

function MCChallenge({ challenge, onResult, progress, eliminatedOptions }: ReviewChallengeProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);

  const handleSelect = useCallback((index: number) => {
    if (showResult) return;
    if (eliminatedOptions?.includes(index)) return;
    setSelected(index);
    setShowResult(true);

    const correct = index === challenge.correctIndex;
    const rating = resultToFSRSRating(challenge.type, correct);
    const userAnswer = challenge.options?.[index] ?? "";
    onResult(correct, rating, userAnswer);
  }, [showResult, challenge, onResult, eliminatedOptions]);

  // Keyboard: 1-4 to select
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showResult) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4 && challenge.options && num <= challenge.options.length) {
        if (eliminatedOptions?.includes(num - 1)) return;
        e.preventDefault();
        handleSelect(num - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showResult, handleSelect, challenge.options, eliminatedOptions]);

  // Mouse follow for radial glow
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty("--mouse-x", `${x}%`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}%`);
  }, []);

  const promptLabel = challenge.type === "mc-word-to-translation"
    ? "What does this mean?"
    : "Which word matches?";

  return (
    <div className="text-center">
      {progress && <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">{progress}</p>}
      <p className="text-sm text-gray-400 font-medium mb-2">{promptLabel}</p>
      <p className="text-2xl font-bold text-gray-900 mb-7">{challenge.prompt}</p>

      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
        {challenge.options?.map((opt, i) => {
          const isEliminated = eliminatedOptions?.includes(i);
          let extraClass = "";

          if (showResult) {
            if (i === challenge.correctIndex) {
              extraClass = "review-option-correct";
            } else if (i === selected) {
              extraClass = "review-option-wrong";
            } else {
              extraClass = "review-option-dimmed";
            }
          } else if (isEliminated) {
            extraClass = "review-option-dimmed line-through";
          }

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              onMouseMove={handleMouseMove}
              disabled={showResult || !!isEliminated}
              className={`review-option-btn review-option-enter ${extraClass}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="absolute top-1.5 left-2.5 text-[10px] text-gray-300 font-mono tabular-nums">{i + 1}</span>
              <span className="text-sm font-medium text-gray-700">{opt}</span>
            </button>
          );
        })}
      </div>

      {!showResult && (
        <p className="text-[11px] text-gray-400 text-center mt-4 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].slice(0, challenge.options?.length ?? 4).map((n) => (
            <kbd key={n} className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">{n}</kbd>
          ))}
          <span className="text-gray-400">to select</span>
        </p>
      )}
    </div>
  );
}

// --- Typing Challenge ---

function TypeChallenge({ challenge, onResult, progress, hintChars }: ReviewChallengeProps) {
  const [input, setInput] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || showResult) return;

    const correct = isAcceptableAnswer(input, challenge.correctAnswer);
    setIsCorrect(correct);
    setShowResult(true);

    const rating = resultToFSRSRating(challenge.type, correct);
    onResult(correct, rating, input.trim());
  }, [input, showResult, challenge, onResult]);

  const placeholder = hintChars
    ? `${hintChars}...`
    : challenge.type === "type-translation" ? "Type translation..." : "Type the word...";

  const inputStateClass = showResult
    ? isCorrect ? "correct" : "wrong"
    : "";

  return (
    <div className="text-center">
      {progress && <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">{progress}</p>}
      <p className="text-2xl font-bold text-gray-900 mb-7">{challenge.prompt}</p>

      <div className="max-w-sm mx-auto" style={{ animation: "fadeInUp 300ms ease-out both" }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={showResult}
          placeholder={placeholder}
          className={`w-full review-type-input ${inputStateClass} ${showResult && !isCorrect ? "line-through text-red-400" : ""}`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {!showResult && (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="mt-4 review-check-btn"
          >
            Check
          </button>
        )}

        {!showResult && (
          <p className="text-[11px] text-gray-400 text-center mt-3 flex items-center justify-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">Enter</kbd>
            to check
          </p>
        )}
      </div>
    </div>
  );
}
