// YouTube subtitle detection and integration

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface YouTubeState {
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  subtitles: SubtitleCue[];
  currentCue: SubtitleCue | null;
}

// Check if we're on a YouTube video page
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

// Get the subtitle container element
export function getSubtitleContainer(): HTMLElement | null {
  return document.querySelector(".ytp-caption-segment");
}

// Parse subtitle track from YouTube's internal player
export async function fetchSubtitles(videoId: string, lang: string = "en"): Promise<SubtitleCue[]> {
  // Try to get subtitle URL from page config first
  const subtitleUrl = getSubtitleUrlFromPage(lang);
  
  if (subtitleUrl) {
    try {
      const response = await fetch(subtitleUrl + "&fmt=json3");
      if (response.ok) {
        const data = await response.json();
        if (data.events) {
          return data.events
            .filter((event: any) => event.segs)
            .map((event: any) => ({
              start: event.tStartMs / 1000,
              end: (event.tStartMs + (event.dDurationMs || 3000)) / 1000,
              text: event.segs.map((seg: any) => seg.utf8).join(""),
            }));
        }
      }
    } catch (e) {
      console.log("[Vocabify] Subtitle URL fetch failed:", e);
    }
  }
  
  // Fallback: Try legacy timedtext API
  try {
    const response = await fetch(
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`
    );
    
    if (!response.ok) {
      console.log("[Vocabify] No subtitles found for language:", lang);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.events) {
      return [];
    }
    
    return data.events
      .filter((event: any) => event.segs)
      .map((event: any) => ({
        start: event.tStartMs / 1000,
        end: (event.tStartMs + (event.dDurationMs || 3000)) / 1000,
        text: event.segs.map((seg: any) => seg.utf8).join(""),
      }));
  } catch (e) {
    console.error("[Vocabify] Failed to fetch subtitles:", e);
    return [];
  }
}

// Get subtitle URL from YouTube's player config
function getSubtitleUrlFromPage(lang: string): string | null {
  try {
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const content = script.textContent || "";
      if (content.includes("ytInitialPlayerResponse")) {
        const match = content.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
        if (match) {
          const data = JSON.parse(match[1]);
          const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (captionTracks && captionTracks.length > 0) {
            // Find matching language track
            const track = captionTracks.find((t: any) => 
              t.languageCode === lang || t.languageCode.startsWith(lang + "-")
            ) || captionTracks.find((t: any) =>
              t.languageCode.startsWith("en")
            ) || captionTracks[0];
            
            if (track?.baseUrl) {
              return track.baseUrl;
            }
          }
        }
      }
    }
  } catch (e) {
    console.log("[Vocabify] Failed to extract subtitle URL from page:", e);
  }
  return null;
}

// Get current subtitle cue based on video time
export function getCurrentCue(subtitles: SubtitleCue[], currentTime: number): SubtitleCue | null {
  return subtitles.find(
    (cue) => currentTime >= cue.start && currentTime <= cue.end
  ) || null;
}

// Tokenize subtitle text into words
export function tokenizeSubtitle(text: string): string[] {
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/[^\w\s'-]/g, " ") // Keep letters, numbers, apostrophes, hyphens
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

// Create an interactive subtitle overlay
export function createSubtitleOverlay(
  cue: SubtitleCue,
  onWordClick: (word: string, rect: DOMRect) => void
): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "vocabify-subtitle-overlay";
  overlay.style.cssText = `
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 18px;
    line-height: 1.4;
    max-width: 80%;
    text-align: center;
    z-index: 2147483640;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const words = tokenizeSubtitle(cue.text);
  
  words.forEach((word, i) => {
    const span = document.createElement("span");
    span.textContent = word;
    span.style.cssText = `
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      transition: background-color 0.15s ease;
    `;
    span.addEventListener("mouseenter", () => {
      span.style.backgroundColor = "rgba(59, 130, 246, 0.5)";
    });
    span.addEventListener("mouseleave", () => {
      span.style.backgroundColor = "transparent";
    });
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      onWordClick(word, span.getBoundingClientRect());
    });
    
    overlay.appendChild(span);
    
    if (i < words.length - 1) {
      overlay.appendChild(document.createTextNode(" "));
    }
  });

  return overlay;
}

// Observer to detect YouTube navigation (SPA)
export function observeYouTubeNavigation(callback: (videoId: string | null) => void): () => void {
  let lastVideoId = getVideoId();
  
  const observer = new MutationObserver(() => {
    const currentVideoId = getVideoId();
    if (currentVideoId !== lastVideoId) {
      lastVideoId = currentVideoId;
      callback(currentVideoId);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // Also listen to popstate for back/forward navigation
  const handlePopState = () => {
    const currentVideoId = getVideoId();
    if (currentVideoId !== lastVideoId) {
      lastVideoId = currentVideoId;
      callback(currentVideoId);
    }
  };
  
  window.addEventListener("popstate", handlePopState);
  
  return () => {
    observer.disconnect();
    window.removeEventListener("popstate", handlePopState);
  };
}
