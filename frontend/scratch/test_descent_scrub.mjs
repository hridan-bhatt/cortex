import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tmpDir = 'C:\\Users\\hrida\\AppData\\Local\\Temp\\edge-cdp-' + Date.now();

const browser = spawn(EDGE_PATH, [
  '--remote-debugging-port=9222',
  '--user-data-dir=' + tmpDir,
  '--headless=new',
  '--window-size=1600,1000',
  '--disable-gpu',
  'http://localhost:3000'
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let ws;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const tabs = await res.json();
      const pageTab = tabs.find((t) => t.type === 'page');
      if (pageTab?.webSocketDebuggerUrl) {
        ws = new WebSocket(pageTab.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        break;
      }
    } catch (e) {}
  }
  if (!ws) {
    console.error('No ws');
    browser.kill();
    return;
  }

  let id = 1;
  const callbacks = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id)(msg.result);
      callbacks.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const curId = id++;
      callbacks.set(curId, resolve);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

  // Wait for status ready
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const r = await send('Runtime.evaluate', {
      expression: 'Boolean(window.__cortex_store && window.__cortex_store.getState().status === "ready")',
      returnByValue: true
    });
    if (r?.result?.value === true) break;
  }

  await send('Runtime.evaluate', {
    expression: 'window.__cortex_store.getState().dismissPreloader(); window.__cortex_store.getState().setMode("descent"); window.scrollTo(0, 0);'
  });
  await sleep(1000);

  // Check initial state of beat 0 and beat 1
  const initial = await send('Runtime.evaluate', {
    expression: `(() => {
      const b0 = document.querySelector('#beat-content-0 h1');
      const b1 = document.querySelector('#beat-content-1 h1');
      return {
        b0_opacity: b0 ? b0.style.opacity : null,
        b0_transform: b0 ? b0.style.transform : null,
        b1_opacity: b1 ? b1.style.opacity : null,
        b1_transform: b1 ? b1.style.transform : null,
      };
    })()`,
    returnByValue: true
  });
  console.log('Scroll 0:', initial.result.value);

  // Scroll down to beat 1 (~92vh = ~920px)
  await send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, 920);'
  });
  await sleep(800);

  const atBeat1 = await send('Runtime.evaluate', {
    expression: `(() => {
      const b0 = document.querySelector('#beat-content-0 h1');
      const b1 = document.querySelector('#beat-content-1 h1');
      const b1Counter = document.querySelector('#beat-content-1 [data-count-target]');
      return {
        b0_opacity: b0 ? b0.style.opacity : null,
        b1_opacity: b1 ? b1.style.opacity : null,
        b1_transform: b1 ? b1.style.transform : null,
        b1_count: b1Counter ? b1Counter.innerText : null,
      };
    })()`,
    returnByValue: true
  });
  console.log('Scroll at Beat 1 (920px):', atBeat1.result.value);

  // Scrub back up to 0
  await send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, 0);'
  });
  await sleep(800);

  const afterScrubBack = await send('Runtime.evaluate', {
    expression: `(() => {
      const b0 = document.querySelector('#beat-content-0 h1');
      const b1 = document.querySelector('#beat-content-1 h1');
      const b1Counter = document.querySelector('#beat-content-1 [data-count-target]');
      return {
        b0_opacity: b0 ? b0.style.opacity : null,
        b0_transform: b0 ? b0.style.transform : null,
        b1_opacity: b1 ? b1.style.opacity : null,
        b1_count: b1Counter ? b1Counter.innerText : null,
      };
    })()`,
    returnByValue: true
  });
  console.log('After Scrub Back (0px):', afterScrubBack.result.value);

  browser.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  browser.kill();
  process.exit(1);
});
