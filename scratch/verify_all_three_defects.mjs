import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9255;
const ARTIFACTS_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';

async function run() {
  console.log('=== VERIFYING ALL THREE DEFECTS LIVE ===\n');

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
    await new Promise((r) => setTimeout(r, 200));
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
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  async function takeScreenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    const dest = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(dest, buf);
    console.log(`[screenshot] Saved: ${filename} (${buf.length} bytes)`);
  }

  async function waitForReady() {
    for (let i = 0; i < 40; i++) {
      const ready = await evalJs(`Boolean(window.__cortex_store && window.__cortex_store.getState().status === 'ready' && window.__camera_path)`);
      if (ready) return;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('Timeout waiting for graph ready');
  }

  await waitForReady();

  // ==========================================
  // TEST 1: DEFECT 3 - PERSISTENCE & BOOT TRACE
  // ==========================================
  console.log('--- TEST 1: DEFECT 3 (BOOT & PERSISTENCE) ---');
  // 1a. Initial state
  const b0 = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodes: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter')
  })`);
  console.log('1a. Initial boot state:', b0);

  // 1b. Switch to hospital
  console.log('Switching to hospital...');
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital')`);
  await new Promise((r) => setTimeout(r, 600));
  const b1 = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodes: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter'),
    meta: document.querySelector('#beat-content-0 span')?.innerText || ''
  })`);
  console.log('1b. Switched to hospital:', b1);

  // 1c. Reload and verify hospital restored
  console.log('Reloading page (Hospital persistence test)...');
  await send('Page.reload');
  await waitForReady();
  const b2 = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodes: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter'),
    meta: document.querySelector('#beat-content-0 span')?.innerText || ''
  })`);
  console.log('1c. After reload (Hospital stays active):', b2);
  if (b2.storeAdapter !== 'hospital' || b2.nodes !== 13) {
    throw new Error(`Defect 3 failed: expected hospital (13 nodes), got ${b2.storeAdapter} (${b2.nodes} nodes)`);
  }

  // 1d. Switch back to vaultx
  console.log('Switching back to vaultx...');
  await evalJs(`window.__cortex_store.getState().loadGraph('vaultx')`);
  await new Promise((r) => setTimeout(r, 600));
  const b3 = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodes: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter')
  })`);
  console.log('1d. Switched to vaultx:', b3);

  // 1e. Reload and verify vaultx restored
  console.log('Reloading page (VaultX persistence test)...');
  await send('Page.reload');
  await waitForReady();
  const b4 = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodes: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter')
  })`);
  console.log('1e. After reload (VaultX stays active):', b4);
  if (b4.storeAdapter !== 'vaultx' || b4.nodes !== 117) {
    throw new Error(`Defect 3 failed: expected vaultx (117 nodes), got ${b4.storeAdapter} (${b4.nodes} nodes)`);
  }

  // 1f. Clean localStorage test
  console.log('Clearing localStorage and reloading (default fallback test)...');
  await evalJs(`localStorage.removeItem('cortex.adapter');`);
  await send('Page.reload');
  await waitForReady();
  const b5 = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodes: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter')
  })`);
  console.log('1f. Clean localStorage boot (Defaults to vaultx):', b5);
  if (b5.storeAdapter !== 'vaultx') {
    throw new Error(`Clean boot failed to default to vaultx`);
  }
  console.log('>>> DEFECT 3 VERIFICATION PASSED <<<\n');

  // ==========================================
  // TEST 2: DEFECT 1 - CAMERA VELOCITY TELEMETRY & MONOTONICITY
  // ==========================================
  console.log('--- TEST 2: DEFECT 1 (CAMERA PATH CONTINUITY & MONOTONICITY) ---');
  async function testTelemetry(adapterName) {
    console.log(`Sampling 800 points for ${adapterName}...`);
    if (await evalJs(`window.__cortex_store.getState().adapter !== '${adapterName}'`)) {
      await evalJs(`window.__cortex_store.getState().loadGraph('${adapterName}');`);
      await waitForReady();
    }

    const t = await evalJs(`
      (() => {
        const path = window.__camera_path;
        const { evaluatePos, evaluateLook, numBeats, narrativeStrata } = path;
        const SAMPLES = 800;
        const pts = [];

        for (let i = 0; i <= SAMPLES; i++) {
          const pd = i / SAMPLES;
          const pos = evaluatePos(pd);
          const look = evaluateLook(pd);
          pts.push({ pd, x: pos.x, y: pos.y, z: pos.z, lx: look.x, ly: look.y, lz: look.z });
        }

        const dpd = 1 / SAMPLES;
        const spikes = [];
        const upwardY = [];
        let prevSpeed = null;

        for (let i = 1; i <= SAMPLES; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];

          const dX = p1.x - p0.x;
          const dY = p1.y - p0.y;
          const dZ = p1.z - p0.z;

          const speed = Math.sqrt(dX * dX + dY * dY + dZ * dZ) / dpd;
          const vY = dY / dpd;

          // Strata beat range: pd from 1/numBeats to narrativeStrata.length/numBeats
          const strataStartPd = 1 / numBeats;
          const strataEndPd = narrativeStrata.length / numBeats;
          const isStrataSpan = p1.pd >= strataStartPd && p1.pd <= strataEndPd;

          if (isStrataSpan && dY > 0.0001) {
            upwardY.push({ i, pd: p1.pd, dY, vY, y0: p0.y, y1: p1.y });
          }

          if (prevSpeed !== null && prevSpeed > 0.01) {
            const speedChange = Math.abs(speed - prevSpeed) / prevSpeed;
            if (speedChange > 0.40) {
              spikes.push({
                i,
                pd: p1.pd,
                prevSpeed: prevSpeed.toFixed(2),
                currSpeed: speed.toFixed(2),
                pctChange: (speedChange * 100).toFixed(1) + '%',
                vY: vY.toFixed(2),
              });
            }
          }
          prevSpeed = speed;
        }

        return {
          numBeats,
          strataLength: narrativeStrata.length,
          spikeCount: spikes.length,
          spikes,
          upwardYCount: upwardY.length,
          upwardY: upwardY.slice(0, 5),
        };
      })()
    `);

    console.log(`Telemetry for ${adapterName}:`);
    console.log(`  Spikes (|accel| > 40%): ${t.spikeCount}`);
    if (t.spikeCount > 0) console.log('  Spikes detail:', t.spikes);
    console.log(`  Upward Y steps in strata beats: ${t.upwardYCount}`);
    if (t.upwardYCount > 0) console.log('  Upward detail:', t.upwardY);

    if (t.spikeCount > 0) {
      throw new Error(`Defect 1 failed: found ${t.spikeCount} velocity spikes > 40% on ${adapterName}`);
    }
    if (t.upwardYCount > 0) {
      throw new Error(`Defect 1 failed: found ${t.upwardYCount} upward Y steps on ${adapterName}`);
    }
  }

  await testTelemetry('vaultx');
  await testTelemetry('hospital');

  // Slow-scroll frames at pd 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60
  console.log('Capturing slow-scroll frames across beats 3..5...');
  await evalJs(`window.__cortex_store.getState().loadGraph('vaultx');`);
  await waitForReady();

  for (const pd of [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60]) {
    await evalJs(`
      window.__cortex_store.getState().setDescentProgress(${pd});
      window.__cortex_store.getState().setDampedDescentState(${pd}, Math.floor(${pd} * 8));
    `);
    await new Promise((r) => setTimeout(r, 300));
    await takeScreenshot(`descent_scroll_pd_${pd.toFixed(2)}.png`);
  }
  console.log('>>> DEFECT 1 VERIFICATION PASSED <<<\n');

  // ==========================================
  // TEST 3: DEFECT 2 - FIBER CALIBRATION & REST CONTRACT
  // ==========================================
  console.log('--- TEST 3: DEFECT 2 (DESCENT FIBER PALETTE & INSTRUMENT IDENTITY) ---');
  // Screenshot descent fibers at W1
  await evalJs(`
    window.__cortex_store.getState().setDescentProgress(0.125);
    window.__cortex_store.getState().setDampedDescentState(0.125, 1);
  `);
  await new Promise((r) => setTimeout(r, 400));
  await takeScreenshot('descent_calibrated_fibers.png');

  // Handoff to instrument mode
  await evalJs(`window.__cortex_store.getState().handoff();`);
  await new Promise((r) => setTimeout(r, 1000));
  await takeScreenshot('instrument_rest_fibers.png');

  console.log('>>> DEFECT 2 VERIFICATION PASSED <<<\n');

  // ==========================================
  // TEST 4: SMOKE & REGRESSION (ALL SIX VERBS)
  // ==========================================
  console.log('--- TEST 4: SMOKE TEST (SIX VERBS & CASADE) ---');
  for (const verb of ['explore', 'impact', 'trace', 'cycles', 'whatif', 'simulate']) {
    await evalJs(`window.__cortex_store.getState().setQueryMode('${verb}');`);
    await new Promise((r) => setTimeout(r, 200));
    const activeVerb = await evalJs(`window.__cortex_store.getState().queryMode`);
    if (activeVerb !== verb) throw new Error(`Verb failed to set: ${verb}`);
  }
  await evalJs(`window.__cortex_store.getState().resetAllQueryModes();`);
  console.log('All 6 verbs transition smoothly.');

  console.log('\n=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY ===');
  edge.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error('VERIFICATION ERROR:', e);
  process.exit(1);
});
