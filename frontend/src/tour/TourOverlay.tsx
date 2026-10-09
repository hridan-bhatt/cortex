import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCortexStore } from '../state/store';
import { gsap, CORTEX_EASE, DURATION } from '../ui/motion';

interface TourOverlayProps {
  onAbort?: () => void;
}

export const TourOverlay: React.FC<TourOverlayProps> = ({ onAbort }) => {
  const isTourActive = useCortexStore((state) => state.isTourActive);
  const tourKicker = useCortexStore((state) => state.tourKicker);
  const tourCaption = useCortexStore((state) => state.tourCaption);
  const queryMode = useCortexStore((state) => state.queryMode);

  const captionContainerRef = useRef<HTMLDivElement>(null);
  const prevCaptionRef = useRef<string | null>(null);

  // Crossfade between beats using Cortex ease, 240ms
  useEffect(() => {
    if (!captionContainerRef.current) return;
    if (tourCaption && tourCaption !== prevCaptionRef.current) {
      prevCaptionRef.current = tourCaption;
      gsap.fromTo(
        captionContainerRef.current,
        { opacity: 0, y: 4 },
        {
          opacity: 1,
          y: 0,
          duration: DURATION.STANDARD,
          ease: CORTEX_EASE,
          overwrite: 'auto',
        }
      );
    }
  }, [tourCaption]);

  if (!isTourActive) return null;

  // Position above bottom console when in simulate mode (console is open) vs regular explore mode
  const bottomPositionClass = queryMode === 'simulate' ? 'bottom-72' : 'bottom-12';

  const handleAbort = () => {
    if (onAbort) {
      onAbort();
    } else if (typeof window !== 'undefined' && (window as any).__cortex_tour) {
      (window as any).__cortex_tour.abort();
    }
  };

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 ${bottomPositionClass} z-50 flex flex-col items-center gap-2 pointer-events-none transition-all duration-standard ease-cortex select-none`}
    >
      {/* Floating Chip: mono 10px, "tour — esc to stop" + X button */}
      <div className="flex items-center gap-2 px-2.5 py-1 bg-surface border border-hairline rounded-[2px] shadow-lg pointer-events-auto">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <span className="font-mono text-[10px] text-muted tracking-wider lowercase">
          tour — esc to stop
        </span>
        <button
          type="button"
          onClick={handleAbort}
          className="text-muted hover:text-ink transition-colors ml-0.5 p-0.5 cursor-pointer rounded-[2px]"
          aria-label="Stop tour"
          title="Stop tour (Esc)"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Captions Card: Space Grotesk 600, 15px, text-ink, mono kicker above */}
      {tourCaption && (
        <div
          ref={captionContainerRef}
          className="flex flex-col items-center text-center px-4 py-2.5 bg-surface border border-hairline rounded-[2px] shadow-2xl pointer-events-auto min-w-[300px] max-w-[560px]"
        >
          {tourKicker && (
            <span className="font-mono text-[10px] uppercase text-muted tracking-[0.18em] leading-none mb-1.5 select-none">
              {tourKicker}
            </span>
          )}
          <span className="font-sans font-semibold text-[15px] text-ink leading-snug tracking-tight">
            {tourCaption}
          </span>
        </div>
      )}
    </div>
  );
};
