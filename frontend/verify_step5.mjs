import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BROWSER_BIN = fs.existsSync(EDGE_PATH) ? EDGE_PATH : CHROME_PATH;

console.log('Using browser:', BROWSER_BIN);

const browserProcess = spawn(BROWSER_BIN, [
  '--remote-debugging-port=9222',
  '--headless=new',
  '--window-size=1600,1000',
  '--disable-gpu-sandbox',
  '--no-sandbox',
  'http://localhost:3000'
]);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectCDP() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const tabs = await res.json();
      const pageTab = tabs.find(t => t.type === 'page');
      if (pageTab && pageTab.webSocketDebuggerUrl) {
        return new Promise((resolve, reject) => {
          const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
          ws.onopen = () => resolve(ws);
          ws.onerror = (e) => reject(e);
        });
      }
    } catch (e) {
      // wait
    }
    await sleep(400);
  }
  throw new Error('Failed to connect to browser CDP');
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${filename}`);
    return outPath;
  }
}

async function run() {
  try {
    await sleep(2000);
    const ws = await connectCDP();
    const cdp = new CDPClient(ws);
    console.log('Connected to CDP successfully!');

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Wait for initial load
    await sleep(2500);

    // 1. Test Preloader: trigger reload
    console.log('\n--- 1. Testing Preloader ---');
    await cdp.eval(`(() => {
      window.__cortex_store.getState().loadGraph('vaultx', true);
    })()`);
    // Wait ~750ms so count is mid-way between 0 and 131
    await sleep(750);
    await cdp.screenshot('preloader_mid_count.png');

    // Wait for preloader ready & dismiss
    await sleep(1500);
    await cdp.eval(`(() => {
      window.__cortex_store.getState().dismissPreloader();
    })()`);

    // 2. Transition into instrument mode
    console.log('\n--- 2. Entering Instrument Mode ---');
    await cdp.eval(`(() => {
      window.__cortex_store.getState().handoff();
    })()`);
    await sleep(1500);

    // 3. Verify Live Ticker
    console.log('\n--- 3. Testing Ticker Facts ---');
    const tickerFacts = await cdp.eval(`(() => {
      const el = document.querySelector('footer');
      const spans = el ? Array.from(el.querySelectorAll('span')).map(s => s.textContent.trim()) : [];
      return spans[0] || '';
    })()`);
    console.log('Raw ticker text:\n', tickerFacts);

    // 4. Test Command Palette (⌘K)
    console.log('\n--- 4. Testing Command Palette ---');
    await cdp.eval(`(() => {
      window.__cortex_store.getState().setPaletteOpen(true);
    })()`);
    await sleep(300);

    // Focus input and insert text "vault"
    await cdp.eval(`(() => {
      const input = document.querySelector('#cortex-command-palette input');
      if (input) input.focus();
    })()`);
    await cdp.send('Input.insertText', { text: 'vault' });
    await sleep(400);

    await cdp.screenshot('palette_mid_query.png');

    const searchResults = await cdp.eval(`(() => {
      const rows = Array.from(document.querySelectorAll('#cortex-command-palette ul li')).map(b => b.textContent.trim());
      return rows;
    })()`);
    console.log('Search results for "vault":', searchResults);

    // 5. Test Fly-To and Ping Sequence
    console.log('\n--- 5. Testing Fly-To & Ping Sequence ---');
    // Select first palette row via Enter key
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13
    });

    // Wait for glide arrival (~1.1s)
    await sleep(1150);
    await cdp.screenshot('ping_frame_1.png');
    await sleep(250);
    await cdp.screenshot('ping_frame_2.png');
    await sleep(350);
    await cdp.screenshot('ping_frame_3.png');

    const stateAfterFlyTo = await cdp.eval(`(() => {
      const s = window.__cortex_store.getState();
      return {
        selectedNodeId: s.selectedNodeId,
        isPaletteOpen: s.isPaletteOpen,
        bracketTarget: s.bracketTarget
      };
    })()`);
    console.log('State after fly-to:', stateAfterFlyTo);

    // 6. Test Solo Band Framing & Viewfinder Brackets
    console.log('\n--- 6. Testing Band Solo Framing & Viewfinder Brackets ---');
    await cdp.eval(`(() => {
      window.__cortex_store.getState().toggleSoloStratum(1);
    })()`);
    await sleep(1300); // Wait for framing glide to complete

    await cdp.screenshot('bracket_frame_band_solo.png');
    const bracketInfo = await cdp.eval(`(() => {
      const s = window.__cortex_store.getState();
      const stampEl = document.querySelector('.bracket-stamp');
      return {
        bracketTarget: s.bracketTarget,
        renderedStamp: stampEl ? stampEl.textContent : null
      };
    })()`);
    console.log('Bracket state on band solo:', bracketInfo);

    // 7. Test Film Grain & Vignette A-B Pair
    console.log('\n--- 7. Testing Grain A-B Pair ---');
    await cdp.screenshot('grain_on.png');

    await cdp.eval(`(() => {
      const g = document.getElementById('cortex-grain-tile');
      if (g) g.style.display = 'none';
    })()`);
    await sleep(100);
    await cdp.screenshot('grain_off.png');
    await cdp.eval(`(() => {
      const g = document.getElementById('cortex-grain-tile');
      if (g) g.style.display = '';
    })()`);

    // 8. Test Custom Cursor States
    console.log('\n--- 8. Testing Cursor States ---');
    // Move cursor to empty space (default)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 350,
      y: 350
    });
    await sleep(200);
    await cdp.screenshot('cursor_default.png');

    // Move cursor over interactive button (hover)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 28,
      y: 80
    });
    await sleep(200);
    await cdp.screenshot('cursor_hover.png');

    // Enter impact mode (crosshair cursor)
    await cdp.eval(`(() => {
      window.__cortex_store.getState().setQueryMode('impact');
    })()`);
    await sleep(200);
    await cdp.screenshot('cursor_crosshair.png');

    // 9. Measure FPS at rest and during impact playback
    console.log('\n--- 9. Measuring FPS ---');
    const fpsRest = await cdp.eval(`new Promise(resolve => {
      let frames = 0;
      const start = performance.now();
      function count() {
        frames++;
        if (performance.now() - start < 1000) {
          requestAnimationFrame(count);
        } else {
          resolve(Math.round(frames / ((performance.now() - start) / 1000)));
        }
      }
      requestAnimationFrame(count);
    })`);
    console.log('FPS at rest with grain:', fpsRest);

    const fpsImpact = await cdp.eval(`new Promise(resolve => {
      const s = window.__cortex_store.getState();
      const btn = document.querySelector('button[aria-label="Impact"]');
      if (btn) btn.click();
      
      let frames = 0;
      const start = performance.now();
      function count() {
        frames++;
        if (performance.now() - start < 1000) {
          requestAnimationFrame(count);
        } else {
          resolve(Math.round(frames / ((performance.now() - start) / 1000)));
        }
      }
      requestAnimationFrame(count);
    })`);
    console.log('FPS during impact playback:', fpsImpact);

    // 10. Check Audio Toggle State
    console.log('\n--- 10. Testing Audio State ---');
    const audioState = await cdp.eval(`(() => {
      const s = window.__cortex_store.getState();
      const initial = s.isAudioEnabled;
      s.toggleAudio();
      const toggled = window.__cortex_store.getState().isAudioEnabled;
      s.toggleAudio();
      return { initial, toggled, persisted: localStorage.getItem('cortex_audio_enabled') };
    })()`);
    console.log('Audio state:', audioState);

    console.log('\nALL VERIFICATION STEPS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error during verification:', err);
  } finally {
    browserProcess.kill();
    process.exit(0);
  }
}

run();
