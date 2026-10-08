import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const browserProcess = spawn(EDGE_PATH, [
  '--remote-debugging-port=9222',
  '--headless=new',
  '--window-size=1600,1000',
  'http://localhost:3000'
]);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  await sleep(2000);
  const res = await fetch('http://127.0.0.1:9222/json');
  const tabs = await res.json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const callbacks = new Map();
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && callbacks.has(msg.id)) {
      callbacks.get(msg.id)(msg.result);
      callbacks.delete(msg.id);
    }
  };
  function send(method, params = {}) {
    return new Promise(resolve => {
      const curId = id++;
      callbacks.set(curId, resolve);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  // Go to instrument mode
  await sleep(1500);
  await send('Runtime.evaluate', { expression: 'window.__cortex_store.getState().dismissPreloader(); window.__cortex_store.getState().handoff();' });
  await sleep(1000);

  // Open palette
  await send('Runtime.evaluate', { expression: 'window.__cortex_store.getState().setPaletteOpen(true);' });
  await sleep(300);

  // Focus input and type characters
  await send('Runtime.evaluate', { expression: 'const inp = document.querySelector("#cortex-command-palette input"); if (inp) { inp.focus(); }' });
  
  // Insert text 'vault'
  await send('Input.insertText', { text: 'vault' });
  await sleep(500);

  const sc = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'palette_mid_query.png'), Buffer.from(sc.data, 'base64'));
  console.log('Saved palette_mid_query.png');

  browserProcess.kill();
  process.exit(0);
}
run();
