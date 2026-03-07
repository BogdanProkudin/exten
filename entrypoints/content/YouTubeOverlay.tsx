import { useState, useEffect, useCallback, useRef } from "react";
import {
  isYouTubeVideoPage,
  getVideoId,
  getVideoElement,
  fetchSubtitles,
  getCurrentCue,
  tokenizeSubtitle,
  type SubtitleCue,
} from "../../src/lib/youtube";
import { lemmatize } from "../../src/lib/lemmatize";

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

  // Check if YouTube subtitles feature is enabled
  useEffect(() => {
    chrome.storage.sync.get("youtubeSubtitlesEnabled").then((data) => {
      if (data.youtubeSubtitlesEnabled === false) {
        setEnabled(false);
      }
    });
  }, []);

  // Initialize video ID
  useEffect(() => {
    if (!isYouTubeVideoPage()) return;
    setVideoId(getVideoId());
  }, []);

  // Listen for YouTube SPA navigation
  useEffect(() => {
    const handleNav = () => {
      setTimeout(() => {
        if (isYouTubeVideoPage()) {
          const newId = getVideoId();
          setVideoId((prev) => {
            if (prev !== newId) {
              setSubtitles([]);
              setCurrentCue(null);
              setError(null);
            }
            return newId;
          });
        } else {
          setVideoId(null);
          setSubtitles([]);
          setCurrentCue(null);
        }
      }, 300);
    };

    document.addEventListener("yt-navigate-finish", handleNav);
    window.addEventListener("popstate", handleNav);

    return () => {
      document.removeEventListener("yt-navigate-finish", handleNav);
      window.removeEventListener("popstate", handleNav);
    };
  }, []);

  // Fetch subtitles when video changes
  useEffect(() => {
    if (!videoId || !enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // fetchSubtitles already falls back to any English track via getSubtitleUrlFromPage
        const subs = await fetchSubtitles(videoId, "en");
        if (cancelled) return;

        if (subs.length > 0) {
          setSubtitles(subs);
        } else {
          setError("No English subtitles available");
        }
      } catch {
        if (!cancelled) setError("Failed to load subtitles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [videoId, enabled]);

  // Track video time and update current cue
  useEffect(() => {
    if (subtitles.length === 0 || !enabled) return;

    let video: HTMLVideoElement | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const updateCue = () => {
      if (!video) return;
      const cue = getCurrentCue(subtitles, video.currentTime);
      setCurrentCue(cue);
    };

    const attach = () => {
      video = getVideoElement();
      if (!video) {
        if (attempts++ < 20) {
          retryTimer = setTimeout(attach, 500);
        }
        return;
      }
      videoRef.current = video;
      video.addEventListener("timeupdate", updateCue);
      video.addEventListener("seeking", updateCue);
    };

    attach();

    return () => {
      clearTimeout(retryTimer);
      if (video) {
        video.removeEventListener("timeupdate", updateCue);
        video.removeEventListener("seeking", updateCue);
      }
    };
  }, [subtitles, enabled]);

  const handleWordClick = useCallback(
    (word: string, e: React.MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      onWordClick(word, { x: rect.left + rect.width / 2, y: rect.top - 10 });

      // Pause video to let user read
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    },
    [onWordClick]
  );

  if (!enabled || !videoId || !currentCue) {
    // Show loading/error even without a cue
    if (loading || error) {
      return (
        <div style={{
          position: "absolute",
          bottom: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          pointerEvents: "auto",
        }}>
          {loading && (
            <div style={{
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
              Loading subtitles...
            </div>
          )}
          {error && (
            <div style={{
              background: "rgba(239, 68, 68, 0.9)",
              color: "#fff",
              padding: "6px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}>
              {error}
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  const words = tokenizeSubtitle(currentCue.text);

  return (
    <div
      style={{
        position: "absolute",
        bottom: "80px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
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
          top: "-28px",
          right: "0",
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          padding: "3px 6px",
          fontSize: "10px",
          cursor: "pointer",
          opacity: 0,
          transition: "opacity 0.2s",
          pointerEvents: "auto",
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0"; }}
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
          pointerEvents: "auto",
        }}
        onMouseEnter={() => {
          // Show close button on hover
          const btn = document.querySelector(".vocabify-yt-container button") as HTMLElement;
          if (btn) btn.style.opacity = "1";
        }}
        onMouseLeave={() => {
          const btn = document.querySelector(".vocabify-yt-container button") as HTMLElement;
          if (btn) btn.style.opacity = "0";
        }}
      >
        {words.map((word, i) => {
          const isKnown = vocabLemmas?.has(lemmatize(word)) || vocabLemmas?.has(word.toLowerCase());
          return (
            <span key={`${currentCue.start}-${i}`}>
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
                  pointerEvents: "auto",
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
    </div>
  );
}
