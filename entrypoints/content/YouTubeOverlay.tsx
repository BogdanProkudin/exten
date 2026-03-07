import { useState, useEffect, useCallback, useRef } from "react";
import {
  getVideoElement,
  observeCaptions,
  tokenizeSubtitle,
} from "../../src/lib/youtube";
import { lemmatize } from "../../src/lib/lemmatize";

interface YouTubeOverlayProps {
  onWordClick: (word: string, position: { x: number; y: number }) => void;
  vocabLemmas?: Set<string>;
}

export function YouTubeOverlay({ onWordClick, vocabLemmas }: YouTubeOverlayProps) {
  const [currentText, setCurrentText] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Check if feature is enabled
  useEffect(() => {
    chrome.storage.sync.get("youtubeSubtitlesEnabled").then((data) => {
      if (data.youtubeSubtitlesEnabled === false) {
        setEnabled(false);
      }
    });
  }, []);

  // Get video element reference
  useEffect(() => {
    let attempts = 0;
    const findVideo = () => {
      const video = getVideoElement();
      if (video) {
        videoRef.current = video;
      } else if (attempts++ < 20) {
        setTimeout(findVideo, 500);
      }
    };
    findVideo();
  }, []);

  // Observe YouTube's native captions
  useEffect(() => {
    if (!enabled) return;

    console.log("[Vocabify] Starting caption observer...");
    const cleanup = observeCaptions((text) => {
      setCurrentText(text);
    });

    return cleanup;
  }, [enabled]);

  // Hide YouTube's native captions when we're showing ours
  useEffect(() => {
    if (!enabled || !currentText) return;

    const style = document.createElement("style");
    style.id = "vocabify-hide-captions";
    style.textContent = `
      .ytp-caption-window-container .ytp-caption-segment {
        color: transparent !important;
      }
      .ytp-caption-window-container .caption-window {
        background: transparent !important;
      }
    `;

    // Only add if not already present
    if (!document.getElementById("vocabify-hide-captions")) {
      document.head.appendChild(style);
    }

    return () => {
      document.getElementById("vocabify-hide-captions")?.remove();
    };
  }, [enabled, !!currentText]);

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

  if (!enabled || !currentText) return null;

  const words = tokenizeSubtitle(currentText);
  if (words.length === 0) return null;

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
      {/* Disable button — visible on hover */}
      <button
        onClick={() => {
          setEnabled(false);
          chrome.storage.sync.set({ youtubeSubtitlesEnabled: false });
          document.getElementById("vocabify-hide-captions")?.remove();
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

      {/* Interactive subtitle overlay */}
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
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          pointerEvents: "auto",
        }}
        onMouseEnter={() => {
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
            <span key={`${i}-${word}`}>
              <span
                onClick={(e) => handleWordClick(word, e)}
                style={{
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  transition: "background-color 0.15s ease",
                  backgroundColor: isKnown ? "rgba(34, 197, 94, 0.3)" : "transparent",
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
