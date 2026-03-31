import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Animated SVG owl matching the Vocabify logo.
 * - Eyes track mouse cursor
 * - Blinks every few seconds
 * - Gentle breathing / floating
 * - Hover perk-up reaction
 * - Twinkling sparkles
 */
export function OwlAvatar({ size = 48 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pupilOffset, setPupilOffset] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFlapping, setIsFlapping] = useState(false);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0, y: 0 });

  // Track mouse
  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mouseRef.current.x - cx;
      const dy = mouseRef.current.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxOffset = size * 0.035;
      const scale = Math.min(dist / 250, 1);
      setPupilOffset({
        x: (dx / (dist || 1)) * maxOffset * scale,
        y: (dy / (dist || 1)) * maxOffset * scale,
      });
    });
  }, [size]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  // Blink cycle
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const blink = () => setIsBlinking(true);
    const scheduleBlink = () => {
      timeout = setTimeout(() => {
        blink();
        setTimeout(() => setIsBlinking(false), 140);
        if (Math.random() < 0.25) {
          setTimeout(() => {
            blink();
            setTimeout(() => setIsBlinking(false), 140);
          }, 280);
        }
        scheduleBlink();
      }, 2500 + Math.random() * 3000);
    };
    scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  const eyeScaleY = isBlinking ? 0.06 : 1;
  // Pupil positions (relative to viewBox)
  const px = pupilOffset.x * (120 / size);
  const py = pupilOffset.y * (120 / size);

  return (
    <div
      ref={containerRef}
      className="owl-avatar-container"
      style={{ width: size, height: size }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (!isFlapping) {
          setIsFlapping(true);
          setTimeout(() => setIsFlapping(false), 800);
        }
      }}
    >
      <div className="owl-avatar-glow" />

      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className={`owl-avatar-svg ${isHovered ? "owl-avatar-hover" : ""} ${isFlapping ? "owl-avatar-flap" : ""}`}
        style={{ overflow: "visible" }}
      >
        <defs>
          {/* Orange body gradient */}
          <radialGradient id="owlBody" cx="50%" cy="38%" r="55%">
            <stop offset="0%" stopColor="#fdad33" />
            <stop offset="55%" stopColor="#f08a24" />
            <stop offset="100%" stopColor="#dd6b18" />
          </radialGradient>

          {/* Cream belly */}
          <radialGradient id="owlBelly" cx="50%" cy="30%" r="55%">
            <stop offset="0%" stopColor="#fffef8" />
            <stop offset="70%" stopColor="#fef3dc" />
            <stop offset="100%" stopColor="#fce4b0" />
          </radialGradient>

          {/* Book cover */}
          <linearGradient id="owlBook" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ac5f7" />
            <stop offset="100%" stopColor="#0e8fd0" />
          </linearGradient>

          {/* Book pages */}
          <linearGradient id="owlPages" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffef5" />
            <stop offset="100%" stopColor="#f5ecd0" />
          </linearGradient>

          {/* Eye white */}
          <radialGradient id="owlEyeW" cx="50%" cy="42%" r="52%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e8f0fe" />
          </radialGradient>

          {/* Iris */}
          <radialGradient id="owlIris" cx="48%" cy="42%" r="50%">
            <stop offset="0%" stopColor="#5db8f5" />
            <stop offset="55%" stopColor="#2196f3" />
            <stop offset="100%" stopColor="#0d5baf" />
          </radialGradient>

          {/* Glasses */}
          <linearGradient id="owlGlass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6d5a4e" />
            <stop offset="100%" stopColor="#4a3728" />
          </linearGradient>

          {/* Shadow filter */}
          <filter id="owlSh" x="-15%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#000" floodOpacity="0.1" />
          </filter>
        </defs>

        {/* ════ BOOK ════ */}
        <g className="owl-book">
          {/* Open book — two cover halves curving outward */}
          <path d="M12,90 Q14,84 60,86 Q106,84 108,90 L106,102 Q60,98 14,102 Z" fill="url(#owlBook)" />
          {/* Page spread — fan of pages in the middle */}
          <path d="M22,88 Q60,83 98,88 L97,89 Q60,84.5 23,89 Z" fill="url(#owlPages)" />
          <path d="M24,90 Q60,85.5 96,90 L95.5,91 Q60,86.5 24.5,91 Z" fill="url(#owlPages)" opacity="0.8" />
          <path d="M25,92 Q60,87.5 95,92 L94.5,92.8 Q60,88.2 25.5,92.8 Z" fill="url(#owlPages)" opacity="0.6" />
          {/* Center spine shadow */}
          <line x1="60" y1="83" x2="60" y2="101" stroke="#0a6da8" strokeWidth="0.6" opacity="0.25" />
          {/* Bookmark */}
          <path d="M74,89 L74,106 L77.5,102 L81,106 L81,89" fill="#fdd835" />
        </g>

        {/* ════ BODY ════ */}
        <g filter="url(#owlSh)">
          {/* Head + body — one big rounded shape, head-heavy like the logo */}
          <path d="
            M60,22
            C78,22 94,34 94,52
            C94,62 90,70 86,76
            Q82,84 60,86
            Q38,84 34,76
            C30,70 26,62 26,52
            C26,34 42,22 60,22 Z
          " fill="url(#owlBody)" />

          {/* Ear tufts — prominent */}
          <path d="M33,34 Q26,16 40,26 Q36,30 35,36 Z" fill="#ef8b1e" />
          <path d="M87,34 Q94,16 80,26 Q84,30 85,36 Z" fill="#ef8b1e" />
          {/* Lighter inner tuft */}
          <path d="M34,34 Q29,20 40,27 Q37,31 36,36 Z" fill="#fdbe50" opacity="0.5" />
          <path d="M86,34 Q91,20 80,27 Q83,31 84,36 Z" fill="#fdbe50" opacity="0.5" />

          {/* Large white belly/chest — very prominent like logo */}
          <ellipse cx="60" cy="68" rx="22" ry="17" fill="url(#owlBelly)" />

          {/* Subtle feather arcs on belly */}
          <path d="M45,62 Q60,59 75,62" fill="none" stroke="#f5deb3" strokeWidth="0.5" opacity="0.5" />
          <path d="M44,66 Q60,63 76,66" fill="none" stroke="#f5deb3" strokeWidth="0.5" opacity="0.4" />
          <path d="M45,70 Q60,67 75,70" fill="none" stroke="#f5deb3" strokeWidth="0.5" opacity="0.3" />

          {/* Side wing shapes */}
          <path
            d="M28,55 Q22,62 27,78 Q30,73 31,64 Z"
            fill="#d87518" opacity="0.7"
            className={isFlapping ? "owl-wing-left" : ""}
          />
          <path
            d="M92,55 Q98,62 93,78 Q90,73 89,64 Z"
            fill="#d87518" opacity="0.7"
            className={isFlapping ? "owl-wing-right" : ""}
          />
        </g>

        {/* ════ EYES (blink group) ════ */}
        <g
          style={{
            transform: `scaleY(${eyeScaleY})`,
            transformOrigin: "60px 48px",
            transition: isBlinking ? "transform 50ms ease-in" : "transform 100ms ease-out",
          }}
        >
          {/* ── Left eye ── */}
          <circle cx="44" cy="48" r="13.5" fill="url(#owlEyeW)" />
          {/* Left iris */}
          <circle cx={44 + px} cy={48 + py} r="8" fill="url(#owlIris)" />
          {/* Left pupil */}
          <circle cx={44 + px * 1.3} cy={48 + py * 1.3} r="4" fill="#0a1628" />
          {/* Left highlights */}
          <circle cx={41} cy={44.5} r="2.5" fill="white" opacity="0.92" />
          <circle cx={46.5} cy={45.5} r="1" fill="white" opacity="0.5" />

          {/* ── Right eye ── */}
          <circle cx="76" cy="48" r="13.5" fill="url(#owlEyeW)" />
          {/* Right iris */}
          <circle cx={76 + px} cy={48 + py} r="8" fill="url(#owlIris)" />
          {/* Right pupil */}
          <circle cx={76 + px * 1.3} cy={48 + py * 1.3} r="4" fill="#0a1628" />
          {/* Right highlights */}
          <circle cx={73} cy={44.5} r="2.5" fill="white" opacity="0.92" />
          <circle cx={78.5} cy={45.5} r="1" fill="white" opacity="0.5" />
        </g>

        {/* ════ GLASSES ════ */}
        <g>
          {/* Left lens */}
          <circle cx="44" cy="48" r="15.5" fill="none" stroke="url(#owlGlass)" strokeWidth="2.2" />
          {/* Right lens */}
          <circle cx="76" cy="48" r="15.5" fill="none" stroke="url(#owlGlass)" strokeWidth="2.2" />
          {/* Bridge connecting lenses */}
          <path d="M59,47 Q60,44.5 61,47" fill="none" stroke="url(#owlGlass)" strokeWidth="1.8" strokeLinecap="round" />
          {/* Glass shine arcs */}
          <path d="M33,42 Q40,36 50,41" fill="none" stroke="white" strokeWidth="0.8" opacity="0.25" strokeLinecap="round" />
          <path d="M65,42 Q72,36 82,41" fill="none" stroke="white" strokeWidth="0.8" opacity="0.25" strokeLinecap="round" />
        </g>

        {/* ════ BEAK ════ */}
        <path d="M56.5,61 L60,66 L63.5,61" fill="#f59e0b" />
        <path d="M57.5,61 L60,64.5 L62.5,61" fill="#fbbf24" />

        {/* ════ FEET on book ════ */}
        <g>
          <path d="M48,84 L44,89 M48,84 L48,90 M48,84 L52,89" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M72,84 L68,89 M72,84 L72,90 M72,84 L76,89" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        </g>

        {/* ════ SPARKLES ════ */}
        <g className="owl-svg-sparkles">
          {/* ★ Top-right big star */}
          <g className="owl-svg-sparkle-1" transform="translate(102, 26)">
            <line x1="0" y1="-5" x2="0" y2="5" stroke="#fdd835" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="-5" y1="0" x2="5" y2="0" stroke="#fdd835" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="-3" y1="-3" x2="3" y2="3" stroke="#fdd835" strokeWidth="1" strokeLinecap="round" />
            <line x1="3" y1="-3" x2="-3" y2="3" stroke="#fdd835" strokeWidth="1" strokeLinecap="round" />
          </g>
          {/* ★ Top-left small star */}
          <g className="owl-svg-sparkle-2" transform="translate(18, 26)">
            <line x1="0" y1="-3.5" x2="0" y2="3.5" stroke="#4fc3f7" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="-3.5" y1="0" x2="3.5" y2="0" stroke="#4fc3f7" strokeWidth="1.3" strokeLinecap="round" />
          </g>
          {/* ★ Right mid */}
          <g className="owl-svg-sparkle-3" transform="translate(108, 56)">
            <line x1="0" y1="-2.5" x2="0" y2="2.5" stroke="#ce93d8" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="-2.5" y1="0" x2="2.5" y2="0" stroke="#ce93d8" strokeWidth="1.2" strokeLinecap="round" />
          </g>
          {/* ★ Left mid */}
          <g className="owl-svg-sparkle-4" transform="translate(12, 52)">
            <line x1="0" y1="-2" x2="0" y2="2" stroke="#81d4fa" strokeWidth="1" strokeLinecap="round" />
            <line x1="-2" y1="0" x2="2" y2="0" stroke="#81d4fa" strokeWidth="1" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}
