import React, { useEffect, useState } from 'react';
import { Search, Volume2, VolumeX, HelpCircle, Sun, Moon, ScrollText } from 'lucide-react';
import { useCortexStore } from '../state/store';
import { MagneticItem } from './useMagnetic';
import { fetchAdapters } from '../api/client';
import { AdapterDescriptor } from '../api/types';

export const TopBar: React.FC = () => {
  const adapter = useCortexStore((state) => state.adapter);
  const nodes = useCortexStore((state) => state.nodes);
  const edges = useCortexStore((state) => state.edges);
  const strataMeta = useCortexStore((state) => state.strataMeta);
  const loadGraph = useCortexStore((state) => state.loadGraph);
  const status = useCortexStore((state) => state.status);
  const setPaletteOpen = useCortexStore((state) => state.setPaletteOpen);
  const isAudioEnabled = useCortexStore((state) => state.isAudioEnabled);
  const toggleAudio = useCortexStore((state) => state.toggleAudio);
  const isHelpOpen = useCortexStore((state) => state.isHelpOpen);
  const toggleHelp = useCortexStore((state) => state.toggleHelp);
  const theme = useCortexStore((state) => state.theme);
  const toggleTheme = useCortexStore((state) => state.toggleTheme);
  const isRulesDrawerOpen = useCortexStore((state) => state.isRulesDrawerOpen);
  const toggleRulesDrawer = useCortexStore((state) => state.toggleRulesDrawer);

  // Global 'R' key listener for rules drawer toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleRulesDrawer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleRulesDrawer]);

  const [availableAdapters, setAvailableAdapters] = useState<AdapterDescriptor[]>([
    { id: 'vaultx', name: 'VaultX Codebase Adapter' },
    { id: 'hospital', name: 'Hospital Healthcare Domain Adapter' },
  ]);

  useEffect(() => {
    fetchAdapters()
      .then((list) => {
        if (list && list.length > 0) {
          setAvailableAdapters(list);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch adapters dynamically:', err);
      });
  }, []);

  const setMode = useCortexStore((state) => state.setMode);
  const setDescentProgress = useCortexStore((state) => state.setDescentProgress);

  const handleAdapterChange = (nextAdapter: string) => {
    if (nextAdapter !== adapter || status === 'error') {
      loadGraph(nextAdapter, true);
    }
  };

  const handleReplayIntro = () => {
    setMode('descent');
    setDescentProgress(0);
    window.scrollTo(0, 0);
  };

  const strataCount = strataMeta.length;

  return (
    <header className="h-10 bg-surface border-b border-hairline flex items-center justify-between px-3 z-20 relative select-none rounded-none">
      {/* Left: Brand & title */}
      <div className="flex items-center">
        <span className="font-mono text-[10px] tracking-[0.18em] text-ink uppercase font-medium">
          CORTEX
        </span>
        <span className="text-faint mx-2 text-[10px]">·</span>
        <span className="font-sans text-[11px] text-muted">
          codebase intelligence
        </span>
      </div>

      {/* Right: Search, Sound, Adapter switcher, replay intro & real stats readout */}
      <div className="flex items-center space-x-3">
        {/* Search trigger button (Phase 1A) */}
        <MagneticItem>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 text-muted hover:text-ink transition-colors cursor-pointer border border-transparent hover:border-hairline rounded-[2px]"
            title="Search entities (⌘K or /)"
            aria-label="Search entities"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="font-mono text-[10px] hidden sm:inline opacity-70">⌘K</span>
          </button>
        </MagneticItem>

        {/* Audio Synth toggle button (Phase 3) */}
        <MagneticItem>
          <button
            type="button"
            onClick={toggleAudio}
            className={`p-1.5 transition-colors cursor-pointer border border-transparent hover:border-hairline rounded-[2px] ${
              isAudioEnabled ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
            title={isAudioEnabled ? 'Mute audio' : 'Enable audio'}
            aria-label={isAudioEnabled ? 'Mute audio' : 'Enable audio'}
          >
            {isAudioEnabled ? (
              <Volume2 className="w-3.5 h-3.5" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>
        </MagneticItem>

        {/* Help Overlay reference toggle button (Phase 2B) */}
        <MagneticItem>
          <button
            type="button"
            onClick={toggleHelp}
            className={`p-1.5 transition-colors cursor-pointer border border-transparent hover:border-hairline rounded-[2px] ${
              isHelpOpen ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
            title="Reference & Shortcuts (?)"
            aria-label="Reference & Shortcuts"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </MagneticItem>

        {/* Inference Rules Drawer toggle button (R) */}
        <MagneticItem>
          <button
            type="button"
            onClick={toggleRulesDrawer}
            className={`p-1.5 transition-colors cursor-pointer border border-transparent hover:border-hairline rounded-[2px] ${
              isRulesDrawerOpen ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
            title="Inference Rules Catalog (R)"
            aria-label="Inference Rules Catalog"
          >
            <ScrollText className="w-3.5 h-3.5" />
          </button>
        </MagneticItem>

        {/* Theme Toggle (Phase 1) */}
        <MagneticItem>
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 transition-colors cursor-pointer border border-transparent hover:border-hairline rounded-[2px] text-muted hover:text-ink"
            title={theme === 'night' ? 'Switch to paper theme' : 'Switch to night theme'}
            aria-label={theme === 'night' ? 'Switch to paper theme' : 'Switch to night theme'}
          >
            {theme === 'night' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </MagneticItem>

        <span className="text-faint text-[10px]">|</span>

        {/* Adapter Switcher */}
        <div className="flex items-center space-x-2.5">
          {availableAdapters.map((item) => {
            const isActive = adapter === item.id;
            return (
              <MagneticItem key={item.id}>
                <button
                  type="button"
                  onClick={() => handleAdapterChange(item.id)}
                  className={`font-mono lowercase text-[11px] transition-colors cursor-pointer ${
                    isActive
                      ? 'text-ink border-b-2 border-ink pb-[1px]'
                      : 'text-muted hover:text-ink pb-[3px]'
                  }`}
                  title={item.description || item.name}
                >
                  {item.id}
                </button>
              </MagneticItem>
            );
          })}

          <span className="text-faint text-[10px]">·</span>

          <MagneticItem>
            <button
              type="button"
              onClick={handleReplayIntro}
              className="font-mono lowercase text-[10px] text-muted hover:text-ink transition-colors cursor-pointer"
              title="Replay cinematic descent introduction"
            >
              replay intro
            </button>
          </MagneticItem>
        </div>

        <div className="text-faint text-[10px]">|</div>

        <div className="font-mono text-[11px] text-muted">
          {nodes.length} entities · {edges.length} edges · {strataCount} strata
        </div>
      </div>
    </header>
  );
};
