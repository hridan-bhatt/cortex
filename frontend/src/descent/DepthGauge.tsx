import React from 'react';
import { useCortexStore } from '../state/store';
import { getBeats } from './copy';

export const DepthGauge: React.FC = () => {
  const dampedDescentProgress = useCortexStore((state) => state.dampedDescentProgress);
  const currentBeatIndex = useCortexStore((state) => state.currentBeatIndex);
  const adapter = useCortexStore((state) => state.adapter);
  const strataMeta = useCortexStore((state) => state.strataMeta);
  const customProjectName = useCortexStore((state) => state.customProjectName);

  const beats = getBeats(adapter, strataMeta, customProjectName || undefined);
  const activeBeat = beats[currentBeatIndex] || beats[0];
  const markerTopPercent = Math.min(100, Math.max(0, dampedDescentProgress * 100));

  return (
    <div
      className="fixed right-6 top-1/2 -translate-y-1/2 z-30 select-none flex items-center gap-4 pointer-events-none"
      aria-hidden="true"
    >
      {/* Active layer label rotated 90 degrees */}
      <div className="w-5 flex justify-center items-center">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted whitespace-nowrap uppercase origin-center rotate-90 transition-opacity duration-large ease-cortex">
          {activeBeat.gaugeLabel}
        </span>
      </div>

      {/* Vertical hairline gauge track with ticks */}
      <div className="relative h-64 w-3 flex justify-center">
        {/* Track line (1px hairline) */}
        <div className="absolute top-0 bottom-0 w-[1px] bg-hairline" />

        {/* Ticks */}
        {beats.map((beat, idx) => {
          const topPercent = (idx / (beats.length - 1)) * 100;
          const isCurrent = idx === currentBeatIndex;
          return (
            <div
              key={beat.id}
              className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-standard ease-cortex ${
                isCurrent ? 'w-3 h-[1px] bg-ink' : 'w-1.5 h-[1px] bg-hairline'
              }`}
              style={{ top: `${topPercent}%` }}
            />
          );
        })}

        {/* Current position marker */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-ink bg-bg"
          style={{ top: `${markerTopPercent}%` }}
        />
      </div>
    </div>
  );
};
