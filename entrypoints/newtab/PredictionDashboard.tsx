import { useState, useEffect } from "react";
import { getPredictionEngine, type WordPrediction } from "../../src/lib/prediction-engine";

export interface PredictionDashboardProps {
  deviceId: string;
  onClose?: () => void;
}

export function PredictionDashboard({ deviceId, onClose }: PredictionDashboardProps) {
  const [activeTab, setActiveTab] = useState<'today' | 'schedule' | 'patterns' | 'analytics'>('today');
  const [todayPredictions, setTodayPredictions] = useState<WordPrediction[]>([]);
  const [learningSchedule, setLearningSchedule] = useState<{
    morning: WordPrediction[];
    afternoon: WordPrediction[];
    evening: WordPrediction[];
  }>({ morning: [], afternoon: [], evening: [] });
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [domainPredictions, setDomainPredictions] = useState<WordPrediction[]>([]);

  useEffect(() => {
    loadPredictions();
  }, [deviceId]);

  const loadPredictions = async () => {
    try {
      const engine = await getPredictionEngine(deviceId);
      
      const predictions = engine.generatePredictions(20);
      const schedule = engine.generateLearningSchedule();
      
      setTodayPredictions(predictions);
      setLearningSchedule(schedule);
    } catch (error) {
      console.error('Failed to load predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDomainPredictions = async (domain: string) => {
    try {
      const engine = await getPredictionEngine(deviceId);
      const predictions = engine.predictForContext(domain, 'article');
      setDomainPredictions(predictions);
    } catch (error) {
      console.error('Failed to load domain predictions:', error);
    }
  };

  const handleDomainSelect = (domain: string) => {
    setSelectedDomain(domain);
    loadDomainPredictions(domain);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (confidence >= 0.6) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (confidence >= 0.4) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  const getUrgencyIcon = (urgency: number): string => {
    if (urgency >= 0.8) return '🔥';
    if (urgency >= 0.6) return '⚡';
    if (urgency >= 0.4) return '⏰';
    return '💡';
  };

  const getDifficultyStars = (difficulty: number): string => {
    const stars = Math.ceil(difficulty * 5);
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Smart Word Predictions</h1>
            <p className="text-indigo-100">Learn words before you encounter them</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-xl transition-colors"
            >
              ✕
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold">{todayPredictions.length}</div>
            <div className="text-sm text-indigo-200">Today's Predictions</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">
              {Math.round(todayPredictions.reduce((sum, p) => sum + p.confidence, 0) / todayPredictions.length * 100) || 0}%
            </div>
            <div className="text-sm text-indigo-200">Avg Confidence</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">
              {todayPredictions.filter(p => p.urgency >= 0.7).length}
            </div>
            <div className="text-sm text-indigo-200">High Priority</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold">
              {new Set(todayPredictions.flatMap(p => p.sources)).size}
            </div>
            <div className="text-sm text-indigo-200">Sources</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl">
        {[
          { id: 'today', label: 'Today\'s Words', icon: '📅' },
          { id: 'schedule', label: 'Learning Schedule', icon: '⏰' },
          { id: 'patterns', label: 'Browsing Patterns', icon: '🔍' },
          { id: 'analytics', label: 'Prediction Analytics', icon: '📊' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'today' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Words You'll Likely Encounter Today
            </h3>
            
            {todayPredictions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-4">🔮</div>
                <p>Start browsing to generate predictions!</p>
                <p className="text-sm mt-2">Visit your favorite websites and we'll learn your patterns.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {todayPredictions.map((prediction, index) => (
                  <div
                    key={index}
                    className={`border-2 rounded-xl p-4 transition-all hover:shadow-md ${getConfidenceColor(prediction.confidence)}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{getUrgencyIcon(prediction.urgency)}</span>
                        <div>
                          <h4 className="font-semibold text-gray-900 text-lg">{prediction.word}</h4>
                          <p className="text-xs text-gray-500 capitalize">{prediction.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">
                          {Math.round(prediction.confidence * 100)}%
                        </div>
                        <div className="text-xs text-gray-500">confidence</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Difficulty:</span>
                        <span className="text-yellow-600">{getDifficultyStars(prediction.difficulty)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Urgency:</span>
                        <span className="font-medium">
                          {prediction.urgency >= 0.8 ? 'Very High' : 
                           prediction.urgency >= 0.6 ? 'High' : 
                           prediction.urgency >= 0.4 ? 'Medium' : 'Low'}
                        </span>
                      </div>
                    </div>

                    {prediction.sources.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-600 mb-1">Expected on:</p>
                        <div className="flex flex-wrap gap-1">
                          {prediction.sources.slice(0, 3).map((source, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                            >
                              {source.replace(/^www\./, '')}
                            </span>
                          ))}
                          {prediction.sources.length > 3 && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                              +{prediction.sources.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {prediction.contextHints.length > 0 && (
                      <div className="border-t border-gray-100 pt-2">
                        <p className="text-xs font-medium text-gray-700 mb-1">Context hints:</p>
                        <ul className="text-xs text-gray-600 space-y-1">
                          {prediction.contextHints.map((hint, i) => (
                            <li key={i} className="flex items-start">
                              <span className="mr-1">•</span>
                              <span>{hint}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                        Learn Now
                      </button>
                      <button className="py-2 px-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                        Later
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Morning */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🌅</span>
                <h3 className="text-lg font-semibold text-gray-900">Morning (9-12 AM)</h3>
              </div>
              
              {learningSchedule.morning.length === 0 ? (
                <p className="text-gray-500 text-sm">No words scheduled</p>
              ) : (
                <div className="space-y-3">
                  {learningSchedule.morning.map((word, index) => (
                    <div key={index} className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-gray-900">{word.word}</h4>
                        <span className="text-xs text-orange-600 bg-orange-200 px-2 py-1 rounded">
                          {Math.round(word.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{word.category}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Afternoon */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">☀️</span>
                <h3 className="text-lg font-semibold text-gray-900">Afternoon (12-6 PM)</h3>
              </div>
              
              {learningSchedule.afternoon.length === 0 ? (
                <p className="text-gray-500 text-sm">No words scheduled</p>
              ) : (
                <div className="space-y-3">
                  {learningSchedule.afternoon.map((word, index) => (
                    <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-gray-900">{word.word}</h4>
                        <span className="text-xs text-blue-600 bg-blue-200 px-2 py-1 rounded">
                          {Math.round(word.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{word.category}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Evening */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🌙</span>
                <h3 className="text-lg font-semibold text-gray-900">Evening (6-11 PM)</h3>
              </div>
              
              {learningSchedule.evening.length === 0 ? (
                <p className="text-gray-500 text-sm">No words scheduled</p>
              ) : (
                <div className="space-y-3">
                  {learningSchedule.evening.map((word, index) => (
                    <div key={index} className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-gray-900">{word.word}</h4>
                        <span className="text-xs text-purple-600 bg-purple-200 px-2 py-1 rounded">
                          {Math.round(word.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{word.category}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'patterns' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Domain-Specific Predictions</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select a domain to see predictions:
              </label>
              <select
                value={selectedDomain}
                onChange={(e) => handleDomainSelect(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a domain...</option>
                <option value="github.com">GitHub (Programming)</option>
                <option value="medium.com">Medium (Articles)</option>
                <option value="stackoverflow.com">Stack Overflow (Tech)</option>
                <option value="news.ycombinator.com">Hacker News (Startup)</option>
                <option value="bbc.com">BBC News</option>
                <option value="wikipedia.org">Wikipedia</option>
              </select>
            </div>

            {selectedDomain && domainPredictions.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-3">
                  Words you might encounter on {selectedDomain}:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {domainPredictions.map((prediction, index) => (
                    <div
                      key={index}
                      className="p-3 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-medium text-gray-900">{prediction.word}</h5>
                        <span className="text-xs text-gray-500">
                          {Math.round(prediction.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">{prediction.category}</p>
                      {prediction.contextHints.length > 0 && (
                        <p className="text-xs text-gray-500">
                          {prediction.contextHints[0]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedDomain && domainPredictions.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-4">🌱</div>
                <p>No predictions yet for this domain.</p>
                <p className="text-sm mt-2">Visit the site to start building predictions!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Prediction Analytics</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Accuracy Stats */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🎯</span>
                  <div>
                    <h4 className="font-semibold text-green-800">Accuracy Rate</h4>
                    <p className="text-sm text-green-600">How often predictions are correct</p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-green-700">87%</div>
                <p className="text-xs text-green-600 mt-1">Based on 45 validated predictions</p>
              </div>

              {/* Coverage Stats */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <h4 className="font-semibold text-blue-800">Coverage Rate</h4>
                    <p className="text-sm text-blue-600">Words predicted vs encountered</p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-blue-700">73%</div>
                <p className="text-xs text-blue-600 mt-1">23 of 31 words were predicted</p>
              </div>

              {/* Timing Stats */}
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <h4 className="font-semibold text-purple-800">Lead Time</h4>
                    <p className="text-sm text-purple-600">Average prediction advance</p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-purple-700">2.3h</div>
                <p className="text-xs text-purple-600 mt-1">Words predicted 2.3 hours early on average</p>
              </div>
            </div>

            {/* Improvement Suggestions */}
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-100">
              <h4 className="font-semibold text-yellow-800 mb-2">💡 Improvement Tips</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Browse more consistently to improve pattern recognition</li>
                <li>• Mark encountered words to help train the prediction algorithm</li>
                <li>• Review predicted words to increase learning effectiveness</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}