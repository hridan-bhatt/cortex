import React, { useEffect, useRef } from 'react';
import { useCortexStore, QueryMode, registerThemeToggleDelegate } from '../state/store';
import { AppTheme } from '../domain/strata';
import { gsap, CORTEX_CURVE, CORTEX_EASE } from './motion';

// Preload both full-viewport backdrop images immediately in memory
if (typeof window !== 'undefined') {
  const pNight = new Image();
  pNight.src = '/backdrop-night.png';
  pNight.decode?.().catch(() => {});
  const pPaper = new Image();
  pPaper.src = '/backdrop-paper.png';
  pPaper.decode?.().catch(() => {});
}

// Global references for scroll/camera-driven updates (zero rAF loop in Backdrop)
let backdropContainerEl: HTMLDivElement | null = null;
let currentDx = 0;
let currentDy = 0;
let currentDescentProgress = 0;

let veilDipEl: HTMLDivElement | null = null;
let nightImgEl: HTMLImageElement | null = null;
let paperImgEl: HTMLImageElement | null = null;
let restingVeilEl: HTMLDivElement | null = null;
let vignetteEl: HTMLDivElement | null = null;

export function runWorkSpreadToggle(
  _currentTheme: AppTheme,
  nextTheme: AppTheme,
  onApplyDomTokens: () => void,
  onSwapBackdrop: () => void,
  onApplyReactTheme: () => void,
  onMidpoint3D: () => void,
  onComplete: () => void
): gsap.core.Timeline | null {
  if (!veilDipEl) {
    onApplyDomTokens();
    onSwapBackdrop();
    onApplyReactTheme();
    onMidpoint3D();
    onComplete();
    return null;
  }

  const targetBg = nextTheme === 'paper' ? '#E6E0D3' : '#0B0D12';
  veilDipEl.style.backgroundColor = targetBg;

  const tl = gsap.timeline({
    onComplete: () => {
      onComplete();
    },
  });

  // t=0 -> 190ms: veil rises to 1.0 (covers the swap behind solid cover)
  tl.to(
    veilDipEl,
    {
      opacity: 1.0,
      duration: 0.19,
      ease: CORTEX_EASE,
    },
    0
  );

  // t≈50ms (0.05s): apply DOM tokens (data-theme, CSS variables, setActiveTheme)
  tl.add(() => {
    onApplyDomTokens();
  }, 0.05);

  // t≈100ms (0.10s): swap backdrop image (instant swap mid-veil, no crossfade)
  tl.add(() => {
    if (nightImgEl && paperImgEl) {
      nightImgEl.style.display = nextTheme === 'night' ? 'block' : 'none';
      paperImgEl.style.display = nextTheme === 'paper' ? 'block' : 'none';
    }
    if (restingVeilEl) {
      restingVeilEl.style.backgroundColor = nextTheme === 'paper' ? '#E6E0D3' : '#0B0D12';
      restingVeilEl.style.opacity = nextTheme === 'paper' ? '0.25' : '0.35';
    }
    if (vignetteEl) {
      vignetteEl.style.background =
        nextTheme === 'paper'
          ? 'radial-gradient(ellipse at 50% 55%, transparent 60%, rgba(230, 224, 211, 0.45) 100%)'
          : 'radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(11, 13, 18, 0.65) 100%)';
    }
    onSwapBackdrop();
  }, 0.10);

  // t≈140ms (0.14s): apply React theme state under >90% opaque veil
  tl.add(() => {
    onApplyReactTheme();
  }, 0.14);

  // t≈190ms (0.19s): veil at 100% solid opacity -> apply 3D values & render ONE frame on demand
  tl.add(() => {
    onMidpoint3D();
  }, 0.19);

  // t=190ms -> 380ms: veil reveals from 1.0 to 0.0
  tl.to(
    veilDipEl,
    {
      opacity: 0.0,
      duration: 0.19,
      ease: CORTEX_EASE,
    },
    0.19
  );

  return tl;
}

export const runFreezeFrameToggle = runWorkSpreadToggle;

function applyBackdropTransform(): void {
  if (!backdropContainerEl) return;
  // Parallax whisper + Descent drift (1.00 -> 1.04 scrubbed by scroll progress)
  const driftScale = 1.035 * (1.0 + 0.04 * currentDescentProgress);
  backdropContainerEl.style.transform = `translate3d(${currentDx.toFixed(3)}vw, ${currentDy.toFixed(3)}vh, 0) scale(${driftScale.toFixed(4)})`;
}

/**
 * Parallax Whisper: updates backdrop offset driven by camera orbit.
 * Clamps strictly to [-1.5%, +1.5%] viewport.
 * Does NOT run an independent rAF loop; updates directly when camera moves.
 */
export function updateBackdropParallax(dxPct: number, dyPct: number): void {
  const targetX = Math.max(-1.5, Math.min(1.5, dxPct));
  const targetY = Math.max(-1.5, Math.min(1.5, dyPct));
  if (Math.abs(targetX - currentDx) < 0.005 && Math.abs(targetY - currentDy) < 0.005) {
    return;
  }
  currentDx = targetX;
  currentDy = targetY;
  applyBackdropTransform();
}

/**
 * Descent Drift: scales the backdrop 1.00 -> 1.04 over the full scroll duration.
 * Continuous transform scrubbed by scroll progress; reverses when scrolling back.
 */
export function setBackdropDescentProgress(progress: number): void {
  const clamped = Math.max(0, Math.min(1, progress));
  if (Math.abs(clamped - currentDescentProgress) < 0.001) {
    return;
  }
  currentDescentProgress = clamped;
  applyBackdropTransform();
}

// Verb-tinted atmospheric filter mappings
const ATMOSPHERE_FILTERS: Record<QueryMode, string> = {
  explore: 'none',
  impact: 'sepia(0.06) brightness(1.03)',
  trace: 'hue-rotate(-4deg) contrast(1.03)',
  cycles: 'hue-rotate(-12deg) saturate(0.95)',
  whatif: 'brightness(1.05) contrast(1.02)',
  simulate: 'brightness(0.95) saturate(0.85)',
};

export const Backdrop: React.FC = () => {
  const theme = useCortexStore((state) => state.theme);
  const queryMode = useCortexStore((state) => state.queryMode);
  const mode = useCortexStore((state) => state.mode);
  const containerRef = useRef<HTMLDivElement>(null);
  const nightImgRef = useRef<HTMLImageElement>(null);
  const paperImgRef = useRef<HTMLImageElement>(null);
  const restingVeilRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const veilDipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    backdropContainerEl = containerRef.current;
    nightImgEl = nightImgRef.current;
    paperImgEl = paperImgRef.current;
    restingVeilEl = restingVeilRef.current;
    vignetteEl = vignetteRef.current;
    veilDipEl = veilDipRef.current;
    applyBackdropTransform();

    registerThemeToggleDelegate((current, next, onApplyDomTokens, onSwapBackdrop, onApplyReactTheme, onMidpoint3D, onComplete) => {
      runWorkSpreadToggle(current, next, onApplyDomTokens, onSwapBackdrop, onApplyReactTheme, onMidpoint3D, onComplete);
    });

    return () => {
      backdropContainerEl = null;
      nightImgEl = null;
      paperImgEl = null;
      restingVeilEl = null;
      vignetteEl = null;
      veilDipEl = null;
      registerThemeToggleDelegate(null);
    };
  }, []);

  // Direct sync if theme changes outside of toggle transition (e.g. initial boot)
  useEffect(() => {
    if (!useCortexStore.getState().isThemeTransitioning) {
      if (nightImgRef.current && paperImgRef.current) {
        nightImgRef.current.style.display = theme === 'night' ? 'block' : 'none';
        paperImgRef.current.style.display = theme === 'paper' ? 'block' : 'none';
      }
      if (restingVeilRef.current) {
        restingVeilRef.current.style.backgroundColor = theme === 'paper' ? '#E6E0D3' : '#0B0D12';
        restingVeilRef.current.style.opacity = theme === 'paper' ? '0.25' : '0.35';
      }
      if (vignetteRef.current) {
        vignetteRef.current.style.background =
          theme === 'paper'
            ? 'radial-gradient(ellipse at 50% 55%, transparent 60%, rgba(230, 224, 211, 0.45) 100%)'
            : 'radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(11, 13, 18, 0.65) 100%)';
      }
    }
  }, [theme]);

  const activeAtmosphereFilter = mode === 'instrument' ? (ATMOSPHERE_FILTERS[queryMode] || 'none') : 'none';

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none bg-bg"
    >
      {/* Parallax layer container with hardware-compositing */}
      <div
        ref={containerRef}
        className="absolute -inset-[3%] w-[106%] h-[106%] will-change-transform"
        style={{
          filter: activeAtmosphereFilter,
          transition: `filter 600ms ${CORTEX_CURVE}`,
        }}
      >
        {/* Pre-positioned Dual Backdrop Images (instant swap at t≈100ms mid-veil rise, no crossfade) */}
        <img
          ref={nightImgRef}
          src="/backdrop-night.png"
          alt=""
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{
            display: theme === 'night' ? 'block' : 'none',
          }}
        />
        <img
          ref={paperImgRef}
          src="/backdrop-paper.png"
          alt=""
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
          style={{
            display: theme === 'paper' ? 'block' : 'none',
          }}
        />

        {/* Resting Atmospheric Veil (static tint for current displayed theme) */}
        <div
          ref={restingVeilRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: theme === 'paper' ? '#E6E0D3' : '#0B0D12',
            opacity: theme === 'paper' ? 0.25 : 0.35,
          }}
        />

        {/* Single Atmospheric Horizon Vignette Effect (swapped behind veil at t≈100ms) */}
        <div
          ref={vignetteRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              theme === 'paper'
                ? 'radial-gradient(ellipse at 50% 55%, transparent 60%, rgba(230, 224, 211, 0.45) 100%)'
                : 'radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(11, 13, 18, 0.65) 100%)',
          }}
        />

      </div>
      {/* Solid Veil Dip Overlay: covers swap via pure hardware-composited opacity OUTSIDE filtered container */}
      <div
        ref={veilDipRef}
        className="fixed inset-0 pointer-events-none z-10 will-change-[opacity]"
        style={{
          opacity: 0,
          backgroundColor: theme === 'paper' ? '#E6E0D3' : '#0B0D12',
        }}
      />
    </div>
  );
};
