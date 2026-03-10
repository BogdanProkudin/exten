import ReactDOM from "react-dom/client";
import { FloatingPopup } from "./FloatingPopup";
import { ReviewToast } from "./ReviewToast";
import { ReadingBadge } from "./ReadingBadge";
import { ReadingPanel } from "./ReadingPanel";
import { SimplifyPanel } from "./SimplifyPanel";
import { AchievementToast } from "./AchievementToast";
import { YouTubeOverlay } from "./YouTubeOverlay";
import { ReadingSpeedButton } from "./ReadingSpeedButton";
import { PredictionToast } from "./PredictionToast";
import { PredictionWidget } from "./PredictionWidget";
import { PredictionButton } from "./PredictionButton";
import { WritingAssistant } from "./WritingAssistant";
import { analyzePageContent, type PageAnalysisResult, type VocabCache } from "../../src/lib/page-analyzer";
import { isYouTubePage, isYouTubeVideoPage, getVideoElement } from "../../src/lib/youtube";
import { getPatternAnalyzer } from "../../src/lib/pattern-analyzer";
import { getGamificationEngine } from "../../src/lib/gamification";
import { getPredictionEngine, type WordPrediction } from "../../src/lib/prediction-engine";
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
function extractSentencesFromPage(): string[] {
  const sentences: string[] = [];
  
  // Get main content areas, skip navigation/ads/headers
  const contentSelectors = [
    'main', 'article', '[role="main"]', '.content', '.post', '.entry',
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li'
  ];
  
  const skipSelectors = [
    'nav', 'header', 'footer', 'aside', '.navigation', '.menu', 
    '.ads', '.advertisement', '.sidebar', '.related', '.comments'
  ];
  
  // Find content elements
  contentSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      // Skip if element is inside a skip area
      if (skipSelectors.some(skipSel => element.closest(skipSel))) {
        return;
      }
      
      const text = element.textContent || '';
      if (text.length > 20 && text.length < 500) {
        // Split into sentences using basic sentence boundary detection
        const sentenceSplit = text
          .split(/[.!?]+/)
          .map(s => s.trim())
          .filter(s => s.length > 15 && s.length < 200 && /[a-zA-Z]/.test(s));
        
        sentences.push(...sentenceSplit);
      }
    });
  });
  
  // Deduplicate and limit
  const uniqueSentences = [...new Set(sentences)];
  return uniqueSentences.slice(0, 50); // Limit to avoid performance issues
}

// --- Radar helpers ---
interface RadarData {
  seen: Record<string, { count: number; lastSeenAt: number }>;
}

const RADAR_MAX_ENTRIES = 500; // Limit radar size to prevent storage overflow

async function updateRadarData(analysis: PageAnalysisResult): Promise<void> {
  const data = await chrome.storage.local.get("vocabifyRadar") as Record<string, RadarData | undefined>;
  const radar: RadarData = data.vocabifyRadar ?? { seen: {} };

  // Take top 20 unknown words from this page
  const top = analysis.unknownWords.slice(0, 20);
  const now = Date.now();
  for (const uw of top) {
    const existing = radar.seen[uw.lemma];
    if (existing) {
      existing.count += 1; // +1 per page, not per occurrence
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

  await chrome.storage.local.set({ vocabifyRadar: radar });
}

async function getRadarSuggestions(): Promise<{ lemma: string; count: number }[]> {
  const data = await chrome.storage.local.get("vocabifyRadar") as Record<string, RadarData | undefined>;
  const radar = data.vocabifyRadar;
  if (!radar?.seen) return [];

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
    let popupCreatedAt = 0;
    let toastUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let badgeUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let panelUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let simplifyUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let achievementUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let readingSpeedButtonUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let predictionToastUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let predictionWidgetUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let predictionButtonUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let writingAssistantUi: Awaited<ReturnType<typeof createShadowRootUi>> | null = null;
    let lastPredictionShown = 0; // Track when we last showed a prediction
    let currentFocusedElement: HTMLElement | null = null;
    let currentAnalysis: PageAnalysisResult | null = null;

    // Show achievement notification
    async function showAchievementToast(achievement: { id: string; name: string; icon: string; xp: number; description?: string }) {
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
          container.style.fontSize = "16px";
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

    // Fetch vocab cache early so it's ready when the popup opens
    chrome.runtime.sendMessage({ type: "GET_VOCAB_CACHE" }).then((res) => {
      console.log("[Vocabify] GET_VOCAB_CACHE response:", res);
      if (res?.success) {
        if (!vocabCacheLemmas) vocabCacheLemmas = new Set();
        for (const l of res.lemmas as string[]) vocabCacheLemmas.add(l);
        // Also include words (for pre-migration entries without lemma)
        for (const w of res.words as string[]) vocabCacheLemmas.add(w);
        console.log("[Vocabify] Cache loaded with lemmas:", Array.from(vocabCacheLemmas));
        
        // Initialize YouTube overlay if already on a video page
        if (isYouTubeVideoPage()) {
          initYouTubeOverlay();
        }
      }
    }).catch((err) => {
      console.error("[Vocabify] GET_VOCAB_CACHE error:", err);
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
    }
    
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
        console.log("[Vocabify] YouTube player not found, skipping overlay");
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
      
      console.log("[Vocabify] YouTube overlay initialized");
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
          container.style.fontSize = "16px";
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
    });
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
      if (tag === "vocabify-popup" || tag === "vocabify-badge" || tag === "vocabify-panel" || tag === "vocabify-simplify") return;

      // Suppress on editable elements
      if (isEditableTarget(target)) return;

      // Check site exclusion
      if (isSiteExcluded()) return;

      // Small delay to let selection finalize
      await new Promise((r) => setTimeout(r, 10));

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length < 2 || text.length > 80) return;

      // Single word: must be letters only
      const isSingleWord = !text.includes(" ") && /^[a-zA-Z'-]+$/.test(text);
      // Multi-word: check if it's a known phrase (2-4 words)
      const isPhrase = text.includes(" ") && text.split(/\s+/).length <= 4;

      if (!isSingleWord && !isPhrase) return;

      // For phrases, detect and only show popup if it's a known phrase
      if (isPhrase) {
        const { detectPhrase } = await import("../../src/lib/phrase-detector");
        if (!detectPhrase(text)) return;
      }

      // Don't re-create if popup is already open
      if (popupUi) return;

      if (!selection) return;

      // Position relative to the selected word using document coordinates
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const popupWidth = 380;
      // Convert viewport coords to document coords by adding scroll offset
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      // Center horizontally under the word, clamp to viewport
      let x = rect.left + scrollX + rect.width / 2 - popupWidth / 2;
      x = Math.max(scrollX + 8, Math.min(x, scrollX + window.innerWidth - popupWidth - 8));
      // Place below the word with a small gap
      let y = rect.bottom + scrollY + 6;
      // If too close to bottom of viewport, place above
      const placeAbove = rect.bottom + 200 > window.innerHeight;
      if (placeAbove) {
        y = rect.top + scrollY - 6;
      }
      const position = { x, y, placeAbove };

      popupUi = await createShadowRootUi(ctx, {
        name: "vocabify-popup",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          // Switch shadow host from fixed to absolute so popup scrolls with page
          const shadowHost = (container.getRootNode() as ShadowRoot).host as HTMLElement;
          shadowHost.style.position = "absolute";

          container.style.pointerEvents = "none";
          container.style.fontSize = "16px";
          const root = ReactDOM.createRoot(container);
          console.log("[Vocabify] Creating popup for word:", text.toLowerCase(), "cache:", vocabCacheLemmas ? Array.from(vocabCacheLemmas) : null);
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
                console.log("[Vocabify] onSaved called:", { lemma, word: text.toLowerCase() });
                if (!vocabCacheLemmas) vocabCacheLemmas = new Set();
                vocabCacheLemmas.add(lemma);
                vocabCacheLemmas.add(text.toLowerCase());
                console.log("[Vocabify] Cache updated, lemmas:", Array.from(vocabCacheLemmas));
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
      if (popupUi) {
        // Don't close popup if it was just created (prevents race with double-click / quick select)
        if (Date.now() - popupCreatedAt < 300) return;
        const target = e.target as HTMLElement;
        // Clicks inside the shadow root retarget to the shadow host element
        if (target.tagName?.toLowerCase() === "vocabify-popup") return;
        popupUi.remove();
        popupUi = null;
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
          container.style.fontSize = "16px";
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

      createShadowRootUi(ctx, {
        name: "vocabify-toast",
        position: "overlay",
        zIndex: 2147483647,
        onMount(container) {
          container.style.pointerEvents = "none";
          container.style.fontSize = "16px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <ReviewToast
              word={message.word}
              onClose={() => {
                toastUi?.remove();
                toastUi = null;
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
        "showDifficultyBadge",
        "radarEnabled",
      ]) as Record<string, unknown>;

      if (settings.readingAssistantEnabled === false) return;

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

      // Run analysis
      const analysis = analyzePageContent(vocabCache);
      currentAnalysis = analysis;

      // Skip if too few words (not a real article)
      if (analysis.totalUniqueWords < 10) return;

      // Pattern analysis - Zero AI cost, pure algorithm
      try {
        const deviceId = await chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" });
        if (deviceId?.success) {
          const patternAnalyzer = await getPatternAnalyzer(deviceId.deviceId);
          const gamification = await getGamificationEngine(deviceId.deviceId);

          // Analyze sentences on the page for patterns
          const sentences = extractSentencesFromPage();
          sentences.forEach(sentence => {
            if (sentence.length > 20 && sentence.length < 200) {
              patternAnalyzer.analyzeSentence(sentence, window.location.href);
            }
          });

          // Check for new patterns discovered and award XP
          const insights = patternAnalyzer.getGrammarInsights();
          const newPatternsCount = insights.filter(p => p.lastSeen > Date.now() - 60000).length; // Last minute
          
          if (newPatternsCount > 0) {
            gamification.addXP({ 
              action: 'pattern_discovered', 
              amount: newPatternsCount * 25,
              source: 'page_analysis'
            });
            
            // Update daily activity
            gamification.updateDailyActivity();
            
            // Save both engines
            await Promise.all([
              patternAnalyzer.saveToStorage(),
              gamification.saveToStorage()
            ]);
          }

          // Prediction Engine: Track browsing session for future predictions
          try {
            const predictionEngine = await getPredictionEngine(deviceId.deviceId);
            const domain = window.location.hostname;
            const wordsOnPage = analysis.unknownWords.map(uw => uw.word).slice(0, 50); // Limit for performance
            
            // Record this browsing session
            await predictionEngine.recordBrowsingSession(domain, 30000, wordsOnPage); // 30s estimated session
            
            // If this is a significant session (lots of unknown words), log it
            if (wordsOnPage.length >= 5) {
              console.debug(`[Vocabify] Recorded session on ${domain}: ${wordsOnPage.length} new words`);
            }

            // Show prediction toast occasionally for high-priority words
            const now = Date.now();
            const timeSinceLastPrediction = now - lastPredictionShown;
            const shouldShowPrediction = timeSinceLastPrediction > 5 * 60 * 1000; // 5 minutes cooldown

            if (shouldShowPrediction && !predictionToastUi) {
              const predictions = predictionEngine.generatePredictions(5);
              const highPriorityPrediction = predictions.find(p => p.urgency >= 0.7 && p.confidence >= 0.6);
              
              if (highPriorityPrediction) {
                showPredictionToast(highPriorityPrediction, deviceId.deviceId);
                lastPredictionShown = now;
              }
            }
          } catch (error) {
            console.debug('Prediction engine update failed:', error);
          }
        }
      } catch (error) {
        // Silently fail - pattern analysis is optional
        console.debug('Pattern analysis failed:', error);
      }

      // Update radar data
      if (settings.radarEnabled !== false) {
        updateRadarData(analysis).catch(() => {});
      }

      // Mount badge
      if (settings.showDifficultyBadge !== false) {
        mountBadge(analysis);
      }
    }

    function mountBadge(analysis: PageAnalysisResult) {
      if (badgeUi) return;

      createShadowRootUi(ctx, {
        name: "vocabify-badge",
        position: "overlay",
        zIndex: 2147483646,
        onMount(container) {
          container.style.pointerEvents = "none";
          container.style.fontSize = "16px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <ReadingBadge
              analysis={analysis}
              onClick={togglePanel}
            />,
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      }).then((ui) => {
        badgeUi = ui;
        badgeUi.mount();
      });
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
            container.style.fontSize = "16px";
            const root = ReactDOM.createRoot(container);
            root.render(
              <ReadingPanel
                analysis={analysis}
                radarSuggestions={radar}
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

                    // Gamification: Award XP for saving words! 🎮
                    if (saveRes?.success) {
                      try {
                        const deviceIdRes = await chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" });
                        if (deviceIdRes?.success) {
                          const gamification = await getGamificationEngine(deviceIdRes.deviceId);
                          
                          // Base XP for saving a word
                          let xpGain = 25;
                          let bonus = 1;
                          
                          // Bonus XP for rare/difficult words
                          if (word.length >= 8) bonus += 0.2; // Long words
                          if (currentAnalysis) {
                            const unknownWord = currentAnalysis.unknownWords.find(uw => uw.word.toLowerCase() === word.toLowerCase());
                            if (unknownWord && unknownWord.difficulty > 0.7) {
                              bonus += 0.5; // Difficult words worth more
                              xpGain = 40;
                            }
                          }

                          const result = gamification.addXP({ 
                            action: 'word_saved', 
                            amount: xpGain,
                            bonus: bonus,
                            source: window.location.hostname
                          });

                          // Update daily activity for streaks
                          gamification.updateDailyActivity();
                          
                          // Save progress
                          await gamification.saveToStorage();

                          // Show level up notification if leveled up
                          if (result.leveledUp) {
                            // Could show a level up toast here
                            console.log(`🎉 Level up! You're now level ${result.newLevel}!`);
                          }

                          // Show achievement notifications
                          if (result.achievementsUnlocked.length > 0) {
                            result.achievementsUnlocked.forEach(achievement => {
                              console.log(`🏆 Achievement unlocked: ${achievement.name}!`);
                            });
                          }
                        }
                      } catch (error) {
                        // Gamification failure shouldn't break word saving
                        console.debug('Gamification update failed:', error);
                      }
                    }
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
          container.style.fontSize = "16px";
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

    // Reading Speed Tracker Button
    async function showReadingSpeedButton() {
      if (readingSpeedButtonUi) return;

      readingSpeedButtonUi = await createShadowRootUi(ctx, {
        name: "vocabify-reading-speed-button",
        position: "overlay",
        zIndex: 2147483645, // Just below other UI elements
        onMount(container) {
          const root = ReactDOM.createRoot(container);
          root.render(
            <ReadingSpeedButton
              onToggle={() => {
                // Optional: Could track usage here
              }}
            />
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });

      readingSpeedButtonUi.mount();
    }

    // Prediction Toast
    async function showPredictionToast(prediction: WordPrediction, deviceId: string) {
      if (predictionToastUi) return;

      predictionToastUi = await createShadowRootUi(ctx, {
        name: "vocabify-prediction-toast",
        position: "overlay",
        zIndex: 2147483644, // Below reading speed button
        onMount(container) {
          container.style.pointerEvents = "none";
          container.style.fontSize = "16px";
          const root = ReactDOM.createRoot(container);
          root.render(
            <PredictionToast
              prediction={prediction}
              onClose={() => {
                predictionToastUi?.remove();
                predictionToastUi = null;
              }}
              onLearnNow={async (word: string) => {
                // Show popup for the predicted word
                const rect = document.querySelector('body')?.getBoundingClientRect();
                if (rect) {
                  const centerX = window.innerWidth / 2 - 190; // Center popup
                  const centerY = window.innerHeight / 3;
                  
                  // Show popup for the predicted word
                  showPopupAt(word.toLowerCase(), { 
                    x: centerX, 
                    y: centerY
                  });
                }
              }}
              onDismiss={async (word: string) => {
                // Track that user dismissed this prediction (for learning)
                try {
                  const engine = await getPredictionEngine(deviceId);
                  engine.validatePrediction(word, false); // User didn't want to learn it
                } catch (error) {
                  console.debug('Failed to track prediction dismissal:', error);
                }
              }}
            />
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });

      predictionToastUi.mount();

      // Auto-hide after 15 seconds
      setTimeout(() => {
        if (predictionToastUi) {
          predictionToastUi.remove();
          predictionToastUi = null;
        }
      }, 15000);
    }

    // Prediction Widget
    async function showPredictionWidget() {
      if (predictionWidgetUi) {
        // If already open, close it
        predictionWidgetUi.remove();
        predictionWidgetUi = null;
        return;
      }

      try {
        const deviceIdRes = await chrome.runtime.sendMessage({ type: "GET_DEVICE_ID" });
        if (!deviceIdRes?.success) return;

        predictionWidgetUi = await createShadowRootUi(ctx, {
          name: "vocabify-prediction-widget",
          position: "overlay",
          zIndex: 2147483646,
          onMount(container) {
            container.style.pointerEvents = "none";
            container.style.fontSize = "16px";
            const root = ReactDOM.createRoot(container);
            root.render(
              <PredictionWidget
                deviceId={deviceIdRes.deviceId}
                onClose={() => {
                  predictionWidgetUi?.remove();
                  predictionWidgetUi = null;
                }}
                onWordSelect={(word: string) => {
                  // Close widget and show popup for selected word
                  predictionWidgetUi?.remove();
                  predictionWidgetUi = null;
                  
                  const centerX = window.innerWidth / 2 - 190;
                  const centerY = window.innerHeight / 3;
                  showPopupAt(word.toLowerCase(), { x: centerX, y: centerY });
                }}
              />
            );
            return root;
          },
          onRemove(root) {
            root?.unmount();
          },
        });

        predictionWidgetUi.mount();
      } catch (error) {
        console.error('Failed to show prediction widget:', error);
      }
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (event) => {
      // Ctrl/Cmd + Shift + P = Show prediction widget
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        showPredictionWidget();
      }
    });

    // Prediction Button
    async function showPredictionButton() {
      if (predictionButtonUi) return;

      predictionButtonUi = await createShadowRootUi(ctx, {
        name: "vocabify-prediction-button",
        position: "overlay",
        zIndex: 2147483645,
        onMount(container) {
          const root = ReactDOM.createRoot(container);
          root.render(
            <PredictionButton
              onClick={() => showPredictionWidget()}
            />
          );
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });

      predictionButtonUi.mount();
    }

    // Writing Assistant
    async function showWritingAssistant(targetElement: HTMLElement) {
      // Close any existing assistant
      if (writingAssistantUi) {
        writingAssistantUi.remove();
        writingAssistantUi = null;
      }

      // Check if writing assistant is enabled
      try {
        const settings = await chrome.storage.sync.get(['enableWritingAssistant', 'openaiApiKey']);
        if (settings.enableWritingAssistant === false || !settings.openaiApiKey) {
          return; // Don't show if disabled or no API key
        }

        writingAssistantUi = await createShadowRootUi(ctx, {
          name: "vocabify-writing-assistant",
          position: "overlay",
          zIndex: 2147483647, // Highest priority
          onMount(container) {
            container.style.pointerEvents = "auto";
            const root = ReactDOM.createRoot(container);
            root.render(
              <WritingAssistant
                targetElement={targetElement}
                onClose={() => {
                  writingAssistantUi?.remove();
                  writingAssistantUi = null;
                  currentFocusedElement = null;
                }}
              />
            );
            return root;
          },
          onRemove(root) {
            root?.unmount();
          },
        });

        writingAssistantUi.mount();
      } catch (error) {
        console.error('Failed to show writing assistant:', error);
      }
    }

    // Focus/blur handlers for writing assistant
    document.addEventListener('focusin', async (event) => {
      const target = event.target as HTMLElement;
      
      if (isEditableTarget(target) && target !== currentFocusedElement) {
        currentFocusedElement = target;
        
        // Show writing assistant after a short delay
        setTimeout(async () => {
          if (currentFocusedElement === target && document.activeElement === target) {
            await showWritingAssistant(target);
          }
        }, 1000); // 1 second delay so it doesn't appear immediately
      }
    });

    document.addEventListener('focusout', (event) => {
      // Hide writing assistant when focus leaves editable elements
      setTimeout(() => {
        if (!document.activeElement || !isEditableTarget(document.activeElement as HTMLElement)) {
          if (writingAssistantUi) {
            writingAssistantUi.remove();
            writingAssistantUi = null;
          }
          currentFocusedElement = null;
        }
      }, 200); // Short delay to avoid hiding when clicking within the assistant
    });

    // Show the reading speed button and prediction button on every page
    if (document.readyState === "complete") {
      showReadingSpeedButton();
      showPredictionButton();
    } else {
      window.addEventListener("load", () => {
        showReadingSpeedButton();
        showPredictionButton();
      }, { once: true });
    }

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
