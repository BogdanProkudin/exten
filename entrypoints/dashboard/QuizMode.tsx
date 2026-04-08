import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isSpeechRecognitionSupported, startListening, type SpeechResult } from "../../src/lib/speech-recognition";
interface QuizWord {
  _id: Id<"words">;
  word: string;
  translation: string;
}

interface QuizQuestion {
  word: QuizWord;
  options: string[];
  correctIndex: number;
}

interface QuizModeProps {
  deviceId: string;
  onClose: () => void;
}

export function QuizMode({ deviceId, onClose }: QuizModeProps) {
  const allWords = useQuery(api.words.getQuizWords, { deviceId, limit: 50 });
  const updateReview = useMutation(api.words.updateReview);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [quizComplete, setQuizComplete] = useState(false);
  const [quizType, setQuizType] = useState<"word-to-translation" | "translation-to-word">("word-to-translation");
  const [questionCount, setQuestionCount] = useState(10);
  const [started, setStarted] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechResult, setSpeechResult] = useState<SpeechResult | null>(null);

  // Generate quiz questions
  const generateQuestions = useCallback(() => {
    if (!allWords || allWords.length < 4) return;

    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length));

    const newQuestions: QuizQuestion[] = selected.map((word) => {
      const otherWords = allWords.filter((w) => w._id !== word._id);
      const wrongAnswers = otherWords
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((w) => quizType === "word-to-translation" ? w.translation : w.word);

      const correctAnswer = quizType === "word-to-translation" ? word.translation : word.word;
      const allOptions = [...wrongAnswers, correctAnswer].sort(() => Math.random() - 0.5);

      return {
        word,
        options: allOptions,
        correctIndex: allOptions.indexOf(correctAnswer),
      };
    });

    setQuestions(newQuestions);
    setCurrentIndex(0);
    setScore({ correct: 0, total: 0 });
    setQuizComplete(false);
    setStarted(true);
  }, [allWords, questionCount, quizType]);

  const handleAnswer = async (optionIndex: number) => {
    if (selectedAnswer !== null) return;

    const question = questions[currentIndex];
    const correct = optionIndex === question.correctIndex;

    setSelectedAnswer(optionIndex);
    setIsCorrect(correct);
    setScore((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
    }));

    // Update spaced repetition
    try {
      await updateReview({
        id: question.word._id,
        deviceId,
        remembered: correct,
      });
    } catch (e) {
      console.error("[Vocabify] Quiz review update failed:", e);
    }

    // Move to next question after delay
    setTimeout(() => {
      if (currentIndex + 1 >= questions.length) {
        setQuizComplete(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
        setSelectedAnswer(null);
        setIsCorrect(null);
        setSpeechResult(null);
      }
    }, 1500);
  };

  const handleSpeak = useCallback(async () => {
    if (isListening || !questions[currentIndex]) return;
    setIsListening(true);
    setSpeechResult(null);
    try {
      const result = await startListening(questions[currentIndex].word.word);
      setSpeechResult(result);
    } catch (e) {
      setSpeechResult({ transcript: (e as Error).message, confidence: 0, isMatch: false });
    } finally {
      setIsListening(false);
    }
  }, [isListening, questions, currentIndex]);

  const currentQuestion = questions[currentIndex];

  // Not enough words
  if (allWords && allWords.length < 4) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 text-center">
          <span className="text-4xl mb-4 block">&#128218;</span>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Need More Words</h2>
          <p className="text-gray-600 mb-4">
            Save at least 4 words to start a quiz. You have {allWords.length}.
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
            <h2 className="text-xl font-bold text-gray-900">&#127919; Quiz Mode</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Quiz Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setQuizType("word-to-translation")}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    quizType === "word-to-translation"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Word &rarr; Translation
                </button>
                <button
                  onClick={() => setQuizType("translation-to-word")}
                  className={`p-3 rounded-xl text-sm font-medium transition-all ${
                    quizType === "translation-to-word"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Translation &rarr; Word
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Questions: {questionCount}
              </label>
              <input
                type="range"
                min={5}
                max={Math.min(20, allWords.length)}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>5</span>
                <span>{Math.min(20, allWords.length)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={generateQuestions}
            className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors"
          >
            Start Quiz
          </button>
        </div>
      </div>
    );
  }

  // Quiz complete
  if (quizComplete) {
    const percentage = Math.round((score.correct / score.total) * 100);
    const emoji = percentage >= 80 ? "&#127881;" : percentage >= 60 ? "&#128077;" : percentage >= 40 ? "&#128218;" : "&#128170;";

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 text-center">
          <span className="text-5xl mb-4 block" dangerouslySetInnerHTML={{ __html: emoji }} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Quiz Complete!</h2>
          <p className="text-4xl font-bold text-blue-500 mb-2">
            {score.correct}/{score.total}
          </p>
          <p className="text-gray-600 mb-6">{percentage}% correct</p>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStarted(false);
                setQuestions([]);
              }}
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              New Quiz
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

  // Quiz question
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm text-gray-500">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-sm font-medium text-blue-500">
            Score: {score.correct}/{score.total}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-gray-200 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {/* Question */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-500 mb-2">
            {quizType === "word-to-translation" ? "What does this mean?" : "What's the English word?"}
          </p>
          <h2 className="text-2xl font-bold text-gray-900">
            {quizType === "word-to-translation"
              ? currentQuestion.word.word
              : currentQuestion.word.translation}
          </h2>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option, index) => {
            let buttonClass = "w-full p-4 rounded-xl text-left font-medium transition-all ";

            if (selectedAnswer !== null) {
              if (index === currentQuestion.correctIndex) {
                buttonClass += "bg-green-100 text-green-700 border-2 border-green-500";
              } else if (index === selectedAnswer) {
                buttonClass += "bg-red-100 text-red-700 border-2 border-red-500";
              } else {
                buttonClass += "bg-gray-100 text-gray-400";
              }
            } else {
              buttonClass += "bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer";
            }

            return (
              <button
                key={index}
                onClick={() => handleAnswer(index)}
                disabled={selectedAnswer !== null}
                className={buttonClass}
              >
                {option}
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {selectedAnswer !== null && (
          <div className={`mt-4 p-3 rounded-xl text-center ${
            isCorrect ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {isCorrect ? "\u2713 Correct!" : `\u2717 The answer was: ${currentQuestion.options[currentQuestion.correctIndex]}`}
          </div>
        )}

        {/* Pronunciation practice */}
        {selectedAnswer !== null && isSpeechRecognitionSupported() && (
          <div className="mt-3 text-center">
            <button
              onClick={handleSpeak}
              disabled={isListening}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                isListening ? "bg-blue-100 text-blue-600" :
                speechResult ? (speechResult.isMatch ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700") :
                "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {isListening ? "&#127908; Listening..." :
               speechResult ? (speechResult.isMatch ? `\u2705 "${speechResult.transcript}"` : `\u274C "${speechResult.transcript}"`) :
               "&#127908; Say this word"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
