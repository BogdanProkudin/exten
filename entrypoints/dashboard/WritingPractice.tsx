import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  startListening,
  type SpeechResult,
} from "../../src/lib/speech-recognition";

type Mode =
  | "translation-to-word"
  | "word-to-translation"
  | "speak"
  | "sentence-writing";

interface WritingPracticeProps {
  deviceId: string;
  onClose: () => void;
}

// Check if sentence contains the target word (or common inflections)
function containsWord(sentence: string, word: string): boolean {
  const lower = sentence.toLowerCase();
  const wordLower = word.toLowerCase();
  if (lower.includes(wordLower)) return true;
  const variants = [
    wordLower + "s",
    wordLower + "es",
    wordLower + "ed",
    wordLower + "ing",
    wordLower + "d",
    wordLower.replace(/y$/, "ies"),
    wordLower.replace(/e$/, "ing"),
    wordLower.replace(/e$/, "ed"),
  ];
  return variants.some((v) => lower.includes(v));
}

export function WritingPractice({ deviceId, onClose }: WritingPracticeProps) {
  const allWords = useQuery(api.words.getQuizWords, { deviceId, limit: 50 });
  const updateReview = useMutation(api.words.updateReview);
  const [mode, setMode] = useState<Mode>("translation-to-word");

  const [words, setWords] = useState<typeof allWords>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [result, setResult] = useState<"correct" | "incorrect" | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [started, setStarted] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechResult, setSpeechResult] = useState<SpeechResult | null>(null);

  // Sentence-writing specific state
  const [sentence, setSentence] = useState("");
  const [sentenceError, setSentenceError] = useState("");
  const [writingStage, setWritingStage] = useState<"writing" | "feedback">(
    "writing",
  );
  const [completedWords, setCompletedWords] = useState<string[]>([]);

  // Slider bounds
  const wordPool = allWords?.length ?? 0;
  const sliderMin = mode === "sentence-writing" ? 1 : 5;
  const sliderMax = Math.max(sliderMin, wordPool);

  // Clamp questionCount when mode or pool changes
  useEffect(() => {
    setQuestionCount((prev) => Math.max(sliderMin, Math.min(prev, sliderMax)));
  }, [mode, sliderMin, sliderMax]);

  const getExamples = useCallback((): string[] => {
    const cw = words?.[currentIndex];
    if (!cw) return [];
    const examples: string[] = [];
    if ((cw as any).example) examples.push((cw as any).example);
    if ((cw as any).contexts) {
      for (const ctx of (cw as any).contexts) {
        if (ctx.sentence && !examples.includes(ctx.sentence)) {
          examples.push(ctx.sentence);
        }
      }
    }
    return examples.slice(0, 3);
  }, [words, currentIndex]);

  const startPractice = useCallback(() => {
    if (!allWords || allWords.length === 0) return;
    const shuffled = [...allWords]
      .sort(() => Math.random() - 0.5)
      .slice(0, questionCount);
    setWords(shuffled);
    if (mode === "sentence-writing") {
      setWritingStage("writing");
      setSentence("");
      setSentenceError("");
      setCompletedWords([]);
    }
    setCurrentIndex(0);
    setScore({ correct: 0, total: 0 });
    setStarted(true);
    setTimeout(() => {
      if (mode === "sentence-writing") {
        textareaRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 100);
  }, [allWords, questionCount, mode]);

  const currentWord = words?.[currentIndex];
  const isComplete = started && currentIndex >= (words?.length ?? 0);

  // --- Quiz mode handlers ---
  const checkAnswer = useCallback(async () => {
    if (!currentWord || showAnswer) return;
    const correctAnswer =
      mode === "translation-to-word"
        ? currentWord.word.toLowerCase().trim()
        : currentWord.translation.toLowerCase().trim();
    const userAnswer = userInput.toLowerCase().trim();
    const isCorrect = userAnswer === correctAnswer;

    setResult(isCorrect ? "correct" : "incorrect");
    setShowAnswer(true);
    setScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    try {
      await updateReview({
        id: currentWord._id,
        deviceId,
        remembered: isCorrect,
      });
    } catch (e) {
      console.error("[Vocabify] Writing practice review failed:", e);
    }
  }, [currentWord, userInput, mode, showAnswer, updateReview, deviceId]);

  const nextWord = useCallback(() => {
    setCurrentIndex((prev) => prev + 1);
    setUserInput("");
    setShowAnswer(false);
    setResult(null);
    setSpeechResult(null);
    if (mode === "sentence-writing") {
      setSentence("");
      setSentenceError("");
      setWritingStage("writing");
      setTimeout(() => textareaRef.current?.focus(), 100);
    } else {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (showAnswer) {
        nextWord();
      } else if (userInput.trim()) {
        checkAnswer();
      }
    }
  };

  const handleSpeak = useCallback(async () => {
    if (isListening || !currentWord || showAnswer) return;
    setIsListening(true);
    setSpeechResult(null);
    try {
      const result = await startListening(currentWord.word);
      setSpeechResult(result);
      const isCorrect = result.isMatch;
      setResult(isCorrect ? "correct" : "incorrect");
      setShowAnswer(true);
      setScore((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));
      try {
        await updateReview({
          id: currentWord._id,
          deviceId,
          remembered: isCorrect,
        });
      } catch (e) {
        console.error("[Vocabify] Speak mode review failed:", e);
      }
    } catch (e) {
      setSpeechResult({
        transcript: (e as Error).message,
        confidence: 0,
        isMatch: false,
      });
    } finally {
      setIsListening(false);
    }
  }, [isListening, currentWord, showAnswer, updateReview, deviceId]);

  // --- Sentence-writing handlers ---
  const handleSentenceSubmit = useCallback(() => {
    if (!currentWord) return;
    const trimmed = sentence.trim();
    if (!trimmed) {
      setSentenceError("Please write a sentence.");
      return;
    }
    if (trimmed.split(/\s+/).length < 5) {
      setSentenceError("Your sentence should be at least 5 words long.");
      return;
    }
    if (!containsWord(trimmed, currentWord.word)) {
      setSentenceError(
        `Your sentence must include the word "${currentWord.word}" (or a variant of it).`,
      );
      return;
    }
    setSentenceError("");
    setCompletedWords((prev) => [...prev, currentWord.word]);
    setScore((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    updateReview({
      id: currentWord._id as Id<"words">,
      deviceId,
      remembered: true,
    });
    setWritingStage("feedback");
  }, [currentWord, sentence, updateReview, deviceId]);

  const handleSentenceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (writingStage === "writing") {
          handleSentenceSubmit();
        } else {
          nextWord();
        }
      }
    },
    [writingStage, handleSentenceSubmit, nextWord],
  );

  // Initial load — wait for the always-fetched quiz words before showing anything
  if (!allWords) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // Setup screen — shown before practice starts, never gated on writingWords loading
  if (!started) {
    const noWords = allWords.length === 0;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">🏋️ Practice</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Choose a practice mode to strengthen your vocabulary.
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Practice Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      key: "translation-to-word" as Mode,
                      label: "🔤 Translation → Word",
                    },
                    {
                      key: "word-to-translation" as Mode,
                      label: "🔁 Word → Translation",
                    },
                    { key: "speak" as Mode, label: "🎤 Speak Mode" },
                    {
                      key: "sentence-writing" as Mode,
                      label: "✍️ Sentence Writing",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setMode(opt.key)}
                    className={`p-3 rounded-xl text-sm font-medium transition-all ${
                      mode === opt.key
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Words: <span className="text-blue-500">{questionCount}</span>
              </label>
              <div className="relative h-8 flex items-center group">
                <div className="absolute w-full h-1.5 bg-gray-200 rounded-full" />
                <div
                  className="absolute h-1.5 bg-blue-500 rounded-full transition-all duration-200 ease-out"
                  style={{
                    width:
                      sliderMax > sliderMin
                        ? `${((questionCount - sliderMin) / (sliderMax - sliderMin)) * 100}%`
                        : "0%",
                  }}
                />
                <input
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="absolute w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-blue-500/30 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:active:scale-110"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>{sliderMin}</span>
                <span>{sliderMax}</span>
              </div>
            </div>
          </div>

          {noWords && (
            <p className="text-sm text-amber-600 mb-3">
              {"Save some words first to practice!"}
            </p>
          )}

          <button
            onClick={startPractice}
            disabled={!!noWords}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Practice
          </button>
        </div>
      </div>
    );
  }

  // Complete screen
  if (isComplete) {
    const percentage =
      score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    if (mode === "sentence-writing") {
      return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 text-center">
            <span className="text-5xl mb-4 block">🎉</span>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Practice Complete!
            </h2>
            <p className="text-gray-600 mb-4">
              You practiced {completedWords.length}{" "}
              {completedWords.length === 1 ? "word" : "words"} in sentence
              context.
            </p>
            <div className="space-y-2 mb-6 text-left">
              {completedWords.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-green-100 text-green-600 text-xs font-bold">
                    +
                  </span>
                  <span className="text-gray-700">{w}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStarted(false);
                  setWords([]);
                  setCompletedWords([]);
                }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                Practice Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }

    const emoji =
      percentage >= 80
        ? "🎉"
        : percentage >= 60
          ? "👍"
          : percentage >= 40
            ? "📝"
            : "💪";
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 text-center">
          <span className="text-5xl mb-4 block">{emoji}</span>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Practice Complete!
          </h2>
          <p className="text-4xl font-bold text-blue-500 mb-2">
            {score.correct}/{score.total}
          </p>
          <p className="text-gray-600 mb-6">{percentage}% accuracy</p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setStarted(false);
                setWords([]);
              }}
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              Practice Again
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Sentence-writing practice screen ---
  if (mode === "sentence-writing") {
    const examples = getExamples();
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Sentence Writing
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                {currentIndex + 1} / {words?.length ?? 0}
              </span>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-6 pb-4">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${((currentIndex + (writingStage === "feedback" ? 1 : 0)) / (words?.length || 1)) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="px-6 pb-6">
            {/* Prompt */}
            <div className="mb-4">
              <p className="text-gray-700">
                Write a sentence using{" "}
                <span className="font-bold text-blue-700">
                  {currentWord?.word}
                </span>
              </p>
              {currentWord?.translation && (
                <p className="text-sm text-gray-400 mt-1">
                  Hint: {currentWord.translation}
                </p>
              )}
            </div>

            {writingStage === "writing" && (
              <>
                <textarea
                  ref={textareaRef}
                  value={sentence}
                  onChange={(e) => {
                    setSentence(e.target.value);
                    if (sentenceError) setSentenceError("");
                  }}
                  onKeyDown={handleSentenceKeyDown}
                  placeholder="Type your sentence here..."
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  autoFocus
                />
                {sentenceError && (
                  <p className="text-sm text-red-500 mt-2">{sentenceError}</p>
                )}
                <button
                  onClick={handleSentenceSubmit}
                  className="mt-4 w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  Submit
                </button>
              </>
            )}

            {writingStage === "feedback" && (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-green-700 mb-1">
                    Your sentence
                  </p>
                  <p className="text-sm text-green-800">{sentence}</p>
                </div>

                {examples.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-gray-600 mb-2">
                      Saved examples for comparison
                    </p>
                    <ul className="space-y-1.5">
                      {examples.map((ex, i) => (
                        <li
                          key={i}
                          className="text-sm text-gray-700 leading-relaxed"
                        >
                          {ex}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={nextWord}
                  onKeyDown={handleSentenceKeyDown}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  {currentIndex + 1 >= (words?.length ?? 0)
                    ? "See Results"
                    : "Next Word"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Quiz/speak practice screen ---
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-500">
            {currentIndex + 1} of {words?.length ?? 0}
          </span>
          <span className="text-sm font-medium text-blue-500">
            {score.correct}/{score.total} correct
          </span>
        </div>

        {/* Progress */}
        <div className="h-2 bg-gray-200 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / (words?.length || 1)) * 100}%`,
            }}
          />
        </div>

        {/* Prompt */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-500 mb-2">
            {mode === "speak"
              ? "Say this word:"
              : mode === "translation-to-word"
                ? "Type the English word for:"
                : "Type the translation for:"}
          </p>
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === "speak"
              ? currentWord?.word
              : mode === "translation-to-word"
                ? currentWord?.translation
                : currentWord?.word}
          </h2>
        </div>

        {/* Input */}
        {mode === "speak" ? (
          <div className="mb-4 text-center">
            <button
              onClick={handleSpeak}
              disabled={isListening || showAnswer}
              className={`w-20 h-20 rounded-full text-3xl transition-all ${
                isListening
                  ? "bg-blue-100 text-blue-600 animate-pulse"
                  : showAnswer
                    ? result === "correct"
                      ? "bg-green-100"
                      : "bg-red-100"
                    : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {isListening ? "🎙️" : "🎤"}
            </button>
            {speechResult && (
              <p
                className={`mt-2 text-sm ${speechResult.isMatch ? "text-green-600" : "text-red-600"}`}
              >
                You said: "{speechResult.transcript}"
              </p>
            )}
          </div>
        ) : (
          <div className="mb-4">
            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={showAnswer}
              placeholder="Type your answer..."
              className={`w-full p-4 text-lg text-center rounded-xl border-2 transition-all focus:outline-none ${
                showAnswer
                  ? result === "correct"
                    ? "border-green-500 bg-green-50"
                    : "border-red-500 bg-red-50"
                  : "border-gray-200 focus:border-blue-500"
              }`}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* Feedback / Action */}
        {showAnswer ? (
          <div className="space-y-3">
            <div
              className={`p-3 rounded-xl text-center ${
                result === "correct"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {result === "correct" ? (
                "✓ Correct!"
              ) : (
                <span>
                  ✗ Correct answer:{" "}
                  <strong>
                    {mode === "speak"
                      ? currentWord?.word
                      : mode === "translation-to-word"
                        ? currentWord?.word
                        : currentWord?.translation}
                  </strong>
                </span>
              )}
            </div>
            <button
              onClick={nextWord}
              className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
            >
              {currentIndex + 1 < (words?.length ?? 0)
                ? "Next Word"
                : "See Results"}
            </button>
          </div>
        ) : mode !== "speak" ? (
          <button
            onClick={checkAnswer}
            disabled={!userInput.trim()}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Check Answer
          </button>
        ) : null}

        {mode !== "speak" && (
          <p className="text-xs text-gray-500 text-center mt-3">
            Press Enter to {showAnswer ? "continue" : "check"}
          </p>
        )}
      </div>
    </div>
  );
}
