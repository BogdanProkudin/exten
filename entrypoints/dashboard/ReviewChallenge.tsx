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

  const promptLabel = challenge.type === "mc-word-to-translation"
    ? "What does this mean?"
    : "Which word matches?";

  return (
    <div className="text-center">
      {progress && <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">{progress}</p>}
      <p className="text-sm text-gray-500 mb-2">{promptLabel}</p>
      <p className="text-2xl font-bold text-gray-900 mb-6">{challenge.prompt}</p>

      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
        {challenge.options?.map((opt, i) => {
          const isEliminated = eliminatedOptions?.includes(i);
          let style = "bg-white hover:bg-gray-50 border-gray-200 cursor-pointer";
          if (isEliminated && !showResult) {
            style = "opacity-20 border-gray-200 cursor-default line-through";
          } else if (showResult) {
            if (i === challenge.correctIndex) {
              style = "bg-green-50 border-green-300 text-green-700 ring-1 ring-green-200";
            } else if (i === selected) {
              style = "bg-red-50 border-red-300 text-red-700";
            } else {
              style = "opacity-40 border-gray-200 cursor-default";
            }
          }

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={showResult || isEliminated}
              className={`relative py-3 px-4 rounded-xl text-sm font-medium border transition-all active:scale-[0.97] ${style}`}
            >
              <span className="absolute top-1 left-2 text-[10px] text-gray-300 font-mono">{i + 1}</span>
              {opt}
            </button>
          );
        })}
      </div>

      {!showResult && (
        <p className="text-[11px] text-gray-400 text-center mt-3 flex items-center justify-center gap-2">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">{n}</kbd>
            </span>
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

  const promptLabel = challenge.type === "type-translation"
    ? "Type the meaning:"
    : "Type the word:";

  const placeholder = hintChars
    ? `${hintChars}...`
    : challenge.type === "type-translation" ? "Type translation..." : "Type the word...";

  return (
    <div className="text-center">
      {progress && <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">{progress}</p>}
      <p className="text-sm text-gray-500 mb-2">{promptLabel}</p>
      <p className="text-2xl font-bold text-gray-900 mb-6">{challenge.prompt}</p>

      <div className="max-w-sm mx-auto">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={showResult}
          placeholder={placeholder}
          className={`w-full py-3 px-4 rounded-xl border text-center text-lg focus:outline-none transition-all ${
            showResult
              ? isCorrect
                ? "border-green-300 bg-green-50"
                : "border-red-300 bg-red-50 line-through text-red-400"
              : "border-gray-200 focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
          }`}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {!showResult && (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="mt-3 py-2.5 px-8 bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-sm font-medium rounded-xl hover:from-blue-600 hover:to-indigo-600 shadow-sm shadow-blue-200 transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Check
          </button>
        )}

        {!showResult && (
          <p className="text-[11px] text-gray-400 text-center mt-3 flex items-center justify-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">Enter</kbd> to check
          </p>
        )}
      </div>
    </div>
  );
}
