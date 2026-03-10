import { useState, useEffect } from "react";
import { getPredictionEngine, type WordPrediction } from "../../src/lib/prediction-engine";

export interface PredictionWidgetProps {
  deviceId: string;
  onClose: () => void;
  onWordSelect: (word: string) => void;
}

export function PredictionWidget({ deviceId, onClose, onWordSelect }: PredictionWidgetProps) {
  const [predictions, setPredictions] = useState<WordPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadPredictions();
  }, [deviceId]);

  const loadPredictions = async () => {
    try {
      const engine = await getPredictionEngine(deviceId);
      const currentDomain = window.location.hostname;
      
      // Get both general and domain-specific predictions
      const generalPredictions = engine.generatePredictions(10);
      const domainPredictions = engine.predictForContext(currentDomain, 'article');
      
      // Combine and deduplicate
      const allPredictions = [...generalPredictions];
      domainPredictions.forEach(dp => {
        if (!allPredictions.find(gp => gp.word === dp.word)) {
          allPredictions.push(dp);
        }
      });
      
      // Sort by combined score
      allPredictions.sort((a, b) => {
        const scoreA = (a.confidence * 0.6) + (a.urgency * 0.4);
        const scoreB = (b.confidence * 0.6) + (b.urgency * 0.4);
        return scoreB - scoreA;
      });
      
      setPredictions(allPredictions.slice(0, 15));
    } catch (error) {
      console.error('Failed to load predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = ['all', ...new Set(predictions.map(p => p.category))];
  const filteredPredictions = selectedCategory === 'all' 
    ? predictions 
    : predictions.filter(p => p.category === selectedCategory);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-blue-600';
    if (confidence >= 0.4) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getPriorityLabel = (prediction: WordPrediction): string => {
    const score = (prediction.confidence * 0.6) + (prediction.urgency * 0.4);
    if (score >= 0.8) return 'Critical';
    if (score >= 0.6) return 'High';
    if (score >= 0.4) return 'Medium';
    return 'Low';
  };

  const getPriorityColor = (prediction: WordPrediction): string => {
    const score = (prediction.confidence * 0.6) + (prediction.urgency * 0.4);
    if (score >= 0.8) return 'bg-red-100 text-red-800 border-red-200';
    if (score >= 0.6) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (score >= 0.4) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="fixed top-4 right-4 z-50 w-96 max-h-[80vh] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔮</span>
            <h3 className="font-semibold">Smart Predictions</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-purple-100">
          Words you're likely to encounter {window.location.hostname.includes('.') ? `on ${window.location.hostname}` : 'today'}
        </p>
      </div>

      {/* Category Filter */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex gap-1 overflow-x-auto">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                selectedCategory === category
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {category === 'all' ? 'All' : category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Analyzing your patterns...</p>
          </div>
        ) : filteredPredictions.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <div className="text-3xl mb-3">🌱</div>
            <p className="text-sm">No predictions available yet.</p>
            <p className="text-xs mt-1">Keep browsing to build your learning patterns!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredPredictions.map((prediction, index) => (
              <div
                key={index}
                className="p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => onWordSelect(prediction.word)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-gray-900">{prediction.word}</h4>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="capitalize">{prediction.category}</span>
                      <span>•</span>
                      <span className={getPriorityColor(prediction)}>{getPriorityLabel(prediction)} priority</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${getConfidenceColor(prediction.confidence)}`}>
                      {Math.round(prediction.confidence * 100)}%
                    </div>
                    <div className="text-xs text-gray-500">confidence</div>
                  </div>
                </div>

                {/* Sources */}
                {prediction.sources.length > 0 && (
                  <div className="mb-2">
                    <div className="flex flex-wrap gap-1">
                      {prediction.sources.slice(0, 2).map((source, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
                        >
                          {source.replace(/^www\./, '')}
                        </span>
                      ))}
                      {prediction.sources.length > 2 && (
                        <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-xs">
                          +{prediction.sources.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Context Hint */}
                {prediction.contextHints.length > 0 && (
                  <div className="bg-purple-50 rounded p-2 border border-purple-100">
                    <p className="text-xs text-purple-700">
                      💡 {prediction.contextHints[0]}
                    </p>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-gray-500">
                    <span>
                      Difficulty: {'★'.repeat(Math.ceil(prediction.difficulty * 3))}{'☆'.repeat(3 - Math.ceil(prediction.difficulty * 3))}
                    </span>
                    <span>
                      Urgency: {prediction.urgency >= 0.8 ? '🔥' : prediction.urgency >= 0.6 ? '⚡' : '⏰'}
                    </span>
                  </div>
                  <button
                    className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onWordSelect(prediction.word);
                    }}
                  >
                    Learn
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>
            {filteredPredictions.length} word{filteredPredictions.length !== 1 ? 's' : ''} predicted
          </span>
          <button
            onClick={onClose}
            className="text-purple-600 hover:text-purple-700 font-medium"
          >
            View Full Dashboard →
          </button>
        </div>
      </div>
    </div>
  );
}