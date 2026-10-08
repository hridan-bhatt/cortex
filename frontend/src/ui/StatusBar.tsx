import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useCortexStore } from '../state/store';

export const StatusBar: React.FC = () => {
  const status = useCortexStore((state) => state.status);
  const loadingStage = useCortexStore((state) => state.loadingStage);
  const error = useCortexStore((state) => state.error);
  const dismissError = useCortexStore((state) => state.dismissError);

  return (
    <>
      {/* Loading status readout in bottom-left */}
      {status === 'loading' && loadingStage && (
        <div className="fixed bottom-3 left-4 pointer-events-none select-none z-20 font-mono text-[11px] text-muted">
          {loadingStage}
        </div>
      )}

      {/* Error banner: top-center below topbar */}
      {error && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 bg-surface border border-hairline px-3 py-2 flex items-center space-x-2.5 text-ink text-[13px] font-sans z-50 shadow-lg select-none rounded-[2px]">
          <AlertTriangle className="w-3.5 h-3.5 text-muted shrink-0" />
          <span className="font-sans text-[13px] text-ink">{error}</span>
          <button
            type="button"
            onClick={dismissError}
            className="text-muted hover:text-ink transition-colors ml-2 cursor-pointer p-0.5 rounded-[2px]"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};
