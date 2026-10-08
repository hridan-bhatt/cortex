import { spawn } from 'child_process';

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

  for (let i = 0; i < 30; i++) {
    await sleep(300);
    const r = await send('Runtime.evaluate', {
      expression: 'Boolean(window.__cortex_store && window.__cortex_store.getState().status === "ready")',
      returnByValue: true
    });
    if (r?.result?.value) break;
  }

  await send('Runtime.evaluate', {
    expression: 'window.__cortex_store.getState().dismissPreloader(); window.__cortex_store.getState().handoff();'
  });
  await sleep(1000);

  const fpsRes = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `new Promise(resolve => {
      let frames = 0;
      const start = performance.now();
      function tick() {
        frames++;
        if (performance.now() - start >= 1500) {
          const elapsed = (performance.now() - start) / 1000;
          resolve(Math.round(frames / elapsed));
        } else {
          requestAnimationFrame(tick);
        }
      }
      requestAnimationFrame(tick);
    })`,
    returnByValue: true
  });
  console.log('Rest FPS measured:', fpsRes?.result?.value);

  browser.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  browser.kill();
  process.exit(1);
});
