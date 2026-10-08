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
      expression: 'Boolean(window.__cortex_store && window.__cortex_store.getState().status === "ready" && window.__cortex_store.getState().nodes.length > 0)',
      returnByValue: true
    });
    if (r?.result?.value === true) break;
  }

  // Dismiss preloader and enter instrument mode
  await send('Runtime.evaluate', {
    expression: 'window.__cortex_store.getState().dismissPreloader(); window.__cortex_store.getState().handoff();'
  });
  await sleep(1000);

  // 1. Capture Inspector
  await send('Runtime.evaluate', {
    expression: `(() => {
      const store = window.__cortex_store.getState();
      const node = store.nodes.find(n => n.entityName === 'AdminController') || store.nodes[0];
      store.setSelectedNodeId(node.id);
    })()`
  });
  await sleep(600);

  let sc = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'deai_inspector.png'), Buffer.from(sc.data, 'base64'));
  console.log('Saved deai_inspector.png');

  // 2. Capture Impact HUD
  await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      const store = window.__cortex_store.getState();
      const node = store.nodes.find(n => n.entityName === 'AdminController') || store.nodes[0];
      store.setQueryMode('impact');
      store.setSelectedNodeId(node.id);
      try {
        const idToFetch = node.entityId || node.id;
        const res = await fetch('http://localhost:8080/traverse/impact/' + encodeURIComponent(idToFetch));
        const data = await res.json();
        store.setImpactData(data);
      } catch (e) {
        console.error(e);
      }
    })()`
  });
  await sleep(600);

  sc = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'deai_impact_hud.png'), Buffer.from(sc.data, 'base64'));
  console.log('Saved deai_impact_hud.png');

  browser.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  browser.kill();
  process.exit(1);
});
