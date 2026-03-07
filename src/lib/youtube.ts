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

// Parse XML subtitle format (YouTube sometimes returns this instead of JSON)
function parseXmlSubtitles(xml: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const texts = doc.querySelectorAll("text");
  
  for (const el of texts) {
    const start = parseFloat(el.getAttribute("start") || "0");
    const dur = parseFloat(el.getAttribute("dur") || "3");
    const text = (el.textContent || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n/g, " ")
      .trim();
    
    if (text.length > 0) {
      cues.push({ start, end: start + dur, text });
    }
  }
  
  return cues;
}

// Parse subtitle events into cues (JSON format)
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

// Fetch subtitles via background script's chrome.scripting.executeScript
// The entire flow (find URL + fetch content) happens in the PAGE's JS context
// because only the page context has the right cookies/origin for YouTube's API
async function fetchSubtitlesFromPageContext(lang: string): Promise<string | null> {
  try {
    const res = await chrome.runtime.sendMessage({ type: "FETCH_YOUTUBE_SUBTITLES", lang });
    if (res?.success && res.content) {
      return res.content;
    }
    console.log("[Vocabify] Subtitle fetch via page context failed:", res?.error);
  } catch (e) {
    console.log("[Vocabify] FETCH_YOUTUBE_SUBTITLES message failed:", e);
  }
  return null;
}

// Fetch subtitles for a YouTube video
export async function fetchSubtitles(videoId: string, lang: string = "en"): Promise<SubtitleCue[]> {
  console.log(`[Vocabify] Fetching subtitles for video ${videoId}, lang=${lang}`);

  // Primary: fetch via page context (executeScript in MAIN world)
  // This is the only reliable method — YouTube requires page cookies for timedtext API
  const text = await fetchSubtitlesFromPageContext(lang);

  if (!text || text.length === 0) {
    console.log("[Vocabify] No subtitle content received");
    return [];
  }

  console.log(`[Vocabify] Got subtitle content: ${text.length} chars`);

  // Try JSON format first (fmt=json3)
  try {
    const data = JSON.parse(text);
    if (data.events) {
      const cues = parseSubtitleEvents(data.events);
      if (cues.length > 0) {
        console.log(`[Vocabify] Loaded ${cues.length} subtitle cues`);
        return cues;
      }
    }
  } catch {
    // Try XML format as fallback
    if (text.includes("<text")) {
      const cues = parseXmlSubtitles(text);
      if (cues.length > 0) {
        console.log(`[Vocabify] Loaded ${cues.length} subtitle cues from XML`);
        return cues;
      }
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
    // Parse from script tags — content scripts CAN read the DOM/script text content,
    // they just can't access JS variables set by the page.
    // ytInitialPlayerResponse is assigned in a script tag and contains the full player
    // response with captions data.
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
      const content = script.textContent || "";
      
      // Skip scripts that don't contain caption data (optimization)
      if (!content.includes("captionTracks")) continue;
      
      const idx = content.indexOf("ytInitialPlayerResponse");
      if (idx === -1) continue;

      // Use balanced-brace extraction (regex can't handle nested JSON)
      const jsonStr = extractJsonObject(content, idx);
      if (!jsonStr) continue;

      try {
        const data = JSON.parse(jsonStr);

        // Verify this response is for the current video (not stale from SPA nav)
        const responseVideoId = data?.videoDetails?.videoId;
        const currentVideoId = getVideoId();
        if (responseVideoId && currentVideoId && responseVideoId !== currentVideoId) {
          console.log("[Vocabify] Skipping stale player response for video:", responseVideoId);
          continue;
        }

        const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!captionTracks || captionTracks.length === 0) continue;

        const track = findTrack(captionTracks);
        if (track?.baseUrl) {
          console.log("[Vocabify] Got subtitle URL from script tag parsing");
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
