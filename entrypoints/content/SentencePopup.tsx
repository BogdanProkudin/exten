import { useState, useEffect, useRef } from "react";

interface SentenceAnalysis {
  grammar: string;
  simplified: string;
  vocabulary: { word: string; role: string }[];
}

interface SentencePopupProps {
  sentence: string;
  position: { x: number; y: number; placeAbove?: boolean };
  onClose: () => void;
  vocabLemmas?: Set<string>;
  onWordClick?: (word: string) => void;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function SentencePopup({
  sentence,
  position,
  onClose,
  vocabLemmas,
  onWordClick,
}: SentencePopupProps) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<SentenceAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [visible, setVisible] = useState(false);
  const [translationError, setTranslationError] = useState(false);
  const [translationKey, setTranslationKey] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Translate sentence
  useEffect(() => {
    setTranslating(true);
    setTranslationError(false);
    chrome.runtime
      .sendMessage({ type: "TRANSLATE_WORD", word: sentence })
      .then((res) => {
        if (res?.success) {
          setTranslation(res.translation);
        } else {
          setTranslation(null);
          setTranslationError(true);
        }
      })
      .catch(() => {
        setTranslation(null);
        setTranslationError(true);
      })
      .finally(() => setTranslating(false));
  }, [sentence, translationKey]);

  function retryTranslation() {
    setTranslationKey((k) => k + 1);
  }

  function speak() {
    if (speaking) {
      chrome.runtime.sendMessage({ type: "STOP_SPEAKING" });
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    chrome.runtime.sendMessage({ type: "SPEAK_WORD", word: sentence })
      .then(() => setSpeaking(false))
      .catch(() => setSpeaking(false));
  }

  function copyTranslation() {
    if (!translation) return;
    navigator.clipboard.writeText(translation).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function runAnalysis() {
    if (aiLoading || aiAnalysis) return;
    setAiLoading(true);
    setAiError(null);
    setShowAnalysis(true);
    try {
      const storage = await chrome.storage.sync.get(["userLevel", "targetLang"]);
      const res = await chrome.runtime.sendMessage({
        type: "AI_ANALYZE_SENTENCE",
        sentence,
        targetLang: storage.targetLang || "ru",
        userLevel: storage.userLevel || "B1",
      });
      if (res?.success) {
        setAiAnalysis(res.analysis as SentenceAnalysis);
      } else {
        setAiError(res?.error || "Analysis failed");
      }
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  }

  function handleWordClick(word: string) {
    onWordClick?.(word);
  }

  const displaySentence = sentence.length > 140 ? sentence.slice(0, 140) + "..." : sentence;

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x}px`,
        top: position.placeAbove ? undefined : `${position.y}px`,
        bottom: position.placeAbove ? `calc(100% - ${position.y}px)` : undefined,
        width: "380px",
        maxWidth: "90vw",
        fontFamily: FONT,
        zIndex: 2147483647,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(4px) scale(0.98)",
        transition: "opacity 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1.0)",
      }}
    >
      <div
        ref={cardRef}
        className="pointer-events-auto"
        style={{
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0,0,0,.12), 0 2px 8px rgba(0,0,0,.08)",
          border: "1px solid rgba(0,0,0,.06)",
          maxHeight: "480px",
          overflowY: "auto",
          overflowX: "hidden",
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
          {/* Header row: close + speak */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "4px",
              marginBottom: "8px",
            }}
          >
            <button
              onClick={speak}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                color: speaking ? "#3b82f6" : "#6b7280",
                background: speaking ? "#eff6ff" : "#f5f5f5",
                transition: "all 150ms ease",
              }}
              title="Listen"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {speaking ? (
                  <>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </>
                ) : (
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                )}
              </svg>
            </button>
            <button
              onClick={onClose}
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
          </div>

          {/* Sentence as blockquote */}
          <div
            style={{
              borderLeft: "3px solid #6366f1",
              paddingLeft: "12px",
              marginBottom: "12px",
              animation: visible ? "sentenceFadeIn 300ms ease both" : undefined,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 500,
                color: "#1e293b",
                lineHeight: 1.5,
                letterSpacing: "-0.01em",
              }}
            >
              {displaySentence}
            </p>
          </div>

          {/* Translation */}
          <div style={{ marginBottom: "14px" }}>
            {translating ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 12px",
                  background: "#f8fafc",
                  borderRadius: "10px",
                  fontSize: "13px",
                  color: "#94a3b8",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    border: "2px solid #e2e8f0",
                    borderTopColor: "#6366f1",
                    animation: "spin 0.6s linear infinite",
                  }}
                />
                Translating...
              </div>
            ) : translation ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  padding: "10px 12px",
                  background: "#f8fafc",
                  borderRadius: "10px",
                  animation: "sentenceFadeIn 300ms ease 100ms both",
                }}
              >
                {/* Arrow indicator */}
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
                <p
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#334155",
                    lineHeight: 1.5,
                    flex: 1,
                  }}
                >
                  {translation}
                </p>
                <button
                  onClick={copyTranslation}
                  style={{
                    width: "26px",
                    height: "26px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    color: copied ? "#22c55e" : "#94a3b8",
                    background: copied ? "#f0fdf4" : "transparent",
                    flexShrink: 0,
                    transition: "all 150ms ease",
                  }}
                  title={copied ? "Copied!" : "Copy"}
                  onMouseEnter={(e) => {
                    if (!copied) (e.currentTarget).style.background = "#f1f5f9";
                  }}
                  onMouseLeave={(e) => {
                    if (!copied) (e.currentTarget).style.background = "transparent";
                  }}
                >
                  {copied ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
            ) : (
              <div
                style={{
                  padding: "10px 12px",
                  background: "#fef2f2",
                  borderRadius: "10px",
                  border: "1px solid #fecaca",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "13px", color: "#991b1b", fontWeight: 500 }}>
                    Translation unavailable
                  </span>
                  <button
                    onClick={retryTranslation}
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 500,
                      borderRadius: "6px",
                      border: "1px solid #fecaca",
                      cursor: "pointer",
                      background: "#fff",
                      color: "#991b1b",
                      transition: "background 150ms ease",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget).style.background = "#fef2f2"; }}
                    onMouseLeave={(e) => { (e.currentTarget).style.background = "#fff"; }}
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* AI Analysis section */}
          {showAnalysis && (
            <div
              style={{
                marginBottom: "12px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                overflow: "hidden",
                animation: "sentenceFadeIn 200ms ease both",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                  borderBottom: aiAnalysis || aiLoading || aiError ? "1px solid #e2e8f0" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
                </svg>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Analysis
                </span>
              </div>

              {aiLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "14px 12px",
                    fontSize: "13px",
                    color: "#94a3b8",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      border: "2px solid #e2e8f0",
                      borderTopColor: "#6366f1",
                      animation: "spin 0.6s linear infinite",
                    }}
                  />
                  Analyzing sentence...
                </div>
              ) : aiError ? (
                <div style={{ padding: "10px 12px", fontSize: "13px", color: "#dc2626" }}>{aiError}</div>
              ) : aiAnalysis ? (
                <div style={{ padding: "10px 12px" }}>
                  {/* Grammar */}
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>
                      Grammar
                    </div>
                    <div style={{ fontSize: "13px", color: "#334155", lineHeight: 1.5 }}>{aiAnalysis.grammar}</div>
                  </div>

                  {/* Simplified */}
                  {aiAnalysis.simplified && (
                    <div style={{ marginBottom: "8px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>
                        Simplified
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "#475569",
                          lineHeight: 1.5,
                          fontStyle: "italic",
                          padding: "6px 10px",
                          background: "#f8fafc",
                          borderRadius: "6px",
                          borderLeft: "2px solid #cbd5e1",
                        }}
                      >
                        {aiAnalysis.simplified}
                      </div>
                    </div>
                  )}

                  {/* Word roles */}
                  {aiAnalysis.vocabulary.length > 0 && (
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                        Word Roles
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                        {aiAnalysis.vocabulary.map((v, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: "11px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "#f1f5f9",
                              color: "#475569",
                              fontWeight: 500,
                            }}
                          >
                            {v.word}
                            <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: "2px" }}>
                              {v.role}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Action row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              animation: "sentenceFadeIn 300ms ease 200ms both",
            }}
          >
            {!showAnalysis && (
              <button
                onClick={runAnalysis}
                style={{
                  padding: "8px 14px",
                  fontSize: "13px",
                  fontWeight: 500,
                  borderRadius: "10px",
                  background: "#fff",
                  color: "#475569",
                  border: "1px solid #e2e8f0",
                  cursor: "pointer",
                  fontFamily: FONT,
                  transition: "all 150ms ease",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget).style.borderColor = "#6366f1";
                  (e.currentTarget).style.color = "#4338ca";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget).style.borderColor = "#e2e8f0";
                  (e.currentTarget).style.color = "#475569";
                }}
                onMouseDown={(e) => {
                  (e.currentTarget).style.transform = "scale(0.97)";
                }}
                onMouseUp={(e) => {
                  (e.currentTarget).style.transform = "scale(1)";
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Analyze
              </button>
            )}
          </div>
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
      `}</style>
    </div>
  );
}
