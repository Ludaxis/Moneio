'use client';

import gsap from 'gsap';
import { useEffect, useRef, useCallback } from 'react';

// Hook to check for reduced motion preference
export function usePrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Hook to create GSAP context for proper cleanup
export function useGsapContext() {
  const ref = useRef<HTMLElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!ref.current || prefersReducedMotion) return;

    const ctx = gsap.context(() => {}, ref);

    return () => ctx.revert();
  }, [prefersReducedMotion]);

  return ref;
}

// Hook for fade-in animation on mount
export function useFadeIn(options?: { duration?: number; delay?: number; y?: number }) {
  const ref = useRef<HTMLElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!ref.current || prefersReducedMotion) return;

    const element = ref.current;
    const { duration = 0.5, delay = 0, y = 20 } = options || {};

    gsap.fromTo(
      element,
      { opacity: 0, y },
      { opacity: 1, y: 0, duration, delay, ease: 'power2.out' }
    );

    return () => {
      gsap.killTweensOf(element);
    };
  }, [prefersReducedMotion, options]);

  return ref;
}

// Hook for staggered list animation
export function useStaggerAnimation(itemCount: number, options?: { stagger?: number; duration?: number }) {
  const ref = useRef<HTMLElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!ref.current || prefersReducedMotion || itemCount === 0) return;

    const { stagger = 0.1, duration = 0.4 } = options || {};
    const items = ref.current.children;

    gsap.fromTo(
      items,
      { opacity: 0, y: 15 },
      { opacity: 1, y: 0, duration, stagger, ease: 'power2.out' }
    );

    return () => {
      gsap.killTweensOf(items);
    };
  }, [itemCount, prefersReducedMotion, options]);

  return ref;
}

// Hook for count-up animation (for numbers)
export function useCountUp(
  value: number,
  options?: { duration?: number; decimals?: number }
): { ref: React.RefObject<HTMLElement>; displayValue: string } {
  const ref = useRef<HTMLElement>(null);
  const valueRef = useRef({ current: 0 });
  const prefersReducedMotion = usePrefersReducedMotion();
  const { duration = 1, decimals = 0 } = options || {};

  useEffect(() => {
    if (!ref.current || prefersReducedMotion) {
      valueRef.current.current = value;
      if (ref.current) {
        ref.current.textContent = value.toFixed(decimals);
      }
      return;
    }

    const element = ref.current;

    gsap.to(valueRef.current, {
      current: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        if (element) {
          element.textContent = valueRef.current.current.toFixed(decimals);
        }
      },
    });

    return () => {
      gsap.killTweensOf(valueRef.current);
    };
  }, [value, duration, decimals, prefersReducedMotion]);

  return {
    ref,
    displayValue: value.toFixed(decimals),
  };
}

// Hook for progress bar animation
export function useProgressAnimation(progress: number, options?: { duration?: number }) {
  const ref = useRef<HTMLElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!ref.current) return;

    const element = ref.current;
    const { duration = 0.5 } = options || {};

    if (prefersReducedMotion) {
      element.style.width = `${progress}%`;
      return;
    }

    gsap.to(element, {
      width: `${progress}%`,
      duration,
      ease: 'power2.out',
    });

    return () => {
      gsap.killTweensOf(element);
    };
  }, [progress, prefersReducedMotion, options]);

  return ref;
}

// Animate function for imperative usage
export function useAnimate() {
  const prefersReducedMotion = usePrefersReducedMotion();

  const animate = useCallback(
    (
      target: gsap.TweenTarget,
      vars: gsap.TweenVars,
      options?: { skipIfReducedMotion?: boolean }
    ) => {
      if (prefersReducedMotion && options?.skipIfReducedMotion !== false) {
        // Set end state immediately
        gsap.set(target, { ...vars, duration: 0 });
        return null;
      }

      return gsap.to(target, vars);
    },
    [prefersReducedMotion]
  );

  return animate;
}
