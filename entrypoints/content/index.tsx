import ReactDOM from "react-dom/client";
import { FloatingPopup } from "./FloatingPopup";
import { ReviewToast } from "./ReviewToast";
import { ReadingBadge } from "./ReadingBadge";
import { ReadingPanel } from "./ReadingPanel";
import { SimplifyPanel } from "./SimplifyPanel";
import { analyzePageContent, type PageAnalysisResult, type VocabCache } from "../../src/lib/page-analyzer";
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

// --- Radar helpers ---
interface RadarData {
  seen: Record<string, { count: number; lastSeenAt: number }>;
}

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
    let currentAnalysis: PageAnalysisResult | null = null;

    // Vocab cache: lemmas the user has already saved (for instant saved-word detection in popup)
    let vocabCacheLemmas: Set<string> | null = null;

    // Fetch vocab cache early so it's ready when the popup opens
    chrome.runtime.sendMessage({ type: "GET_VOCAB_CACHE" }).then((res) => {
      if (res?.success) {
        if (!vocabCacheLemmas) vocabCacheLemmas = new Set();
        for (const l of res.lemmas as string[]) vocabCacheLemmas.add(l);
        // Also include words (for pre-migration entries without lemma)
        for (const w of res.words as string[]) vocabCacheLemmas.add(w);
      }
    }).catch(() => {});

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

      if (!text || text.includes(" ") || text.length < 2 || text.length > 40) {
        return;
      }

      // Only match words (letters, hyphens, apostrophes)
      if (!/^[a-zA-Z'-]+$/.test(text)) return;

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
                    await chrome.runtime.sendMessage({
                      type: "SAVE_WORD",
                      word,
                      translation: transRes.translation,
                      example: "",
                      sourceUrl: window.location.href,
                    });
                  }
                }}
                onExplainWord={async (word, sentence) => {
                  const res = await chrome.runtime.sendMessage({
                    type: "AI_EXPLAIN",
                    word,
                    sentence,
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

      const res = await chrome.runtime.sendMessage({
        type: "AI_SIMPLIFY",
        text,
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
