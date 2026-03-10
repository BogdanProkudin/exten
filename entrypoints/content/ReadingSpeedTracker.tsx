import { useState, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ConvexClientProvider } from "../../src/lib/convex-provider";

export interface ReadingSpeedTrackerProps {
  deviceId: string;
  onClose: () => void;
}

interface ReadingSession {
  startTime: number;
  wordCount: number;
  contentType: string; // 'article', 'youtube', 'social', 'other'
  domain: string;
  language: string;
  comprehensionScore?: number; // 1-5 rating user gives themselves
}

function ReadingSpeedTrackerInner({ deviceId, onClose }: ReadingSpeedTrackerProps) {
  const [currentSession, setCurrentSession] = useState<ReadingSession | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [showComprehensionModal, setShowComprehensionModal] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const saveReadingSession = useMutation(api.analytics.saveReadingSession);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-detect content type based on current page
  const detectContentType = (): { type: string; domain: string } => {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return { type: 'youtube', domain: hostname };
    }
    if (hostname.includes('twitter.com') || hostname.includes('x.com') || hostname.includes('facebook.com') || hostname.includes('instagram.com')) {
      return { type: 'social', domain: hostname };
    }
    if (pathname.includes('news') || hostname.includes('bbc.com') || hostname.includes('cnn.com') || hostname.includes('reuters.com')) {
      return { type: 'news', domain: hostname };
    }
    if (hostname.includes('wikipedia.org')) {
      return { type: 'reference', domain: hostname };
    }
    return { type: 'article', domain: hostname };
  };

  // Count words in visible text
  const countWordsOnPage = (): number => {
    const textContent = document.body.innerText || '';
    // Basic word counting - can be enhanced
    return textContent.trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const startTracking = () => {
    const { type, domain } = detectContentType();
    const words = countWordsOnPage();
    
    setCurrentSession({
      startTime: Date.now(),
      wordCount: words,
      contentType: type,
      domain,
      language: 'auto-detect', // Could enhance with language detection
    });
    
    setWordCount(words);
    setIsTracking(true);
    setElapsedTime(0);
    
    // Update elapsed time every second
    intervalRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
  };

  const stopTracking = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
    setShowComprehensionModal(true);
  };

  const finishSession = async (comprehensionScore: number) => {
    if (!currentSession) return;
    
    const totalTime = Math.floor((Date.now() - currentSession.startTime) / 1000);
    const wpm = totalTime > 0 ? Math.round((currentSession.wordCount / totalTime) * 60) : 0;
    
    await saveReadingSession({
      deviceId,
      wordCount: currentSession.wordCount,
      timeSeconds: totalTime,
      wpm,
      contentType: currentSession.contentType,
      domain: currentSession.domain,
      language: currentSession.language,
      comprehensionScore,
      timestamp: new Date().toISOString(),
    });
    
    setShowComprehensionModal(false);
    setCurrentSession(null);
    setElapsedTime(0);
    onClose();
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getCurrentWPM = (): number => {
    if (!currentSession || elapsedTime === 0) return 0;
    return Math.round((currentSession.wordCount / elapsedTime) * 60);
  };

  const getContentTypeIcon = (type: string): string => {
    switch (type) {
      case 'youtube': return '🎥';
      case 'social': return '💬';
      case 'news': return '📰';
      case 'reference': return '📚';
      default: return '📄';
    }
  };

  const getContentTypeColor = (type: string): string => {
    switch (type) {
      case 'youtube': return 'from-red-500 to-red-600';
      case 'social': return 'from-blue-500 to-blue-600';
      case 'news': return 'from-green-500 to-green-600';
      case 'reference': return 'from-purple-500 to-purple-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  if (showComprehensionModal) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">How well did you understand?</h3>
          
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Reading time:</span>
                <span className="font-medium">{formatTime(elapsedTime)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Words read:</span>
                <span className="font-medium">{wordCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Current WPM:</span>
                <span className="font-medium text-blue-600">{getCurrentWPM()}</span>
              </div>
            </div>
            
            <div>
              <p className="text-sm text-gray-600 mb-3">Rate your comprehension (1-5):</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    onClick={() => finishSession(score)}
                    className={`flex-1 py-3 rounded-lg border-2 transition-all hover:scale-105 ${
                      score <= 2
                        ? 'border-red-200 bg-red-50 hover:bg-red-100 text-red-700'
                        : score === 3
                        ? 'border-yellow-200 bg-yellow-50 hover:bg-yellow-100 text-yellow-700'
                        : 'border-green-200 bg-green-50 hover:bg-green-100 text-green-700'
                    }`}
                  >
                    <div className="text-lg font-bold">{score}</div>
                    <div className="text-xs">
                      {score === 1 ? 'Poor' : score === 2 ? 'Fair' : score === 3 ? 'Good' : score === 4 ? 'Very Good' : 'Excellent'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 min-w-[280px]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h3 className="font-semibold text-gray-900">Reading Tracker</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {!isTracking ? (
          <div className="space-y-4">
            <div className="text-center">
              <div className="bg-gray-50 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-2xl">{getContentTypeIcon(detectContentType().type)}</span>
                  <div className="text-left">
                    <div className="text-sm font-medium text-gray-900">
                      {detectContentType().type.charAt(0).toUpperCase() + detectContentType().type.slice(1)}
                    </div>
                    <div className="text-xs text-gray-500">{detectContentType().domain}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  ~{countWordsOnPage().toLocaleString()} words detected
                </div>
              </div>
              
              <button
                onClick={startTracking}
                className={`w-full py-3 rounded-lg bg-gradient-to-r ${getContentTypeColor(detectContentType().type)} text-white font-medium hover:shadow-lg transition-all`}
              >
                Start Reading Session
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-blue-600 font-medium">Active Session</span>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Time:</span>
                  <span className="font-medium">{formatTime(elapsedTime)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Words:</span>
                  <span className="font-medium">{wordCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Current WPM:</span>
                  <span className="font-medium text-blue-600">{getCurrentWPM()}</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={stopTracking}
              className="w-full py-2 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-900 transition-colors"
            >
              Finish Session
            </button>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-500 text-center">
            Track your reading progress across different content types
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReadingSpeedTracker(props: ReadingSpeedTrackerProps) {
  return (
    <ConvexClientProvider>
      <ReadingSpeedTrackerInner {...props} />
    </ConvexClientProvider>
  );
}