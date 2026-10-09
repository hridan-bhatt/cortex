import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

// Register CustomEase plugin with GSAP
gsap.registerPlugin(CustomEase);

/**
 * The Cortex Curve: cubic-bezier(0.32, 0.72, 0, 1)
 * The single canonical curve used across the entire application:
 * DOM transitions, GSAP tweens, and 3D camera/treatment glides.
 */
export const CORTEX_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const CORTEX_BEZIER = '0.32, 0.72, 0, 1';

// Register named CustomEase for GSAP
CustomEase.create('cortex', CORTEX_BEZIER);
export const CORTEX_EASE = 'cortex';

/**
 * Duration Scale in seconds (GSAP tweens & timelines)
 * - MICRO (140ms): hovers, fades, row states, micro-interactions
 * - STANDARD (240ms): panel mounts, crossfades, rail indicator
 * - LARGE (380ms): drawer, theme toggle, camera handoff
 */
export const DURATION = {
  MICRO: 0.14,
  STANDARD: 0.24,
  LARGE: 0.38,
} as const;

/**
 * Duration Scale in milliseconds (CSS transitions & setTimeout delays)
 */
export const DURATION_MS = {
  MICRO: 140,
  STANDARD: 240,
  LARGE: 380,
} as const;

/**
 * Global GSAP defaults:
 * Satisfies Continuity Law L1 (Interruptible Retargeting: overwrite 'auto' and animate from current values)
 */
gsap.defaults({
  ease: CORTEX_EASE,
  duration: DURATION.STANDARD,
  overwrite: 'auto',
});

export { gsap };
