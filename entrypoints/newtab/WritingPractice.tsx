import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isSpeechRecognitionSupported, startListening, type SpeechResult } from "../../src/lib/speech-recognition";

interface WritingPracticeProps {
  deviceId: string;
  onClose: () => void;
}

export function WritingPractice({ deviceId, onClose }: WritingPracticeProps) {
  const allWords = useQuery(api.words.getQuizWords, { deviceId, limit: 50 });
  const updateReview = useMutation(api.words.updateReview);
  
  const [words, setWords] = useState<typeof allWords>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [result, setResult] = useState<"correct" | "incorrect" | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<"translation-to-word" | "word-to-translation" | "speak">("translation-to-word");
  const [questionCount, setQuestionCount] = useState(10);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechResult, setSpeechResult] = useState<SpeechResult | null>(null);

  const startPractice = useCallback(() => {
    if (!allWords || allWords.length === 0) return;
    const shuffled = [...allWords].sort(() => Math.random() - 0.5).slice(0, questionCount);
    setWords(shuffled);
    setCurrentIndex(0);
    setScore({ correct: 0, total: 0 });
    setStarted(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [allWords, questionCount]);

  const currentWord = words?.[currentIndex];
  const isComplete = started && currentIndex >= (words?.length ?? 0);

  const checkAnswer = useCallback(async () => {
    if (!currentWord || showAnswer) return;

    const correctAnswer = mode === "translation-to-word" 
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

    // Update spaced repetition
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
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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

      // Auto-check: treat speech result like an answer
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
      setSpeechResult({ transcript: (e as Error).message, confidence: 0, isMatch: false });
    } finally {
      setIsListening(false);
    }
  }, [isListening, currentWord, showAnswer, updateReview, deviceId]);

  // Not enough words
  if (allWords && allWords.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 text-center">
          <span className="text-4xl mb-4 block">✍️</span>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No Words Yet</h2>
          <p className="text-gray-600 mb-4">
            Save some words first to practice writing!
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (!allWords) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // Setup screen
  if (!started) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">✍️ Writing Practice</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>

          <p className="text-sm text-gray-600 mb-4">
            Practice spelling by typing words from memory. Great for cementing vocabulary!
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Practice Type</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setMode("translation-to-word")}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    mode === "translation-to-word"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Translation → Word
                </button>
                <button
                  onClick={() => setMode("word-to-translation")}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    mode === "word-to-translation"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Word → Translation
                </button>
                <button
                  onClick={() => setMode("speak")}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    mode === "speak"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  🎤 Speak Mode
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Words: {questionCount}
              </label>
              <input
                type="range"
                min={5}
                max={Math.min(20, allWords.length)}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>

          <button
            onClick={startPractice}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
          >
            Start Practice
          </button>
        </div>
      </div>
    );
  }

  // Complete screen
  if (isComplete) {
    const percentage = Math.round((score.correct / score.total) * 100);
    const emoji = percentage >= 80 ? "🎉" : percentage >= 60 ? "👍" : percentage >= 40 ? "📝" : "💪";

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 text-center">
          <span className="text-5xl mb-4 block">{emoji}</span>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Practice Complete!</h2>
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

  // Practice screen
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
            style={{ width: `${((currentIndex + 1) / (words?.length || 1)) * 100}%` }}
          />
        </div>

        {/* Prompt */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-500 mb-2">
            {mode === "speak" ? "Say this word:" : mode === "translation-to-word" ? "Type the English word for:" : "Type the translation for:"}
          </p>
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === "speak" ? currentWord?.word : mode === "translation-to-word" ? currentWord?.translation : currentWord?.word}
          </h2>
        </div>

        {/* Input */}
        {mode === "speak" ? (
          <div className="mb-4 text-center">
            <button
              onClick={handleSpeak}
              disabled={isListening || showAnswer}
              className={`w-20 h-20 rounded-full text-3xl transition-all ${
                isListening ? "bg-blue-100 text-blue-600 animate-pulse" :
                showAnswer ? (result === "correct" ? "bg-green-100" : "bg-red-100") :
                "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {isListening ? "🎙️" : "🎤"}
            </button>
            {speechResult && (
              <p className={`mt-2 text-sm ${speechResult.isMatch ? "text-green-600" : "text-red-600"}`}>
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
            <div className={`p-3 rounded-xl text-center ${
              result === "correct" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}>
              {result === "correct" ? (
                "✓ Correct!"
              ) : (
                <span>
                  ✗ Correct answer: <strong>
                    {mode === "speak" ? currentWord?.word : mode === "translation-to-word" ? currentWord?.word : currentWord?.translation}
                  </strong>
                </span>
              )}
            </div>
            <button
              onClick={nextWord}
              className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
            >
              {currentIndex + 1 < (words?.length ?? 0) ? "Next Word" : "See Results"}
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
