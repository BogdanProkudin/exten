import { useState, useEffect, useRef, useCallback } from "react";
import { extractSentence, highlightWord } from "../../src/lib/text-utils";
import { extractPageWords } from "../../src/lib/page-scan";
import {
  gatherTextBlocks,
  processBlocks,
  getContextAroundSentence,
  type CandidateSentence,
} from "../../src/lib/context-capture";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";
import { lemmatize } from "../../src/lib/lemmatize";
import { computeStrength } from "../../src/lib/memory-strength";
import { getWordEnrichment, type WordEnrichment } from "../../src/lib/word-enrichment";
import { getPhrasalVerbs } from "../../src/lib/phrase-detector";
import type { CollocationMatch } from "../../src/lib/collocation-engine";
import { speak } from "../../src/lib/tts";
import { getAITranslator } from "../../src/lib/ai-translator";

interface SavedWordData {
  _id: string;
  word: string;
  translation: string;
  status: string;
  isHard: boolean;
  contexts: { sentence: string; url: string; timestamp: number }[];
  reviewCount: number;
  lastReviewed?: number;
  difficulty: number;
  consecutiveCorrect: number;
  intervalDays: number;
}

interface Achievement {
  id: string;
  name: string;
  icon: string;
  xp: number;
}

interface FloatingPopupProps {
  word: string;
  position: { x: number; y: number; placeAbove?: boolean };
  onClose: () => void;
  vocabLemmas?: Set<string>;
  onSaved?: (lemma: string) => void;
  onAchievement?: (achievement: Achievement) => void;
  wordType?: "word" | "phrase";
  phraseCategory?: string;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function friendlyError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network")) {
    return "Network error. Check your connection.";
  }
  if (msg.includes("timed out") || msg.includes("timeout")) {
    return "Request timed out. Try again.";
  }
  if (msg.includes("translation failed")) {
    return "Translation unavailable. Try again.";
  }
  return "Something went wrong. Try again.";
}

export function FloatingPopup({ word, position, onClose, vocabLemmas, onSaved, onAchievement, wordType, phraseCategory }: FloatingPopupProps) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorShake, setErrorShake] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedWordId, setSavedWordId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<string[] | null>(null);
  const [savingWord, setSavingWord] = useState<string | null>(null);
  const [savedScanWords, setSavedScanWords] = useState<Set<string>>(new Set());
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [simplifying, setSimplifying] = useState(false);
  const [simplified, setSimplified] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [contextTipVisible, setContextTipVisible] = useState(false);
  const [scanTipVisible, setScanTipVisible] = useState(false);
  const [explainTipVisible, setExplainTipVisible] = useState(false);

  // Word enrichment state
  const [enrichment, setEnrichment] = useState<WordEnrichment | null>(null);
  const [enrichmentExpanded, setEnrichmentExpanded] = useState(false);
  // Collocation state
  const [collocations, setCollocations] = useState<CollocationMatch[]>([]);
  const [collocationsExpanded, setCollocationsExpanded] = useState(false);
  const [savingCollocation, setSavingCollocation] = useState<string | null>(null);

  // Smart context capture state
  const [candidates, setCandidates] = useState<CandidateSentence[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);
  const [allSentences, setAllSentences] = useState<string[]>([]);

  // Saved-word detection: mode can transition "saved" → "new" on fetch failure
  const lemma = lemmatize(word);
  const detectedAsSaved = vocabLemmas?.has(lemma) ?? false;
  const [mode, setMode] = useState<"new" | "saved">(detectedAsSaved ? "saved" : "new");
  const [savedWordData, setSavedWordData] = useState<SavedWordData | null>(null);
  const [loadingSavedData, setLoadingSavedData] = useState(detectedAsSaved);
  const [togglingHard, setTogglingHard] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const [contextAddResult, setContextAddResult] = useState<"added" | "duplicate" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Review mini-card state
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewResult, setReviewResult] = useState<"remembered" | "forgot" | null>(null);
  const [reviewNewStatus, setReviewNewStatus] = useState<string | null>(null);

  // Fade in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Auto-clear action errors after 3 seconds
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 3000);
    return () => clearTimeout(t);
  }, [actionError]);

  // Always verify saved status against server (handles stale/missing local cache)
  useEffect(() => {
    console.log("[Vocabify] Checking saved status for:", { word, lemma, detectedAsSaved });
    chrome.runtime
      .sendMessage({ type: "GET_WORD_BY_LEMMA", lemma, word: word.toLowerCase() })
      .then((res) => {
        console.log("[Vocabify] GET_WORD_BY_LEMMA response:", res);
        if (res?.success && res.word) {
          setSavedWordData(res.word as SavedWordData);
          setMode("saved");
        } else {
          // Word not in DB (deleted?) — fall back to new if we thought it was saved
          console.log("[Vocabify] Word not found in DB, keeping mode:", mode);
          setMode((prev) => (prev === "saved" ? "new" : prev));
        }
      })
      .catch((err) => {
        console.error("[Vocabify] GET_WORD_BY_LEMMA error:", err);
        setMode((prev) => (prev === "saved" ? "new" : prev));
      })
      .finally(() => setLoadingSavedData(false));
  }, [lemma]);

  // Smart context: capture DOM blocks synchronously, process on idle
  useEffect(() => {
    const blocks = gatherTextBlocks(word);
    if (blocks.length === 0) {
      setLoadingCandidates(false);
      return;
    }

    const schedule = "requestIdleCallback" in window
      ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 300 })
      : (cb: () => void) => setTimeout(cb, 0);

    schedule(() => {
      const result = processBlocks(blocks, word);
      const hasCands = result.candidates.length > 0;
      setCandidates(hasCands ? result.candidates : null);
      setAllSentences(result.allSentences);
      setLoadingCandidates(false);
      // Check if we should show save-context tip
      if (hasCands) {
        shouldShowTip("tip_save_context").then((show) => {
          if (show) {
            setContextTipVisible(true);
            markTipSeen("tip_save_context");
          }
        });
      }
    });
  }, [word]);

  const fetchTranslation = useCallback(async () => {
    if (mode === "saved") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTranslation(null);

    try {
      // Try AI translation first if enabled and configured
      const aiTranslator = await getAITranslator();
      if (aiTranslator) {
        const settings = await chrome.storage.sync.get(['enableSmartTranslation']);
        
        if (settings.enableSmartTranslation !== false) {
          try {
            const context = aiTranslator.getTranslationContext(word, document.body.innerText.slice(0, 500));
            const fullContext = {
              sourceText: word,
              surroundingText: context.surroundingText || '',
              ...context,
              domain: context.domain || window.location.hostname,
              contentType: context.contentType || 'article',
              userLevel: context.userLevel || 'B1',
              targetLanguage: context.targetLanguage || 'ru',
              sourceLanguage: 'en'
            };

            const smartTranslation = await aiTranslator.translateSmart(word, fullContext);
            
            if (smartTranslation && smartTranslation.mainTranslation) {
              let enhancedTranslation = smartTranslation.mainTranslation;
              
              if (smartTranslation.alternativeTranslations.length > 0) {
                enhancedTranslation += ` (${smartTranslation.alternativeTranslations.slice(0, 2).join(', ')})`;
              }
              
              if (smartTranslation.partOfSpeech) {
                enhancedTranslation += ` [${smartTranslation.partOfSpeech}]`;
              }

              setTranslation(enhancedTranslation);
              
              // Create enhanced enrichment
              const enhancedEnrichment: WordEnrichment = {
                phonetic: smartTranslation.pronunciation || '',
                definitions: smartTranslation.contextualUsage.examples.map((example) => ({
                  partOfSpeech: smartTranslation.partOfSpeech || 'unknown',
                  definition: smartTranslation.contextualUsage.explanation || example
                })),
                synonyms: smartTranslation.learningTips.similarWords,
                antonyms: []
              };
              
              setEnrichment(enhancedEnrichment);
              setLoading(false);
              return;
            }
          } catch (aiError) {
            console.debug('AI translation failed, using fallback:', aiError);
          }
        }
      }

      // Fallback to regular translation
      const res = await chrome.runtime.sendMessage({ type: "TRANSLATE_WORD", word });
      if (res?.success) {
        setTranslation(res.translation);
        // Fetch enrichment and collocations in parallel (fire-and-forget)
        getWordEnrichment(word).then(setEnrichment).catch(() => {});
        try {
          const colRes = await chrome.runtime.sendMessage({ type: "GET_COLLOCATIONS", word });
          if (colRes?.success && colRes.collocations?.length > 0) {
            setCollocations(colRes.collocations);
          } else {
            // Try discovering via API if no static matches
            try {
              const discRes = await chrome.runtime.sendMessage({ type: "DISCOVER_COLLOCATIONS", word });
              if (discRes?.success && discRes.collocations?.length > 0) {
                setCollocations(discRes.collocations);
              }
            } catch { /* collocation discovery is non-critical */ }
          }
        } catch { /* collocation fetch is non-critical */ }
      } else {
        const msg = res?.error || "Translation failed";
        setError(friendlyError(msg));
        setErrorShake(true);
        setTimeout(() => setErrorShake(false), 400);
      }
    } catch (error) {
      setError("Translation failed");
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 400);
    } finally {
      setLoading(false);
    }
  }, [word, mode]);

  useEffect(() => {
    fetchTranslation();
    // Check for scan/explain tips (only for new words)
    if (mode === "new") {
      shouldShowTip("tip_scan_page").then((show) => {
        if (show) {
          setScanTipVisible(true);
          markTipSeen("tip_scan_page");
          setTimeout(() => setScanTipVisible(false), 5000);
        }
      });
      shouldShowTip("tip_explain").then((show) => {
        if (show) {
          setExplainTipVisible(true);
          markTipSeen("tip_explain");
          setTimeout(() => setExplainTipVisible(false), 5000);
        }
      });
    }
  }, [fetchTranslation]);

  // Escape to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fadeOutAndClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const fadeOutAndClose = () => {
    setFading(true);
    setTimeout(onClose, 250);
  };

  const handleSave = async (withContext = false) => {
    if (!translation || saved || saving) return;
    setSaving(true);

    let example = "";
    let exampleContext: string[] | undefined;
    let exampleSource: string | undefined;

    if (candidates && candidates.length > 0) {
      const selected = candidates[selectedCandidateIdx];
      example = selected.text;
      exampleSource = selected.source;

      if (withContext) {
        exampleContext = getContextAroundSentence(allSentences, example);
      }
    } else {
      // Fallback: old behavior
      const selection = window.getSelection();
      if (selection?.anchorNode) {
        const parent = selection.anchorNode.parentElement?.closest(
          "p, li, div, span, td, h1, h2, h3, h4, h5, h6",
        );
        if (parent) {
          example = extractSentence(parent.textContent || "", word);
        }
      }
    }

    const res = await chrome.runtime.sendMessage({
      type: "SAVE_WORD",
      word,
      translation,
      example,
      sourceUrl: window.location.href,
      exampleContext,
      exampleSource,
      wordType: wordType ?? (word.includes(" ") ? "phrase" : undefined),
    });

    setSaving(false);

    if (res?.success) {
      console.log("[Vocabify] Word saved successfully:", { word, lemma });
      setSaved(true);
      if (res.wordId) setSavedWordId(res.wordId);
      // Show achievement notifications
      if (res.achievements && res.achievements.length > 0) {
        // Delay achievement display until after save animation
        setTimeout(() => {
          for (const achievement of res.achievements) {
            onAchievement?.(achievement);
          }
        }, 1000);
      }
      incrementCounter("wordsSaved");
      if (withContext) incrementCounter("saveContextUsed", true);
      onSaved?.(lemma);
      setTimeout(fadeOutAndClose, 5000); // Extended for undo window
    } else {
      console.error("[Vocabify] Save failed:", res);
      setError(friendlyError(res?.error || "Failed to save word"));
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 400);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    const pageWords = extractPageWords();
    const res = await chrome.runtime.sendMessage({ type: "SCAN_PAGE", words: pageWords });
    if (res?.success) {
      setScanResults(res.words);
      incrementCounter("scanUsed", true);
    } else {
      setScanResults([]);
    }
    setScanning(false);
  };

  const handleSaveScanWord = async (scanWord: string) => {
    setSavingWord(scanWord);
    const transRes = await chrome.runtime.sendMessage({ type: "TRANSLATE_WORD", word: scanWord });
    if (transRes?.success) {
      await chrome.runtime.sendMessage({
        type: "SAVE_WORD",
        word: scanWord,
        translation: transRes.translation,
        example: "",
        sourceUrl: window.location.href,
      });
      setSavedScanWords((prev) => new Set(prev).add(scanWord));
    }
    setSavingWord(null);
  };

  const handleExplain = async () => {
    if (explaining || explanation) return;
    setExplaining(true);
    try {
      const selection = window.getSelection();
      let sentence = "";
      if (selection?.anchorNode) {
        const parent = selection.anchorNode.parentElement?.closest("p, li, div, span, td, h1, h2, h3, h4, h5, h6");
        if (parent) {
          sentence = (parent.textContent || "").slice(0, 200);
        }
      }
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
      if (res?.success) {
        setExplanation(res.explanation);
        incrementCounter("explainUsed", true);
      } else {
        setExplanation(res?.error || "Could not explain");
      }
    } catch {
      setExplanation("Failed to get explanation");
    }
    setExplaining(false);
  };

  const handleSimplify = async () => {
    if (simplifying || simplified) return;
    setSimplifying(true);
    try {
      const selection = window.getSelection();
      let text = "";
      if (selection?.anchorNode) {
        const parent = selection.anchorNode.parentElement?.closest("p, div, article, section, li");
        if (parent) {
          text = (parent.textContent || "").slice(0, 1200);
        }
      }
      if (!text) {
        setSimplified("No surrounding text found");
        setSimplifying(false);
        return;
      }
      // Get user level from storage
      const storage = await chrome.storage.sync.get("userLevel");
      const userLevel = storage.userLevel || "B1";
      const res = await chrome.runtime.sendMessage({
        type: "AI_SIMPLIFY",
        text,
        userLevel,
      });
      if (res?.success) {
        setSimplified(res.simplified);
      } else {
        setSimplified(res?.error || "Could not simplify");
      }
    } catch {
      setSimplified("Failed to simplify");
    }
    setSimplifying(false);
  };

  const handleToggleHard = async () => {
    if (!savedWordData || togglingHard) return;
    setTogglingHard(true);
    setActionError(null);
    try {
      const res = await chrome.runtime.sendMessage({
        type: "TOGGLE_HARD",
        wordId: savedWordData._id,
      });
      if (res?.success) {
        setSavedWordData({ ...savedWordData, isHard: !savedWordData.isHard });
      } else {
        setActionError("Failed to update");
      }
    } catch {
      setActionError("Failed to update");
    }
    setTogglingHard(false);
  };

  const handleAddContext = async () => {
    if (!savedWordData || addingContext || contextAddResult || !candidates?.length) return;
    setAddingContext(true);
    setActionError(null);
    try {
      const selected = candidates[selectedCandidateIdx];
      const res = await chrome.runtime.sendMessage({
        type: "ADD_CONTEXT",
        wordId: savedWordData._id,
        sentence: selected.text,
        url: window.location.href,
      });
      if (res?.success) {
        setContextAddResult(res.duplicate ? "duplicate" : "added");
      } else {
        setActionError("Failed to add context");
      }
    } catch {
      setActionError("Failed to add context");
    }
    setAddingContext(false);
  };

  const handleReview = async (remembered: boolean) => {
    if (!savedWordData || reviewSubmitting) return;
    setReviewSubmitting(true);
    setActionError(null);
    try {
      const res = await chrome.runtime.sendMessage({
        type: "REVIEW_RESULT",
        wordId: savedWordData._id,
        remembered,
      });
      if (res?.success) {
        setReviewResult(remembered ? "remembered" : "forgot");
        if (res.newStatus) setReviewNewStatus(res.newStatus);
        // Update local data to reflect the review
        setSavedWordData(prev => prev ? {
          ...prev,
          lastReviewed: Date.now(),
          status: res.newStatus || prev.status,
          reviewCount: prev.reviewCount + 1,
          consecutiveCorrect: remembered ? prev.consecutiveCorrect + 1 : 0,
        } : null);
      } else {
        setActionError("Review failed");
      }
    } catch {
      setActionError("Review failed");
    }
    setReviewSubmitting(false);
  };

  const handleOpenDashboard = () => {
    window.open(
      chrome.runtime.getURL(`/dashboard.html?word=${encodeURIComponent(word)}`),
      "_blank",
    );
  };

  // Metadata helpers
  const getLastReviewedText = (data: SavedWordData): string => {
    if (!data.lastReviewed) return "Never";
    const days = Math.floor((Date.now() - data.lastReviewed) / (24 * 60 * 60 * 1000));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  const getStrength = (data: SavedWordData): number => {
    return computeStrength({
      intervalDays: data.intervalDays,
      consecutiveCorrect: data.consecutiveCorrect,
      lastReviewed: data.lastReviewed,
      status: data.status as "new" | "learning" | "known",
      reviewCount: data.reviewCount,
    });
  };

  const shouldPlaceAbove = !!position.placeAbove;
  const topValue = shouldPlaceAbove ? position.y : position.y;
  const hasCandidates = !loadingCandidates && candidates && candidates.length > 0;

  return (
    <div
      role="dialog"
      aria-label={`Translation for ${word}`}
      style={{
        position: "absolute",
        left: position.x,
        top: topValue,
        fontFamily: FONT,
        fontSize: "14px",
        opacity: fading ? 0 : visible ? 1 : 0,
        transform: fading
          ? `translateY(${shouldPlaceAbove ? "calc(-100% + 4px)" : "-4px"}) scale(0.98)`
          : visible
            ? shouldPlaceAbove
              ? "translateY(-100%) scale(1)"
              : "translateY(0) scale(1)"
            : `translateY(${shouldPlaceAbove ? "calc(-100% - 4px)" : "4px"}) scale(0.98)`,
        transition: "opacity 200ms ease, transform 200ms ease",
        zIndex: 2147483647,
      }}
    >
      <div
        ref={cardRef}
        className="pointer-events-auto"
        style={{
          width: "340px",
          maxWidth: "90vw",
          borderRadius: "16px",
          background: "#fff",
          boxShadow: "0 8px 32px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08)",
          border: "1px solid rgba(0,0,0,.06)",
          position: "relative",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, #6366f1, #3b82f6, #06b6d4)",
            borderRadius: "16px 16px 0 0",
          }}
        />

        <div style={{ padding: "16px" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div style={{ borderLeft: "3px solid #6366f1", paddingLeft: "12px" }}>
            <span
              className="leading-snug"
              style={{ fontWeight: 600, color: "#111", letterSpacing: "-0.01em", fontSize: "16px" }}
            >
              {word}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {/* Pronounce */}
            <button
              onClick={() => { speak(word); }}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                color: "#6b7280",
                background: "#f5f5f5",
                transition: "all 150ms ease",
              }}
              title="Pronounce"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </button>
            {/* Explain icon */}
            {!saved && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={handleExplain}
                  disabled={explaining || !!explanation}
                  style={{
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "8px",
                    color: explanation ? "#6b7280" : "#d97706",
                    background: "#f5f5f5",
                    cursor: (explaining || !!explanation) ? "default" : "pointer",
                    border: "none",
                    transition: "all 150ms ease",
                  }}
                  title={explaining ? "Explaining…" : "Explain word"}
                >
                  {explaining ? (
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "1.5px solid #e5e7eb", borderTopColor: "#d97706", animation: "spin 0.6s linear infinite" }} />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18h6" />
                      <path d="M10 22h4" />
                      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5C8.26 12.26 8.72 13.02 8.91 14" />
                    </svg>
                  )}
                </button>
                {explainTipVisible && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      right: 0,
                      background: "#1D1D1F",
                      color: "#fff",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      lineHeight: 1.3,
                      whiteSpace: "nowrap",
                      animation: "fadeInUp 200ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                      zIndex: 1,
                    }}
                  >
                    Need more context? Try Explain for usage notes
                  </div>
                )}
              </div>
            )}
            {/* Simplify icon */}
            {!saved && (
              <button
                onClick={handleSimplify}
                disabled={simplifying || !!simplified}
                style={{
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  color: simplified ? "#6b7280" : "#3730a3",
                  background: "#f5f5f5",
                  cursor: (simplifying || !!simplified) ? "default" : "pointer",
                  border: "none",
                  transition: "all 150ms ease",
                }}
                title={simplifying ? "Simplifying…" : "Simplify surrounding text"}
              >
                {simplifying ? (
                  <div style={{ width: "12px", height: "12px", borderRadius: "50%", border: "1.5px solid #e5e7eb", borderTopColor: "#3730a3", animation: "spin 0.6s linear infinite" }} />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                )}
              </button>
            )}
            {/* Close */}
            {!saved && (
              <button
                onClick={fadeOutAndClose}
                style={{
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  background: "#f5f5f5",
                  fontSize: "14px",
                  transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget).style.color = "#6b7280";
                  (e.currentTarget).style.background = "#f0f0f0";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget).style.color = "#9ca3af";
                  (e.currentTarget).style.background = "#f5f5f5";
                }}
              >
                &#x2715;
              </button>
            )}
          </div>
        </div>

        {/* ── SAVED WORD MODE ── */}
        {mode === "saved" && loadingSavedData ? (
            <div className="flex items-center gap-2 py-2">
              <div
                className="w-3.5 h-3.5 rounded-full animate-spin"
                style={{ border: "2px solid #e5e7eb", borderTopColor: "#6b7280" }}
              />
              <span style={{ fontSize: "13px", color: "#6b7280" }}>Checking…</span>
            </div>
          ) : mode === "saved" && savedWordData ? (
            <>
              {/* Saved badge + status + hard */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#059669",
                    background: "#ecfdf5",
                    padding: "2px 8px",
                    borderRadius: "10px",
                  }}
                >
                  ✓ Saved
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    color: savedWordData.status === "known" ? "#1d4ed8" : savedWordData.status === "learning" ? "#d97706" : "#6b7280",
                    background: savedWordData.status === "known" ? "#eff6ff" : savedWordData.status === "learning" ? "#fffbeb" : "#f3f4f6",
                    padding: "2px 8px",
                    borderRadius: "10px",
                  }}
                >
                  {savedWordData.status}
                </span>
                {savedWordData.isHard && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "#dc2626",
                      background: "#fef2f2",
                      padding: "2px 8px",
                      borderRadius: "10px",
                    }}
                  >
                    ★ Hard
                  </span>
                )}
              </div>

              {/* Metadata row */}
              <div
                className="flex items-center gap-3 mb-3"
                style={{ fontSize: "11px", color: "#6b7280" }}
              >
                <span>Last reviewed: {getLastReviewedText(savedWordData)}</span>
                <span>·</span>
                <span>Strength: {getStrength(savedWordData)}%</span>
              </div>

              {/* Translation */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "10px 12px",
                  background: "#f8fafc",
                  borderRadius: "10px",
                  marginBottom: "12px",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginTop: "2px", flexShrink: 0 }}
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#334155", lineHeight: 1.5, flex: 1 }}>
                  {savedWordData.translation}
                </p>
              </div>

              {/* ── Quick Review mini-card ── */}
              {reviewResult ? (
                <div
                  className="mb-3 rounded-lg text-center"
                  style={{
                    padding: "10px",
                    background: reviewResult === "remembered" ? "#ecfdf5" : "#fef2f2",
                    border: `1px solid ${reviewResult === "remembered" ? "#a7f3d0" : "#fecaca"}`,
                    fontSize: "13px",
                    fontWeight: 500,
                    color: reviewResult === "remembered" ? "#059669" : "#dc2626",
                    animation: "fadeInUp 200ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
                  }}
                >
                  {reviewResult === "remembered"
                    ? `✓ Remembered!${reviewNewStatus ? ` → ${reviewNewStatus}` : ""}`
                    : `Marked for review${reviewNewStatus ? ` → ${reviewNewStatus}` : ""}`}
                </div>
              ) : (
                <div
                  className="mb-3 rounded-lg"
                  style={{
                    padding: "10px",
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <p style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                    Quick Review
                  </p>
                  {!reviewRevealed ? (
                    <button
                      onClick={() => setReviewRevealed(true)}
                      className="w-full rounded-lg"
                      style={{
                        padding: "6px 10px",
                        fontSize: "12px",
                        fontWeight: 500,
                        border: "1px solid #d1d5db",
                        cursor: "pointer",
                        background: "#fff",
                        color: "#374151",
                        borderRadius: "8px",
                        transition: "background 150ms ease",
                      }}
                    >
                      Reveal translation
                    </button>
                  ) : (
                    <>
                      <p style={{ fontSize: "13px", color: "#374151", marginBottom: "8px", fontStyle: "italic" }}>
                        {savedWordData.translation}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(true)}
                          disabled={reviewSubmitting}
                          className="flex-1 rounded-lg"
                          style={{
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: 500,
                            border: "none",
                            cursor: reviewSubmitting ? "default" : "pointer",
                            background: "#059669",
                            color: "#fff",
                            borderRadius: "8px",
                          }}
                        >
                          {reviewSubmitting ? "…" : "Remembered"}
                        </button>
                        <button
                          onClick={() => handleReview(false)}
                          disabled={reviewSubmitting}
                          className="flex-1 rounded-lg"
                          style={{
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: 500,
                            border: "1px solid #fca5a5",
                            cursor: reviewSubmitting ? "default" : "pointer",
                            background: "#fff",
                            color: "#dc2626",
                            borderRadius: "8px",
                          }}
                        >
                          {reviewSubmitting ? "…" : "Forgot"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Context candidates for Add Context */}
              {!loadingCandidates && candidates && candidates.length > 0 && (
                <div
                  className="mb-3 rounded-lg"
                  style={{ maxHeight: "180px", overflowY: "auto", border: "1px solid #f3f4f6" }}
                >
                  {candidates.map((c, i) => (
                    <label
                      key={i}
                      className="flex items-start gap-2 cursor-pointer"
                      style={{
                        padding: "6px 8px",
                        fontSize: "12px",
                        lineHeight: 1.4,
                        background: selectedCandidateIdx === i ? "#f0f9ff" : "transparent",
                        borderBottom: i < candidates.length - 1 ? "1px solid #f3f4f6" : "none",
                        transition: "background 100ms ease",
                      }}
                    >
                      <input
                        type="radio"
                        name="candidate"
                        checked={selectedCandidateIdx === i}
                        onChange={() => setSelectedCandidateIdx(i)}
                        style={{ marginTop: "2px", accentColor: "#6366f1", flexShrink: 0 }}
                      />
                      <span style={{ color: "#374151" }}>
                        {highlightWord(c.text, word).map((part, j) =>
                          typeof part === "string" ? (
                            <span key={j}>{part}</span>
                          ) : (
                            <mark key={j} style={{ background: "#fef3c7", borderRadius: "2px", padding: "0 1px" }}>
                              {part.highlight}
                            </mark>
                          ),
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {hasCandidates && (
                  <button
                    onClick={handleAddContext}
                    disabled={addingContext || !!contextAddResult}
                    className="flex-1 rounded-lg"
                    style={{
                      padding: "8px 12px",
                      fontSize: "13px",
                      fontWeight: 500,
                      border: "none",
                      cursor: addingContext || contextAddResult ? "default" : "pointer",
                      background: contextAddResult ? "#ecfdf5" : "#4f46e5",
                      color: contextAddResult ? "#059669" : "#fff",
                      borderRadius: "10px",
                      transition: "filter 150ms ease",
                    }}
                  >
                    {contextAddResult === "added" ? "Context added ✓" : contextAddResult === "duplicate" ? "Already saved" : addingContext ? "Adding…" : "Add Context"}
                  </button>
                )}
                <button
                  onClick={handleToggleHard}
                  disabled={togglingHard}
                  className="flex-1 rounded-lg"
                  style={{
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: "1px solid #e5e7eb",
                    cursor: togglingHard ? "default" : "pointer",
                    background: savedWordData.isHard ? "#fef2f2" : "#f9fafb",
                    color: savedWordData.isHard ? "#dc2626" : "#374151",
                    borderRadius: "10px",
                    transition: "background 150ms ease",
                  }}
                >
                  {togglingHard ? "…" : savedWordData.isHard ? "★ Unmark Hard" : "☆ Mark Hard"}
                </button>
              </div>

              {actionError && (
                <p style={{ fontSize: "12px", color: "#dc2626", textAlign: "center", marginTop: "6px" }}>
                  {actionError}
                </p>
              )}

              {/* Open in Dashboard */}
              <div className="mt-2 text-center">
                <button
                  onClick={handleOpenDashboard}
                  style={{
                    fontSize: "12px",
                    color: "#4f46e5",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 0",
                    textDecoration: "underline",
                    textDecorationColor: "#a5b4fc",
                    textUnderlineOffset: "2px",
                  }}
                >
                  Open in Dashboard
                </button>
              </div>

              {/* Explanation panel */}
              {explanation && (
                <div
                  className="mt-2 rounded-lg"
                  style={{
                    padding: "8px 10px",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    fontSize: "12px",
                    color: "#92400e",
                    lineHeight: 1.5,
                    maxHeight: "150px",
                    overflowY: "auto",
                    animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
                  }}
                >
                  {explanation}
                </div>
              )}
              {/* Simplified text panel */}
              {simplified && (
                <div
                  className="mt-2 rounded-lg"
                  style={{
                    padding: "8px 10px",
                    background: "#eef2ff",
                    border: "1px solid #e0e7ff",
                    fontSize: "12px",
                    color: "#3730a3",
                    lineHeight: 1.5,
                    maxHeight: "150px",
                    overflowY: "auto",
                    animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
                  }}
                >
                  {simplified}
                </div>
              )}
            </>
          )

        /* ── NEW WORD MODE ── */
        : loading ? (
          <div className="flex items-center gap-2 py-2">
            <div
              className="w-3.5 h-3.5 rounded-full animate-spin"
              style={{
                border: "2px solid #e5e7eb",
                borderTopColor: "#6366f1",
              }}
            />
            <span style={{ fontSize: "13px", color: "#6b7280" }}>Translating…</span>
          </div>
        ) : error ? (
          /* ── Error / Timeout state ── */
          <div
            className="py-1"
            style={{
              animation: errorShake ? "shake 400ms ease" : undefined,
            }}
          >
            <p style={{ fontSize: "13px", color: "#dc2626", marginBottom: "8px" }}>
              {error}
            </p>
            <button
              onClick={fetchTranslation}
              className="w-full rounded-lg"
              style={{
                padding: "8px 12px",
                fontSize: "13px",
                fontWeight: 500,
                border: "1px solid #e5e7eb",
                cursor: "pointer",
                background: "#f9fafb",
                color: "#374151",
                transition: "background 150ms ease",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background = "#f3f4f6";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = "#f9fafb";
              }}
            >
              Retry
            </button>
          </div>
        ) : saved ? (
          /* ── Saved confirmation with checkmark bounce, XP, and Undo ── */
          <div className="py-1">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "10px",
                background: undone ? "#fef2f2" : "#ecfdf5",
                border: undone ? "1px solid #fecaca" : "1px solid #a7f3d0",
                animation: "sentenceSavePop 400ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
              }}
            >
              {undone ? (
                <span style={{ color: "#dc2626", fontSize: "12px", lineHeight: 1 }}>↩</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span style={{ fontSize: "13px", fontWeight: 600, color: undone ? "#dc2626" : "#059669" }}>
                {undone ? "Removed from vocabulary" : "Saved to vocabulary"}
              </span>
            </div>
            {savedWordId && !undone && (
              <button
                onClick={async () => {
                  if (undoing) return;
                  setUndoing(true);
                  const res = await chrome.runtime.sendMessage({
                    type: "DELETE_WORD",
                    wordId: savedWordId,
                  });
                  setUndoing(false);
                  if (res?.success) {
                    setUndone(true);
                    setTimeout(fadeOutAndClose, 1500);
                  }
                }}
                disabled={undoing}
                style={{
                  marginTop: "6px",
                  background: "none",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "3px 10px",
                  fontSize: "11px",
                  color: undoing ? "#9ca3af" : "#6b7280",
                  cursor: undoing ? "default" : "pointer",
                  transition: "all 150ms",
                }}
              >
                {undoing ? "Undoing..." : "Undo"}
              </button>
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "10px 12px",
                background: "#f8fafc",
                borderRadius: "10px",
                marginBottom: "12px",
                animation: "sentenceFadeIn 300ms ease 100ms both",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginTop: "2px", flexShrink: 0 }}
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
              <p style={{ margin: 0, fontSize: "14px", fontWeight: 500, color: "#334155", lineHeight: 1.5, flex: 1 }}>
                {translation}
              </p>
            </div>

            {/* ── Related Words (enrichment) ── */}
            {enrichment && (enrichment.synonyms.length > 0 || enrichment.antonyms.length > 0) && (
              <div style={{ marginTop: "8px" }}>
                <button
                  onClick={() => setEnrichmentExpanded(!enrichmentExpanded)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: "11px", color: "#6b7280", display: "flex",
                    alignItems: "center", gap: "4px", padding: "2px 0",
                  }}
                >
                  <span style={{ transform: enrichmentExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms", display: "inline-block", fontSize: "8px" }}>&#9654;</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Related Words</span>
                  {enrichment.phonetic && <span style={{ color: "#9ca3af", marginLeft: "4px" }}>{enrichment.phonetic}</span>}
                </button>
                {enrichmentExpanded && (
                  <div style={{ marginTop: "6px", padding: "8px", background: "#f0fdf4", borderRadius: "6px", fontSize: "11px", animation: "fadeInUp 200ms ease both" }}>
                    {enrichment.synonyms.length > 0 && (
                      <div style={{ marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#166534" }}>Synonyms: </span>
                        <span style={{ color: "#15803d" }}>{enrichment.synonyms.slice(0, 5).join(", ")}</span>
                      </div>
                    )}
                    {enrichment.antonyms.length > 0 && (
                      <div style={{ marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#991b1b" }}>Antonyms: </span>
                        <span style={{ color: "#dc2626" }}>{enrichment.antonyms.slice(0, 5).join(", ")}</span>
                      </div>
                    )}
                    {enrichment.definitions.length > 0 && (
                      <div style={{ marginTop: "4px", paddingTop: "4px", borderTop: "1px solid #dcfce7" }}>
                        <span style={{ fontWeight: 600, color: "#374151" }}>{enrichment.definitions[0].partOfSpeech}: </span>
                        <span style={{ color: "#4b5563" }}>{enrichment.definitions[0].definition}</span>
                      </div>
                    )}
                    {getPhrasalVerbs(lemma).length > 0 && (
                      <div style={{ marginTop: "4px", fontSize: "11px", color: "#6b7280" }}>
                        <span style={{ fontWeight: 600 }}>Phrasal verbs: </span>
                        {getPhrasalVerbs(lemma).slice(0, 4).join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Common Pairings (collocations) ── */}
            {collocations.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <button
                  onClick={() => setCollocationsExpanded(!collocationsExpanded)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: "11px", color: "#6b7280", display: "flex",
                    alignItems: "center", gap: "4px", padding: "2px 0",
                  }}
                >
                  <span style={{ transform: collocationsExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms", display: "inline-block", fontSize: "8px" }}>&#9654;</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Common pairings ({collocations.length})</span>
                </button>
                {collocationsExpanded && (
                  <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px", animation: "fadeInUp 200ms ease both" }}>
                    {collocations.slice(0, 6).map((col) => (
                      <button
                        key={col.collocation}
                        onClick={async () => {
                          setSavingCollocation(col.collocation);
                          try {
                            await chrome.runtime.sendMessage({
                              type: "SAVE_COLLOCATION",
                              collocation: col.collocation,
                              words: col.collocation.split(/\s+/),
                              category: col.category,
                              level: col.level,
                            });
                          } catch {}
                          setTimeout(() => setSavingCollocation(null), 1000);
                        }}
                        style={{
                          fontSize: "10px",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          border: savingCollocation === col.collocation ? "1px solid #22c55e" : "1px solid #e2e8f0",
                          background: savingCollocation === col.collocation ? "#f0fdf4" : "#fff",
                          color: savingCollocation === col.collocation ? "#16a34a" : "#475569",
                          cursor: "pointer",
                          transition: "all 150ms",
                          whiteSpace: "nowrap",
                          fontFamily: FONT,
                        }}
                        onMouseEnter={(e) => {
                          if (savingCollocation !== col.collocation) {
                            (e.currentTarget).style.borderColor = "#6366f1";
                            (e.currentTarget).style.color = "#4338ca";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (savingCollocation !== col.collocation) {
                            (e.currentTarget).style.borderColor = "#e2e8f0";
                            (e.currentTarget).style.color = "#475569";
                          }
                        }}
                        title={`${col.category}${col.source === "discovered" ? " (discovered)" : ""} - Click to save`}
                      >
                        {savingCollocation === col.collocation ? "Saved!" : col.collocation}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Smart example candidates ── */}
            {loadingCandidates ? (
              <div
                className="rounded-lg mb-3 animate-pulse"
                style={{
                  height: "24px",
                  background: "#f3f4f6",
                }}
              />
            ) : candidates && candidates.length > 0 ? (
              <div
                className="mb-3 rounded-lg"
                style={{
                  maxHeight: "180px",
                  overflowY: "auto",
                  border: "1px solid #f3f4f6",
                }}
              >
                {candidates.map((c, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2 cursor-pointer"
                    style={{
                      padding: "6px 8px",
                      fontSize: "12px",
                      lineHeight: 1.4,
                      background: selectedCandidateIdx === i ? "#f0f9ff" : "transparent",
                      borderBottom: i < candidates.length - 1 ? "1px solid #f3f4f6" : "none",
                      transition: "background 100ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCandidateIdx !== i)
                        (e.currentTarget as HTMLElement).style.background = "#fafafa";
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCandidateIdx !== i)
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <input
                      type="radio"
                      name="candidate"
                      checked={selectedCandidateIdx === i}
                      onChange={() => setSelectedCandidateIdx(i)}
                      style={{
                        marginTop: "2px",
                        accentColor: "#6366f1",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "#374151" }}>
                      {highlightWord(c.text, word).map((part, j) =>
                        typeof part === "string" ? (
                          <span key={j}>{part}</span>
                        ) : (
                          <mark
                            key={j}
                            style={{
                              background: "#fef3c7",
                              borderRadius: "2px",
                              padding: "0 1px",
                            }}
                          >
                            {part.highlight}
                          </mark>
                        ),
                      )}
                    </span>
                    {i === 0 && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "#4f46e5",
                          background: "#eef2ff",
                          padding: "1px 5px",
                          borderRadius: "8px",
                          marginTop: "1px",
                        }}
                      >
                        Best
                      </span>
                    )}
                  </label>
                ))}
              </div>
            ) : null}

            {scanResults === null ? (
              <>
              {/* Primary action buttons */}
              <div className="flex gap-2" style={{ animation: "sentenceFadeIn 300ms ease 200ms both" }}>
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="flex-1 rounded-lg"
                  style={{
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: "none",
                    cursor: saving ? "default" : "pointer",
                    background: "#4f46e5",
                    color: "#fff",
                    borderRadius: "10px",
                    transition: "all 150ms ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    fontFamily: FONT,
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) (e.currentTarget).style.background = "#4338ca";
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) (e.currentTarget).style.background = "#4f46e5";
                  }}
                  onMouseDown={(e) => {
                    (e.currentTarget).style.transform = "scale(0.97)";
                  }}
                  onMouseUp={(e) => {
                    (e.currentTarget).style.transform = "scale(1)";
                  }}
                >
                  {saving ? "Saving…" : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      Save
                    </>
                  )}
                </button>
                {hasCandidates && (
                  <button
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="flex-1 rounded-lg"
                    style={{
                      padding: "8px 12px",
                      fontSize: "13px",
                      fontWeight: 500,
                      border: "1px solid #e2e8f0",
                      cursor: saving ? "default" : "pointer",
                      background: "#fff",
                      color: "#475569",
                      borderRadius: "10px",
                      transition: "all 150ms ease",
                      fontFamily: FONT,
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) {
                        (e.currentTarget).style.borderColor = "#6366f1";
                        (e.currentTarget).style.color = "#4338ca";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!saving) {
                        (e.currentTarget).style.borderColor = "#e2e8f0";
                        (e.currentTarget).style.color = "#475569";
                      }
                    }}
                    onMouseDown={(e) => {
                      (e.currentTarget).style.transform = "scale(0.97)";
                    }}
                    onMouseUp={(e) => {
                      (e.currentTarget).style.transform = "scale(1)";
                    }}
                  >
                    {saving ? "Saving…" : "Save + Context"}
                  </button>
                )}
              </div>

              {/* Tip: save with context */}
              {contextTipVisible && hasCandidates && (
                <div
                  style={{
                    marginTop: "6px",
                    padding: "6px 10px",
                    background: "#1D1D1F",
                    color: "#fff",
                    borderRadius: "8px",
                    fontSize: "11px",
                    lineHeight: 1.4,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "6px",
                    animation: "fadeInUp 200ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                  }}
                >
                  <span style={{ flex: 1 }}>
                    Try Save + Context — surrounding sentences improve recall
                  </span>
                  <button
                    onClick={() => setContextTipVisible(false)}
                    style={{
                      color: "#fff",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "12px",
                      lineHeight: 1,
                      padding: 0,
                      flexShrink: 0,
                      opacity: 0.7,
                    }}
                  >
                    &#x2715;
                  </button>
                </div>
              )}

              {/* Scan Page as text link */}
              <div className="mt-2 text-center" style={{ position: "relative" }}>
                <button
                  onClick={handleScan}
                  disabled={scanning}
                  style={{
                    fontSize: "12px",
                    color: scanning ? "#6b7280" : "#4f46e5",
                    background: "none",
                    border: "none",
                    cursor: scanning ? "default" : "pointer",
                    padding: "2px 0",
                    textDecoration: scanning ? "none" : "underline",
                    textDecorationColor: "#a5b4fc",
                    textUnderlineOffset: "2px",
                  }}
                >
                  {scanning ? "Scanning…" : "Scan page for more words"}
                </button>
                {/* Scan tip tooltip */}
                {scanTipVisible && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "calc(100% + 4px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#1D1D1F",
                      color: "#fff",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      fontSize: "11px",
                      lineHeight: 1.3,
                      whiteSpace: "nowrap",
                      animation: "fadeInUp 200ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                    }}
                  >
                    Scan Page finds all words worth saving at once
                  </div>
                )}
              </div>

              {/* Explanation panel */}
              {explanation && (
                <div
                  className="mt-2 rounded-lg"
                  style={{
                    padding: "8px 10px",
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    fontSize: "12px",
                    color: "#92400e",
                    lineHeight: 1.5,
                    maxHeight: "150px",
                    overflowY: "auto",
                    animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
                  }}
                >
                  {explanation}
                </div>
              )}
              {/* Simplified text panel */}
              {simplified && (
                <div
                  className="mt-2 rounded-lg"
                  style={{
                    padding: "8px 10px",
                    background: "#eef2ff",
                    border: "1px solid #e0e7ff",
                    fontSize: "12px",
                    color: "#3730a3",
                    lineHeight: 1.5,
                    maxHeight: "150px",
                    overflowY: "auto",
                    animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
                  }}
                >
                  {simplified}
                </div>
              )}
              </>
            ) : (
              <div>
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="w-full rounded-lg mb-3"
                  style={{
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: 600,
                    border: "none",
                    cursor: saving ? "default" : "pointer",
                    background: "#4f46e5",
                    color: "#fff",
                    borderRadius: "10px",
                    transition: "all 150ms ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    fontFamily: FONT,
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) (e.currentTarget).style.background = "#4338ca";
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) (e.currentTarget).style.background = "#4f46e5";
                  }}
                >
                  {saving ? "Saving…" : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      Save
                    </>
                  )}
                </button>
                {scanResults.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "#6b7280", textAlign: "center" }}>
                    No new words found
                  </p>
                ) : (
                  <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                    <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>
                      Words on this page:
                    </p>
                    {scanResults.map((w) => (
                      <div
                        key={w}
                        className="flex items-center justify-between py-1"
                        style={{ borderBottom: "1px solid #f3f4f6" }}
                      >
                        <span style={{ fontSize: "13px", color: "#333" }}>{w}</span>
                        {savedScanWords.has(w) ? (
                          <span style={{ fontSize: "11px", color: "#059669" }}>Saved ✓</span>
                        ) : savingWord === w ? (
                          <span style={{ fontSize: "11px", color: "#6b7280" }}>…</span>
                        ) : (
                          <button
                            onClick={() => handleSaveScanWord(w)}
                            style={{
                              fontSize: "11px",
                              color: "#4f46e5",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Save
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes sentenceFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sentenceSavePop {
          0% { transform: scale(0.9); opacity: 0; }
          50% { transform: scale(1.03); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
