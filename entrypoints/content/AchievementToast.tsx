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
    const timer = setTimeout(() => setConfettiVisible(false), 2000);
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
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
          borderRadius: "16px",
          padding: "16px 20px",
          width: "320px",
          boxShadow: "0 20px 60px rgba(99, 102, 241, 0.4), 0 10px 20px rgba(0,0,0,0.15)",
          transform: showState ? "translateX(0) scale(1)" : "translateX(100%) scale(0.8)",
          opacity: showState ? 1 : 0,
          transition: [
            `transform ${isClosing ? DURATION.exit : DURATION.entrance}ms ${isClosing ? EASING.accelerate : EASING.panel}`,
            `opacity ${isClosing ? DURATION.exit : DURATION.entrance}ms ${isClosing ? EASING.accelerate : EASING.decelerate}`,
          ].join(", "),
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Confetti particles */}
        {confettiVisible && (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: "8px",
                  height: "8px",
                  borderRadius: i % 2 === 0 ? "50%" : "2px",
                  background: ["#fbbf24", "#34d399", "#f472b6", "#60a5fa", "#fff"][i % 5],
                  left: `${10 + (i * 7)}%`,
                  top: "-10px",
                  animation: `confettiFall ${1 + (i % 3) * 0.3}s ease-out forwards`,
                  animationDelay: `${i * 0.08}s`,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            🎉 Achievement Unlocked!
          </span>
          <button
            onClick={triggerClose}
            style={{
              color: "rgba(255,255,255,0.7)",
              background: "none",
              border: "none",
              fontSize: "18px",
              cursor: "pointer",
              padding: "0",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Achievement content */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {/* Icon */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              animation: "achievementIconPop 600ms cubic-bezier(0.34, 1.56, 0.64, 1.0) both",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            {achievement.icon}
          </div>

          {/* Text */}
          <div style={{ flex: 1 }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#fff",
                margin: "0 0 4px 0",
                animation: "fadeInUp 400ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 200ms both",
              }}
            >
              {achievement.name}
            </h3>
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.8)",
                margin: "0 0 6px 0",
                animation: "fadeInUp 400ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 300ms both",
              }}
            >
              {achievement.description}
            </p>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#fbbf24",
                animation: "fadeInUp 400ms cubic-bezier(0.0, 0.0, 0.2, 1.0) 400ms both",
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
