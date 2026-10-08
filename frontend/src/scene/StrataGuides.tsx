import React from 'react';
import { Html } from '@react-three/drei';
import { useCortexStore } from '../state/store';
import { getStratumColor } from '../domain/strata';

export const StrataGuides: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const strataMeta = useCortexStore((state) => state.strataMeta);
  const toggleSoloStratum = useCortexStore((state) => state.toggleSoloStratum);
  const complexityMode = useCortexStore((state) => state.complexityMode);
  const hoveredStratumIndex = useCortexStore((state) => state.hoveredStratumIndex);

  return (
    <group>
      {/* Hairline lineSegments geometry completely removed per Fix B */}

      {/* Screen-space HTML labels at left edge of bowed arc (disabled in MINIMAL view mode) */}
      {complexityMode !== 'min' && strataMeta.map((meta) => {
        const color = getStratumColor(meta.stratumIndex);
        const isInstrument = mode === 'instrument';
        const isHoveredBand = hoveredStratumIndex === meta.stratumIndex;

        return (
          <Html
            key={meta.stratumIndex}
            position={[-meta.bandWidth / 2 - 3, meta.y, 0]}
            transform={false}
            zIndexRange={[10, 0]}
            style={{
              transform: 'translate(-100%, -50%)',
              pointerEvents: isInstrument ? 'auto' : 'none',
              opacity: isInstrument ? (isHoveredBand ? 1.0 : 0.85) : 0.12,
              transition: 'opacity 0.2s ease-out',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isInstrument) {
                  toggleSoloStratum(meta.stratumIndex);
                }
              }}
              className={`font-mono text-[10px] tracking-[0.18em] whitespace-nowrap select-none uppercase flex items-center gap-1.5 transition-all rounded-[2px] ${
                isInstrument
                  ? isHoveredBand
                    ? 'text-ink cursor-pointer bg-surface border border-ink/40 px-1 py-0.5 shadow-md scale-105 rounded-[2px]'
                    : 'text-muted hover:text-ink cursor-pointer bg-surface hover:bg-surface2 px-1 py-0.5 border border-hairline rounded-[2px]'
                  : 'text-muted pointer-events-none'
              }`}
            >
              <span className="w-[14px] h-[1px] bg-current opacity-70 shrink-0 inline-block mr-0.5" />
              <span
                className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                style={{ backgroundColor: color }}
              />
              <span>{meta.label} · {meta.nodeCount}</span>
            </button>
          </Html>
        );
      })}
    </group>
  );
};
