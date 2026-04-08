import { useState, useEffect, useRef, useCallback } from "react";
import { extractSentence, highlightWord } from "../../src/lib/text-utils";
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
import { getAITranslator } from "../../src/lib/ai-translator";

interface SavedWordData {
  _id: string;
  word: string;
  translation: string;
  status: string;
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
}

interface FloatingPopupProps {
  word: string;
  position: { x: number; y: number; placeAbove?: boolean };
  onClose: () => void;
  vocabLemmas?: Set<string>;
  onSaved?: (lemma: string) => void;
  onAchievement?: (achievement: Achievement) => void;
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

export function FloatingPopup({ word, position, onClose, vocabLemmas, onSaved, onAchievement }: FloatingPopupProps) {
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
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [simplifying, setSimplifying] = useState(false);
  const [simplified, setSimplified] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [contextTipVisible, setContextTipVisible] = useState(false);
  const [explainTipVisible, setExplainTipVisible] = useState(false);

  // Word enrichment state
  const [enrichment, setEnrichment] = useState<WordEnrichment | null>(null);
  const [enrichmentExpanded, setEnrichmentExpanded] = useState(false);
  const [wordTranslations, setWordTranslations] = useState<Record<string, string>>({});

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

  // Translate synonyms/antonyms when enrichment panel is expanded
  useEffect(() => {
    if (!enrichmentExpanded || !enrichment) return;
    const wordsToTranslate = [
      ...enrichment.synonyms.slice(0, 5),
      ...enrichment.antonyms.slice(0, 5),
    ].filter((w) => !wordTranslations[w]);
    if (wordsToTranslate.length === 0) return;

    for (const w of wordsToTranslate) {
      chrome.runtime
        .sendMessage({ type: "TRANSLATE_WORD", word: w })
        .then((res) => {
          if (res?.success && res.translation) {
            setWordTranslations((prev) => ({ ...prev, [w]: res.translation }));
          }
        })
        .catch(() => {});
    }
  }, [enrichmentExpanded, enrichment]);

  // Auto-clear action errors after 3 seconds
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 3000);
    return () => clearTimeout(t);
  }, [actionError]);

  // Always verify saved status against server (handles stale/missing local cache)
  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: "GET_WORD_BY_LEMMA", lemma, word: word.toLowerCase() })
      .then((res) => {
        if (res?.success && res.word) {
          setSavedWordData(res.word as SavedWordData);
          setMode("saved");
        } else {
          // Word not in DB (deleted?) — fall back to new if we thought it was saved
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
        // Fetch enrichment (fire-and-forget)
        getWordEnrichment(word).then(setEnrichment).catch(() => {});
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
        filter: fading ? "blur(4px)" : visible ? "blur(0)" : "blur(4px)",
        transform: fading
          ? `translateY(${shouldPlaceAbove ? "calc(-100% + 8px)" : "-8px"}) scale(0.95)`
          : visible
            ? shouldPlaceAbove
              ? "translateY(-100%) scale(1)"
              : "translateY(0) scale(1)"
            : `translateY(${shouldPlaceAbove ? "calc(-100% - 8px)" : "8px"}) scale(0.95)`,
        transition: "opacity 250ms cubic-bezier(0.4, 0, 0.2, 1), transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1.0), filter 250ms ease",
        zIndex: 2147483647,
      }}
    >
      <div
        ref={cardRef}
        className="pointer-events-auto"
        style={{
          width: "360px",
          maxWidth: "90vw",
          borderRadius: "20px",
          background: "#ffffff",
          boxShadow: "0 24px 48px -12px rgba(99, 102, 241, 0.18), 0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)",
          border: "1px solid #e8e5f5",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Animated gradient accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, #818cf8, #6366f1, #a78bfa, #7c3aed, #6366f1, #818cf8)",
            backgroundSize: "200% 100%",
            animation: "gradientShift 3s ease infinite",
            borderRadius: "20px 20px 0 0",
          }}
        />
        {/* Subtle top glow */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "60%",
            height: "40px",
            background: "radial-gradient(ellipse at center, rgba(99,102,241,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ padding: "18px 18px 16px" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div style={{ paddingLeft: "0" }}>
            <span
              className="leading-snug"
              style={{
                fontWeight: 700,
                color: "#1e1b4b",
                letterSpacing: "-0.02em",
                fontSize: "18px",
                background: "linear-gradient(135deg, #312e81 0%, #4f46e5 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {word}
            </span>
            {enrichment?.phonetic && (
              <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "8px", fontWeight: 400, fontStyle: "italic" }}>
                {enrichment.phonetic}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Pronounce */}
            <button
              onClick={() => { chrome.runtime.sendMessage({ type: "SPEAK_WORD", word }); }}
              style={{
                width: "30px",
                height: "30px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "10px",
                border: "1px solid rgba(99,102,241,0.12)",
                cursor: "pointer",
                color: "#6366f1",
                background: "rgba(99,102,241,0.06)",
                transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(99,102,241,0.12)";
                e.currentTarget.style.transform = "scale(1.08)";
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.25)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(99,102,241,0.06)";
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.12)";
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
                    width: "30px",
                    height: "30px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "10px",
                    color: explanation ? "#9ca3af" : "#d97706",
                    background: explanation ? "rgba(0,0,0,0.03)" : "rgba(217,119,6,0.06)",
                    cursor: (explaining || !!explanation) ? "default" : "pointer",
                    border: `1px solid ${explanation ? "rgba(0,0,0,0.04)" : "rgba(217,119,6,0.12)"}`,
                    transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                  onMouseEnter={(e) => {
                    if (!explaining && !explanation) {
                      e.currentTarget.style.background = "rgba(217,119,6,0.12)";
                      e.currentTarget.style.transform = "scale(1.08)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!explaining && !explanation) {
                      e.currentTarget.style.background = "rgba(217,119,6,0.06)";
                      e.currentTarget.style.transform = "scale(1)";
                    }
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
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "10px",
                  color: simplified ? "#9ca3af" : "#3730a3",
                  background: simplified ? "rgba(0,0,0,0.03)" : "rgba(55,48,163,0.06)",
                  cursor: (simplifying || !!simplified) ? "default" : "pointer",
                  border: `1px solid ${simplified ? "rgba(0,0,0,0.04)" : "rgba(55,48,163,0.12)"}`,
                  transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={(e) => {
                  if (!simplifying && !simplified) {
                    e.currentTarget.style.background = "rgba(55,48,163,0.12)";
                    e.currentTarget.style.transform = "scale(1.08)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!simplifying && !simplified) {
                    e.currentTarget.style.background = "rgba(55,48,163,0.06)";
                    e.currentTarget.style.transform = "scale(1)";
                  }
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
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "10px",
                  border: "1px solid rgba(0,0,0,0.06)",
                  cursor: "pointer",
                  color: "#9ca3af",
                  background: "rgba(0,0,0,0.03)",
                  fontSize: "13px",
                  transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#ef4444";
                  e.currentTarget.style.background = "rgba(239,68,68,0.08)";
                  e.currentTarget.style.borderColor = "rgba(239,68,68,0.15)";
                  e.currentTarget.style.transform = "scale(1.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#9ca3af";
                  e.currentTarget.style.background = "rgba(0,0,0,0.03)";
                  e.currentTarget.style.borderColor = "rgba(0,0,0,0.06)";
                  e.currentTarget.style.transform = "scale(1)";
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
              {/* Saved badge + status */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#059669",
                    background: "linear-gradient(135deg, rgba(5,150,105,0.08) 0%, rgba(16,185,129,0.12) 100%)",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    border: "1px solid rgba(5,150,105,0.12)",
                    letterSpacing: "0.01em",
                  }}
                >
                  ✓ Saved
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: savedWordData.status === "known" ? "#4f46e5" : savedWordData.status === "learning" ? "#d97706" : "#6b7280",
                    background: savedWordData.status === "known" ? "rgba(79,70,229,0.08)" : savedWordData.status === "learning" ? "rgba(217,119,6,0.08)" : "rgba(0,0,0,0.04)",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    border: `1px solid ${savedWordData.status === "known" ? "rgba(79,70,229,0.12)" : savedWordData.status === "learning" ? "rgba(217,119,6,0.12)" : "rgba(0,0,0,0.06)"}`,
                    textTransform: "capitalize" as const,
                  }}
                >
                  {savedWordData.status}
                </span>
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
                  gap: "10px",
                  padding: "12px 14px",
                  background: "linear-gradient(135deg, rgba(238,242,255,0.7) 0%, rgba(243,232,255,0.5) 100%)",
                  borderRadius: "14px",
                  marginBottom: "12px",
                  border: "1px solid rgba(99,102,241,0.08)",
                }}
              >
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </div>
                <p style={{ margin: 0, fontSize: "15px", fontWeight: 500, color: "#1e1b4b", lineHeight: 1.5, flex: 1 }}>
                  {savedWordData.translation}
                </p>
              </div>

              {/* ── Quick Review mini-card ── */}
              {reviewResult ? (
                <div
                  className="mb-3 text-center"
                  style={{
                    padding: "12px",
                    background: reviewResult === "remembered"
                      ? "linear-gradient(135deg, rgba(5,150,105,0.06) 0%, rgba(16,185,129,0.1) 100%)"
                      : "linear-gradient(135deg, rgba(220,38,38,0.06) 0%, rgba(239,68,68,0.1) 100%)",
                    border: `1px solid ${reviewResult === "remembered" ? "rgba(5,150,105,0.15)" : "rgba(220,38,38,0.15)"}`,
                    borderRadius: "14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: reviewResult === "remembered" ? "#059669" : "#dc2626",
                    animation: "sentenceSavePop 400ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                  }}
                >
                  {reviewResult === "remembered"
                    ? `✓ Remembered!${reviewNewStatus ? ` → ${reviewNewStatus}` : ""}`
                    : (
                      <>
                        <div style={{ marginBottom: "6px" }}>Marked for review{reviewNewStatus ? ` → ${reviewNewStatus}` : ""}</div>
                        {savedWordData && (
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#1e1b4b", fontStyle: "italic" }}>
                            {savedWordData.translation}
                          </div>
                        )}
                      </>
                    )}
                </div>
              ) : (
                <div
                  className="mb-3"
                  style={{
                    padding: "12px",
                    background: "linear-gradient(135deg, rgba(249,250,251,0.8) 0%, rgba(238,242,255,0.4) 100%)",
                    border: "1px solid rgba(99,102,241,0.08)",
                    borderRadius: "14px",
                  }}
                >
                  <p style={{ fontSize: "10px", color: "#6366f1", marginBottom: "8px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                    Quick Review
                  </p>
                  {!reviewRevealed ? (
                    <button
                      onClick={() => setReviewRevealed(true)}
                      className="w-full"
                      style={{
                        padding: "8px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        border: "1px solid rgba(99,102,241,0.15)",
                        cursor: "pointer",
                        background: "rgba(99,102,241,0.04)",
                        color: "#4f46e5",
                        borderRadius: "10px",
                        transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(99,102,241,0.08)";
                        e.currentTarget.style.borderColor = "rgba(99,102,241,0.25)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(99,102,241,0.04)";
                        e.currentTarget.style.borderColor = "rgba(99,102,241,0.15)";
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
                          className="flex-1"
                          style={{
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "none",
                            cursor: reviewSubmitting ? "default" : "pointer",
                            background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                            color: "#fff",
                            borderRadius: "10px",
                            boxShadow: "0 2px 8px rgba(5,150,105,0.25)",
                            transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                          onMouseEnter={(e) => {
                            if (!reviewSubmitting) {
                              e.currentTarget.style.transform = "translateY(-1px)";
                              e.currentTarget.style.boxShadow = "0 4px 12px rgba(5,150,105,0.35)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 2px 8px rgba(5,150,105,0.25)";
                          }}
                        >
                          {reviewSubmitting ? "…" : "Remembered"}
                        </button>
                        <button
                          onClick={() => handleReview(false)}
                          disabled={reviewSubmitting}
                          className="flex-1"
                          style={{
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: "1px solid rgba(220,38,38,0.15)",
                            cursor: reviewSubmitting ? "default" : "pointer",
                            background: "rgba(220,38,38,0.04)",
                            color: "#dc2626",
                            borderRadius: "10px",
                            transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                          onMouseEnter={(e) => {
                            if (!reviewSubmitting) {
                              e.currentTarget.style.background = "rgba(220,38,38,0.08)";
                              e.currentTarget.style.borderColor = "rgba(220,38,38,0.25)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "rgba(220,38,38,0.04)";
                            e.currentTarget.style.borderColor = "rgba(220,38,38,0.15)";
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
                    className="flex-1"
                    style={{
                      padding: "10px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "none",
                      cursor: addingContext || contextAddResult ? "default" : "pointer",
                      background: contextAddResult
                        ? "linear-gradient(135deg, rgba(5,150,105,0.08) 0%, rgba(16,185,129,0.12) 100%)"
                        : "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)",
                      color: contextAddResult ? "#059669" : "#fff",
                      borderRadius: "12px",
                      transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: contextAddResult ? "none" : "0 4px 12px rgba(99,102,241,0.3)",
                    }}
                    onMouseEnter={(e) => {
                      if (!addingContext && !contextAddResult) {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 6px 20px rgba(99,102,241,0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      if (!contextAddResult) e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.3)";
                    }}
                  >
                    {contextAddResult === "added" ? "Context added ✓" : contextAddResult === "duplicate" ? "Already saved" : addingContext ? "Adding…" : "Add Context"}
                  </button>
                )}
              </div>

              {actionError && (
                <p style={{ fontSize: "12px", color: "#dc2626", textAlign: "center", marginTop: "6px" }}>
                  {actionError}
                </p>
              )}

              {/* Open in Dashboard */}
              <div className="mt-3 text-center">
                <button
                  onClick={handleOpenDashboard}
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#6366f1",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 0",
                    transition: "color 200ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#4338ca"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#6366f1"; }}
                >
                  Open in Dashboard →
                </button>
              </div>

              {/* Explanation panel */}
              {explanation && (
                <div
                  className="mt-2 rounded-lg"
                  style={{
                    padding: "10px 12px",
                    background: "linear-gradient(135deg, rgba(255,251,235,0.8) 0%, rgba(254,243,199,0.5) 100%)",
                    border: "1px solid rgba(217,119,6,0.12)",
                    borderRadius: "12px",
                    fontSize: "12px",
                    color: "#92400e",
                    lineHeight: 1.6,
                    maxHeight: "150px",
                    overflowY: "auto",
                    animation: "fadeInUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
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
                    padding: "10px 12px",
                    background: "linear-gradient(135deg, rgba(238,242,255,0.8) 0%, rgba(224,231,255,0.5) 100%)",
                    border: "1px solid rgba(55,48,163,0.1)",
                    borderRadius: "12px",
                    fontSize: "12px",
                    color: "#3730a3",
                    lineHeight: 1.6,
                    maxHeight: "150px",
                    overflowY: "auto",
                    animation: "fadeInUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                  }}
                >
                  {simplified}
                </div>
              )}
            </>
          )

        /* ── NEW WORD MODE ── */
        : loading ? (
          <div className="flex items-center gap-3 py-3">
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                border: "2px solid rgba(99,102,241,0.15)",
                borderTopColor: "#6366f1",
                animation: "spin 0.7s cubic-bezier(0.4, 0, 0.2, 1) infinite",
              }}
            />
            <span style={{ fontSize: "13px", color: "#8b8fa3", fontWeight: 500 }}>Translating…</span>
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
                gap: "8px",
                padding: "10px 16px",
                borderRadius: "14px",
                background: undone
                  ? "linear-gradient(135deg, rgba(220,38,38,0.06) 0%, rgba(239,68,68,0.1) 100%)"
                  : "linear-gradient(135deg, rgba(5,150,105,0.06) 0%, rgba(16,185,129,0.12) 100%)",
                border: undone ? "1px solid rgba(220,38,38,0.15)" : "1px solid rgba(5,150,105,0.15)",
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
                gap: "10px",
                padding: "12px 14px",
                background: "linear-gradient(135deg, rgba(238,242,255,0.7) 0%, rgba(243,232,255,0.5) 100%)",
                borderRadius: "14px",
                marginBottom: "14px",
                border: "1px solid rgba(99,102,241,0.08)",
                animation: "sentenceFadeIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1.0) 100ms both",
              }}
            >
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </div>
              <p style={{ margin: 0, fontSize: "15px", fontWeight: 500, color: "#1e1b4b", lineHeight: 1.5, flex: 1 }}>
                {translation}
              </p>
            </div>

            {/* ── Related Words (enrichment) ── */}
            {enrichment && (enrichment.synonyms.length > 0 || enrichment.antonyms.length > 0) && (
              <div style={{ marginTop: "4px", marginBottom: "8px" }}>
                <button
                  onClick={() => setEnrichmentExpanded(!enrichmentExpanded)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: "11px", color: "#6b7280", display: "flex",
                    alignItems: "center", gap: "6px", padding: "4px 0",
                    transition: "color 150ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#4f46e5"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#6b7280"; }}
                >
                  <span style={{ transform: enrichmentExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)", display: "inline-block", fontSize: "8px" }}>&#9654;</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "inherit", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Related Words</span>
                </button>
                {enrichmentExpanded && (
                  <div style={{
                    marginTop: "6px",
                    padding: "10px 12px",
                    background: "linear-gradient(135deg, rgba(240,253,244,0.8) 0%, rgba(236,253,245,0.6) 100%)",
                    borderRadius: "12px",
                    fontSize: "12px",
                    border: "1px solid rgba(22,101,52,0.08)",
                    animation: "fadeInUp 200ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                  }}>
                    {enrichment.synonyms.length > 0 && (
                      <div style={{ marginBottom: "6px" }}>
                        <span style={{ fontWeight: 600, color: "#166534", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: "4px" }}>Synonyms</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
                          {enrichment.synonyms.slice(0, 5).map((s) => (
                            <span key={s} style={{ color: "#15803d" }}>
                              {s}
                              {wordTranslations[s] && (
                                <span style={{ color: "#6b7280", fontSize: "11px", marginLeft: "2px" }}>
                                  ({wordTranslations[s].split(/[,(]/)[0].trim()})
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {enrichment.antonyms.length > 0 && (
                      <div style={{ marginBottom: "6px" }}>
                        <span style={{ fontWeight: 600, color: "#991b1b", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: "4px" }}>Antonyms</span>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
                          {enrichment.antonyms.slice(0, 5).map((a) => (
                            <span key={a} style={{ color: "#dc2626" }}>
                              {a}
                              {wordTranslations[a] && (
                                <span style={{ color: "#6b7280", fontSize: "11px", marginLeft: "2px" }}>
                                  ({wordTranslations[a].split(/[,(]/)[0].trim()})
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {enrichment.definitions.length > 0 && (
                      <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(22,163,74,0.1)" }}>
                        <span style={{ fontWeight: 600, color: "#374151", fontSize: "10px", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{enrichment.definitions[0].partOfSpeech} </span>
                        <span style={{ color: "#4b5563" }}>{enrichment.definitions[0].definition}</span>
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

            {/* Primary action buttons */}
            <div className="flex gap-2" style={{ animation: "sentenceFadeIn 300ms ease 200ms both" }}>
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex-1 rounded-lg"
                style={{
                  padding: "10px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  border: "none",
                  cursor: saving ? "default" : "pointer",
                  background: "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)",
                  color: "#fff",
                  borderRadius: "12px",
                  transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  fontFamily: FONT,
                  boxShadow: "0 4px 12px rgba(99,102,241,0.3), 0 1px 3px rgba(0,0,0,0.08)",
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 6px 20px rgba(99,102,241,0.4), 0 2px 6px rgba(0,0,0,0.1)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.3), 0 1px 3px rgba(0,0,0,0.08)";
                  }
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "translateY(0) scale(0.97)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px) scale(1)";
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
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 500,
                    border: "1px solid rgba(99,102,241,0.15)",
                    cursor: saving ? "default" : "pointer",
                    background: "rgba(99,102,241,0.04)",
                    color: "#4f46e5",
                    borderRadius: "12px",
                    transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                    fontFamily: FONT,
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) {
                      e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)";
                      e.currentTarget.style.background = "rgba(99,102,241,0.08)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) {
                      e.currentTarget.style.borderColor = "rgba(99,102,241,0.15)";
                      e.currentTarget.style.background = "rgba(99,102,241,0.04)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = "scale(0.97)";
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px) scale(1)";
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
                  marginTop: "8px",
                  padding: "8px 12px",
                  background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
                  color: "#e0e7ff",
                  borderRadius: "12px",
                  fontSize: "11px",
                  lineHeight: 1.4,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  animation: "fadeInUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                  boxShadow: "0 4px 12px rgba(30,27,75,0.2)",
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

            {/* Explanation panel */}
            {explanation && (
              <div
                className="mt-2 rounded-lg"
                style={{
                  padding: "10px 12px",
                  background: "linear-gradient(135deg, rgba(255,251,235,0.8) 0%, rgba(254,243,199,0.5) 100%)",
                  border: "1px solid rgba(217,119,6,0.12)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "#92400e",
                  lineHeight: 1.6,
                  maxHeight: "150px",
                  overflowY: "auto",
                  animation: "fadeInUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
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
                  padding: "10px 12px",
                  background: "linear-gradient(135deg, rgba(238,242,255,0.8) 0%, rgba(224,231,255,0.5) 100%)",
                  border: "1px solid rgba(55,48,163,0.1)",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "#3730a3",
                  lineHeight: 1.6,
                  maxHeight: "150px",
                  overflowY: "auto",
                  animation: "fadeInUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
                }}
              >
                {simplified}
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
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes sentenceFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sentenceSavePop {
          0% { transform: scale(0.9); opacity: 0; }
          50% { transform: scale(1.03); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
