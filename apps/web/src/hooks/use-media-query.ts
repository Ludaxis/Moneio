'use client';

import { useEffect, useState } from 'react';

/**
 * Custom hook for responsive design with SSR support
 * Uses CSS breakpoints defined in tailwind.config.ts
 */

type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const breakpoints: Record<Breakpoint, number> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

/**
 * Returns true if the viewport matches the given media query
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/**
 * Returns true if viewport is below the given breakpoint
 */
export function useBreakpointDown(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(max-width: ${breakpoints[breakpoint] - 1}px)`);
}

/**
 * Returns true if viewport is at or above the given breakpoint
 */
export function useBreakpointUp(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${breakpoints[breakpoint]}px)`);
}

/**
 * Responsive design helpers with semantic naming
 */
export function useResponsive() {
  // Mobile: < 768px (below md breakpoint)
  const isMobile = useBreakpointDown('md');

  // Tablet: >= 768px and < 1024px
  const isTablet = useMediaQuery(
    `(min-width: ${breakpoints.md}px) and (max-width: ${breakpoints.lg - 1}px)`
  );

  // Desktop: >= 1024px
  const isDesktop = useBreakpointUp('lg');

  // Touch device detection (heuristic)
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  // Prefers reduced motion
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Prefers color scheme
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  return {
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    prefersReducedMotion,
    prefersDark,
  };
}

export { breakpoints };
