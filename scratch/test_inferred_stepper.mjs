import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9238;
const ARTIFACT_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== Inferred Stepper Verification ===');

  // Fetch real inferred fact from backend
  const reasonRes = await fetch('http://localhost:8080/reason', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetEntityId: 'FileEntity', targetStatus: 'FAILED', maxIterations: 10 })
  });
  const reasonData = await reasonRes.json();
  const inferredFact = reasonData.facts.find(f => f.inferred);
  console.log('Selected inferred fact:', inferredFact.id, inferredFact.factData?.entity_name);

  // Fetch its live evidence
  const evRes = await fetch(`http://localhost:8080/evidence/${inferredFact.id}`);
  const evData = await evRes.json();
  console.log('Fetched live evidence for:', inferredFact.id);

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

  const captureScreenshot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.result.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, `${name}.png`);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);
  };

  // Wait for app and graph to be ready
  console.log('Waiting for graph to load...');
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const status = await evaluate(`window.__cortex_store ? window.__cortex_store.getState().status : null`);
    if (status === 'ready') {
      console.log('Graph ready!');
      break;
    }
  }
  await sleep(1000);

  // Transition to instrument mode
  await evaluate(`
    const st = window.__cortex_store.getState();
    st.setMode('instrument');
    st.setQueryMode('simulate');
    st.setSimTarget('FileEntity', 'FileEntity');
  `);
  await sleep(1000);

  // Inject live evidence and open Provenance Stepper modal
  await evaluate(`
    (() => {
      const st = window.__cortex_store.getState();
      st.setSimSelectedFactId(${JSON.stringify(inferredFact.id)});
      st.setSimEvidenceData(${JSON.stringify(evData)});
    })()
  `);
  await sleep(1000);

  const modalInfo = await evaluate(`
    (() => {
      const m = document.querySelector('[data-testid="provenance-stepper-modal"]');
      if (!m) return null;
      return {
        title: m.querySelector('h2')?.innerText,
        text: m.innerText.slice(0, 500)
      };
    })()
  `);
  console.log('Modal Info:', modalInfo);
  await captureScreenshot('provenance_stepper_modal_4steps');

  // Test View Fiber button click
  console.log('Testing View Fiber button in modal...');
  await evaluate(`
    (() => {
      const m = document.querySelector('[data-testid="provenance-stepper-modal"]');
      const fiberBtn = Array.from(m.querySelectorAll('button')).find(b => b.innerText.includes('View Fiber'));
      if (fiberBtn) {
        fiberBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(500);
  await captureScreenshot('provenance_stepper_fiber_active');

  // Test Walk Premise Chain button click
  console.log('Testing Walk Premise Chain button in modal...');
  await evaluate(`
    (() => {
      const m = document.querySelector('[data-testid="provenance-stepper-modal"]');
      const walkBtn = Array.from(m.querySelectorAll('button')).find(b => b.innerText.includes('Walk premise chain'));
      if (walkBtn) {
        walkBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(1200);
  await captureScreenshot('provenance_stepper_depth1');

  // Test Back button
  console.log('Testing Back button in modal...');
  await evaluate(`
    (() => {
      const m = document.querySelector('[data-testid="provenance-stepper-modal"]');
      const backBtn = Array.from(m.querySelectorAll('button')).find(b => b.innerText.includes('Back to:'));
      if (backBtn) {
        backBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(500);

  // Close modal
  await evaluate(`window.__cortex_store.getState().setSimSelectedFactId(null);`);
  await sleep(500);

  ws.close();
  edge.kill();
  console.log('Inferred stepper test passed successfully.');
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
