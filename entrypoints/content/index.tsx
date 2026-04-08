import ReactDOM from "react-dom/client";
import { FloatingPopup } from "./FloatingPopup";
import { SentencePopup } from "./SentencePopup";
import { ReviewToast } from "./ReviewToast";

import { ReadingPanel } from "./ReadingPanel";
import { SimplifyPanel } from "./SimplifyPanel";
import { AchievementToast } from "./AchievementToast";
import { YouTubeOverlay } from "./YouTubeOverlay";
import { analyzePageContent, type PageAnalysisResult, type VocabCache } from "../../src/lib/page-analyzer";
import { isYouTubePage, isYouTubeVideoPage, getVideoElement } from "../../src/lib/youtube";
import { getFromStore, putInStore } from "../../src/lib/indexed-db";
import "../../src/global.css";

function isEditableTarget(el: HTMLElement): boolean {
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;

  // Check for common code editors by walking up the tree
  const editorSelectors = [
    "[contenteditable]",
    "[contenteditable='true']",
    ".CodeMirror",
    ".monaco-editor",
    ".ace_editor",
    "[role='textbox']",
    "[role='combobox']",
  ];

  return editorSelectors.some((sel) => el.closest(sel) !== null);
}

// Extract readable sentences from page for pattern analysis
// --- Radar helpers (IndexedDB-backed) ---
interface RadarEntry {
  count: number;
  lastSeenAt: number;
}

interface RadarData {
  seen: Record<string, RadarEntry>;
}

const RADAR_MAX_ENTRIES = 500;
const RADAR_IDB_KEY = "radar-data";

async function getRadarData(): Promise<RadarData> {
  // Try IndexedDB first
  const idbData = await getFromStore<RadarData>("radar", RADAR_IDB_KEY);
  if (idbData) return idbData;

  // Migrate from chrome.storage.local if exists
  try {
    const data = await chrome.storage.local.get("vocabifyRadar") as Record<string, RadarData | undefined>;
    if (data.vocabifyRadar?.seen) {
      await putInStore("radar", RADAR_IDB_KEY, data.vocabifyRadar);
      await chrome.storage.local.remove("vocabifyRadar");
      return data.vocabifyRadar;
    }
  } catch {}

  return { seen: {} };
}

async function updateRadarData(analysis: PageAnalysisResult): Promise<void> {
  const radar = await getRadarData();

  const top = analysis.unknownWords.slice(0, 20);
  const now = Date.now();
  for (const uw of top) {
    const existing = radar.seen[uw.lemma];
    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = now;
    } else {
      radar.seen[uw.lemma] = { count: 1, lastSeenAt: now };
    }
  }

  // Limit size by removing oldest entries if over limit
  const entries = Object.entries(radar.seen);
  if (entries.length > RADAR_MAX_ENTRIES) {
    entries.sort((a, b) => b[1].lastSeenAt - a[1].lastSeenAt);
    radar.seen = Object.fromEntries(entries.slice(0, RADAR_MAX_ENTRIES));
  }

  await putInStore("radar", RADAR_IDB_KEY, radar);
}

async function getRadarSuggestions(): Promise<{ lemma: string; count: number }[]> {
  const radar = await getRadarData();
  if (!radar.seen) return [];

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return Object.entries(radar.seen)
    .filter(([, entry]) => entry.count >= 4 && entry.lastSeenAt >= sevenDaysAgo)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([lemma, entry]) => ({ lemma, count: entry.count }));
}

// --- Text collection for simplify ---
function collectVisibleText(maxChars: number): string {
  const parts: string[] = [];
  let total = 0;
  const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "MATH"]);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || skipTags.has(parent.tagName)) continue;
    try {
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") continue;
    } catch { continue; }

    const text = (node.textContent || "").trim();
    if (!text) continue;
    if (total + text.length > maxChars) {
      parts.push(text.slice(0, maxChars - total));
      break;
    }
    parts.push(text);
    total += text.length;
  }
  return parts.join(" ");
}

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  async main(ctx) {
    let popupUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let sentenceUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let popupCreatedAt = 0;
    let toastUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let panelUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let simplifyUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let achievementUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let currentAnalysis: PageAnalysisResult | null = null;
    let currentUserLevel = "B1";

    // Show achievement notification
    async function showAchievementToast(achievement: { id: string; name: string; icon: string; description?: string }) {
      // Close existing achievement toast
      if (achievementUi) {
        achievementUi.remove();
        achievementUi = null;
      }

      achievementUi = await createShadowRootUi(ctx, {
        name: "vocabify-achievement",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          container.style.pointerEvents = "none";
          container.style.fontSize = "14px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <AchievementToast
              achievement={{
                ...achievement,
                description: achievement.description || "",
              }}
              onClose={() => {
                achievementUi?.remove();
                achievementUi = null;
              }}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });

      achievementUi.mount();
    }

    // Vocab cache: lemmas the user has already saved (for instant saved-word detection in popup)
    let vocabCacheLemmas: Set<string> | null = null;
    let vocabCacheReady = false;

    // Fetch vocab cache early so it's ready when the popup opens
    const vocabCachePromise = chrome.runtime.sendMessage({ type: "GET_VOCAB_CACHE" }).then((res) => {
      if (res?.success) {
        if (!vocabCacheLemmas) vocabCacheLemmas = new Set();
        for (const l of res.lemmas as string[]) vocabCacheLemmas.add(l);
        // Also include words (for pre-migration entries without lemma)
        for (const w of res.words as string[]) vocabCacheLemmas.add(w);

        // Initialize YouTube overlay if already on a video page
        if (isYouTubeVideoPage()) {
          initYouTubeOverlay();
        }
      }
    }).catch((err) => {
      console.error("[Vocabify] GET_VOCAB_CACHE error:", err);
    }).finally(() => {
      vocabCacheReady = true;
    });

    // Watch for YouTube SPA navigation so overlay works when browsing
    // homepage → video (not just on direct video page loads)
    if (isYouTubePage()) {
      const handleYtNav = () => {
        // Small delay to let YouTube update the URL
        setTimeout(() => {
          if (isYouTubeVideoPage()) {
            // Clean up old overlay first (new video = new player possibly)
            cleanupYouTubeOverlay();
            initYouTubeOverlay();
          } else {
            cleanupYouTubeOverlay();
          }
        }, 300);
      };

      document.addEventListener("yt-navigate-finish", handleYtNav);
      window.addEventListener("popstate", handleYtNav);
      ctx.onInvalidated(() => {
        document.removeEventListener("yt-navigate-finish", handleYtNav);
        window.removeEventListener("popstate", handleYtNav);
        cleanupYouTubeOverlay();
      });
    }

    // Generic SPA navigation detection (History API monkey-patch)
    let lastHref = window.location.href;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    function handleSPANavigation() {
      const newHref = window.location.href;
      if (newHref === lastHref) return;
      lastHref = newHref;
      // Close open popups on navigation
      if (popupUi) { popupUi.remove(); popupUi = null; }
      if (sentenceUi) { sentenceUi.remove(); sentenceUi = null; }
      // Re-run page analysis for new content
      currentAnalysis = null;
      setTimeout(() => scheduleAnalysis(), 500);
    }

    history.pushState = function(...args: Parameters<typeof originalPushState>) {
      originalPushState.apply(this, args);
      handleSPANavigation();
    };
    history.replaceState = function(...args: Parameters<typeof originalReplaceState>) {
      originalReplaceState.apply(this, args);
      handleSPANavigation();
    };
    window.addEventListener("popstate", handleSPANavigation);

    ctx.onInvalidated(() => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", handleSPANavigation);
    });

    // YouTube Overlay — injected directly into YouTube's player (not shadow DOM)
    let youtubeContainer: HTMLDivElement | null = null;
    let youtubeRoot: ReturnType<typeof ReactDOM.createRoot> | null = null;
    
    async function initYouTubeOverlay() {
      if (youtubeContainer) return;
      
      // Check if YouTube subtitles are enabled
      const settings = await chrome.storage.sync.get("youtubeSubtitlesEnabled");
      if (settings.youtubeSubtitlesEnabled === false) return;
      
      // Wait for the video player to appear
      let player: HTMLElement | null = null;
      for (let i = 0; i < 30; i++) {
        const video = document.querySelector("video.html5-main-video");
        player = video?.closest(".html5-video-player") as HTMLElement | null;
        if (player) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!player) {
        return;
      }

      // Remove any existing overlay
      player.querySelector(".vocabify-yt-container")?.remove();

      // Create container directly in YouTube's player
      youtubeContainer = document.createElement("div");
      youtubeContainer.className = "vocabify-yt-container";
      youtubeContainer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:60;";
      player.style.position = "relative"; // ensure positioning context
      player.appendChild(youtubeContainer);

      youtubeRoot = ReactDOM.createRoot(youtubeContainer);
      youtubeRoot.render(
        <YouTubeOverlay
          vocabLemmas={vocabCacheLemmas ?? undefined}
          onWordClick={(word, position) => {
            showPopupAt(word, position);
          }}
        />,
      );
      
    }
    
    function cleanupYouTubeOverlay() {
      if (youtubeRoot) {
        youtubeRoot.unmount();
        youtubeRoot = null;
      }
      if (youtubeContainer) {
        youtubeContainer.remove();
        youtubeContainer = null;
      }
    }
    
    // Helper to show popup at a specific position
    async function showPopupAt(word: string, position: { x: number; y: number }) {
      // Ensure vocab cache is loaded before showing popup
      if (!vocabCacheReady) await vocabCachePromise;

      if (popupUi) {
        popupUi.remove();
        popupUi = null;
      }
      
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      
      popupUi = await createShadowRootUi(ctx, {
        name: "vocabify-popup",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          const shadowHost = (container.getRootNode() as ShadowRoot).host as HTMLElement;
          shadowHost.style.position = "absolute";
          container.style.pointerEvents = "none";
          container.style.fontSize = "14px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <FloatingPopup
              word={word.toLowerCase()}
              position={{ x: position.x + scrollX, y: position.y + scrollY }}
              onClose={() => {
                popupUi?.remove();
                popupUi = null;
              }}
              vocabLemmas={vocabCacheLemmas ?? undefined}
              onSaved={(lemma) => {
                if (!vocabCacheLemmas) vocabCacheLemmas = new Set();
                vocabCacheLemmas.add(lemma);
                vocabCacheLemmas.add(word.toLowerCase());
              }}
              onAchievement={(achievement) => {
                showAchievementToast(achievement);
              }}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      
      popupUi.mount();
      popupCreatedAt = Date.now();
    }

    // Load excluded sites and keep in sync
    let excludedDomains: string[] = [];
    chrome.storage.sync.get("excludedDomains").then((data: Record<string, unknown>) => {
      excludedDomains = (data.excludedDomains as string[]) || [];
    }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.excludedDomains) {
        excludedDomains = (changes.excludedDomains.newValue as string[]) || [];
      }
    });

    function isSiteExcluded(): boolean {
      const hostname = window.location.hostname;
      return excludedDomains.some(
        (domain) => hostname === domain || hostname.endsWith("." + domain),
      );
    }

    // --- Word Selection Popup ---
    document.addEventListener("mouseup", async (e) => {
      // Ignore mouseup originating from inside vocabify elements
      const target = e.target as HTMLElement;
      const tag = target.tagName?.toLowerCase();
      if (tag === "vocabify-popup" || tag === "vocabify-sentence" || tag === "vocabify-badge" || tag === "vocabify-panel" || tag === "vocabify-simplify") return;

      // Suppress on editable elements
      if (isEditableTarget(target)) return;

      // Check site exclusion
      if (isSiteExcluded()) return;

      // Small delay to let selection finalize
      await new Promise((r) => setTimeout(r, 10));

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length < 2 || text.length > 300) return;

      const wordCount = text.split(/\s+/).length;
      const isSingleWord = !text.includes(" ") && /^[a-zA-Z'-]+$/.test(text);
      const isSentence = text.includes(" ") && wordCount > 1 && text.length <= 300;

      // Determine which popup to show
      let showSentencePopup = false;

      if (isSingleWord) {
        // Single word → FloatingPopup (below)
      } else if (isSentence) {
        showSentencePopup = true;
      } else {
        return;
      }

      // Don't re-create if popup is already open
      if (popupUi || sentenceUi) return;

      if (!selection) return;

      // Position relative to the selected word using document coordinates
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const currentPopupWidth = showSentencePopup ? 380 : 340; // sentence popup is wider
      // Convert viewport coords to document coords by adding scroll offset
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      // Center horizontally under the word, clamp to viewport
      let x = rect.left + scrollX + rect.width / 2 - currentPopupWidth / 2;
      x = Math.max(scrollX + 8, Math.min(x, scrollX + window.innerWidth - currentPopupWidth - 8));
      // Place below the word with a small gap
      let y = rect.bottom + scrollY + 6;
      // If too close to bottom of viewport, place above
      const placeAbove = rect.bottom + 200 > window.innerHeight;
      if (placeAbove) {
        y = rect.top + scrollY - 6;
      }
      const position = { x, y, placeAbove };

      if (showSentencePopup) {
        sentenceUi = await createShadowRootUi(ctx, {
          name: "vocabify-sentence",
          position: "overlay",
          zIndex: 2147483647,
          onMount(container) {
            const shadowHost = (container.getRootNode() as ShadowRoot).host as HTMLElement;
            shadowHost.style.position = "absolute";
            container.style.pointerEvents = "none";
            container.style.fontSize = "14px";
            const root = ReactDOM.createRoot(container);
            root.render(
              <SentencePopup
                sentence={text}
                position={position}
                onClose={() => {
                  sentenceUi?.remove();
                  sentenceUi = null;
                }}
                vocabLemmas={vocabCacheLemmas ?? undefined}
                onWordClick={(word) => {
                  // Close sentence popup, open FloatingPopup for the clicked word
                  sentenceUi?.remove();
                  sentenceUi = null;
                  showPopupAt(word.toLowerCase(), {
                    x: position.x + currentPopupWidth / 2,
                    y: position.y,
                  });
                }}
              />,
            );
            return root;
          },
          onRemove(root) {
            root?.unmount();
          },
        });
        sentenceUi.mount();
        popupCreatedAt = Date.now();
        return;
      }

      popupUi = await createShadowRootUi(ctx, {
        name: "vocabify-popup",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          // Switch shadow host from fixed to absolute so popup scrolls with page
          const shadowHost = (container.getRootNode() as ShadowRoot).host as HTMLElement;
          shadowHost.style.position = "absolute";

          container.style.pointerEvents = "none";
          container.style.fontSize = "14px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <FloatingPopup
              word={text.toLowerCase()}
              position={position}
              onClose={() => {
                popupUi?.remove();
                popupUi = null;
              }}
              vocabLemmas={vocabCacheLemmas ?? undefined}
              onSaved={(lemma) => {
                if (!vocabCacheLemmas) vocabCacheLemmas = new Set();
                vocabCacheLemmas.add(lemma);
                vocabCacheLemmas.add(text.toLowerCase());
              }}
              onAchievement={(achievement) => {
                showAchievementToast(achievement);
              }}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });

      popupUi.mount();
      popupCreatedAt = Date.now();
    });

    // Close popup on click outside (but not when clicking inside the popup itself)
    document.addEventListener("mousedown", (e) => {
      // Don't close if just created (prevents race with double-click / quick select)
      if (Date.now() - popupCreatedAt < 300) return;
      const target = e.target as HTMLElement;
      const tagLower = target.tagName?.toLowerCase();

      if (popupUi) {
        if (tagLower === "vocabify-popup") return;
        popupUi.remove();
        popupUi = null;
      }
      if (sentenceUi) {
        if (tagLower === "vocabify-sentence") return;
        sentenceUi.remove();
        sentenceUi = null;
      }
    });

    // --- Context menu & keyboard shortcut handlers ---
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "CONTEXT_MENU_TRANSLATE" && message.word) {
        // Get cursor position from last known mouse position
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          showPopupAt(message.word.toLowerCase(), {
            x: rect.left + rect.width / 2,
            y: rect.bottom + 6,
          });
        } else {
          // Fallback: center of viewport
          showPopupAt(message.word.toLowerCase(), {
            x: window.innerWidth / 2,
            y: window.innerHeight / 3,
          });
        }
      } else if (message.type === "CONTEXT_MENU_SAVED" && message.word) {
        // Show a brief save confirmation toast
        showSaveConfirmation(message.word, message.translation);
      } else if (message.type === "KEYBOARD_TRANSLATE") {
        // Translate currently selected text
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (text && text.length >= 2 && text.length <= 40 && /^[a-zA-Z'-]+$/.test(text)) {
          const range = selection!.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          showPopupAt(text.toLowerCase(), {
            x: rect.left + rect.width / 2,
            y: rect.bottom + 6,
          });
        }
      }
    });

    // Brief save confirmation for context menu "Save to Vocabify"
    async function showSaveConfirmation(word: string, translation: string) {
      const confirmUi = await createShadowRootUi(ctx, {
        name: "vocabify-confirm",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          container.style.pointerEvents = "none";
          container.style.fontSize = "14px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <div style={{
              position: "fixed",
              bottom: "20px",
              right: "20px",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 16px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              pointerEvents: "auto",
              animation: "fadeInUp 250ms ease both",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              maxWidth: "280px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#22c55e", fontSize: "18px" }}>&#10003;</span>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>
                    Saved "{word}"
                  </div>
                  <div style={{ fontSize: "11px", color: "#6b7280" }}>
                    {translation}
                  </div>
                </div>
              </div>
            </div>,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      confirmUi.mount();
      setTimeout(() => confirmUi.remove(), 3000);
    }

    // --- Review Toast (triggered by background) ---
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type !== "SHOW_REVIEW" || !message.word) return;

      if (toastUi) {
        toastUi.remove();
        toastUi = null;
      }

      // Hide timer while review toast is shown
      document.dispatchEvent(new CustomEvent("vocabify-toast-visibility", { detail: { visible: true } }));

      createShadowRootUi(ctx, {
        name: "vocabify-toast",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          container.style.fontSize = "16px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <ReviewToast
              word={message.word}
              onClose={() => {
                toastUi?.remove();
                toastUi = null;
                document.dispatchEvent(new CustomEvent("vocabify-toast-visibility", { detail: { visible: false } }));
                // Schedule next review timer
                chrome.runtime.sendMessage({ type: "SCHEDULE_NEXT_REVIEW" }).catch(() => {});
              }}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      }).then((ui) => {
        toastUi = ui;
        toastUi.mount();
      });
    });

    // --- Reading Assistant ---
    async function runPageAnalysis() {
      // Skip analysis on restricted pages
      if (isSiteExcluded()) return;
      const url = window.location.href;
      if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

      // Check settings
      const settings = await chrome.storage.sync.get([
        "readingAssistantEnabled",
        "radarEnabled",
        "userLevel",
      ]) as Record<string, unknown>;

      if (settings.readingAssistantEnabled === false) return;

      // Store user level for panel/badge
      currentUserLevel = (settings.userLevel as string) || "B1";

      // Fetch vocab cache from background
      let vocabCache: VocabCache;
      try {
        const res = await chrome.runtime.sendMessage({ type: "GET_VOCAB_CACHE" });
        if (!res?.success) return;
        const wordsSet = new Set(res.words as string[]);
        const lemmasSet = new Set(res.lemmas as string[]);
        vocabCache = { words: wordsSet, lemmas: lemmasSet };
        // Update the module-level lemma cache for popup use (merge, not replace, to preserve onSaved additions)
        if (!vocabCacheLemmas) vocabCacheLemmas = new Set();
        for (const l of lemmasSet) vocabCacheLemmas.add(l);
        for (const w of wordsSet) vocabCacheLemmas.add(w);
      } catch {
        return;
      }

      // Check cache first (10-minute TTL)
      const cacheKey = `page-analysis:${window.location.href}`;
      try {
        const cached = await getFromStore<{ result: PageAnalysisResult; timestamp: number }>("settings", cacheKey);
        if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
          currentAnalysis = cached.result;
          return;
        }
      } catch {}

      // Run analysis
      const analysis = analyzePageContent(vocabCache);
      currentAnalysis = analysis;

      // Cache result
      try {
        await putInStore("settings", cacheKey, { result: analysis, timestamp: Date.now() });
      } catch {}

      // Skip if too few words (not a real article)
      if (analysis.totalUniqueWords < 10) return;

      // Update radar data
      if (settings.radarEnabled !== false) {
        updateRadarData(analysis).catch(() => {});
      }

    }

    function togglePanel() {
      if (panelUi) {
        panelUi.remove();
        panelUi = null;
        return;
      }
      if (!currentAnalysis) return;

      const analysis = currentAnalysis;

      getRadarSuggestions().then((radar) => {
        createShadowRootUi(ctx, {
          name: "vocabify-panel",
          position: "overlay",
          zIndex: 2147483646,
          onMount(container) {
            container.style.pointerEvents = "none";
            container.style.fontSize = "14px";
            const root = ReactDOM.createRoot(container);
            root.render(
              <ReadingPanel
                analysis={analysis}
                radarSuggestions={radar}
                userLevel={currentUserLevel}
                onClose={() => {
                  panelUi?.remove();
                  panelUi = null;
                }}
                onSaveWord={async (word) => {
                  // Translate then save
                  const transRes = await chrome.runtime.sendMessage({
                    type: "TRANSLATE_WORD",
                    word,
                  });
                  if (transRes?.success) {
                    const saveRes = await chrome.runtime.sendMessage({
                      type: "SAVE_WORD",
                      word,
                      translation: transRes.translation,
                      example: "",
                      sourceUrl: window.location.href,
                    });

                  }
                }}
                onExplainWord={async (word, sentence) => {
                  // Get user settings from storage
                  const storage = await chrome.storage.sync.get(["userLevel", "targetLang"]);
                  const userLevel = storage.userLevel || "B1";
                  const targetLang = storage.targetLang || "ru";
                  const res = await chrome.runtime.sendMessage({
                    type: "AI_EXPLAIN",
                    word,
                    sentence,
                    userLevel,
                    targetLang,
                  });
                  if (res?.success) return res.explanation as string;
                  return null;
                }}
                onSimplifyPage={handleSimplifyPage}
              />,
            );
            return root;
          },
          onRemove(root) {
            root?.unmount();
          },
        }).then((ui) => {
          panelUi = ui;
          panelUi.mount();
        });
      });
    }

    async function handleSimplifyPage() {
      const text = collectVisibleText(12_000);
      if (!text || text.length < 50) return;

      // Get user level from storage
      const storage = await chrome.storage.sync.get("userLevel");
      const userLevel = storage.userLevel || "B1";
      const res = await chrome.runtime.sendMessage({
        type: "AI_SIMPLIFY",
        text,
        userLevel,
      });
      if (!res?.success) return;

      if (simplifyUi) {
        simplifyUi.remove();
        simplifyUi = null;
      }

      simplifyUi = await createShadowRootUi(ctx, {
        name: "vocabify-simplify",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          container.style.pointerEvents = "none";
          container.style.fontSize = "14px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <SimplifyPanel
              simplified={res.simplified as string}
              onClose={() => {
                simplifyUi?.remove();
                simplifyUi = null;
              }}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });

      simplifyUi.mount();
    }

    // --- Activity reporting for smart scheduler ---
    let lastActivityReport = 0;
    const ACTIVITY_DEBOUNCE = 60_000; // max 1 report per 60s

    function reportActivity() {
      const now = Date.now();
      if (now - lastActivityReport < ACTIVITY_DEBOUNCE) return;
      lastActivityReport = now;
      chrome.runtime.sendMessage({ type: "UPDATE_ACTIVITY" }).catch(() => {});
    }

    document.addEventListener("scroll", reportActivity, { passive: true });
    document.addEventListener("click", reportActivity, { passive: true });

    // Typing state (debounced)
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleKeydown = () => {
      chrome.runtime.sendMessage({ type: "TYPING_STATE", typing: true }).catch(() => {});
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        chrome.runtime.sendMessage({ type: "TYPING_STATE", typing: false }).catch(() => {});
      }, 30_000);
    };
    document.addEventListener("keydown", handleKeydown, { passive: true });

    // Video state detection
    function detectVideoState() {
      const videos = document.querySelectorAll("video");
      let anyPlaying = false;
      for (const video of videos) {
        if (!video.paused && !video.ended && video.readyState > 2) {
          anyPlaying = true;
          break;
        }
      }
      chrome.runtime.sendMessage({ type: "VIDEO_STATE", playing: anyPlaying }).catch(() => {});
    }

    // Check video state periodically
    const videoStateInterval = setInterval(detectVideoState, 10_000);

    // Cleanup activity listeners and intervals on invalidation
    ctx.onInvalidated(() => {
      document.removeEventListener("scroll", reportActivity);
      document.removeEventListener("click", reportActivity);
      document.removeEventListener("keydown", handleKeydown);
      clearInterval(videoStateInterval);
      if (typingTimeout) clearTimeout(typingTimeout);
    });

    // Run analysis after page load via requestIdleCallback
    if (document.readyState === "complete") {
      scheduleAnalysis();
    } else {
      window.addEventListener("load", scheduleAnalysis, { once: true });
    }

    function scheduleAnalysis() {
      if ("requestIdleCallback" in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(() => runPageAnalysis(), { timeout: 5000 });
      } else {
        setTimeout(runPageAnalysis, 1000);
      }
    }
  },
});
