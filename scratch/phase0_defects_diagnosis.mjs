import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9245;

async function run() {
  console.log('=== Phase 0 Telemetry & Diagnosis ===');
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

  console.log('Waiting for graph to be ready...');
  for (let i = 0; i < 40; i++) {
    const ready = await send('Runtime.evaluate', {
      expression: `Boolean(window.__cortex_store && window.__cortex_store.getState().status === 'ready' && window.__camera_path)`,
      returnByValue: true,
    });
    if (ready?.result?.value) break;
    await new Promise((r) => setTimeout(r, 400));
  }

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

  // --- 0c: Trace Boot Sequence & Reload Desync ---
  console.log('\n--- 0c: Boot Sequence & Reload Desync Trace ---');
  const initialBootInfo = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodeCount: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter'),
    topBarAdapter: document.querySelector('header button.border-b-2')?.innerText || 'none'
  })`);
  console.log('Initial Boot State:', initialBootInfo);

  console.log('Switching to hospital...');
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital', true);`);
  await new Promise((r) => setTimeout(r, 1500));

  const switchedInfo = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodeCount: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter'),
  })`);
  console.log('After switch to hospital:', switchedInfo);

  console.log('Reloading page...');
  await send('Page.reload');
  for (let i = 0; i < 40; i++) {
    const ready = await send('Runtime.evaluate', {
      expression: `Boolean(window.__cortex_store && window.__cortex_store.getState().status === 'ready' && window.__camera_path)`,
      returnByValue: true,
    });
    if (ready?.result?.value) break;
    await new Promise((r) => setTimeout(r, 400));
  }

  const reloadedInfo = await evalJs(`({
    storeAdapter: window.__cortex_store.getState().adapter,
    nodeCount: window.__cortex_store.getState().nodes.length,
    localAdapter: localStorage.getItem('cortex.adapter'),
  })`);
  console.log('After Reload State (CONFIRMED DESYNC):', reloadedInfo);

  // --- 0a & 0b: Sample Active Camera Path for Spikes and Monotonicity ---
  async function sampleCameraTelemetry(adapterName) {
    console.log(`\n--- 0a/0b: Camera Telemetry for ${adapterName} ---`);
    if (await evalJs(`window.__cortex_store.getState().adapter !== '${adapterName}'`)) {
      await evalJs(`window.__cortex_store.getState().loadGraph('${adapterName}', true);`);
      await new Promise((r) => setTimeout(r, 1500));
    }

    const telemetry = await evalJs(`
      (() => {
        const path = window.__camera_path;
        if (!path) return { error: 'no path' };
        const { positionCurve, lookAtCurve, uWPos, uWLook, numBeats, posPoints, lookPoints } = path;

        const SAMPLES = 800;
        const pts = [];
        for (let i = 0; i <= SAMPLES; i++) {
          const pd = i / SAMPLES;
          const rawBeat = Math.min(numBeats - 1, Math.floor(pd * numBeats));
          const local = pd * numBeats - rawBeat;

          const uPos = window.THREE.MathUtils.lerp(uWPos[rawBeat], uWPos[rawBeat + 1], local);
          const uLook = window.THREE.MathUtils.lerp(uWLook[rawBeat], uWLook[rawBeat + 1], local);

          const c = positionCurve.getPointAt(uPos);
          const l = lookAtCurve.getPointAt(uLook);
          pts.push({ pd, beat: rawBeat, x: c.x, y: c.y, z: c.z, lx: l.x, ly: l.y, lz: l.z, uPos, uLook });
        }

        const spikes = [];
        const upwardY = [];
        const dpd = 1 / SAMPLES;

        let prevVY = null;
        let prevSpeed = null;

        for (let i = 1; i <= SAMPLES; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];

          const dX = p1.x - p0.x;
          const dY = p1.y - p0.y;
          const dZ = p1.z - p0.z;

          const dLY = p1.ly - p0.ly;

          const vY = dY / dpd;
          const hSpeed = Math.sqrt(dX * dX + dZ * dZ) / dpd;
          const speed = Math.sqrt(dX * dX + dY * dY + dZ * dZ) / dpd;

          // Beats 1 to (numBeats - 2) are strata descent beats
          const isStrataBeat = p1.beat >= 1 && p1.beat <= (numBeats - 2);
          if (isStrataBeat && dY > 0.001) {
            upwardY.push({ i, pd: p1.pd, beat: p1.beat, dY, vY, y0: p0.y, y1: p1.y });
          }

          if (prevSpeed !== null && prevSpeed > 0.01) {
            const speedChange = Math.abs(speed - prevSpeed) / prevSpeed;
            if (speedChange > 0.40) {
              spikes.push({
                i,
                pd: p1.pd,
                beat: p1.beat,
                prevSpeed: prevSpeed.toFixed(2),
                currSpeed: speed.toFixed(2),
                pctChange: (speedChange * 100).toFixed(1) + '%',
                vY: vY.toFixed(2),
              });
            }
          }

          prevVY = vY;
          prevSpeed = speed;
        }

        const waypoints = posPoints.map((p, idx) => ({
          idx,
          pos: [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)],
          look: [lookPoints[idx].x.toFixed(1), lookPoints[idx].y.toFixed(1), lookPoints[idx].z.toFixed(1)],
          uWPos: uWPos[idx]?.toFixed(4),
        }));

        return {
          numBeats,
          waypoints,
          spikeCount: spikes.length,
          spikes: spikes.slice(0, 15),
          upwardYCount: upwardY.length,
          upwardY: upwardY.slice(0, 15),
        };
      })()
    `);

    console.log(`Waypoints count: ${telemetry.waypoints?.length}`);
    console.log(`Spikes (|delta velocity| > 40%): ${telemetry.spikeCount}`);
    if (telemetry.spikes.length > 0) {
      console.log('Sample spikes:', JSON.stringify(telemetry.spikes, null, 2));
    }
    console.log(`Upward Y steps in strata beats: ${telemetry.upwardYCount}`);
    if (telemetry.upwardY.length > 0) {
      console.log('Sample upward Y steps:', JSON.stringify(telemetry.upwardY, null, 2));
    }
  }

  await sampleCameraTelemetry('vaultx');
  await sampleCameraTelemetry('hospital');

  edge.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
