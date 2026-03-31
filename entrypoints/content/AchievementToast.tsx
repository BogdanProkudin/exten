import { useState, useEffect } from "react";
import { useEntranceAnimation, useExitAnimation, DURATION, EASING } from "../../src/lib/motion";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp: number;
}

interface AchievementToastProps {
  achievement: Achievement;
  onClose: () => void;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const CONFETTI_COLORS = ["#6366f1", "#3b82f6", "#06b6d4", "#f59e0b", "#10b981", "#f472b6"];

export function AchievementToast({ achievement, onClose }: AchievementToastProps) {
  const visible = useEntranceAnimation();
  const { isClosing, triggerClose } = useExitAnimation(onClose, DURATION.exit);
  const [confettiVisible, setConfettiVisible] = useState(true);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(triggerClose, 5000);
    return () => clearTimeout(timer);
  }, [triggerClose]);

  // Hide confetti after animation
  useEffect(() => {
    const timer = setTimeout(() => setConfettiVisible(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  const showState = visible && !isClosing;

  return (
    <div
      className="fixed top-5 right-5 z-[2147483647] pointer-events-auto"
      role="alert"
      aria-label={`Achievement unlocked: ${achievement.name}`}
    >
      <div
        style={{
          fontFamily: FONT,
          background: "#fff",
          borderRadius: "16px",
          padding: "0",
          width: "340px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
          transform: showState ? "translateY(0) scale(1)" : "translateY(-16px) scale(0.95)",
          opacity: showState ? 1 : 0,
          transition: [
            `transform ${isClosing ? DURATION.exit : 350}ms ${isClosing ? EASING.accelerate : EASING.spring}`,
            `opacity ${isClosing ? DURATION.exit : 300}ms ${isClosing ? EASING.accelerate : EASING.decelerate}`,
          ].join(", "),
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top accent gradient bar — matches ReviewToast */}
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

        {/* Shimmer sweep — celebratory touch */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
            borderRadius: "16px",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "linear-gradient(105deg, transparent 40%, rgba(99, 102, 241, 0.06) 45%, rgba(99, 102, 241, 0.1) 50%, rgba(99, 102, 241, 0.06) 55%, transparent 60%)",
              animation: "achievementShimmer 1.6s ease-in-out 0.4s forwards",
            }}
          />
        </div>

        {/* Confetti particles */}
        {confettiVisible && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: i % 3 === 0 ? "7px" : "5px",
                  height: i % 3 === 0 ? "7px" : "5px",
                  borderRadius: i % 2 === 0 ? "50%" : "1px",
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  left: `${6 + i * 7.5}%`,
                  top: "-6px",
                  animation: `confettiFall ${1.1 + (i % 4) * 0.25}s ease-out forwards`,
                  animationDelay: `${i * 0.06}s`,
                  opacity: 0.75,
                }}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ padding: "16px 18px", position: "relative" }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span
              style={{
                fontSize: "11px",
                fontFamily: FONT,
                fontWeight: 600,
                color: "#6366f1",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Achievement unlocked
            </span>

            {/* Close button — matches ReviewToast */}
            <button
              onClick={triggerClose}
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "8px",
                border: "none",
                background: "#f5f5f5",
                cursor: "pointer",
                color: "#6b7280",
                fontSize: "14px",
                transition: "all 150ms",
                fontFamily: FONT,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#e5e7eb";
                e.currentTarget.style.color = "#374151";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f5f5f5";
                e.currentTarget.style.color = "#6b7280";
              }}
            >
              &#x2715;
            </button>
          </div>

          {/* Icon + text row */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Icon */}
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #eef2ff, #e0e7ff)",
                border: "1px solid #c7d2fe",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                flexShrink: 0,
                animation: "achievementIconPop 600ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
              }}
            >
              {achievement.icon}
            </div>

            {/* Text block */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "15px",
                  fontFamily: FONT,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                  lineHeight: 1.3,
                  animation: "fadeInUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 150ms both",
                }}
              >
                {achievement.name}
              </p>
              <p
                style={{
                  fontSize: "13px",
                  fontFamily: FONT,
                  fontWeight: 400,
                  color: "#6b7280",
                  margin: "3px 0 0 0",
                  lineHeight: 1.4,
                  animation: "fadeInUp 300ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 250ms both",
                }}
              >
                {achievement.description}
              </p>
            </div>
          </div>

          {/* XP badge — bottom right, bounces in */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "12px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontFamily: FONT,
                fontWeight: 700,
                color: "#6366f1",
                background: "#eef2ff",
                border: "1px solid #c7d2fe",
                padding: "4px 10px",
                borderRadius: "10px",
                animation: "xpPop 400ms cubic-bezier(0.34, 1.56, 0.64, 1.0) 0.4s both",
              }}
            >
              +{achievement.xp} XP
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
