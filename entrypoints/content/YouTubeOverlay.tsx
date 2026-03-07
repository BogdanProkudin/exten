import { useEffect, useRef, useCallback } from "react";
import { getVideoElement } from "../../src/lib/youtube";
import { lemmatize } from "../../src/lib/lemmatize";

interface YouTubeOverlayProps {
  onWordClick: (word: string, position: { x: number; y: number }) => void;
  vocabLemmas?: Set<string>;
}

/**
 * Makes YouTube's native caption words clickable for translation.
 * Does NOT replace or hide YouTube's captions — just enhances them.
 */
export function YouTubeOverlay({ onWordClick, vocabLemmas }: YouTubeOverlayProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get video reference
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

  const processSegment = useCallback((segment: Element) => {
    // Skip if already processed
    if (segment.getAttribute("data-vocabify") === "1") return;
    segment.setAttribute("data-vocabify", "1");

    const text = segment.textContent || "";
    if (!text.trim()) return;

    // Split text into words and wrap each in a clickable span
    const fragment = document.createDocumentFragment();
    const words = text.split(/(\s+)/); // Keep whitespace

    for (const part of words) {
      if (/^\s+$/.test(part)) {
        // Whitespace — keep as-is
        fragment.appendChild(document.createTextNode(part));
        continue;
      }

      // Clean word for lookup
      const cleanWord = part.replace(/[^\w'-]/g, "");
      if (!cleanWord) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }

      const isKnown = vocabLemmas?.has(lemmatize(cleanWord)) || vocabLemmas?.has(cleanWord.toLowerCase());

      const span = document.createElement("span");
      span.textContent = part;
      span.style.cssText = `
        cursor: pointer;
        padding: 1px 2px;
        border-radius: 3px;
        transition: background-color 0.15s ease;
        ${isKnown ? "background-color: rgba(34, 197, 94, 0.3);" : "border-bottom: 1px dashed rgba(255,255,255,0.5);"}
      `;

      span.addEventListener("mouseenter", () => {
        span.style.backgroundColor = isKnown
          ? "rgba(34, 197, 94, 0.5)"
          : "rgba(59, 130, 246, 0.5)";
      });

      span.addEventListener("mouseleave", () => {
        span.style.backgroundColor = isKnown
          ? "rgba(34, 197, 94, 0.3)"
          : "transparent";
      });

      span.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();

        const rect = span.getBoundingClientRect();
        onWordClick(cleanWord, {
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });

        // Pause video
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
        }
      });

      fragment.appendChild(span);
    }

    // Replace segment content with clickable words
    segment.textContent = "";
    segment.appendChild(fragment);
  }, [onWordClick, vocabLemmas]);

  const processAllSegments = useCallback(() => {
    const segments = document.querySelectorAll(".ytp-caption-segment");
    segments.forEach(processSegment);
  }, [processSegment]);

  // Observe caption changes
  useEffect(() => {
    console.log("[Vocabify] YouTube: watching for captions...");

    // Inject CSS to make captions interactive
    let style = document.getElementById("vocabify-yt-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "vocabify-yt-style";
      style.textContent = `
        .ytp-caption-segment {
          cursor: default !important;
          pointer-events: auto !important;
        }
        .ytp-caption-segment span:hover {
          text-shadow: 0 0 8px rgba(255,255,255,0.5);
        }
      `;
      document.head.appendChild(style);
    }

    // Watch for new caption segments
    const container = document.querySelector(".html5-video-player") || document.body;

    observerRef.current = new MutationObserver(() => {
      processAllSegments();
    });

    observerRef.current.observe(container, {
      childList: true,
      subtree: true,
    });

    // Also poll since captions can change without triggering mutations
    intervalRef.current = setInterval(processAllSegments, 500);

    // Process any existing captions
    processAllSegments();

    return () => {
      observerRef.current?.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.getElementById("vocabify-yt-style")?.remove();
    };
  }, [processAllSegments]);

  // This component doesn't render anything — it enhances existing DOM
  return null;
}
