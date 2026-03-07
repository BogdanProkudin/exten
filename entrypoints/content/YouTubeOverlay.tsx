import { useState, useEffect, useCallback, useRef } from "react";
import {
  isYouTubeVideoPage,
  getVideoId,
  getVideoElement,
  fetchSubtitles,
  getCurrentCue,
  tokenizeSubtitle,
  observeYouTubeNavigation,
  type SubtitleCue,
} from "../../src/lib/youtube";

interface YouTubeOverlayProps {
  onWordClick: (word: string, position: { x: number; y: number }) => void;
  vocabLemmas?: Set<string>;
}

export function YouTubeOverlay({ onWordClick, vocabLemmas }: YouTubeOverlayProps) {
  const [enabled, setEnabled] = useState(true);
  const [subtitles, setSubtitles] = useState<SubtitleCue[]>([]);
  const [currentCue, setCurrentCue] = useState<SubtitleCue | null>(null);
  const [loading, setLoading] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Check if YouTube subtitles feature is enabled
  useEffect(() => {
    chrome.storage.sync.get("youtubeSubtitlesEnabled").then((data) => {
      if (data.youtubeSubtitlesEnabled === false) {
        setEnabled(false);
      }
    });
  }, []);

  // Initialize and observe navigation
  useEffect(() => {
    if (!isYouTubeVideoPage()) return;

    const currentId = getVideoId();
    setVideoId(currentId);

    const cleanup = observeYouTubeNavigation((newVideoId) => {
      setVideoId(newVideoId);
      setSubtitles([]);
      setCurrentCue(null);
      setError(null);
    });

    return cleanup;
  }, []);

  // Fetch subtitles when video changes
  useEffect(() => {
    if (!videoId || !enabled) return;

    setLoading(true);
    setError(null);

    fetchSubtitles(videoId, "en")
      .then((subs) => {
        if (subs.length > 0) {
          setSubtitles(subs);
          console.log(`[Vocabify] Loaded ${subs.length} subtitle cues`);
        } else {
          // Try auto-generated
          fetchSubtitles(videoId, "en-US").then((autoSubs) => {
            if (autoSubs.length > 0) {
              setSubtitles(autoSubs);
            } else {
              setError("No English subtitles available");
            }
          });
        }
      })
      .catch(() => setError("Failed to load subtitles"))
      .finally(() => setLoading(false));
  }, [videoId, enabled]);

  // Track video time and update current cue
  useEffect(() => {
    if (subtitles.length === 0 || !enabled) return;

    const video = getVideoElement();
    if (!video) return;
    videoRef.current = video;

    const updateCue = () => {
      const cue = getCurrentCue(subtitles, video.currentTime);
      setCurrentCue(cue);
    };

    video.addEventListener("timeupdate", updateCue);
    video.addEventListener("seeking", updateCue);

    return () => {
      video.removeEventListener("timeupdate", updateCue);
      video.removeEventListener("seeking", updateCue);
    };
  }, [subtitles, enabled]);

  // Position the overlay relative to the video player
  useEffect(() => {
    if (!containerRef.current) return;

    const video = getVideoElement();
    if (!video) return;

    const player = video.closest(".html5-video-player");
    if (!player) return;

    // Insert our overlay into the player
    const existingOverlay = player.querySelector(".vocabify-yt-container");
    if (existingOverlay) {
      existingOverlay.remove();
    }

    containerRef.current.className = "vocabify-yt-container";
    player.appendChild(containerRef.current);
  }, [currentCue]);

  const handleWordClick = useCallback(
    (word: string, e: React.MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      onWordClick(word, { x: rect.left, y: rect.bottom + 8 });

      // Pause video briefly to let user read
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    },
    [onWordClick]
  );

  if (!enabled || !isYouTubeVideoPage() || !currentCue) {
    return null;
  }

  const words = tokenizeSubtitle(currentCue.text);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        bottom: "80px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2147483640,
        pointerEvents: "auto",
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => {
          setEnabled(false);
          chrome.storage.sync.set({ youtubeSubtitlesEnabled: false });
        }}
        style={{
          position: "absolute",
          top: "-32px",
          right: "0",
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          padding: "4px 8px",
          fontSize: "11px",
          cursor: "pointer",
          opacity: 0.7,
        }}
        title="Disable Vocabify subtitles"
      >
        V ✕
      </button>

      {/* Subtitle overlay */}
      <div
        style={{
          background: "rgba(0, 0, 0, 0.8)",
          color: "white",
          padding: "10px 20px",
          borderRadius: "8px",
          fontSize: "20px",
          lineHeight: 1.5,
          maxWidth: "80vw",
          textAlign: "center",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        {words.map((word, i) => {
          const isKnown = vocabLemmas?.has(word.toLowerCase());
          return (
            <span key={i}>
              <span
                onClick={(e) => handleWordClick(word, e)}
                style={{
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  transition: "background-color 0.15s ease",
                  backgroundColor: isKnown
                    ? "rgba(34, 197, 94, 0.3)"
                    : "transparent",
                  borderBottom: isKnown ? "none" : "1px dashed rgba(255,255,255,0.4)",
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = isKnown
                    ? "rgba(34, 197, 94, 0.5)"
                    : "rgba(59, 130, 246, 0.5)";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.backgroundColor = isKnown
                    ? "rgba(34, 197, 94, 0.3)"
                    : "transparent";
                }}
              >
                {word}
              </span>
              {i < words.length - 1 && " "}
            </span>
          );
        })}
      </div>

      {/* Loading/Error states */}
      {loading && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "8px",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        >
          Loading subtitles...
        </div>
      )}

      {error && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "8px",
            background: "rgba(239, 68, 68, 0.9)",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
