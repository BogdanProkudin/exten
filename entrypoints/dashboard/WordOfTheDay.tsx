import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { speak } from "../../src/lib/tts";

interface WordOfTheDayProps {
  deviceId: string;
}

export function WordOfTheDay({ deviceId }: WordOfTheDayProps) {
  const [dismissed, setDismissed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const wordOfDay = useQuery(api.words.getWordOfTheDay, { deviceId });

  // Clear entrance animations after they complete so they can't flash on repaints
  useEffect(() => {
    const t = setTimeout(() => setAnimDone(true), 1000);
    return () => clearTimeout(t);
  }, []);

  // Check if already dismissed today
  useEffect(() => {
    const today = new Date().toDateString();
    chrome.storage.local.get("wotdDismissed").then((data) => {
      if (data.wotdDismissed === today) {
        setDismissed(true);
      }
    });
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    chrome.storage.local.set({ wotdDismissed: new Date().toDateString() });
  };

  const handleSpeak = () => {
    if (speaking || !wordOfDay) return;
    setSpeaking(true);
    speak(wordOfDay.word).then(() => setSpeaking(false)).catch(() => setSpeaking(false));
  };

  if (dismissed || !wordOfDay) {
    return null;
  }

  const strengthLabel = 
    wordOfDay.strength < 30 ? "Needs practice" :
    wordOfDay.strength < 60 ? "Getting there" :
    wordOfDay.strength < 80 ? "Almost mastered" : "Well known";

  const strengthColor =
    wordOfDay.strength < 30 ? "text-red-500" :
    wordOfDay.strength < 60 ? "text-amber-500" :
    wordOfDay.strength < 80 ? "text-blue-500" : "text-green-500";

  return (
    <div className="mb-6 p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/30 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-16 h-16 bg-orange-200/30 rounded-full translate-y-1/2 -translate-x-1/2" />
      
      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <span className="text-sm font-semibold text-amber-700">Word of the Day</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-amber-400 hover:text-amber-600 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Word */}
        <div className="flex items-center gap-3 mb-2" style={animDone ? undefined : { animation: "fadeInUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 150ms both" }}>
          <h3 className="text-2xl font-bold text-gray-900">{wordOfDay.word}</h3>
          <button
            onClick={handleSpeak}
            disabled={speaking}
            className="p-1.5 rounded-full bg-white/80 hover:bg-white hover:scale-110 transition-all text-amber-600"
          >
            {speaking ? (
              <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
        </div>

        {/* Translation */}
        <p className="text-lg text-gray-700 mb-3">{wordOfDay.translation}</p>

        {/* Context if available */}
        {wordOfDay.example && (
          <p className="text-sm text-gray-600 italic mb-3 line-clamp-2">
            "{wordOfDay.example}"
          </p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs" style={animDone ? undefined : { animation: "fadeInUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 250ms both" }}>
          <span className={`font-medium ${strengthColor}`}>
            {strengthLabel} ({wordOfDay.strength}%)
          </span>
          <span className="text-gray-500">
            Reviewed {wordOfDay.reviewCount} times
          </span>
        </div>

        {/* Strength bar */}
        <div className="mt-3 h-1.5 bg-amber-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${wordOfDay.strength}%`,
              background: wordOfDay.strength < 30 ? "#ef4444" : wordOfDay.strength < 60 ? "#f59e0b" : wordOfDay.strength < 80 ? "#3b82f6" : "#22c55e",
              transformOrigin: "left",
              ...(animDone ? {} : { animation: "strengthBarFill 600ms ease-out 400ms both" }),
            }}
          />
        </div>
      </div>
    </div>
  );
}
