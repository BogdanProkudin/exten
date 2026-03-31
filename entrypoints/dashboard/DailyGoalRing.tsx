import { memo } from "react";

interface DailyGoalRingProps {
  current: number;
  target: number;
  streak: number;
}

const RADIUS = 36;
const STROKE = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE) * 2;

export const DailyGoalRing = memo(function DailyGoalRing({
  current,
  target,
  streak,
}: DailyGoalRingProps) {
  const progress = target > 0 ? Math.min(current / target, 1) : 0;
  const offset = CIRCUMFERENCE * (1 - progress);
  const goalMet = current >= target;
  const strokeColor = goalMet ? "#22c55e" : "#3b82f6";
  const remaining = Math.max(0, target - current);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "12px 16px",
        background: goalMet ? "#f0fdf4" : "#f8fafc",
        borderRadius: "12px",
        border: `1px solid ${goalMet ? "#bbf7d0" : "#e2e8f0"}`,
        maxWidth: "28rem",
        margin: "0 auto 16px",
      }}
    >
      {/* SVG Ring */}
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ flexShrink: 0 }}
      >
        {/* Background track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={STROKE}
        />
        {/* Progress arc */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={strokeColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 0.6s ease-out, stroke 0.3s ease",
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
          }}
        />
        {/* Center text */}
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 4}
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill="#1e293b"
        >
          {current}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 10}
          textAnchor="middle"
          fontSize="10"
          fill="#94a3b8"
        >
          / {target}
        </text>
      </svg>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: goalMet ? "#166534" : "#334155",
            marginBottom: "2px",
          }}
        >
          {goalMet ? "Goal reached!" : `${remaining} more to go`}
        </div>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          Daily goal: {target} words
        </div>
        {streak > 1 && (
          <div
            style={{
              fontSize: "12px",
              color: "#ea580c",
              fontWeight: 600,
              marginTop: "2px",
            }}
          >
            {streak} day streak 🔥
          </div>
        )}
      </div>
    </div>
  );
});
