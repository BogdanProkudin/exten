import { useState, useEffect } from "react";
import type { PageAnalysisResult, UnknownWord } from "../../src/lib/page-analyzer";
import type { FrequencyBand } from "../../src/lib/frequency-list";
import {
  filterAndSortByLevel,
  getLevelAwareComprehension,
  getConfigForLevel,
} from "../../src/lib/level-filter";
import {
  useEntranceAnimation,
  useExitAnimation,
  DURATION,
  EASING,
} from "../../src/lib/motion";

interface RadarSuggestion {
  lemma: string;
  count: number;
}

interface ReadingPanelProps {
  analysis: PageAnalysisResult;
  radarSuggestions: RadarSuggestion[];
  userLevel: string;
  onClose: () => void;
  onSaveWord: (word: string) => Promise<void>;
  onExplainWord: (word: string, sentence: string) => Promise<string | null>;
  onSimplifyPage: () => void;
}

const FREQ_BADGE: Record<FrequencyBand, { label: string; bg: string; text: string }> = {
  top2k: { label: "Common", bg: "#dcfce7", text: "#166534" },
  top5k: { label: "Mid", bg: "#dbeafe", text: "#1e40af" },
  top10k: { label: "Uncommon", bg: "#fef9c3", text: "#854d0e" },
  rare: { label: "Rare", bg: "#fee2e2", text: "#991b1b" },
};

// Frequency dot colors (compact badge alternative)
const FREQ_DOT: Record<FrequencyBand, string> = {
  top2k: "#22c55e",
  top5k: "#3b82f6",
  top10k: "#eab308",
  rare: "#ef4444",
};

const BAND_ORDER: Record<FrequencyBand, number> = { top2k: 0, top5k: 1, top10k: 2, rare: 3 };
const BAND_HEADERS: Record<FrequencyBand, string> = {
  top2k: "Common — worth learning first",
  top5k: "Mid-frequency",
  top10k: "Uncommon",
  rare: "Rare — specialized vocabulary",
};

function groupByBand(words: UnknownWord[]): { band: FrequencyBand; words: UnknownWord[] }[] {
  const groups = new Map<FrequencyBand, UnknownWord[]>();
  const sorted = [...words].sort(
    (a, b) => BAND_ORDER[a.frequency] - BAND_ORDER[b.frequency] || b.occurrences - a.occurrences,
  );
  for (const w of sorted) {
    const list = groups.get(w.frequency);
    if (list) list.push(w);
    else groups.set(w.frequency, [w]);
  }
  return [...groups.entries()].map(([band, words]) => ({ band, words }));
}

export function ReadingPanel({
  analysis,
  radarSuggestions,
  userLevel,
  onClose,
  onSaveWord,
  onExplainWord,
  onSimplifyPage,
}: ReadingPanelProps) {
  const [savingWords, setSavingWords] = useState<Set<string>>(new Set());
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [explainingWord, setExplainingWord] = useState<string | null>(null);
  const [savingAllCommon, setSavingAllCommon] = useState(false);

  // Level-aware filtering
  const { priority, secondary } = filterAndSortByLevel(analysis.unknownWords, userLevel);
  const config = getConfigForLevel(userLevel);
  const levelComprehension = getLevelAwareComprehension(
    analysis.totalUniqueWords,
    analysis.unknownWords,
    userLevel,
  );
  const hasPriority = priority.length > 0;

  const visible = useEntranceAnimation();
  const { isClosing, triggerClose } = useExitAnimation(onClose, DURATION.exit);

  // Escape to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        triggerClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [triggerClose]);

  const handleSave = async (word: string) => {
    setSavingWords((prev) => new Set(prev).add(word));
    await onSaveWord(word);
    setSavingWords((prev) => {
      const next = new Set(prev);
      next.delete(word);
      return next;
    });
    setSavedWords((prev) => new Set(prev).add(word));
  };

  const handleExplain = async (word: string) => {
    if (explanations[word] || explainingWord) return;
    setExplainingWord(word);
    const result = await onExplainWord(word, "");
    if (result) {
      setExplanations((prev) => ({ ...prev, [word]: result }));
    }
    setExplainingWord(null);
  };

  const cefrColors: Record<string, string> = {
    A2: "#16a34a",
    B1: "#2563eb",
    B2: "#ca8a04",
    C1: "#dc2626",
  };

  const showState = visible && !isClosing;

  return (
    <div
      role="complementary"
      aria-label="Reading assistant"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "380px",
        height: "100vh",
        background: "#fff",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-4px 0 24px rgba(0,0,0,.08)",
        zIndex: 2147483646,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: "14px",
        color: "#111",
        transform: showState ? "translateX(0)" : "translateX(100%)",
        transition: `transform ${isClosing ? DURATION.exit : DURATION.slow}ms ${isClosing ? EASING.accelerate : EASING.panel}`,
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid #f3f4f6",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "4px" }}>
            Reading Assistant
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              padding: "2px 8px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 700,
              background: cefrColors[analysis.difficultyLevel] || "#888",
              color: "#fff",
            }}>
              {analysis.difficultyLevel}
            </span>
            <span style={{ fontSize: "13px", color: "#6b7280" }}>
              {levelComprehension}% comprehension
            </span>
          </div>
        </div>
        <button
          onClick={triggerClose}
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "14px",
            border: "none",
            background: "#f3f4f6",
            color: "#666",
            fontSize: "16px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          &#x2715;
        </button>
      </div>

      {/* Stats Row */}
      <div style={{
        display: "flex",
        gap: "12px",
        padding: "12px 20px",
        borderBottom: "1px solid #f3f4f6",
      }}>
        <StatPill label="Total" value={analysis.totalUniqueWords} color="#6b7280" />
        <StatPill label="Known" value={analysis.knownWordCount} color="#22c55e" />
        <StatPill label="Unknown" value={analysis.unknownWordCount} color="#ef4444" />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {/* Radar Suggestions */}
        {radarSuggestions.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "#6b7280",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
            }}>
              Vocabulary Radar — Frequently Seen
            </div>
            {radarSuggestions.map((s) => (
              <div key={s.lemma} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid #f9fafb",
              }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: "14px" }}>{s.lemma}</span>
                  <span style={{ fontSize: "11px", color: "#6b7280", marginLeft: "8px" }}>
                    Seen {s.count}x
                  </span>
                </div>
                {savedWords.has(s.lemma) ? (
                  <span style={{ fontSize: "11px", color: "#22c55e" }}>Saved</span>
                ) : savingWords.has(s.lemma) ? (
                  <span style={{ fontSize: "11px", color: "#6b7280" }}>...</span>
                ) : (
                  <button
                    onClick={() => handleSave(s.lemma)}
                    style={{
                      fontSize: "11px",
                      color: "#3b82f6",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 6px",
                    }}
                  >
                    Save
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Level-Aware Unknown Words */}
        <div style={{
          fontSize: "12px",
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span>
            {hasPriority ? config.priorityLabel : "Unknown Words"} ({hasPriority ? priority.length : secondary.length})
          </span>
          {(() => {
            const recommendedWords = hasPriority ? priority : secondary;
            const unsaved = recommendedWords.filter(w => !savedWords.has(w.word));
            if (unsaved.length === 0) return null;
            return (
              <button
                onClick={async () => {
                  setSavingAllCommon(true);
                  for (const w of unsaved) {
                    await handleSave(w.word);
                  }
                  setSavingAllCommon(false);
                }}
                disabled={savingAllCommon}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#fff",
                  background: savingAllCommon ? "#9ca3af" : "#22c55e",
                  border: "none",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  cursor: savingAllCommon ? "default" : "pointer",
                  textTransform: "none",
                  letterSpacing: "normal",
                }}
              >
                {savingAllCommon ? "Saving..." : `Save All Recommended (${unsaved.length})`}
              </button>
            );
          })()}
        </div>

        {priority.length === 0 && secondary.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "24px 0",
            color: "#6b7280",
            fontSize: "13px",
          }}>
            All words on this page are in your vocabulary!
          </div>
        ) : (
          <>
            {/* Priority section */}
            {hasPriority ? (
              <>
                {groupByBand(priority).map(({ band, words: bandWords }) => (
                  <div key={band} style={{ marginBottom: "12px" }}>
                    <div style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: FREQ_BADGE[band].text,
                      background: FREQ_BADGE[band].bg,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      marginBottom: "6px",
                      display: "inline-block",
                    }}>
                      {BAND_HEADERS[band]} ({bandWords.length})
                    </div>
                    {bandWords.map((uw) => (
                      <WordRow
                        key={uw.lemma}
                        word={uw}
                        isSaving={savingWords.has(uw.word)}
                        isSaved={savedWords.has(uw.word)}
                        explanation={explanations[uw.word]}
                        isExplaining={explainingWord === uw.word}
                        onSave={() => handleSave(uw.word)}
                        onExplain={() => handleExplain(uw.word)}
                      />
                    ))}
                  </div>
                ))}

                {/* Secondary section — collapsed */}
                {secondary.length > 0 && (
                  <details style={{ marginTop: "12px" }}>
                    <summary style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#6b7280",
                      cursor: "pointer",
                      padding: "6px 0",
                      userSelect: "none",
                    }}>
                      Also on this page ({secondary.length})
                    </summary>
                    <div style={{ marginTop: "8px" }}>
                      {groupByBand(secondary).map(({ band, words: bandWords }) => (
                        <div key={band} style={{ marginBottom: "12px" }}>
                          <div style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: FREQ_BADGE[band].text,
                            background: FREQ_BADGE[band].bg,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            marginBottom: "6px",
                            display: "inline-block",
                          }}>
                            {BAND_HEADERS[band]} ({bandWords.length})
                          </div>
                          {bandWords.map((uw) => (
                            <WordRow
                              key={uw.lemma}
                              word={uw}
                              isSaving={savingWords.has(uw.word)}
                              isSaved={savedWords.has(uw.word)}
                              explanation={explanations[uw.word]}
                              isExplaining={explainingWord === uw.word}
                              onSave={() => handleSave(uw.word)}
                              onExplain={() => handleExplain(uw.word)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <>
                {/* No priority words — show secondary as main with note */}
                <div style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  fontStyle: "italic",
                  marginBottom: "8px",
                }}>
                  No words at your target level — showing all unknown words
                </div>
                {groupByBand(secondary).map(({ band, words: bandWords }) => (
                  <div key={band} style={{ marginBottom: "12px" }}>
                    <div style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: FREQ_BADGE[band].text,
                      background: FREQ_BADGE[band].bg,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      marginBottom: "6px",
                      display: "inline-block",
                    }}>
                      {BAND_HEADERS[band]} ({bandWords.length})
                    </div>
                    {bandWords.map((uw) => (
                      <WordRow
                        key={uw.lemma}
                        word={uw}
                        isSaving={savingWords.has(uw.word)}
                        isSaved={savedWords.has(uw.word)}
                        explanation={explanations[uw.word]}
                        isExplaining={explainingWord === uw.word}
                        onSave={() => handleSave(uw.word)}
                        onExplain={() => handleExplain(uw.word)}
                      />
                    ))}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 20px",
        borderTop: "1px solid #f3f4f6",
      }}>
        <button
          onClick={onSimplifyPage}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            color: "#374151",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            transition: "background 150ms",
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#f3f4f6"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#f9fafb"; }}
        >
          Simplify Page
        </button>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 10px",
      borderRadius: "8px",
      background: "#f9fafb",
    }}>
      <span style={{ fontSize: "16px", fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: "11px", color: "#6b7280" }}>{label}</span>
    </div>
  );
}

function WordRow({
  word,
  isSaving,
  isSaved,
  explanation,
  isExplaining,
  onSave,
  onExplain,
}: {
  word: UnknownWord;
  isSaving: boolean;
  isSaved: boolean;
  explanation?: string;
  isExplaining: boolean;
  onSave: () => void;
  onExplain: () => void;
}) {
  const dotColor = FREQ_DOT[word.frequency];
  const freq = FREQ_BADGE[word.frequency];
  return (
    <div style={{
      padding: "6px 0",
      borderBottom: "1px solid #f9fafb",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontWeight: 500 }}>{word.word}</span>
          <span
            title={freq.label}
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "3px",
              background: dotColor,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {word.occurrences > 1 && (
            <span style={{ fontSize: "11px", color: "#6b7280" }}>
              {word.occurrences}x
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {isSaved ? (
            <span style={{ fontSize: "11px", color: "#22c55e" }}>Saved</span>
          ) : (
            <button
              onClick={onSave}
              disabled={isSaving}
              style={{
                fontSize: "11px",
                color: "#3b82f6",
                background: "none",
                border: "none",
                cursor: isSaving ? "default" : "pointer",
                padding: "2px 4px",
              }}
            >
              {isSaving ? "..." : "Save"}
            </button>
          )}
          <button
            onClick={onExplain}
            disabled={isExplaining || !!explanation}
            style={{
              fontSize: "11px",
              color: explanation ? "#6b7280" : "#d97706",
              background: "none",
              border: "none",
              cursor: (isExplaining || !!explanation) ? "default" : "pointer",
              padding: "2px 4px",
            }}
          >
            {isExplaining ? "..." : "Explain"}
          </button>
        </div>
      </div>
      {explanation && (
        <div style={{
          marginTop: "6px",
          padding: "8px 10px",
          borderRadius: "6px",
          background: "#fffbeb",
          fontSize: "12px",
          color: "#92400e",
          lineHeight: 1.5,
          animation: "fadeInUp 250ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
          overflow: "hidden",
        }}>
          {explanation}
        </div>
      )}
    </div>
  );
}
