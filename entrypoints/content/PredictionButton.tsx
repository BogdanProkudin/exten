export interface PredictionButtonProps {
  onClick: () => void;
}

export function PredictionButton({ onClick }: PredictionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-36 right-4 z-40 w-12 h-12 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-lg font-bold group"
      title="Smart Word Predictions (Ctrl+Shift+P)"
    >
      <span className="transform group-hover:scale-110 transition-transform">🔮</span>
      
      {/* Tooltip */}
      <div className="absolute right-full mr-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-gray-900 text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap">
          Smart Predictions
          <div className="text-xs text-gray-300 mt-1">Ctrl+Shift+P</div>
          <div className="absolute left-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-l-4 border-l-gray-900 border-t-4 border-t-transparent border-b-4 border-b-transparent"></div>
        </div>
      </div>
    </button>
  );
}