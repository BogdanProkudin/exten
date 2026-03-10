import { useState, useEffect } from "react";
import { ReadingSpeedTracker } from "./ReadingSpeedTracker";
import { getDeviceId } from "../../src/lib/device-id";

export interface ReadingSpeedButtonProps {
  onToggle?: () => void;
}

export function ReadingSpeedButton({ onToggle }: ReadingSpeedButtonProps) {
  const [showTracker, setShowTracker] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  const handleClick = () => {
    setShowTracker(!showTracker);
    onToggle?.();
  };

  if (!deviceId) {
    return null; // Don't render until we have the device ID
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="fixed bottom-20 right-4 z-50 w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-lg font-bold"
        title="Start Reading Speed Tracker"
      >
        📖
      </button>

      {showTracker && (
        <ReadingSpeedTracker
          deviceId={deviceId}
          onClose={() => setShowTracker(false)}
        />
      )}
    </>
  );
}