import { useState, useCallback, type ReactNode } from "react";

interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  flipped: boolean;
  /** Disable the mouse-follow tilt (e.g. during feedback). */
  disableTilt?: boolean;
}

/**
 * CSS 3D flip card with mouse-follow tilt and dynamic shadow.
 * Front/back are rendered on opposite sides; flipping rotates the container 180deg on Y.
 * The tilt effect creates a subtle "floating" depth that follows the cursor.
 * A dynamic shadow moves opposite to the tilt direction for realism.
 */
export function FlipCard({ front, back, flipped, disableTilt }: FlipCardProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disableTilt || flipped) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientY - rect.top - rect.height / 2) / rect.height) * -8;
      const y = ((e.clientX - rect.left - rect.width / 2) / rect.width) * 8;
      setTilt({ x, y });
    },
    [disableTilt, flipped],
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  const tiltTransform =
    !flipped && !disableTilt
      ? `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
      : "perspective(1200px) rotateX(0deg) rotateY(0deg)";

  // Dynamic shadow — moves opposite to tilt for realism
  const shadowX = -tilt.y * 1.5;
  const shadowY = -tilt.x * 1.5;
  const shadowBlur = 24 + Math.abs(tilt.x + tilt.y) * 2;
  const dynamicShadow = !flipped && !disableTilt && (tilt.x !== 0 || tilt.y !== 0)
    ? `${shadowX}px ${shadowY}px ${shadowBlur}px rgba(99, 102, 241, 0.1), 0 2px 8px rgba(0, 0, 0, 0.04)`
    : "0 4px 24px rgba(99, 102, 241, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04)";

  return (
    <div
      className="relative w-full"
      style={{ perspective: "1200px" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Tilt wrapper — applies mouse-follow rotation + dynamic shadow */}
      <div
        style={{
          transform: tiltTransform,
          transition: "transform 0.18s ease-out, box-shadow 0.25s ease-out",
          transformStyle: "preserve-3d",
          borderRadius: "24px",
          boxShadow: dynamicShadow,
        }}
      >
        {/* Flip wrapper — applies the 180deg Y rotation */}
        <div
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Front face */}
          <div style={{ backfaceVisibility: "hidden" }}>{front}</div>

          {/* Back face */}
          <div
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              position: "absolute",
              inset: 0,
            }}
          >
            {back}
          </div>
        </div>
      </div>
    </div>
  );
}
