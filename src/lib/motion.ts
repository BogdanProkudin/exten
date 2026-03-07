import { useState, useEffect, useCallback, useRef } from "react";

// ── Duration tokens (ms) ──
export const DURATION = {
  instant: 100,
  fast: 150,
  normal: 200,
  slow: 300,
  entrance: 250,
  exit: 200,
} as const;

// ── Easing tokens ──
export const EASING = {
  default: "cubic-bezier(0.25, 0.1, 0.25, 1.0)",
  decelerate: "cubic-bezier(0.0, 0.0, 0.2, 1.0)",
  accelerate: "cubic-bezier(0.4, 0.0, 1.0, 1.0)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1.0)",
  panel: "cubic-bezier(0.32, 0.72, 0.0, 1.0)",
} as const;

// ── Reduced motion check ──
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── useEntranceAnimation ──
// Returns `visible` which starts false, becomes true on next frame.
// Use to trigger CSS entrance transitions.
export function useEntranceAnimation(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return visible;
}

// ── useExitAnimation ──
// Returns { isClosing, triggerClose }.
// Call triggerClose() instead of onClose() directly.
// After the animation duration, it calls the real onClose callback.
export function useExitAnimation(
  onClose: () => void,
  duration: number = DURATION.exit,
): { isClosing: boolean; triggerClose: () => void } {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    const d = prefersReducedMotion() ? 0 : duration;
    timerRef.current = setTimeout(onClose, d);
  }, [isClosing, onClose, duration]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isClosing, triggerClose };
}

// ── Transition shorthand helpers ──
export function transition(
  property: string,
  duration: number = DURATION.normal,
  easing: string = EASING.default,
): string {
  return `${property} ${duration}ms ${easing}`;
}
