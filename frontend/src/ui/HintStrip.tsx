import React, { useEffect, useState } from 'react';
import { useCortexStore } from '../state/store';

export const HintStrip: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const selectedNodeId = useCortexStore((state) => state.selectedNodeId);

  const [hasDismissed, setHasDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('cortex_hint_dismissed') === 'true';
  });
  const [hasSelected, setHasSelected] = useState<boolean>(false);
  const [hasZoomed, setHasZoomed] = useState<boolean>(false);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  useEffect(() => {
    if (selectedNodeId) {
      setHasSelected(true);
    }
  }, [selectedNodeId]);

  useEffect(() => {
    if (mode !== 'instrument' || hasDismissed) return;

    const onWheel = () => {
      setHasZoomed(true);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
    };
  }, [mode, hasDismissed]);

  useEffect(() => {
    if (mode !== 'instrument' || hasDismissed) return;

    // Auto dismiss after 10s
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      setTimeout(() => {
        setHasDismissed(true);
        sessionStorage.setItem('cortex_hint_dismissed', 'true');
      }, 400);
    }, 10000);

    return () => clearTimeout(timer);
  }, [mode, hasDismissed]);

  useEffect(() => {
    if (hasSelected && hasZoomed && !hasDismissed) {
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setHasDismissed(true);
        sessionStorage.setItem('cortex_hint_dismissed', 'true');
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [hasSelected, hasZoomed, hasDismissed]);

  const queryMode = useCortexStore((state) => state.queryMode);

  if (mode !== 'instrument' || hasDismissed || queryMode !== 'explore') {
    return null;
  }

  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-opacity duration-400 ease-out select-none ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="bg-surface border border-hairline px-3 py-1.5 shadow-lg rounded-[2px]">
        <span className="font-mono text-[11px] text-muted tracking-tight">
          click a node to inspect · drag to orbit · scroll to zoom at cursor · click a layer to focus · v — calms the view
        </span>
      </div>
    </div>
  );
};
