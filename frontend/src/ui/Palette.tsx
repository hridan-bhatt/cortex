import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { gsap, DURATION, CORTEX_EASE } from './motion';
import { useCortexStore } from '../state/store';
import { searchNodes, SearchMatch } from '../domain/search';
import { getStratumColor } from '../domain/strata';

export const Palette: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const isPaletteOpen = useCortexStore((state) => state.isPaletteOpen);
  const setPaletteOpen = useCortexStore((state) => state.setPaletteOpen);
  const searchIndex = useCortexStore((state) => state.searchIndex);
  const triggerFlyTo = useCortexStore((state) => state.triggerFlyTo);
  const setSelectedNodeId = useCortexStore((state) => state.setSelectedNodeId);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Computed results from deterministic search
  const results: SearchMatch[] = useMemo(() => {
    return searchNodes(searchIndex, query, 9);
  }, [searchIndex, query]);

  // Keep selection clamped within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle global shortcuts: ⌘K / Ctrl+K / "/"
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'instrument') return;

      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!isPaletteOpen);
      } else if (e.key === '/' && !isInputFocused && !isPaletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isPaletteOpen, setPaletteOpen]);

  // Auto-focus input and reset query on open
  useEffect(() => {
    if (isPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });

      if (modalRef.current) {
        gsap.fromTo(
          modalRef.current,
          { opacity: 0 },
          { opacity: 1, duration: DURATION.MICRO, ease: CORTEX_EASE, overwrite: 'auto' }
        );
      }
    }
  }, [isPaletteOpen]);

  // Smooth close with 140ms fade
  const closePalette = (onDone?: () => void) => {
    if (modalRef.current) {
      gsap.to(modalRef.current, {
        opacity: 0,
        duration: DURATION.MICRO,
        ease: CORTEX_EASE,
        overwrite: 'auto',
        onComplete: () => {
          setPaletteOpen(false);
          onDone?.();
        },
      });
    } else {
      setPaletteOpen(false);
      onDone?.();
    }
  };

  const handleSelect = (match: SearchMatch, runImpact: boolean = false) => {
    closePalette(() => {
      setSelectedNodeId(match.node.id);
      triggerFlyTo(match.node.id, runImpact);
    });
  };

  // Keyboard navigation inside palette
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const match = results[selectedIndex];
      if (match) {
        const isCmd = e.metaKey || e.ctrlKey;
        handleSelect(match, isCmd);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && results.length > 0) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, results.length]);

  if (!isPaletteOpen || mode !== 'instrument') {
    return null;
  }

  const isQueryEmpty = !query.trim();

  return (
    <div
      id="cortex-command-palette"
      className="fixed inset-0 z-50 flex justify-center items-start pt-[18vh] bg-bg/50 select-none"
      onClick={() => closePalette()}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] bg-surface border border-hairline rounded-[2px] shadow-2xl flex flex-col overflow-hidden text-ink"
      >
        {/* Search Input bar */}
        <div className="flex items-center px-3 py-2.5 border-b border-hairline gap-3">
          <Search className="w-4 h-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="search entities…"
            className="w-full bg-transparent font-mono text-[13px] text-ink placeholder:text-muted focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="font-mono text-[10px] text-muted border border-hairline px-1.5 py-0.5 rounded-[2px]">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="max-h-[40vh] overflow-y-auto">
          {isQueryEmpty && (
            <div className="px-3 pt-2 pb-1 font-mono text-[10px] text-muted uppercase tracking-[0.18em]">
              top hubs
            </div>
          )}

          {results.length > 0 ? (
            <ul ref={listRef} className="py-1">
              {results.map((match, idx) => {
                const isSelected = idx === selectedIndex;
                const stratumHue = getStratumColor(match.stratumIndex);
                const name = match.node.entityName || '';

                // Render entityName with matched substring underlined in accent
                let nameContent: React.ReactNode = name;
                if (match.matchedNameRange) {
                  const [start, end] = match.matchedNameRange;
                  const before = name.slice(0, start);
                  const matched = name.slice(start, end);
                  const after = name.slice(end);
                  nameContent = (
                    <>
                      {before}
                      <span className="underline decoration-stratum0 decoration-1 underline-offset-2 text-ink font-medium">
                        {matched}
                      </span>
                      {after}
                    </>
                  );
                }

                return (
                  <li
                    key={match.node.id}
                    onClick={() => handleSelect(match)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors ${
                      isSelected ? 'bg-surface2' : 'hover:bg-surface2'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                      {/* Stratum color dot (8px) */}
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: stratumHue }}
                      />
                      <span className="font-sans text-[13px] text-ink font-semibold truncate">
                        {nameContent}
                      </span>
                    </div>

                    <div className="font-mono text-[11px] text-muted shrink-0 flex items-center gap-1.5">
                      <span className="uppercase">{match.node.entityType}</span>
                      <span>·</span>
                      <span>deg {match.totalDegree}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-3 font-mono text-[11px] text-muted text-center">
              no entities match — &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
