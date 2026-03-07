import { useState, useEffect, useRef } from "react";
import {
  useEntranceAnimation,
  useExitAnimation,
  DURATION,
  EASING,
} from "../../src/lib/motion";

interface SimplifyPanelProps {
  simplified: string;
  onClose: () => void;
}

export function SimplifyPanel({ simplified, onClose }: SimplifyPanelProps) {
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
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

  // Focus trap: keep focus inside the modal
  useEffect(() => {
    if (!panelRef.current) return;
    const panel = panelRef.current;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length > 0) focusable[0].focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(simplified);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = simplified;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const showState = visible && !isClosing;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Simplified text"
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2147483647,
        pointerEvents: "auto",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        opacity: showState ? 1 : 0,
        transition: `opacity ${DURATION.normal}ms ${EASING.default}`,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "700px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,.15)",
          margin: "20px",
          transform: showState ? "scale(1) translateY(0)" : "scale(0.95) translateY(16px)",
          opacity: showState ? 1 : 0,
          transition: [
            `transform ${DURATION.entrance}ms ${EASING.decelerate}`,
            `opacity ${DURATION.entrance}ms ${EASING.decelerate}`,
          ].join(", "),
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid #f3f4f6",
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#111", margin: 0 }}>
            Simplified Text
          </h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleCopy}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                background: copied ? "#dcfce7" : "#f9fafb",
                color: copied ? "#166534" : "#374151",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={triggerClose}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
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
        </div>

        {/* Content */}
        <div style={{
          padding: "24px",
          overflowY: "auto",
          flex: 1,
          fontSize: "15px",
          lineHeight: 1.8,
          color: "#333",
          whiteSpace: "pre-wrap",
        }}>
          {simplified}
        </div>
      </div>
    </div>
  );
}
