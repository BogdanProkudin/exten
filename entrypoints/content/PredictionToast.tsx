import { useState, useEffect } from "react";
import type { WordPrediction } from "../../src/lib/prediction-engine";

export interface PredictionToastProps {
  prediction: WordPrediction;
  onClose: () => void;
  onLearnNow: (word: string) => void;
  onDismiss: (word: string) => void;
}

export function PredictionToast({ prediction, onClose, onLearnNow, onDismiss }: PredictionToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for animation
  };

  const handleLearnNow = () => {
    onLearnNow(prediction.word);
    handleClose();
  };

  const handleDismiss = () => {
    onDismiss(prediction.word);
    handleClose();
  };

  const getUrgencyColor = () => {
    if (prediction.urgency >= 0.8) return 'from-red-400 to-orange-500';
    if (prediction.urgency >= 0.6) return 'from-blue-400 to-indigo-500';
    return 'from-purple-400 to-pink-500';
  };

  const getUrgencyIcon = () => {
    if (prediction.urgency >= 0.8) return '🔥';
    if (prediction.urgency >= 0.6) return '⚡';
    return '🔮';
  };

  return (
    <div 
      className={`fixed bottom-24 right-4 z-50 max-w-80 transition-all duration-300 ${
        isVisible ? 'transform translate-y-0 opacity-100' : 'transform translate-y-4 opacity-0'
      }`}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      <div className={`bg-gradient-to-r ${getUrgencyColor()} rounded-xl p-4 text-white shadow-lg`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{getUrgencyIcon()}</span>
            <div>
              <h4 className="font-semibold text-sm">Word Prediction</h4>
              <p className="text-xs text-white/80">
                {Math.round(prediction.confidence * 100)}% likely to encounter
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Word */}
        <div className="mb-3">
          <h3 className="text-lg font-bold">{prediction.word}</h3>
          <div className="flex items-center gap-2 text-xs text-white/80">
            <span className="capitalize">{prediction.category}</span>
            {prediction.sources.length > 0 && (
              <>
                <span>•</span>
                <span>Expected on {prediction.sources[0].replace(/^www\./, '')}</span>
              </>
            )}
          </div>
        </div>

        {/* Context hint */}
        {prediction.contextHints.length > 0 && (
          <div className="mb-4 p-2 bg-white/10 rounded-lg">
            <p className="text-xs text-white/90">
              💡 {prediction.contextHints[0]}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleLearnNow}
            className="flex-1 py-2 px-3 bg-white text-gray-900 font-medium text-sm rounded-lg hover:bg-gray-100 transition-colors"
          >
            Learn Now
          </button>
          <button
            onClick={handleDismiss}
            className="py-2 px-3 bg-white/20 text-white font-medium text-sm rounded-lg hover:bg-white/30 transition-colors"
          >
            Later
          </button>
        </div>

        {/* Urgency indicator */}
        <div className="mt-2 flex items-center justify-center">
          <div className="flex space-x-1">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={`w-1 h-2 rounded-full ${
                  level <= prediction.urgency * 5
                    ? 'bg-white'
                    : 'bg-white/30'
                }`}
              />
            ))}
          </div>
          <span className="ml-2 text-xs text-white/80">
            {prediction.urgency >= 0.8 ? 'High' : 
             prediction.urgency >= 0.6 ? 'Medium' : 'Low'} priority
          </span>
        </div>
      </div>
    </div>
  );
}