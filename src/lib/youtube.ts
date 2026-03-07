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

// Parse subtitle events into cues
function parseSubtitleEvents(events: any[]): SubtitleCue[] {
  return events
    .filter((event: any) => event.segs)
    .map((event: any) => ({
      start: event.tStartMs / 1000,
      end: (event.tStartMs + (event.dDurationMs || 3000)) / 1000,
      text: event.segs
        .map((seg: any) => seg.utf8)
        .join("")
        .replace(/\n/g, " ")
        .trim(),
    }))
    .filter((cue) => cue.text.length > 0);
}

// Inject a script into the page context to extract subtitle URLs
// (Content scripts can't access window.ytInitialPlayerResponse due to isolated worlds)
function getSubtitleUrlFromPageContext(lang: string): Promise<string | null> {
  return new Promise((resolve) => {
    const callbackId = "vocabify_subs_" + Date.now();
    
    // Listen for the response from the injected script
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.callbackId === callbackId) {
        document.removeEventListener("vocabify-subtitle-response", handler);
        resolve(detail.url || null);
      }
    };
    document.addEventListener("vocabify-subtitle-response", handler);

    // Inject script into page context
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        var lang = ${JSON.stringify(lang)};
        var callbackId = ${JSON.stringify(callbackId)};
        var url = null;
        
        try {
          // Method 1: window.ytInitialPlayerResponse (most reliable)
          var response = window.ytInitialPlayerResponse;
          
          // Method 2: ytplayer.config  
          if (!response) {
            var ytplayer = window.ytplayer;
            response = ytplayer && ytplayer.config && ytplayer.config.args && ytplayer.config.args.raw_player_response;
          }
          
          // Method 3: document.ytInitialPlayerResponse (some YT versions)
          if (!response) {
            response = document.ytInitialPlayerResponse;
          }

          if (response && response.captions) {
            var tracks = response.captions.playerCaptionsTracklistRenderer && 
                         response.captions.playerCaptionsTracklistRenderer.captionTracks;
            if (tracks && tracks.length > 0) {
              // Find best matching track
              var manual = null, auto = null, anyEn = null;
              for (var i = 0; i < tracks.length; i++) {
                var t = tracks[i];
                var lc = t.languageCode || "";
                var isMatch = lc === lang || lc.indexOf(lang + "-") === 0;
                var isEn = lc.indexOf("en") === 0;
                var isManual = t.kind !== "asr";
                
                if (isMatch && isManual && !manual) manual = t;
                else if (isMatch && !auto) auto = t;
                else if (isEn && isManual && !anyEn) anyEn = t;
                else if (isEn && !anyEn) anyEn = t;
              }
              var best = manual || auto || anyEn;
              if (best && best.baseUrl) url = best.baseUrl;
            }
          }
        } catch(e) {
          console.log("[Vocabify] Page context subtitle extraction error:", e);
        }
        
        document.dispatchEvent(new CustomEvent("vocabify-subtitle-response", {
          detail: { callbackId: callbackId, url: url }
        }));
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    // Timeout after 2 seconds
    setTimeout(() => {
      document.removeEventListener("vocabify-subtitle-response", handler);
      resolve(null);
    }, 2000);
  });
}

// Fetch subtitles for a YouTube video
export async function fetchSubtitles(videoId: string, lang: string = "en"): Promise<SubtitleCue[]> {
  // Method 1: Extract URL from page's JavaScript context (most reliable)
  let subtitleUrl = await getSubtitleUrlFromPageContext(lang);
  console.log(`[Vocabify] Page context subtitle URL (lang=${lang}):`, subtitleUrl ? "found" : "not found");

  // Method 2: Fall back to parsing script tags (initial page load only)
  if (!subtitleUrl) {
    subtitleUrl = getSubtitleUrlFromPage(lang);
    console.log(`[Vocabify] Script tag subtitle URL (lang=${lang}):`, subtitleUrl ? "found" : "not found");
  }
  
  if (subtitleUrl) {
    try {
      const separator = subtitleUrl.includes("?") ? "&" : "?";
      const response = await fetch(subtitleUrl + separator + "fmt=json3");
      if (response.ok) {
        const data = await response.json();
        if (data.events) {
          const cues = parseSubtitleEvents(data.events);
          if (cues.length > 0) {
            console.log(`[Vocabify] Loaded ${cues.length} subtitle cues`);
            return cues;
          }
        }
      }
    } catch (e) {
      console.log("[Vocabify] Subtitle fetch failed:", e);
    }
  }

  return [];
}

// Extract balanced JSON object starting at a given index
function extractJsonObject(text: string, startIdx: number): string | null {
  const braceStart = text.indexOf("{", startIdx);
  if (braceStart === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = braceStart; i < text.length; i++) {
    const c = text[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === "\\" && inString) { escapeNext = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(braceStart, i + 1);
      }
    }
  }
  return null;
}

// Get subtitle URL from YouTube's player config
function getSubtitleUrlFromPage(lang: string): string | null {
  // Helper to find a matching track from caption tracks
  function findTrack(captionTracks: any[]): any | null {
    // Prefer manual over auto-generated
    const manualTrack = captionTracks.find((t: any) =>
      (t.languageCode === lang || t.languageCode.startsWith(lang + "-")) && t.kind !== "asr"
    );
    const autoTrack = captionTracks.find((t: any) =>
      (t.languageCode === lang || t.languageCode.startsWith(lang + "-"))
    );
    const anyEnglish = captionTracks.find((t: any) =>
      t.languageCode.startsWith("en") && t.kind !== "asr"
    );
    const anyEnglishAuto = captionTracks.find((t: any) =>
      t.languageCode.startsWith("en")
    );
    return manualTrack || autoTrack || anyEnglish || anyEnglishAuto || null;
  }

  try {
    // Method 1: Try reading from window object (works after SPA navigation)
    try {
      const playerResponse = (window as any).ytInitialPlayerResponse;
      if (playerResponse) {
        const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length > 0) {
          const track = findTrack(tracks);
          if (track?.baseUrl) {
            console.log("[Vocabify] Got subtitle URL from window.ytInitialPlayerResponse");
            return track.baseUrl;
          }
        }
      }
    } catch { /* fallthrough */ }

    // Method 2: Try ytplayer.config (another common location)
    try {
      const ytplayer = (window as any).ytplayer;
      const config = ytplayer?.config?.args;
      if (config?.raw_player_response) {
        const tracks = config.raw_player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (tracks?.length > 0) {
          const track = findTrack(tracks);
          if (track?.baseUrl) {
            console.log("[Vocabify] Got subtitle URL from ytplayer.config");
            return track.baseUrl;
          }
        }
      }
    } catch { /* fallthrough */ }

    // Method 3: Parse from script tags (works on initial page load)
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const content = script.textContent || "";
      const idx = content.indexOf("ytInitialPlayerResponse");
      if (idx === -1) continue;

      // Use balanced-brace extraction instead of regex (regex can't handle nested JSON)
      const jsonStr = extractJsonObject(content, idx);
      if (!jsonStr) continue;

      try {
        const data = JSON.parse(jsonStr);
        const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!captionTracks || captionTracks.length === 0) continue;

        const track = findTrack(captionTracks);
        if (track?.baseUrl) {
          console.log("[Vocabify] Got subtitle URL from script tag");
          return track.baseUrl;
        }
      } catch {
        continue;
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
  
  // YouTube uses History API pushState for SPA navigation (not caught by popstate alone)
  const handleNavigation = () => {
    const currentVideoId = getVideoId();
    if (currentVideoId !== lastVideoId) {
      lastVideoId = currentVideoId;
      callback(currentVideoId);
    }
  };

  // Listen for YouTube's custom navigation event (most reliable)
  const handleYtNavigate = () => handleNavigation();
  document.addEventListener("yt-navigate-finish", handleYtNavigate);

  // MutationObserver as fallback — debounce to avoid excessive firing
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleNavigation, 200);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // Also listen to popstate for back/forward navigation
  window.addEventListener("popstate", handleNavigation);
  
  return () => {
    document.removeEventListener("yt-navigate-finish", handleYtNavigate);
    observer.disconnect();
    clearTimeout(debounceTimer);
    window.removeEventListener("popstate", handleNavigation);
  };
}
