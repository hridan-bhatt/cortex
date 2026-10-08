import React from 'react';
import { useCortexStore, ComplexityMode } from '../state/store';
import { MagneticItem } from './useMagnetic';

export const ComplexityDial: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const complexityMode = useCortexStore((state) => state.complexityMode);
  const setComplexityMode = useCortexStore((state) => state.setComplexityMode);

  if (mode !== 'instrument') {
    return null;
  }

  const modes: { id: ComplexityMode; label: string; desc: string }[] = [
    {
      id: 'min',
      label: 'min',
      desc: 'minimal — orbs & strata only, quiet focus',
    },
    {
      id: 'std',
      label: 'std',
      desc: 'standard — resting threads & dynamic bloom',
    },
    {
      id: 'max',
      label: 'max',
      desc: 'detail — ambient river & top hub labels',
    },
  ];

  return (
    <div
      className="fixed bottom-8 right-4 z-20 flex items-center bg-surface border border-hairline p-0.5 rounded-[2px] select-none pointer-events-auto shadow-lg"
      title="View Complexity Mode (V to cycle)"
      role="radiogroup"
      aria-label="View complexity modes"
    >
      <span className="font-mono text-[10px] text-faint uppercase px-1.5 tracking-[0.18em]">
        view
      </span>

      <div className="flex items-center gap-0.5">
        {modes.map((m) => {
          const isActive = complexityMode === m.id;
          return (
            <MagneticItem key={m.id} maxDistance={2}>
              <button
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setComplexityMode(m.id)}
                className={`font-mono text-[11px] px-2 py-0.5 rounded-[2px] transition-all cursor-pointer relative ${
                  isActive
                    ? 'bg-surface2 text-ink font-medium shadow-sm border border-hairline/60'
                    : 'text-muted hover:text-ink hover:bg-surface2/50 border border-transparent'
                }`}
                title={m.desc}
              >
                {m.label}
              </button>
            </MagneticItem>
          );
        })}
      </div>
    </div>
  );
};
