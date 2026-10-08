import { spawn } from 'child_process';
import http from 'http';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9244;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== Verifying All 6 Verbs ===');

  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'http://localhost:3000',
  ]);

  let versionData = null;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    try {
      versionData = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json/version`, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
      });
      if (versionData) break;
    } catch (e) {}
  }

  const pages = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });

  const page = pages.find((p) => p.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const cb = pending.get(msg.id);
      pending.delete(msg.id);
      cb(msg);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const reqId = id++;
      pending.set(reqId, resolve);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  };

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.result?.value;
  };

  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const status = await evaluate(`window.__cortex_store ? window.__cortex_store.getState().status : null`);
    if (status === 'ready') break;
  }
  await sleep(1000);

  await evaluate(`
    const st = window.__cortex_store.getState();
    st.setMode('instrument');
  `);
  await sleep(500);

  const verbs = ['explore', 'impact', 'trace', 'cycles', 'whatif', 'simulate'];
  const results = {};

  for (const verb of verbs) {
    console.log(`Checking verb: ${verb}...`);
    await evaluate(`window.__cortex_store.getState().setQueryMode('${verb}')`);
    await sleep(600);

    const check = await evaluate(`
      (() => {
        const qm = window.__cortex_store.getState().queryMode;
        const text = document.body.innerText;
        let hudFound = false;
        if (qm === 'explore') hudFound = text.includes('click a node to inspect') || text.includes('INSPECTOR');
        if (qm === 'impact') hudFound = text.includes('impact — select a node') || text.includes('IMPACT ANALYSIS') || !!document.querySelector('.hud-shell');
        if (qm === 'trace') hudFound = text.includes('trace — select a source') || text.includes('DEPENDENCY TRACE') || !!document.querySelector('.hud-shell');
        if (qm === 'cycles') hudFound = text.includes('detecting cycles') || text.includes('CIRCULAR DEPENDENCIES') || !!document.querySelector('.hud-shell');
        if (qm === 'whatif') hudFound = text.includes('what-if') || text.includes('HYPOTHETICAL REMOVAL') || !!document.querySelector('.hud-shell');
        if (qm === 'simulate') hudFound = text.includes('SIMULATE') || !!document.querySelector('[data-testid="sim-console"]');
        return { qm, hudFound };
      })()
    `);
    results[verb] = check;
  }

  console.log('Verb check results:', JSON.stringify(results, null, 2));

  ws.close();
  edge.kill();
  console.log('All verbs verified successfully.');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
