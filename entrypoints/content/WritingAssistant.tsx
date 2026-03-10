import { useState, useEffect, useRef } from "react";
import { getWritingAssistant, type WritingSuggestion, type WritingAnalysis } from "../../src/lib/ai-writing-assistant";

export interface WritingAssistantProps {
  targetElement: HTMLElement;
  onClose: () => void;
}

export function WritingAssistant({ targetElement, onClose }: WritingAssistantProps) {
  const [suggestions, setSuggestions] = useState<WritingSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [showDetailed, setShowDetailed] = useState(false);
  const [analysis, setAnalysis] = useState<WritingAnalysis | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastAnalysisRef = useRef<string>('');

  useEffect(() => {
    if (!isEnabled) return;

    const handleInput = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        await analyzeText();
      }, 1500); // Wait 1.5 seconds after user stops typing
    };

    const handleKeyUp = () => {
      // Quick analysis for urgent fixes
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        await getInstantSuggestions();
      }, 500); // Faster response for instant suggestions
    };

    targetElement.addEventListener('input', handleInput);
    targetElement.addEventListener('keyup', handleKeyUp);

    return () => {
      targetElement.removeEventListener('input', handleInput);
      targetElement.removeEventListener('keyup', handleKeyUp);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [targetElement, isEnabled]);

  const analyzeText = async () => {
    if (!isEnabled) return;

    const text = getElementText();
    if (!text || text.length < 10 || text === lastAnalysisRef.current) return;

    try {
      setIsAnalyzing(true);
      const assistant = await getWritingAssistant();
      if (!assistant) return;

      const context = assistant.getWritingContext(targetElement);
      const fullContext = {
        textBefore: '',
        textAfter: '',
        selectedText: '',
        ...context,
        inputType: context.inputType || 'other',
        domain: context.domain || window.location.hostname,
        userLevel: context.userLevel || 'B1',
        targetLanguage: context.targetLanguage || 'en'
      };

      const result = await assistant.analyzeWriting(text, fullContext);
      setAnalysis(result);
      setSuggestions(result.suggestions.filter(s => s.severity === 'error' || s.severity === 'warning'));
      lastAnalysisRef.current = text;
    } catch (error) {
      console.error('Writing analysis failed:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getInstantSuggestions = async () => {
    if (!isEnabled) return;

    const text = getElementText();
    if (!text || text.length < 20) return;

    try {
      const assistant = await getWritingAssistant();
      if (!assistant) return;

      const cursorPosition = getCursorPosition();
      const context = assistant.getWritingContext(targetElement);
      const fullContext = {
        textBefore: '',
        textAfter: '',
        selectedText: '',
        ...context,
        inputType: context.inputType || 'other',
        domain: context.domain || window.location.hostname,
        userLevel: context.userLevel || 'B1',
        targetLanguage: context.targetLanguage || 'en'
      };

      const instantSuggestions = await assistant.getInstantSuggestions(text, cursorPosition, fullContext);
      if (instantSuggestions.length > 0) {
        setSuggestions(instantSuggestions);
      }
    } catch (error) {
      console.error('Instant suggestions failed:', error);
    }
  };

  const getElementText = (): string => {
    if (targetElement.tagName.toLowerCase() === 'input' || targetElement.tagName.toLowerCase() === 'textarea') {
      return (targetElement as HTMLInputElement | HTMLTextAreaElement).value;
    }
    if (targetElement.isContentEditable) {
      return targetElement.innerText || targetElement.textContent || '';
    }
    return '';
  };

  const getCursorPosition = (): number => {
    if (targetElement.tagName.toLowerCase() === 'input' || targetElement.tagName.toLowerCase() === 'textarea') {
      return (targetElement as HTMLInputElement | HTMLTextAreaElement).selectionStart || 0;
    }
    if (targetElement.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        return selection.getRangeAt(0).startOffset;
      }
    }
    return 0;
  };

  const applySuggestion = async (suggestion: WritingSuggestion) => {
    const text = getElementText();
    const newText = text.replace(suggestion.original, suggestion.suggestion);
    
    if (targetElement.tagName.toLowerCase() === 'input' || targetElement.tagName.toLowerCase() === 'textarea') {
      (targetElement as HTMLInputElement | HTMLTextAreaElement).value = newText;
    } else if (targetElement.isContentEditable) {
      targetElement.innerText = newText;
    }

    // Trigger input event so other listeners know about the change
    targetElement.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Remove applied suggestion from list
    setSuggestions(prev => prev.filter(s => s !== suggestion));
  };

  const getSuggestionColor = (suggestion: WritingSuggestion): string => {
    switch (suggestion.severity) {
      case 'error': return 'border-red-200 bg-red-50';
      case 'warning': return 'border-yellow-200 bg-yellow-50';
      case 'suggestion': return 'border-blue-200 bg-blue-50';
      case 'enhancement': return 'border-green-200 bg-green-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const getSuggestionIcon = (suggestion: WritingSuggestion): string => {
    switch (suggestion.type) {
      case 'grammar': return '📝';
      case 'vocabulary': return '📚';
      case 'style': return '✨';
      case 'clarity': return '💡';
      case 'tone': return '🎭';
      default: return '💭';
    }
  };

  const position = getElementPosition();

  return (
    <div 
      className="fixed z-50 w-80 bg-white rounded-xl shadow-xl border border-gray-200"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">✍️</span>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">AI Writing Assistant</h3>
            <p className="text-xs text-gray-500">
              {isAnalyzing ? 'Analyzing...' : `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`w-8 h-4 rounded-full transition-colors relative ${
              isEnabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${
              isEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg ml-2"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {isAnalyzing && (
          <div className="p-4 text-center">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-500">Analyzing your writing...</p>
          </div>
        )}

        {!isAnalyzing && suggestions.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            <div className="text-2xl mb-2">✅</div>
            <p className="text-sm">Your writing looks great!</p>
            <p className="text-xs mt-1">Keep typing for real-time suggestions.</p>
          </div>
        )}

        {!isAnalyzing && suggestions.length > 0 && (
          <div className="divide-y divide-gray-100">
            {suggestions.map((suggestion, index) => (
              <div key={index} className={`p-3 border-l-4 ${getSuggestionColor(suggestion)}`}>
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">{getSuggestionIcon(suggestion)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700 capitalize">
                        {suggestion.type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded text-white ${
                        suggestion.severity === 'error' ? 'bg-red-500' :
                        suggestion.severity === 'warning' ? 'bg-yellow-500' :
                        suggestion.severity === 'suggestion' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}>
                        {suggestion.severity}
                      </span>
                      <span className="text-xs text-gray-500">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                    </div>
                    
                    <div className="mb-2">
                      <div className="text-sm text-gray-600 mb-1">
                        Original: <span className="bg-red-100 px-1 rounded">{suggestion.original}</span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Suggested: <span className="bg-green-100 px-1 rounded">{suggestion.suggestion}</span>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-600 mb-2">{suggestion.explanation}</p>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => applySuggestion(suggestion)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => setSuggestions(prev => prev.filter(s => s !== suggestion))}
                        className="px-3 py-1 border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-50 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with detailed analysis button */}
      {analysis && (
        <div className="p-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setShowDetailed(!showDetailed)}
            className="w-full text-xs text-purple-600 hover:text-purple-700 font-medium"
          >
            {showDetailed ? 'Hide' : 'Show'} detailed analysis →
          </button>
          
          {showDetailed && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded p-2">
                  <div className="font-medium text-gray-700">Tone</div>
                  <div className="text-gray-600 capitalize">{analysis.overallTone}</div>
                </div>
                <div className="bg-white rounded p-2">
                  <div className="font-medium text-gray-700">Level</div>
                  <div className="text-gray-600">{analysis.estimatedLevel}</div>
                </div>
                <div className="bg-white rounded p-2">
                  <div className="font-medium text-gray-700">Readability</div>
                  <div className="text-gray-600">{analysis.readabilityScore}/100</div>
                </div>
                <div className="bg-white rounded p-2">
                  <div className="font-medium text-gray-700">Enhancements</div>
                  <div className="text-gray-600">{analysis.vocabularyEnhancements.length}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  function getElementPosition(): { x: number; y: number } {
    const rect = targetElement.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    
    // Position to the right of the element
    let x = rect.right + scrollX + 10;
    let y = rect.top + scrollY;
    
    // Keep within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (x + 320 > viewportWidth + scrollX) {
      x = rect.left + scrollX - 330; // Position to the left instead
    }
    
    if (y + 300 > viewportHeight + scrollY) {
      y = Math.max(scrollY + 10, viewportHeight + scrollY - 310);
    }
    
    return { x: Math.max(10, x), y: Math.max(10, y) };
  }
}