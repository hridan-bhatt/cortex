import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { Scene } from './scene/Scene';
import { TopBar } from './ui/TopBar';
import { VerbRail } from './ui/VerbRail';
import { Navigator } from './ui/Navigator';
import { HelpOverlay } from './ui/HelpOverlay';
import { ComplexityDial } from './ui/ComplexityDial';
import { Inspector } from './ui/Inspector';
import { ImpactHud } from './ui/ImpactHud';
import { TraceHud } from './ui/TraceHud';
import { CyclesHud } from './ui/CyclesHud';
import { WhatIfHud } from './ui/WhatIfHud';
import { SimConsole } from './ui/SimConsole';

import { HintStrip } from './ui/HintStrip';
import { StatusBar } from './ui/StatusBar';
import { Ticker } from './ui/Ticker';
import { Palette } from './ui/Palette';
import { FrameBrackets } from './ui/FrameBrackets';

import { Cursor } from './ui/Cursor';
import { Preloader } from './ui/Preloader';
import { Backdrop } from './ui/Backdrop';
import { DescentOverlay } from './descent/DescentOverlay';
import { useCortexStore } from './state/store';

export const App: React.FC = () => {
  const mode = useCortexStore((state) => state.mode);
  const loadGraph = useCortexStore((state) => state.loadGraph);
  const chromeRef = useRef<HTMLDivElement>(null);

  const hasBootedRef = useRef(false);

  useEffect(() => {
    if (hasBootedRef.current) return;
    hasBootedRef.current = true;
    // Automatically load persisted adapter or default "vaultx" on boot
    const bootAdapter =
      (typeof window !== 'undefined' ? localStorage.getItem('cortex.adapter') : null) || 'vaultx';
    loadGraph(bootAdapter, true);
  }, [loadGraph]);

  // Sync html & body scroll classes with current mode
  useEffect(() => {
    if (mode === 'descent') {
      document.documentElement.classList.add('mode-descent');
      document.body.classList.add('mode-descent');
      document.documentElement.classList.remove('mode-instrument');
      document.body.classList.remove('mode-instrument');
    } else {
      document.documentElement.classList.add('mode-instrument');
      document.body.classList.add('mode-instrument');
      document.documentElement.classList.remove('mode-descent');
      document.body.classList.remove('mode-descent');
      window.scrollTo(0, 0);
    }
  }, [mode]);

  // Fade in UI chrome with 80ms stagger upon entering instrument mode
  useEffect(() => {
    if (mode === 'instrument' && chromeRef.current) {
      const items = chromeRef.current.querySelectorAll('.chrome-fade-in');
      gsap.fromTo(
        items,
        { opacity: 0, y: -6 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out',
          onComplete: () => {
            gsap.set(items, { clearProps: 'transform' });
          },
        }
      );
    }
  }, [mode]);

  // Global shortcuts for V (cycle complexity) and ? (toggle help)
  useEffect(() => {
    if (mode !== 'instrument') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isInputFocused) return;

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        useCortexStore.getState().toggleHelp();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        useCortexStore.getState().cycleComplexityMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  const isDescent = mode === 'descent';

  return (
    <div
      className={`relative w-full bg-transparent text-ink font-sans select-none ${
        isDescent ? 'min-h-screen' : 'h-screen overflow-hidden'
      }`}
    >

      <Backdrop />
      <Cursor />
      <Preloader />
      <Palette />
      <HelpOverlay />
      <FrameBrackets />

      <div
        className={`fixed inset-0 z-[1] ${
          isDescent ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
      >
        <Scene />
      </div>

      {isDescent && <DescentOverlay />}

      {!isDescent && (
        <>
          <div ref={chromeRef} className="relative z-10 w-full h-full pointer-events-none flex flex-col">
            <div className="chrome-fade-in pointer-events-auto">
              <TopBar />
            </div>

            <main className="flex-1 relative w-full overflow-hidden pointer-events-none">
              <div className="chrome-fade-in pointer-events-none">
                <VerbRail />
              </div>

              <div className="chrome-fade-in pointer-events-none">
                <Navigator />
              </div>

              <div className="chrome-fade-in pointer-events-none">
                <ComplexityDial />
              </div>

              <div className="chrome-fade-in pointer-events-none">
                <HintStrip />
              </div>

              <div className="chrome-fade-in pointer-events-none">
                <StatusBar />
              </div>
            </main>

            <div className="chrome-fade-in pointer-events-auto">
              <Ticker />
            </div>
          </div>

          <Inspector />
          <ImpactHud />
          <TraceHud />
          <CyclesHud />
          <WhatIfHud />
          <SimConsole />
        </>
      )}

    </div>
  );
};

export default App;
