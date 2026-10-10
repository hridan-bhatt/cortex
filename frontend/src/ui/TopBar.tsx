import React, { useEffect, useState } from 'react';
import { Search, Volume2, VolumeX, HelpCircle, Sun, Moon, ScrollText, FolderOpen, Play } from 'lucide-react';
import { useCortexStore } from '../state/store';
import { MagneticItem } from './useMagnetic';
import { fetchAdapters } from '../api/client';
import { AdapterDescriptor } from '../api/types';
import { PanelShell, PanelHeader } from './PanelShell';
import { CORTEX_CURVE } from './motion';

interface TopBarProps {
  onStartTour?: () => void;
  onAbortTour?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onStartTour, onAbortTour }) => {
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
  const isTourActive = useCortexStore((state) => state.isTourActive);
  const customProjectName = useCortexStore((state) => state.customProjectName);

  const [isOpenDialogOpen, setIsOpenDialogOpen] = useState(false);
  const [projectPathInput, setProjectPathInput] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);

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
    if (nextAdapter !== adapter || customProjectName || status === 'error') {
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
    <header className="h-10 bg-surface border-b border-hairline flex items-center justify-between z-20 relative select-none rounded-none pr-3">
      {/* Left: 56px Rail-aligned Brand compartment */}
      <div className="flex items-center h-full">
        <div className="w-14 h-full border-r border-hairline flex items-center justify-center shrink-0">
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink uppercase font-medium">
            CORTEX
          </span>
        </div>
        <span className="font-sans text-[11px] text-muted pl-3">
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

        {/* Tour trigger button (Phase 1: lucide play, 16px, muted, hover ink) */}
        <MagneticItem>
          <button
            type="button"
            onClick={() => {
              if (isTourActive) {
                if (onAbortTour) onAbortTour();
                else if (typeof window !== 'undefined' && (window as any).__cortex_tour) (window as any).__cortex_tour.abort();
              } else {
                if (onStartTour) onStartTour();
                else if (typeof window !== 'undefined' && (window as any).__cortex_tour) (window as any).__cortex_tour.start();
              }
            }}
            className={`p-1.5 transition-colors cursor-pointer border border-transparent hover:border-hairline rounded-[2px] ${
              isTourActive ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
            title={isTourActive ? 'Stop guided tour (Esc)' : 'Start guided tour (T)'}
            aria-label={isTourActive ? 'Stop guided tour (Esc)' : 'Start guided tour (T)'}
          >
            <Play className="w-4 h-4" />
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
            <div className="w-4 h-4 relative overflow-hidden">
              <Sun
                className="w-4 h-4 absolute inset-0"
                style={{
                  transform: theme === 'night' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
                  opacity: theme === 'night' ? 1 : 0,
                  transition: `transform 380ms ${CORTEX_CURVE}, opacity 380ms ${CORTEX_CURVE}`,
                }}
              />
              <Moon
                className="w-4 h-4 absolute inset-0"
                style={{
                  transform: theme === 'paper' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0)',
                  opacity: theme === 'paper' ? 1 : 0,
                  transition: `transform 380ms ${CORTEX_CURVE}, opacity 380ms ${CORTEX_CURVE}`,
                }}
              />
            </div>
          </button>
        </MagneticItem>

        {/* Open Project Folder Dialog trigger (Phase 2B) */}
        <MagneticItem>
          <button
            type="button"
            onClick={() => {
              setIsOpenDialogOpen(true);
              setDialogError(null);
            }}
            className="p-1.5 transition-colors cursor-pointer border border-transparent hover:border-hairline rounded-[2px] text-muted hover:text-ink"
            title="Open project folder"
            aria-label="Open project folder"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
        </MagneticItem>

        <span className="text-faint text-[10px]">|</span>

        {/* Adapter Switcher (pinned worlds: vaultx, hospital) */}
        <div className="flex items-center space-x-2.5">
          {availableAdapters
            .filter((item) => item.id === 'vaultx' || item.id === 'hospital')
            .map((item) => {
              const isActive = adapter === item.id && !customProjectName;
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

        {/* Stats Readout with Custom Project Indication */}
        <div className="font-mono text-[11px] text-muted">
          {customProjectName && (
            <>
              <span className="text-ink">custom · {customProjectName}</span>
              <span className="text-faint mx-1.5">·</span>
            </>
          )}
          {nodes.length} entities · {edges.length} edges · {strataCount} strata
        </div>
      </div>

      {/* Open Project Dialog Modal (Phase 2B) */}
      <PanelShell
        id="open-project-modal"
        testId="open-project-modal"
        ariaLabel="Open Project Dialog"
        variant="modal"
        isOpen={isOpenDialogOpen}
        onClose={() => {
          setIsOpenDialogOpen(false);
          setDialogError(null);
        }}
        escPriority={100}
      >
        <div className="bg-surface border border-hairline rounded-[2px] w-[420px] max-w-[90vw] shadow-2xl overflow-hidden">
          <PanelHeader
            title="OPEN PROJECT"
            onClose={() => {
              setIsOpenDialogOpen(false);
              setDialogError(null);
            }}
            closeTitle="Close dialog"
          />

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const cleanPath = projectPathInput.trim();
              if (!cleanPath) {
                setDialogError('Please enter a directory path');
                return;
              }
              setIsSubmittingProject(true);
              setDialogError(null);
              try {
                await loadGraph('java', true, cleanPath);
                setIsOpenDialogOpen(false);
                setProjectPathInput('');
              } catch (err: any) {
                setDialogError(err?.message || 'Failed to analyze project');
              } finally {
                setIsSubmittingProject(false);
              }
            }}
            className="p-4 space-y-3"
          >
            <div>
              <input
                type="text"
                value={projectPathInput}
                onChange={(e) => {
                  setProjectPathInput(e.target.value);
                  if (dialogError) setDialogError(null);
                }}
                placeholder="C:\path\to\java\project"
                className="w-full bg-surface2 border border-hairline rounded-[2px] px-3 py-1.5 font-mono text-[11px] text-ink placeholder:text-faint focus:outline-none focus:border-ink"
                autoFocus
              />
            </div>

            {dialogError && (
              <div className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-[2px] break-words">
                {dialogError}
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpenDialogOpen(false);
                  setDialogError(null);
                }}
                className="px-2.5 py-1 font-mono text-[10px] uppercase text-muted hover:text-ink cursor-pointer"
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingProject}
                className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-ink border border-hairline hover:border-ink transition-colors rounded-[2px] cursor-pointer disabled:opacity-50"
              >
                {isSubmittingProject ? 'analyzing…' : 'analyze'}
              </button>
            </div>
          </form>
        </div>
      </PanelShell>
    </header>
  );
};
