// YouTube subtitle integration — DOM-based approach
// Instead of fetching subtitle data via API, we observe YouTube's own
// rendered caption elements and make them interactive.

export interface SubtitleWord {
  word: string;
  isKnown: boolean;
}

// Check if we're on YouTube
export function isYouTubePage(): boolean {
  return window.location.hostname.includes("youtube.com");
}

export function isYouTubeVideoPage(): boolean {
  return isYouTubePage() && window.location.pathname === "/watch";
}

// Extract video ID from URL
export function getVideoId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("v");
}

// Get the video element
export function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector("video.html5-main-video");
}

// Tokenize subtitle text into words
export function tokenizeSubtitle(text: string): string[] {
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/[^\w\s'-]/g, " ") // Keep letters, numbers, apostrophes, hyphens
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

// Observer to detect YouTube navigation (SPA)
export function observeYouTubeNavigation(callback: (videoId: string | null) => void): () => void {
  let lastVideoId = getVideoId();

  const handleNav = () => {
    const currentVideoId = getVideoId();
    if (currentVideoId !== lastVideoId) {
      lastVideoId = currentVideoId;
      callback(currentVideoId);
    }
  };

  // YouTube's custom navigation event (most reliable for SPA)
  document.addEventListener("yt-navigate-finish", handleNav);
  window.addEventListener("popstate", handleNav);

  return () => {
    document.removeEventListener("yt-navigate-finish", handleNav);
    window.removeEventListener("popstate", handleNav);
  };
}

/**
 * Observe YouTube's native caption elements and call back with the current text.
 * YouTube renders captions in .ytp-caption-segment elements inside .ytp-caption-window-container.
 * We watch for changes and extract the text.
 */
export function observeCaptions(
  callback: (text: string | null) => void
): () => void {
  let lastText: string | null = null;
  let observer: MutationObserver | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;

  function getCaptionText(): string | null {
    const segments = document.querySelectorAll(".ytp-caption-segment");
    if (segments.length === 0) return null;
    const text = Array.from(segments)
      .map((s) => s.textContent?.trim() || "")
      .filter((t) => t.length > 0)
      .join(" ");
    return text || null;
  }

  function startObserving() {
    // Find the caption container
    const container =
      document.querySelector(".ytp-caption-window-container") ||
      document.querySelector(".html5-video-player");

    if (!container) {
      if (attempts++ < 30) {
        retryTimer = setTimeout(startObserving, 1000);
      }
      return;
    }

    // Watch for caption changes
    observer = new MutationObserver(() => {
      const text = getCaptionText();
      if (text !== lastText) {
        lastText = text;
        callback(text);
      }
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Also check periodically (captions can change without DOM mutations in some cases)
    const interval = setInterval(() => {
      const text = getCaptionText();
      if (text !== lastText) {
        lastText = text;
        callback(text);
      }
    }, 300);

    // Store interval for cleanup
    (observer as any)._vocabifyInterval = interval;
  }

  startObserving();

  return () => {
    clearTimeout(retryTimer);
    if (observer) {
      const interval = (observer as any)._vocabifyInterval;
      if (interval) clearInterval(interval);
      observer.disconnect();
    }
  };
}
