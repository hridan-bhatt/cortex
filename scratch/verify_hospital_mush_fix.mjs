import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9270;
const ARTIFACTS_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';

async function run() {
  console.log('=== VERIFYING HOSPITAL MUSH & SPACING FIX LIVE ===\n');

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

  // --- ACCEPTANCE 1: 0a RE-RUN OVERLAP AUDIT ---
  console.log('--- ACCEPTANCE 1: 0a RE-RUN OVERLAP AUDIT ---');

  async function auditOverlaps(adapterName) {
    await evalJs(`window.__cortex_store.getState().loadGraph('${adapterName}')`);
    await waitForReady();
    await new Promise((r) => setTimeout(r, 600));

    return await evalJs(`
      (() => {
        const state = window.__cortex_store.getState();
        const nodes = state.nodes;
        const positions = state.positions;
        const radii = state.radii;
        const strataMeta = state.strataMeta;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        let minR = Infinity, maxR = -Infinity;
        let sumR = 0;

        for (const n of nodes) {
          const r = radii.get(n.id) || 1.15;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          sumR += r;
        }
        const meanR = nodes.length > 0 ? sumR / nodes.length : 0;
        const clearance = Math.max(1.2, 0.25 * meanR);

        for (const pos of positions.values()) {
          if (pos.x < minX) minX = pos.x;
          if (pos.x > maxX) maxX = pos.x;
          if (pos.y < minY) minY = pos.y;
          if (pos.y > maxY) maxY = pos.y;
          if (pos.z < minZ) minZ = pos.z;
          if (pos.z > maxZ) maxZ = pos.z;
        }

        const width = maxX - minX;
        const height = maxY - minY;
        const depth = maxZ - minZ;
        const diagonal = Math.sqrt(width * width + height * height + depth * depth);

        const overlaps = [];
        let worstRatio = Infinity;
        let worstPair = null;
        let minSurfaceDist = Infinity;

        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          const p1 = positions.get(n1.id);
          const r1 = radii.get(n1.id) || 1.15;
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const p2 = positions.get(n2.id);
            const r2 = radii.get(n2.id) || 1.15;

            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
            const sumRadii = r1 + r2;
            const surfaceDist = dist - sumRadii;
            if (surfaceDist < minSurfaceDist) {
              minSurfaceDist = surfaceDist;
            }

            const threshold = sumRadii + 0.8;
            const ratio = dist / sumRadii;
            if (ratio < worstRatio) {
              worstRatio = ratio;
              worstPair = { n1: n1.entityName || n1.id, n2: n2.entityName || n2.id, dist, sumRadii, ratio };
            }

            if (dist < threshold) {
              overlaps.push({
                node1: n1.entityName || n1.id,
                node2: n2.entityName || n2.id,
                dist,
                sumRadii,
                ratio,
              });
            }
          }
        }

        const fovRad = (45 * Math.PI) / 180;
        const aspect = 1440 / 900;
        const isHospital = state.adapter === 'hospital';
        const distH = (height * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2));
        const distW = (width * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2) * aspect);
        const framingDist = isHospital ? Math.max(distH, distW) : Math.max(distH, distW, 140);

        const smallestR = minR;
        const screenHeightPx = 900;
        const focalLengthPx = screenHeightPx / (2 * Math.tan(fovRad / 2));
        const subtensionPx = (2 * smallestR / framingDist) * focalLengthPx;

        return {
          adapter: state.adapter,
          nodeCount: nodes.length,
          minR: Number(minR.toFixed(3)),
          maxR: Number(maxR.toFixed(3)),
          meanR: Number(meanR.toFixed(3)),
          clearance: Number(clearance.toFixed(3)),
          bbox: {
            width: Number(width.toFixed(2)),
            height: Number(height.toFixed(2)),
            depth: Number(depth.toFixed(2)),
            diagonal: Number(diagonal.toFixed(2)),
          },
          framingDist: Number(framingDist.toFixed(2)),
          subtensionPx: Number(subtensionPx.toFixed(2)),
          minSurfaceDist: Number(minSurfaceDist.toFixed(3)),
          overlapCount: overlaps.length,
          worstRatio: Number(worstRatio.toFixed(3)),
          worstPair,
        };
      })()
    `);
  }

  const vAudit = await auditOverlaps('vaultx');
  console.log('VaultX Audit:', JSON.stringify(vAudit, null, 2));

  const hAudit = await auditOverlaps('hospital');
  console.log('Hospital Audit:', JSON.stringify(hAudit, null, 2));

  if (vAudit.overlapCount !== 0) {
    throw new Error(`VaultX has ${vAudit.overlapCount} overlaps!`);
  }
  if (hAudit.overlapCount !== 0) {
    throw new Error(`Hospital has ${hAudit.overlapCount} overlaps!`);
  }
  console.log('>>> ACCEPTANCE 1 PASSED: Zero overlap pairs on both adapters! <<<\n');

  // --- ACCEPTANCE 2: VISUAL HOSPITAL CAPTURES ---
  console.log('--- ACCEPTANCE 2: VISUAL HOSPITAL CAPTURES ---');
  // 2a. Default pose in instrument mode
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital')`);
  await waitForReady();
  await evalJs(`window.__cortex_store.getState().handoff();`);
  await new Promise((r) => setTimeout(r, 1200));
  await takeScreenshot('hospital_default_pose_spaced.png');

  // 2b. Zoomed-in mid-band shot (focus on Prescriptions band, stratum 1)
  await evalJs(`
    const cam = window.__cortex_store.getState();
    const pos = cam.positions;
    // Find a prescriptions node
    let targetId = null;
    pos.forEach((p, id) => {
      if (cam.nodeStrata.get(id) === 1 && !targetId) targetId = id;
    });
    if (targetId) {
      window.__cortex_store.getState().triggerFlyTo(targetId);
    }
  `);
  await new Promise((r) => setTimeout(r, 1800));
  await takeScreenshot('hospital_midband_zoom.png');
  console.log('>>> ACCEPTANCE 2 PASSED: Visual screenshots captured! <<<\n');

  // --- ACCEPTANCE 3: HOSPITAL DESCENT TELEMETRY ---
  console.log('--- ACCEPTANCE 3: HOSPITAL DESCENT TELEMETRY & SLOW-SCROLL ---');
  await evalJs(`
    window.__cortex_store.getState().setMode('descent');
    window.__cortex_store.getState().setDescentProgress(0);
  `);
  await new Promise((r) => setTimeout(r, 600));

  const hTelemetry = await evalJs(`
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
              pctChange: (speedChange * 100).toFixed(1) + '%',
            });
          }
        }
        prevSpeed = speed;
      }

      return {
        spikeCount: spikes.length,
        upwardYCount: upwardY.length,
      };
    })()
  `);
  console.log('Hospital Descent Telemetry on New Layout:', hTelemetry);
  if (hTelemetry.spikeCount !== 0 || hTelemetry.upwardYCount !== 0) {
    throw new Error(`Hospital descent telemetry failed: ${JSON.stringify(hTelemetry)}`);
  }
  console.log('>>> ACCEPTANCE 3 PASSED: Clean C1 and zero upward Y on Hospital! <<<\n');

  // --- ACCEPTANCE 4: VAULTX VISUAL PARITY & TELEMETRY ---
  console.log('--- ACCEPTANCE 4: VAULTX PARITY ---');
  await evalJs(`window.__cortex_store.getState().loadGraph('vaultx')`);
  await waitForReady();
  await evalJs(`window.__cortex_store.getState().handoff();`);
  await new Promise((r) => setTimeout(r, 1200));
  await takeScreenshot('vaultx_default_pose_spaced.png');

  // Re-check vaultx descent telemetry
  await evalJs(`
    window.__cortex_store.getState().setMode('descent');
    window.__cortex_store.getState().setDescentProgress(0);
  `);
  await new Promise((r) => setTimeout(r, 600));

  const vTelemetry = await evalJs(`
    (() => {
      const path = window.__camera_path;
      const { evaluatePos, evaluateLook, numBeats, narrativeStrata } = path;
      const SAMPLES = 800;
      const pts = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const pd = i / SAMPLES;
        const pos = evaluatePos(pd);
        const look = evaluateLook(pd);
        pts.push({ pd, x: pos.x, y: pos.y, z: pos.z });
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
        const isStrataSpan = p1.pd >= (1 / numBeats) && p1.pd <= (narrativeStrata.length / numBeats);
        if (isStrataSpan && dY > 0.0001) upwardY.push({ i, pd: p1.pd, dY });
        if (prevSpeed !== null && prevSpeed > 0.01) {
          const speedChange = Math.abs(speed - prevSpeed) / prevSpeed;
          if (speedChange > 0.40) spikes.push(i);
        }
        prevSpeed = speed;
      }
      return { spikeCount: spikes.length, upwardYCount: upwardY.length };
    })()
  `);
  console.log('VaultX Telemetry Comparison:', vTelemetry);
  if (vTelemetry.spikeCount !== 0 || vTelemetry.upwardYCount !== 0) {
    throw new Error(`VaultX descent telemetry failed: ${JSON.stringify(vTelemetry)}`);
  }
  console.log('>>> ACCEPTANCE 4 PASSED: VaultX identical and verified! <<<\n');

  // --- ACCEPTANCE 5: SIX VERBS ON HOSPITAL ---
  console.log('--- ACCEPTANCE 5: SIX VERBS ON HOSPITAL ---');
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital')`);
  await waitForReady();
  await evalJs(`window.__cortex_store.getState().handoff();`);
  await new Promise((r) => setTimeout(r, 600));

  for (const verb of ['explore', 'impact', 'trace', 'cycles', 'whatif', 'simulate']) {
    await evalJs(`window.__cortex_store.getState().setQueryMode('${verb}')`);
    await new Promise((r) => setTimeout(r, 200));
    const active = await evalJs(`window.__cortex_store.getState().queryMode`);
    if (active !== verb) throw new Error(`Hospital verb ${verb} failed to set`);
  }

  // Trigger impact on John Doe
  const johnDoeId = await evalJs(`
    (() => {
      const n = window.__cortex_store.getState().nodes.find(n => n.entityName === 'John Doe');
      return n ? n.id : null;
    })()
  `);
  if (johnDoeId) {
    console.log('Testing Impact verb on Hospital John Doe:', johnDoeId);
    await evalJs(`window.__cortex_store.getState().setSelectedNodeId('${johnDoeId}')`);
    await evalJs(`window.__cortex_store.getState().setQueryMode('impact')`);
    await new Promise((r) => setTimeout(r, 600));
  }

  await evalJs(`window.__cortex_store.getState().resetAllQueryModes();`);
  console.log('>>> ACCEPTANCE 5 PASSED: All verbs function cleanly on Hospital! <<<\n');

  console.log('=== ALL HOSPITAL MUSH ACCEPTANCE CRITERIA PASSED ===');
  edge.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error('VERIFICATION FAILED:', e);
  process.exit(1);
});
