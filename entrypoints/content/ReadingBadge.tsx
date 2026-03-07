import { useState, useEffect } from "react";
import type { CEFRLevel, PageAnalysisResult } from "../../src/lib/page-analyzer";
import { shouldShowTip, markTipSeen, dismissTipForever, incrementCounter } from "../../src/lib/tips";

interface ReadingBadgeProps {
  analysis: PageAnalysisResult;
  onClick: () => void;
}

const CEFR_COLORS: Record<CEFRLevel, { bg: string; text: string; border: string }> = {
  A2: { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" },
  B1: { bg: "#dbeafe", text: "#1e40af", border: "#bfdbfe" },
  B2: { bg: "#fef9c3", text: "#854d0e", border: "#fef08a" },
  C1: { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" },
};

export function ReadingBadge({ analysis, onClick }: ReadingBadgeProps) {
  const colors = CEFR_COLORS[analysis.difficultyLevel];
  const [tipVisible, setTipVisible] = useState(false);

  // Check if we should show the badge click tip
  useEffect(() => {
    shouldShowTip("tip_reading_badge").then((show) => {
      if (show) {
        setTipVisible(true);
        markTipSeen("tip_reading_badge");
        // Auto-dismiss after 8 seconds
        const timer = setTimeout(() => setTipVisible(false), 8000);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  const handleClick = () => {
    incrementCounter("badgeClicked", true);
    setTipVisible(false);
    onClick();
  };

  return (
    <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 2147483646, pointerEvents: "auto" }}>
      {/* Coachmark tip */}
      {tipVisible && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: "#1D1D1F",
            color: "#fff",
            borderRadius: "8px",
            padding: "8px 12px",
            fontSize: "12px",
            lineHeight: 1.4,
            width: "200px",
            animation: "fadeInUp 200ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
          }}
        >
          <span style={{ flex: 1 }}>Click the badge to see unknown words on this page</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTipVisible(false);
              dismissTipForever("tip_reading_badge");
            }}
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

      {/* Badge */}
      <div
        onClick={handleClick}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "20px",
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 2px 12px rgba(0,0,0,.1)",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: "13px",
          fontWeight: 600,
          color: colors.text,
          transition: "transform 150ms ease, box-shadow 150ms ease",
          userSelect: "none",
          animation: "badgeSlideIn 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) both",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1.05)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,.15)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,.1)";
        }}
      >
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "24px",
          height: "24px",
          borderRadius: "12px",
          background: colors.text,
          color: "#fff",
          fontSize: "11px",
          fontWeight: 700,
        }}>
          {analysis.difficultyLevel}
        </span>
        <span>{analysis.comprehensionPercent}% known</span>
        {analysis.unknownWordCount > 0 && (
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "18px",
            height: "18px",
            borderRadius: "9px",
            background: colors.text,
            color: "#fff",
            fontSize: "10px",
            fontWeight: 700,
            padding: "0 5px",
          }}>
            {analysis.unknownWordCount > 99 ? "99+" : analysis.unknownWordCount}
          </span>
        )}
      </div>
    </div>
  );
}
