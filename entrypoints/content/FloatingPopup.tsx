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
}

export function FloatingPopup({ word, position, onClose, vocabLemmas, onSaved, onAchievement }: FloatingPopupProps) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorShake, setErrorShake] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [xpEarned, setXpEarned] = useState<number | null>(null);
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

  const fetchTranslation = useCallback(() => {
    if (mode === "saved") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTranslation(null);

    chrome.runtime
      .sendMessage({ type: "TRANSLATE_WORD", word })
      .then((res) => {
        if (res?.success) {
          setTranslation(res.translation);
          getWordEnrichment(word).then(setEnrichment).catch(() => {});
        } else {
          const msg = res?.error || "Translation failed";
          setError(msg.includes("timed out") ? "Translation timed out" : msg);
          setErrorShake(true);
          setTimeout(() => setErrorShake(false), 400);
        }
      })
      .catch(() => {
        setError("Translation failed");
        setErrorShake(true);
        setTimeout(() => setErrorShake(false), 400);
      })
      .finally(() => setLoading(false));
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
    });

    setSaving(false);

    if (res?.success) {
      console.log("[Vocabify] Word saved successfully:", { word, lemma });
      setSaved(true);
      if (res.wordId) setSavedWordId(res.wordId);
      // Show XP earned
      if (res.xp?.xpAwarded) {
        setXpEarned(res.xp.xpAwarded);
      }
      // Show achievement notifications
      if (res.xp?.newAchievements && res.xp.newAchievements.length > 0) {
        // Delay achievement display until after save animation
        setTimeout(() => {
          for (const achievement of res.xp.newAchievements) {
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
      setError(res?.error || "Failed to save word");
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
      chrome.runtime.getURL(`/newtab.html?word=${encodeURIComponent(word)}`),
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
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        fontSize: "16px",
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
        className="pointer-events-auto rounded-2xl p-4 min-w-[220px] max-w-[380px]"
        style={{
          background: "#fff",
          boxShadow: "0 8px 32px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08)",
          border: "1px solid rgba(0,0,0,.06)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <span
            className="text-base leading-snug"
            style={{ fontWeight: 600, color: "#111", letterSpacing: "-0.01em" }}
          >
            {word}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {/* Pronounce */}
            <button
              onClick={() => {
                speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(word);
                u.lang = "en";
                u.rate = 0.9;
                speechSynthesis.speak(u);
              }}
              className="w-5 h-5 flex items-center justify-center rounded-full"
              style={{ color: "#666", background: "#f5f5f5" }}
              title="Pronounce"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  className="w-5 h-5 flex items-center justify-center rounded-full"
                  style={{
                    color: explanation ? "#6b7280" : "#d97706",
                    background: "#f5f5f5",
                    cursor: (explaining || !!explanation) ? "default" : "pointer",
                    border: "none",
                    fontSize: "11px",
                  }}
                  title={explaining ? "Explaining…" : "Explain word"}
                >
                  {explaining ? (
                    <div className="w-2.5 h-2.5 rounded-full animate-spin" style={{ border: "1.5px solid #e5e7eb", borderTopColor: "#d97706" }} />
                  ) : "💡"}
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
                className="w-5 h-5 flex items-center justify-center rounded-full"
                style={{
                  color: simplified ? "#6b7280" : "#3730a3",
                  background: "#f5f5f5",
                  cursor: (simplifying || !!simplified) ? "default" : "pointer",
                  border: "none",
                  fontSize: "11px",
                }}
                title={simplifying ? "Simplifying…" : "Simplify surrounding text"}
              >
                {simplifying ? (
                  <div className="w-2.5 h-2.5 rounded-full animate-spin" style={{ border: "1.5px solid #e5e7eb", borderTopColor: "#3730a3" }} />
                ) : "📝"}
              </button>
            )}
            {/* Close */}
            {!saved && (
              <button
                onClick={fadeOutAndClose}
                className="w-5 h-5 flex items-center justify-center rounded-full"
                style={{ color: "#999", fontSize: "14px", background: "#f5f5f5" }}
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
              <p className="mb-3 leading-relaxed" style={{ fontSize: "14px", color: "#444" }}>
                {savedWordData.translation}
              </p>

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
                  <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "6px", fontWeight: 500 }}>
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
                        style={{ marginTop: "2px", accentColor: "#3b82f6", flexShrink: 0 }}
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
                      background: contextAddResult ? "#ecfdf5" : "#3b82f6",
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
                    color: "#3b82f6",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 0",
                    textDecoration: "underline",
                    textDecorationColor: "#93c5fd",
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
                borderTopColor: "#3b82f6",
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center w-5 h-5 rounded-full"
                  style={{
                    background: undone ? "#fef2f2" : "#ecfdf5",
                    animation: "checkmarkBounce 400ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                  }}
                >
                  <span style={{ color: undone ? "#dc2626" : "#059669", fontSize: "12px", lineHeight: 1 }}>
                    {undone ? "↩" : "✓"}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    color: undone ? "#dc2626" : "#059669",
                    fontWeight: 500,
                    animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 150ms both",
                  }}
                >
                  {undone ? "Removed from vocabulary" : "Saved to vocabulary"}
                </span>
              </div>
              {xpEarned && !undone && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "#8b5cf6",
                    fontWeight: 600,
                    background: "#f3e8ff",
                    padding: "2px 8px",
                    borderRadius: "10px",
                    animation: "xpPop 500ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                  }}
                >
                  +{xpEarned} XP
                </span>
              )}
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
                  borderRadius: "6px",
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
            <p
              className="mb-3 leading-relaxed"
              style={{ fontSize: "14px", color: "#444" }}
            >
              {translation}
            </p>

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
                  <span style={{ transform: enrichmentExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 150ms", display: "inline-block" }}>&#9654;</span>
                  Related Words
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
                        accentColor: "#3b82f6",
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
                          color: "#3b82f6",
                          background: "#eff6ff",
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
              <div className="flex gap-2">
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="flex-1 rounded-lg"
                  style={{
                    padding: "8px 12px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: "none",
                    cursor: saving ? "default" : "pointer",
                    background: "#3b82f6",
                    color: "#fff",
                    borderRadius: "10px",
                    transition: "filter 150ms ease, transform 100ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) (e.target as HTMLElement).style.filter = "brightness(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) (e.target as HTMLElement).style.filter = "brightness(1)";
                  }}
                  onMouseDown={(e) => {
                    (e.target as HTMLElement).style.transform = "scale(0.97)";
                  }}
                  onMouseUp={(e) => {
                    (e.target as HTMLElement).style.transform = "scale(1)";
                  }}
                >
                  {saving ? "Saving…" : "Save"}
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
                      border: "1px solid #3b82f6",
                      cursor: saving ? "default" : "pointer",
                      background: "#fff",
                      color: "#3b82f6",
                      borderRadius: "10px",
                      transition: "background 150ms ease, transform 100ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving) (e.target as HTMLElement).style.background = "#eff6ff";
                    }}
                    onMouseLeave={(e) => {
                      if (!saving) (e.target as HTMLElement).style.background = "#fff";
                    }}
                    onMouseDown={(e) => {
                      (e.target as HTMLElement).style.transform = "scale(0.97)";
                    }}
                    onMouseUp={(e) => {
                      (e.target as HTMLElement).style.transform = "scale(1)";
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
                    color: scanning ? "#6b7280" : "#3b82f6",
                    background: "none",
                    border: "none",
                    cursor: scanning ? "default" : "pointer",
                    padding: "2px 0",
                    textDecoration: scanning ? "none" : "underline",
                    textDecorationColor: "#93c5fd",
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
                    fontWeight: 500,
                    border: "none",
                    cursor: saving ? "default" : "pointer",
                    background: "#3b82f6",
                    color: "#fff",
                    borderRadius: "10px",
                    transition: "filter 150ms ease, transform 100ms ease",
                  }}
                >
                  {saving ? "Saving…" : "Save"}
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
                              color: "#3b82f6",
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
  );
}
