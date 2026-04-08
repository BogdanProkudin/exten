import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { ReviewChallenge } from "./ReviewChallenge";
import { FlipCard } from "./FlipCard";
import { OwlAvatar } from "../../src/components/OwlAvatar";
import { buildChallenge, resultToFSRSRating, type Challenge, type ChallengeType } from "../../src/lib/review-challenge";

type WordDoc = Doc<"words">;

// --- Sound effects (Web Audio API) ---

let _audioCtx: AudioContext | null = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

function playCorrectSound() {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(523, ctx.currentTime);
    o.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    o.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.4);
  } catch {}
}

function playWrongSound() {
  try {
    const ctx = getAudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = "triangle";
    o.frequency.setValueAtTime(330, ctx.currentTime);
    o.frequency.setValueAtTime(277, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.3);
  } catch {}
}

// --- Canvas confetti burst ---

function fireConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const colors = ["#6366f1", "#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#818cf8", "#fb923c"];
  const pieces: { x: number; y: number; vx: number; vy: number; r: number; color: string; rot: number; rv: number; shape: number; life: number }[] = [];

  for (let i = 0; i < 60; i++) {
    const angle = (Math.random() * Math.PI * 2);
    const speed = 3 + Math.random() * 6;
    pieces.push({
      x: w / 2,
      y: h / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      r: 3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      rv: (Math.random() - 0.5) * 0.3,
      shape: Math.floor(Math.random() * 3), // 0=circle, 1=rect, 2=star
      life: 1,
    });
  }

  let frame = 0;
  function animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    let alive = false;

    for (const p of pieces) {
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.rot += p.rv;
      p.life -= 0.015;
      p.vx *= 0.99;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;

      if (p.shape === 0) {
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 1) {
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      } else {
        // Small star
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a = (j * 4 * Math.PI) / 5 - Math.PI / 2;
          const method = j === 0 ? "moveTo" : "lineTo";
          ctx[method](Math.cos(a) * p.r, Math.sin(a) * p.r);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (alive) {
      frame = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, w, h);
    }
  }
  animate();
  return () => cancelAnimationFrame(frame);
}

// --- Sub-components ---

function SessionHeader({ total, current, results, retryIndices, streak = 0, correctStreak = 0 }: {
  total: number; current: number; results: ("correct" | "wrong" | null)[]; retryIndices: Set<number>; streak?: number; correctStreak?: number;
}) {
  const done = results.filter((r) => r !== null).length;
  const progress = total > 0 ? (done / total) * 100 : 0;
  const prevResultsRef = useRef<("correct" | "wrong" | null)[]>([]);

  // Track which dots just changed for animation
  const [animatingDots, setAnimatingDots] = useState<Map<number, "correct" | "wrong">>(new Map());

  useEffect(() => {
    const prev = prevResultsRef.current;
    const newAnimations = new Map<number, "correct" | "wrong">();
    for (let i = 0; i < results.length; i++) {
      if (results[i] !== null && (i >= prev.length || prev[i] === null)) {
        newAnimations.set(i, results[i]!);
      }
    }
    if (newAnimations.size > 0) {
      setAnimatingDots(newAnimations);
      const timer = setTimeout(() => setAnimatingDots(new Map()), 500);
      return () => clearTimeout(timer);
    }
    prevResultsRef.current = [...results];
  }, [results]);

  // Gradient shifts from indigo → purple → green as progress increases
  const progressGradient = progress === 100
    ? "linear-gradient(90deg, #22c55e, #4ade80)"
    : progress > 60
      ? "linear-gradient(90deg, #818cf8, #a78bfa, #c084fc)"
      : "linear-gradient(90deg, #6366f1, #818cf8)";

  return (
    <div className="mb-8">
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs tabular-nums text-gray-400 font-semibold tracking-wide bg-gray-50 px-2.5 py-1 rounded-lg">
          {current + 1} / {total}
        </span>

        {/* Correct streak fire */}
        {correctStreak >= 2 && (
          <div className="review-streak-flame" style={{ animation: "pillBounce 350ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C12 2 7 8.5 7 13C7 16.5 9.24 19 12 19C14.76 19 17 16.5 17 13C17 8.5 12 2 12 2Z" fill="#fb923c" />
              <path d="M12 10C12 10 10 13 10 15C10 16.5 10.9 17.5 12 17.5C13.1 17.5 14 16.5 14 15C14 13 12 10 12 10Z" fill="#fbbf24" />
            </svg>
            <span className="text-xs tabular-nums font-bold text-orange-500">{correctStreak}</span>
          </div>
        )}

        <span className="w-12 flex justify-end">
          {streak > 0 && (
            <span className="text-xs tabular-nums font-medium text-orange-400/80 bg-orange-50 px-2 py-1 rounded-lg">
              {streak}d
            </span>
          )}
        </span>
      </div>

      {/* Animated progress bar */}
      <div className="review-progress-bar">
        <div
          className="review-progress-fill"
          style={{
            width: `${progress}%`,
            background: progressGradient,
          }}
        />
      </div>

      {/* Dot indicators for <= 12 words */}
      {total <= 12 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {Array.from({ length: total }).map((_, i) => {
            const result = results[i];
            const isCurrent = i === current;
            const isRetry = retryIndices.has(i);
            const justAnimated = animatingDots.get(i);

            let dotClass = "w-2.5 h-2.5 rounded-full transition-all duration-300";
            let extraClass = "";

            if (result === "correct") {
              dotClass += " bg-gradient-to-br from-green-400 to-emerald-500 shadow-sm shadow-green-200";
              if (justAnimated === "correct") extraClass = "review-dot-correct";
            } else if (result === "wrong") {
              dotClass += " bg-gradient-to-br from-red-400 to-rose-500 shadow-sm shadow-red-200";
              if (justAnimated === "wrong") extraClass = "review-dot-wrong";
            } else if (isCurrent) {
              dotClass += " bg-indigo-500 ring-[3px] ring-indigo-200/60 scale-125";
            } else if (isRetry) {
              dotClass += " bg-amber-400 w-2 h-2";
            } else {
              dotClass += " bg-gray-200";
            }

            return (
              <div key={i} className={`${dotClass} ${extraClass}`} />
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Canvas 2D particle ring ---

function ParticleRing({ colors, glowRgb }: { colors: string[]; glowRgb: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = 180;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;

    interface P { x: number; y: number; vx: number; vy: number; r: number; color: string; a: number; phase: number }
    const particles: P[] = [];
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const radius = 55 + Math.random() * 25;
      particles.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        vx: Math.cos(angle) * (0.06 + Math.random() * 0.1),
        vy: Math.sin(angle) * (0.06 + Math.random() * 0.1),
        r: 1.5 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        a: 0.25 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      });
    }

    let frame = 0;
    let time = 0;
    let isVisible = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function animate() {
      if (!ctx) return;
      if (!isVisible) { frame = requestAnimationFrame(animate); return; }
      time += 0.02;
      ctx.clearRect(0, 0, size, size);

      const glow = ctx.createRadialGradient(cx, cy, 20, cx, cy, 75);
      glow.addColorStop(0, `rgba(${glowRgb}, 0.10)`);
      glow.addColorStop(0.6, `rgba(${glowRgb}, 0.03)`);
      glow.addColorStop(1, `rgba(${glowRgb}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      for (const p of particles) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) + 0.003;
        const target = 55 + Math.sin(time + p.phase) * 12;
        const pull = (target - dist) * 0.005;
        p.x = cx + Math.cos(angle) * dist + (dx / dist) * pull + p.vx * 0.2;
        p.y = cy + Math.sin(angle) * dist + (dy / dist) * pull + p.vy * 0.2;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0.05, Math.min(0.85, p.a + Math.sin(time * 2 + p.phase) * 0.25));
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const ring = 1 + Math.sin(time * 1.2) * 0.03;
      ctx.beginPath();
      ctx.arc(cx, cy, 50 * ring, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${glowRgb}, 0.10)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      frame = requestAnimationFrame(animate);
    }

    if (!reducedMotion) animate();

    function handleVis() { isVisible = document.visibilityState === "visible"; }
    document.addEventListener("visibilitychange", handleVis);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [colors, glowRgb]);

  return <canvas ref={canvasRef} className="absolute inset-0 m-auto" style={{ width: 180, height: 180 }} />;
}

// --- Session Complete ---

function SessionComplete({ correct, wrong, onContinue }: {
  correct: number; wrong: number;
  onContinue: () => void;
}) {
  const total = correct + wrong;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const confettiRef = useRef<HTMLCanvasElement>(null);

  // Fire confetti on mount
  useEffect(() => {
    if (confettiRef.current && accuracy >= 50) {
      const cancel = fireConfetti(confettiRef.current);
      return cancel;
    }
  }, [accuracy]);

  const getMessage = () => {
    if (accuracy >= 90) return { title: "Outstanding!", sub: "You're on fire" };
    if (accuracy >= 70) return { title: "Great job!", sub: "Keep up the momentum" };
    if (accuracy >= 50) return { title: "Nice work!", sub: "Getting better every day" };
    return { title: "Keep learning!", sub: "Every review makes you stronger" };
  };
  const msg = getMessage();

  return (
    <div className="max-w-md mx-auto text-center relative review-celebration-enter">
      {/* Confetti canvas */}
      <canvas ref={confettiRef} className="review-confetti-canvas" />

      {/* Owl with particles */}
      <div className="relative w-[180px] h-[180px] mx-auto mb-2">
        <ParticleRing
          colors={["#818cf8", "#a78bfa", "#c084fc", "#fbbf24", "#fb923c"]}
          glowRgb="99, 102, 241"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <OwlAvatar size={96} />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
        {msg.title}
      </h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
        {msg.sub} — {total} word{total !== 1 ? "s" : ""} reviewed
      </p>

      {/* Stats with pop animation */}
      <div className="inline-flex items-center gap-5 mb-8 px-7 py-4 review-card-glow">
        <div className="text-center review-stat-pop" style={{ animationDelay: "100ms" }}>
          <div className="text-2xl font-bold text-green-500">{correct}</div>
          <div className="text-[11px] text-gray-400 font-semibold tracking-wide">correct</div>
        </div>
        <div className="w-px h-10 bg-gradient-to-b from-transparent via-gray-200 to-transparent" />
        <div className="text-center review-stat-pop" style={{ animationDelay: "250ms" }}>
          <div className="text-2xl font-bold text-red-400">{wrong}</div>
          <div className="text-[11px] text-gray-400 font-semibold tracking-wide">mistakes</div>
        </div>
        <div className="w-px h-10 bg-gradient-to-b from-transparent via-gray-200 to-transparent" />
        <div className="text-center review-stat-pop" style={{ animationDelay: "400ms" }}>
          <div className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">{accuracy}%</div>
          <div className="text-[11px] text-gray-400 font-semibold tracking-wide">accuracy</div>
        </div>
      </div>

      <div>
        <button onClick={onContinue} className="review-continue-btn">
          Continue
        </button>
      </div>
    </div>
  );
}

function HintButton({ onHint, usedHint }: { onHint: () => void; usedHint: boolean }) {
  if (usedHint) return <p className="text-xs text-gray-400 text-center mt-3">Hint used</p>;
  return (
    <button onClick={onHint} className="block mx-auto mt-4 text-xs text-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer group">
      <span className="inline-flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform">
          <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" />
        </svg>
        Show hint
      </span>
    </button>
  );
}

export function NoWordsView({ totalWords, learningCount, masteredCount, streak = 0, onShowQuiz, onShowWriting }: {
  totalWords: number;
  learningCount: number;
  masteredCount: number;
  streak?: number;
  onShowQuiz?: () => void;
  onShowWriting?: () => void;
}) {
  // Mastery percentage for the ring around the owl
  const masteryPct = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;
  const ringCircumference = 2 * Math.PI * 82; // radius = 82
  const ringOffset = ringCircumference - (masteryPct / 100) * ringCircumference;

  if (totalWords === 0) {
    return (
      <div className="max-w-sm mx-auto text-center py-8 idle-page-enter relative">
        {/* Background orbs */}
        <div className="idle-bg-orbs">
          <div className="idle-orb idle-orb-1" />
          <div className="idle-orb idle-orb-2" />
          <div className="idle-orb idle-orb-3" />
        </div>

        <div className="relative z-10">
          {/* Owl with decorative ring */}
          <div className="relative w-[180px] h-[180px] mx-auto mb-4">
            <ParticleRing
              colors={["#818cf8", "#a78bfa", "#c084fc", "#fbbf24", "#34d399"]}
              glowRgb="99, 102, 241"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <OwlAvatar size={80} />
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Start your vocabulary journey
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-8 leading-relaxed max-w-xs mx-auto">
            Select any word on a webpage to save it.<br />Words will appear here for spaced-repetition review.
          </p>

          {/* Steps — 3 mini cards */}
          <div className="flex gap-3 mb-8">
            {[
              {
                step: "1",
                label: "Select a word",
                icon: "M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5",
                color: "#6366f1",
                bg: "rgba(99,102,241,0.06)",
              },
              {
                step: "2",
                label: "Save translation",
                icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
                color: "#8b5cf6",
                bg: "rgba(139,92,246,0.06)",
              },
              {
                step: "3",
                label: "Review & learn",
                icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
                color: "#10b981",
                bg: "rgba(16,185,129,0.06)",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className="flex-1 review-stat-pop"
                style={{ animationDelay: `${200 + i * 100}ms` }}
              >
                <div
                  className="rounded-2xl p-3 border transition-all duration-300 hover:scale-[1.03] cursor-default"
                  style={{
                    background: "rgba(255,255,255,0.8)",
                    backdropFilter: "blur(8px)",
                    borderColor: "rgba(229,231,235,0.4)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl mx-auto mb-2 flex items-center justify-center"
                    style={{ background: item.bg }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                  </div>
                  <p className="text-[11px] font-semibold text-gray-600 leading-tight">{item.label}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => window.location.hash = "vocabulary"}
            className="review-continue-btn cursor-pointer"
            style={{ maxWidth: "220px", margin: "0 auto", display: "block" }}
          >
            Get started
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto text-center py-4 relative idle-page-enter">
      {/* Ambient background orbs */}
      <div className="idle-bg-orbs">
        <div className="idle-orb idle-orb-1" />
        <div className="idle-orb idle-orb-2" />
        <div className="idle-orb idle-orb-3" />
        <div className="idle-orb idle-orb-4" />
      </div>

      <div className="relative z-10">
        {/* Owl mascot with orbiting particles + mastery ring */}
        <div className="relative w-[200px] h-[200px] mx-auto mb-3">
          <ParticleRing
            colors={["#fbbf24", "#f59e0b", "#4ade80", "#a78bfa", "#818cf8"]}
            glowRgb="251, 191, 36"
          />
          {/* Mastery progress ring */}
          <svg
            className="absolute inset-0 m-auto -rotate-90"
            width="184" height="184" viewBox="0 0 184 184"
          >
            {/* Track */}
            <circle cx="92" cy="92" r="82" fill="none" stroke="rgba(229,231,235,0.3)" strokeWidth="3" />
            {/* Fill */}
            <circle
              cx="92" cy="92" r="82" fill="none"
              stroke="url(#masteryGrad)" strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              className="idle-mastery-ring"
            />
            <defs>
              <linearGradient id="masteryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <OwlAvatar size={96} />
          </div>
        </div>

        {/* Title + subtitle */}
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1.5">
          All caught up!
        </h2>

        {/* Streak badge or next review */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="text-sm text-gray-400">
            {totalWords} {totalWords !== 1 ? "words" : "word"} saved
          </span>
          {streak > 0 ? (
            <>
              <span className="text-gray-300">·</span>
              <span className="idle-streak-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0" style={{ animation: "flame-flicker 1.5s ease-in-out infinite", filter: "drop-shadow(0 0 3px rgba(251,146,60,0.5))" }}>
                  <path d="M12 2C12 2 7 8.5 7 13C7 16.5 9.24 19 12 19C14.76 19 17 16.5 17 13C17 8.5 12 2 12 2Z" fill="#fb923c" />
                  <path d="M12 10C12 10 10 13 10 15C10 16.5 10.9 17.5 12 17.5C13.1 17.5 14 16.5 14 15C14 13 12 10 12 10Z" fill="#fbbf24" />
                </svg>
                <span className="text-sm font-bold text-orange-500 tabular-nums">{streak}</span>
                <span className="text-xs text-orange-400 font-medium">day streak</span>
              </span>
            </>
          ) : (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-sm text-gray-400">next review coming soon</span>
            </>
          )}
        </div>

        {/* Stats — individual tiles with colored tops */}
        <div className="grid grid-cols-3 gap-3 mb-7">
          {[
            {
              value: totalWords,
              label: "Saved",
              color: "indigo",
              textColor: "text-indigo-500",
              iconBg: "bg-indigo-50",
              iconColor: "#6366f1",
              icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
              delay: "0ms",
            },
            {
              value: learningCount,
              label: "Learning",
              color: "amber",
              textColor: "text-amber-500",
              iconBg: "bg-amber-50",
              iconColor: "#f59e0b",
              icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
              delay: "80ms",
            },
            {
              value: masteredCount,
              label: "Mastered",
              color: "emerald",
              textColor: "text-emerald-500",
              iconBg: "bg-emerald-50",
              iconColor: "#10b981",
              icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
              delay: "160ms",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className={`idle-stat-tile ${stat.color} review-stat-pop`}
              style={{ animationDelay: stat.delay }}
            >
              <div className={`idle-stat-icon ${stat.iconBg}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stat.iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={stat.icon} />
                </svg>
              </div>
              <div className={`text-2xl font-bold tabular-nums ${stat.textColor}`}>{stat.value}</div>
              <div className="text-[11px] text-gray-400 font-semibold tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Action buttons with icons */}
        <div className="flex justify-center gap-3">
          {[
            {
              label: "Quiz",
              onClick: () => onShowQuiz?.(),
              glow: "rgba(99, 102, 241, 0.06)",
              color: "text-indigo-500",
              icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01",
              delay: "0ms",
            },
            {
              label: "Practice",
              onClick: () => onShowWriting?.(),
              glow: "rgba(168, 85, 247, 0.06)",
              color: "text-purple-500",
              icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
              delay: "80ms",
            },
            {
              label: "Words",
              onClick: () => { window.location.hash = "vocabulary"; },
              glow: "rgba(16, 185, 129, 0.06)",
              color: "text-emerald-500",
              icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
              delay: "160ms",
            },
          ].map((btn) => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              className="idle-action-btn review-stat-pop"
              style={{ "--btn-glow": btn.glow, animationDelay: btn.delay } as React.CSSProperties}
            >
              <span className={`idle-action-icon ${btn.color}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={btn.icon} />
                </svg>
              </span>
              <span className="text-xs font-semibold text-gray-500">{btn.label}</span>
            </button>
          ))}
        </div>

        {/* Mastery percentage hint */}
        {masteredCount > 0 && (
          <p className="text-[11px] text-gray-300 mt-5 idle-stagger-4" style={{ animation: "fadeInUp 400ms ease-out 300ms both" }}>
            {masteryPct}% mastered
          </p>
        )}
      </div>
    </div>
  );
}

// --- Main Session Component ---

interface ReviewSessionProps {
  deviceId: string;
  sessionWords: WordDoc[];
  allWordsForDistractors: any[];
  onContinue: () => void;
  updateReview: (args: any) => Promise<any>;
  streak?: number;
}

type SessionPhase = "challenge" | "feedback" | "complete";

interface FeedbackState {
  correct: boolean;
  userAnswer: string;
  correctAnswer: string;
  word: WordDoc;
}

export function ReviewSession({
  deviceId,
  sessionWords: initialWords,
  allWordsForDistractors,
  onContinue,
  updateReview,
  streak = 0,
}: ReviewSessionProps) {
  const [sessionWords, setSessionWords] = useState(initialWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<("correct" | "wrong" | null)[]>(() => initialWords.map(() => null));
  const [phase, setPhase] = useState<SessionPhase>("challenge");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [usedHints, setUsedHints] = useState<Set<number>>(new Set());
  const [eliminatedOptions, setEliminatedOptions] = useState<number[] | undefined>(undefined);
  const [hintChars, setHintChars] = useState<string | undefined>(undefined);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const challengeKeyRef = useRef(0);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);

  // Correct streak tracking
  const [correctStreak, setCorrectStreak] = useState(0);
  // Card flash effect
  const [cardFlash, setCardFlash] = useState<"correct" | "wrong" | null>(null);
  // XP pop
  const [xpPop, setXpPop] = useState<{ key: number; x: number; y: number } | null>(null);
  const xpKeyRef = useRef(0);

  // Retry tracking
  const [retriedIds, setRetriedIds] = useState<Set<string>>(new Set());
  const [retryIndices, setRetryIndices] = useState<Set<number>>(new Set());
  const originalLength = useRef(initialWords.length);

  // Refs to avoid stale closures in callbacks
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const sessionWordsRef = useRef(sessionWords);
  sessionWordsRef.current = sessionWords;

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const wordsKey = useMemo(
    () => initialWords.map(w => w._id).join(","),
    [initialWords]
  );

  useEffect(() => {
    setSessionWords(initialWords);
    setCurrentIndex(0);
    setResults(initialWords.map(() => null));
    setPhase("challenge");
    setFeedback(null);
    setUsedHints(new Set());
    setEliminatedOptions(undefined);
    setHintChars(undefined);
    setRetriedIds(new Set());
    setRetryIndices(new Set());
    setCorrectStreak(0);
    setCardFlash(null);
    originalLength.current = initialWords.length;
    challengeKeyRef.current++;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsKey]);

  const currentWord = sessionWords[currentIndex];

  const isRetryEntry = retryIndices.has(currentIndex);
  const challenge = useMemo(() => {
    if (!currentWord) return null;
    return buildChallenge(currentWord as any, allWordsForDistractors, isRetryEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord, allWordsForDistractors, isRetryEntry]);

  const advanceToNext = useCallback(() => {
    if (feedbackTimer.current) {
      clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }

    const idx = currentIndexRef.current;
    const words = sessionWordsRef.current;

    setEliminatedOptions(undefined);
    setHintChars(undefined);
    setFeedback(null);
    setCardFlash(null);

    if (idx + 1 >= words.length) {
      setPhase("complete");
    } else {
      setCurrentIndex(idx + 1);
      setPhase("challenge");
      challengeKeyRef.current++;
    }
  }, []);

  const handleResult = useCallback((correct: boolean, rating: number, userAnswer: string) => {
    if (phase !== "challenge") return;

    const isRetry = retryIndices.has(currentIndex);

    setResults((prev) => {
      const next = [...prev];
      next[currentIndex] = correct ? "correct" : "wrong";
      return next;
    });

    // Card flash effect
    setCardFlash(correct ? "correct" : "wrong");

    // Correct streak
    if (correct) {
      setCorrectStreak(prev => prev + 1);
      // Fire confetti on 3+ streak or just on correct
      if (confettiCanvasRef.current) {
        fireConfetti(confettiCanvasRef.current);
      }
      // XP pop
      xpKeyRef.current++;
      setXpPop({ key: xpKeyRef.current, x: 50, y: 30 });
    } else {
      setCorrectStreak(0);
    }

    setFeedback({
      correct,
      userAnswer,
      correctAnswer: challenge?.correctAnswer ?? "",
      word: currentWord!,
    });
    setPhase("feedback");

    if (correct) playCorrectSound(); else playWrongSound();

    if (!isRetry) {
      updateReview({
        id: currentWord!._id as Id<"words">,
        deviceId,
        rating,
      }).catch(() => {});
    }

    // Retry logic for wrong answers
    if (!correct && !isRetry && !retriedIds.has(currentWord!._id)) {
      const remaining = sessionWordsRef.current.length - currentIndex - 1;
      if (remaining >= 1) {
        const retryWord = { ...currentWord! };
        let insertAt: number;
        if (remaining >= 3) {
          insertAt = Math.min(currentIndex + 4, sessionWordsRef.current.length);
        } else {
          insertAt = sessionWordsRef.current.length;
        }
        setSessionWords((prev) => [
          ...prev.slice(0, insertAt),
          retryWord,
          ...prev.slice(insertAt),
        ]);
        setResults((prev) => [
          ...prev.slice(0, insertAt),
          null,
          ...prev.slice(insertAt),
        ]);
        setRetryIndices((prev) => new Set(prev).add(insertAt));
        setRetriedIds((prev) => new Set(prev).add(currentWord!._id));
      }
    }

    if (correct) {
      feedbackTimer.current = setTimeout(() => {
        advanceToNext();
      }, 1500);
    }
  }, [phase, currentIndex, currentWord, challenge, updateReview, deviceId, advanceToNext, retryIndices, retriedIds]);

  // Keyboard for wrong feedback
  useEffect(() => {
    if (phase !== "feedback" || !feedback || feedback.correct) return;
    let active = false;
    const enableTimer = setTimeout(() => { active = true; }, 100);
    const handler = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        advanceToNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      clearTimeout(enableTimer);
      window.removeEventListener("keydown", handler);
    };
  }, [phase, feedback, advanceToNext]);

  // Hint
  const handleHint = useCallback(() => {
    if (!challenge || usedHints.has(currentIndex)) return;
    setUsedHints((prev) => new Set(prev).add(currentIndex));
    const isMC = challenge.type === "mc-word-to-translation" || challenge.type === "mc-translation-to-word";
    if (isMC && challenge.options && challenge.correctIndex !== undefined) {
      const wrongIndices = challenge.options.map((_, i) => i).filter((i) => i !== challenge.correctIndex);
      const toEliminate = wrongIndices.sort(() => Math.random() - 0.5).slice(0, 2);
      setEliminatedOptions(toEliminate);
    } else {
      setHintChars(challenge.correctAnswer.slice(0, 2));
    }
  }, [challenge, currentIndex, usedHints]);

  const correctCount = results.filter((r) => r === "correct").length;
  const wrongCount = results.filter((r) => r === "wrong").length;

  const challengeTypeConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    "mc-word-to-translation": { label: "Choose", color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
    "mc-translation-to-word": { label: "Match", color: "text-purple-600", bg: "bg-purple-50 border-purple-100", icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" },
    "type-translation": { label: "Translate", color: "text-teal-600", bg: "bg-teal-50 border-teal-100", icon: "M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" },
    "type-word": { label: "Recall", color: "text-amber-600", bg: "bg-amber-50 border-amber-100", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
  };

  // Card flash class
  const cardFlashClass = cardFlash === "correct"
    ? "review-correct-flash"
    : cardFlash === "wrong"
      ? "review-wrong-shake"
      : "";

  // --- Complete screen ---
  if (phase === "complete") {
    return (
      <div className="max-w-lg mx-auto">
        <SessionHeader total={sessionWords.length} current={sessionWords.length - 1} results={results} retryIndices={retryIndices} streak={streak} correctStreak={0} />
        <SessionComplete
          correct={correctCount}
          wrong={wrongCount}
          onContinue={onContinue}
        />
      </div>
    );
  }

  const typeConfig = challenge ? challengeTypeConfig[challenge.type] : null;

  // --- Challenge + Feedback ---
  return (
    <div className="max-w-lg mx-auto relative">
      {/* Confetti canvas overlay */}
      <canvas ref={confettiCanvasRef} className="review-confetti-canvas" style={{ borderRadius: 24 }} />

      {/* XP pop */}
      {xpPop && (
        <div
          key={xpPop.key}
          className="review-xp-pop text-sm font-bold text-indigo-500"
          style={{ top: `${xpPop.y}%`, left: `${xpPop.x}%`, transform: "translateX(-50%)" }}
        >
          +10 XP
        </div>
      )}

      <SessionHeader total={sessionWords.length} current={currentIndex} results={results} retryIndices={retryIndices} streak={streak} correctStreak={correctStreak} />

      <FlipCard
        flipped={phase === "feedback"}
        disableTilt={phase === "feedback"}
        front={
          <div className={`review-card-glow active-border p-8 ${cardFlashClass}`}>
            {typeConfig && (
              <div className="text-center mb-5">
                {isRetryEntry ? (
                  <span className={`review-type-badge bg-amber-50 border border-amber-100 text-amber-600`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 4v6h6M23 20v-6h-6" />
                      <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                    </svg>
                    Second chance
                  </span>
                ) : (
                  <span className={`review-type-badge ${typeConfig.bg} border ${typeConfig.color}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={typeConfig.icon} />
                    </svg>
                    {typeConfig.label}
                  </span>
                )}
              </div>
            )}
            {challenge && (
              <div key={challengeKeyRef.current}>
                <ReviewChallenge
                  challenge={challenge}
                  onResult={handleResult}
                  eliminatedOptions={eliminatedOptions}
                  hintChars={hintChars}
                />
                <HintButton onHint={handleHint} usedHint={usedHints.has(currentIndex)} />
              </div>
            )}
          </div>
        }
        back={
          <div className={`review-card-glow p-8 ${cardFlashClass}`}>
            {typeConfig && (
              <div className="text-center mb-5">
                <span className={`review-type-badge ${typeConfig.bg} border ${typeConfig.color}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={typeConfig.icon} />
                  </svg>
                  {typeConfig.label}
                </span>
              </div>
            )}
            {feedback && (
              <div style={{ animation: "fadeInUp 250ms ease-out both" }}>
                {feedback.correct ? (
                  <div className="text-center py-6">
                    <div className="relative inline-block mb-4">
                      {/* Animated checkmark circle */}
                      <svg width="64" height="64" viewBox="0 0 64 64" className="mx-auto">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="#22c55e" strokeWidth="3"
                          strokeDasharray="176" strokeDashoffset="176"
                          style={{ animation: "drawCircle 400ms ease-out 100ms forwards" }} />
                        <path d="M20 32 L28 40 L44 24" fill="none" stroke="#22c55e" strokeWidth="3.5"
                          strokeLinecap="round" strokeLinejoin="round"
                          strokeDasharray="40" strokeDashoffset="40"
                          style={{ animation: "drawCheck 300ms ease-out 400ms forwards" }} />
                      </svg>
                    </div>
                    <p className="text-green-600 font-bold text-lg mb-3">Correct!</p>
                    <div className="inline-block px-5 py-3 rounded-2xl bg-green-50/80 border border-green-100">
                      <p className="font-bold text-gray-800 text-base">{feedback.word.word}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{feedback.word.translation}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-4 flex items-center justify-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      Continuing...
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="relative inline-block mb-4">
                      <svg width="64" height="64" viewBox="0 0 64 64" className="mx-auto">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="#ef4444" strokeWidth="3"
                          strokeDasharray="176" strokeDashoffset="176"
                          style={{ animation: "drawCircle 400ms ease-out 100ms forwards" }} />
                        <path d="M22 22 L42 42 M42 22 L22 42" fill="none" stroke="#ef4444" strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeDasharray="56" strokeDashoffset="56"
                          style={{ animation: "drawCheck 300ms ease-out 400ms forwards" }} />
                      </svg>
                    </div>
                    <p className="text-red-500 font-bold text-lg mb-4">Not quite</p>

                    <div className="space-y-2 mb-4">
                      {feedback.userAnswer && (
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-red-50/80 border border-red-100">
                          <span className="text-xs text-red-400 font-medium">You said</span>
                          <span className="text-red-500 line-through font-medium">{feedback.userAnswer}</span>
                        </div>
                      )}
                      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-green-50/80 border border-green-100">
                        <span className="text-xs text-green-500 font-medium">Answer</span>
                        <span className="text-green-700 font-bold">{feedback.correctAnswer}</span>
                      </div>
                    </div>

                    <div className="inline-block px-5 py-3 rounded-2xl bg-gray-50/80 border border-gray-100 mb-4">
                      <p className="font-bold text-gray-800">{feedback.word.word}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{feedback.word.translation}</p>
                    </div>

                    <div>
                      <button
                        onClick={advanceToNext}
                        className="text-sm text-indigo-500 hover:text-indigo-700 font-semibold transition-colors cursor-pointer group"
                      >
                        Got it, continue
                        <span className="inline-block ml-1 group-hover:translate-x-1 transition-transform">&rarr;</span>
                      </button>
                      <p className="text-[11px] text-gray-400 mt-2 flex items-center justify-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">Enter</kbd>
                        or
                        <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] font-mono text-gray-500 border border-gray-200">&rarr;</kbd>
                        to continue
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
