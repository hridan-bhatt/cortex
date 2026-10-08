import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9230;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('Launching Headless Edge for Phase 0 Descent Telemetry...');
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
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = id++;
      pending.set(msgId, { resolve });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      console.error('[eval exception]', JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  };

  console.log('Waiting for frontend boot and ready state...');
  for (let i = 0; i < 50; i++) {
    const status = await evalJs(`window.__cortex_store ? window.__cortex_store.getState().status : null`);
    if (status === 'ready') break;
    await sleep(200);
  }

  // Switch to descent mode
  await evalJs(`window.__cortex_store.getState().setMode('descent')`);
  await sleep(1000);

  // ----------------------------------------------------
  // Run Telemetry for VaultX
  // ----------------------------------------------------
  console.log('\n======================================================');
  console.log('0a & 0b: TELEMETRY ON VAULTX');
  console.log('======================================================\n');

  const vaultxTelemetry = await evalJs(`(() => {
    // We recreate the exact math from useDescentCamera to get waypoints, uW, and 400 samples
    const s = window.__cortex_store.getState();
    const positions = s.positions;
    const strataMeta = s.strataMeta;
    const nodeStrata = s.nodeStrata;
    const godClassId = s.godClassId;
    const adapter = s.adapter;
    const isHospital = adapter === 'hospital';
    const narrativeStrata = [0, 1, 2, 3, 4, 7];
    const numBeats = 8;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

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
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const fovRad = (45 * Math.PI) / 180;
    const aspect = 1440 / 900;
    const distH = (height * 1.1) / (2 * Math.tan(fovRad / 2));
    const distW = (width * 1.1) / (2 * Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(distH, distW, 140);

    const framingPos = new THREE.Vector3(
      centerX + 0.18 * width,
      centerY + 0.35 * height + 20,
      centerZ + dist
    );
    const framingLookAt = new THREE.Vector3(centerX, centerY, centerZ);

    const posPoints = [];
    const lookPoints = [];

    // W0: surface framing
    posPoints.push(new THREE.Vector3(centerX, centerY + height * 0.7 + 60, centerZ + 120));
    lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));

    // W1..W6: narrative strata
    narrativeStrata.forEach((sIdx, i) => {
      const meta = strataMeta.find((m) => m.stratumIndex === sIdx);
      if (meta) {
        let bandMaxZ = -Infinity;
        positions.forEach((p, nodeId) => {
          if (nodeStrata.get(nodeId) === sIdx) {
            if (p.z > bandMaxZ) bandMaxZ = p.z;
          }
        });
        if (bandMaxZ === -Infinity) bandMaxZ = centerZ;

        const dx = i % 2 === 0 ? 26 : -26;
        const dy = 7;
        const thinBandComp = meta.nodeCount < 8 ? (8 - meta.nodeCount) * 5 : 0;
        const dz = bandMaxZ + 34 + thinBandComp;

        posPoints.push(new THREE.Vector3(centerX + dx, meta.y + dy, dz));
        lookPoints.push(new THREE.Vector3(centerX, meta.y - meta.sag * 0.5, centerZ));
      } else {
        posPoints.push(new THREE.Vector3(centerX + 26, centerY, centerZ + 40));
        lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));
      }
    });

    // W7: God class orbit
    const godPos = godClassId ? positions.get(godClassId) : null;
    if (godPos) {
      posPoints.push(new THREE.Vector3(godPos.x + 18, godPos.y + 8, godPos.z + 32));
      lookPoints.push(new THREE.Vector3(godPos.x, godPos.y, godPos.z));
    } else {
      posPoints.push(new THREE.Vector3(centerX + 18, centerY + 8, centerZ + 32));
      lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));
    }

    // W8: Final instrument framing
    posPoints.push(framingPos);
    lookPoints.push(framingLookAt);

    // Current CatmullRomCurve3
    const positionCurve = new THREE.CatmullRomCurve3(posPoints, false, 'catmullrom', 0.5);
    const lookAtCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'catmullrom', 0.5);

    const SAMPLE_COUNT = 2000;
    const uWPos = [0];
    const uWLook = [0];
    const sampledPos = [];
    const sampledLook = [];

    for (let s = 0; s <= SAMPLE_COUNT; s++) {
      const u = s / SAMPLE_COUNT;
      sampledPos.push(positionCurve.getPointAt(u));
      sampledLook.push(lookAtCurve.getPointAt(u));
    }

    for (let b = 1; b < numBeats; b++) {
      const targetPos = posPoints[b];
      let bestUPos = b / numBeats;
      let minPosDist = Infinity;
      for (let s = 0; s <= SAMPLE_COUNT; s++) {
        const d = sampledPos[s].distanceTo(targetPos);
        if (d < minPosDist) {
          minPosDist = d;
          bestUPos = s / SAMPLE_COUNT;
        }
      }
      uWPos.push(bestUPos);

      const targetLook = lookPoints[b];
      let bestULook = b / numBeats;
      let minLookDist = Infinity;
      for (let s = 0; s <= SAMPLE_COUNT; s++) {
        const d = sampledLook[s].distanceTo(targetLook);
        if (d < minLookDist) {
          minLookDist = d;
          bestULook = s / SAMPLE_COUNT;
        }
      }
      uWLook.push(bestULook);
    }
    uWPos.push(1.0);
    uWLook.push(1.0);

    // 0a: Waypoint table
    const waypoints = [];
    for (let i = 0; i < posPoints.length; i++) {
      const p = posPoints[i];
      const l = lookPoints[i];
      const pdStart = i === 0 ? 0 : (i - 1) / numBeats;
      const pdEnd = i / numBeats;
      waypoints.push({
        index: 'W' + i,
        pos: [Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))],
        lookAt: [Number(l.x.toFixed(2)), Number(l.y.toFixed(2)), Number(l.z.toFixed(2))],
        uWPos: Number(uWPos[i].toFixed(4)),
        uWLook: Number(uWLook[i].toFixed(4)),
        pdRange: pdStart.toFixed(3) + '..' + pdEnd.toFixed(3),
      });
    }

    // 0b: 400 samples across pd in [0, 1]
    const samples = [];
    const NUM_SAMPLES = 400;
    const reversals = [];

    let prevCamY = null;
    let prevLookY = null;

    for (let i = 0; i <= NUM_SAMPLES; i++) {
      const pd = i / NUM_SAMPLES;
      const rawBeat = Math.min(numBeats - 1, Math.floor(pd * numBeats));
      const local = pd * numBeats - rawBeat;

      const uPos = THREE.MathUtils.lerp(uWPos[rawBeat], uWPos[rawBeat + 1], local);
      const uLook = THREE.MathUtils.lerp(uWLook[rawBeat], uWLook[rawBeat + 1], local);

      const cam = positionCurve.getPointAt(uPos);
      const look = lookAtCurve.getPointAt(uLook);

      const beatNum = rawBeat + 1; // 1-indexed beat

      if (prevCamY !== null) {
        const deltaCamY = cam.y - prevCamY;
        const deltaLookY = look.y - prevLookY;

        // Monotonic descent contract: across beat 1 to beat 6 (strata beats), Y must NOT increase
        // Check if deltaCamY > 0.001
        if (deltaCamY > 0.001) {
          reversals.push({
            type: 'camY',
            pd: Number(pd.toFixed(4)),
            beat: beatNum,
            prevY: Number(prevCamY.toFixed(3)),
            currY: Number(cam.y.toFixed(3)),
            rise: Number(deltaCamY.toFixed(3)),
          });
        }
        if (deltaLookY > 0.001) {
          reversals.push({
            type: 'lookY',
            pd: Number(pd.toFixed(4)),
            beat: beatNum,
            prevY: Number(prevLookY.toFixed(3)),
            currY: Number(look.y.toFixed(3)),
            rise: Number(deltaLookY.toFixed(3)),
          });
        }
      }

      prevCamY = cam.y;
      prevLookY = look.y;

      if (i % 20 === 0) {
        samples.push({
          pd: Number(pd.toFixed(3)),
          beat: beatNum,
          camY: Number(cam.y.toFixed(2)),
          lookY: Number(look.y.toFixed(2)),
        });
      }
    }

    // Group reversals by span
    const reversalSpans = [];
    let currentSpan = null;

    for (const rev of reversals) {
      if (!currentSpan || currentSpan.type !== rev.type || Math.abs(rev.pd - currentSpan.endPd) > (1 / NUM_SAMPLES) * 1.5) {
        if (currentSpan) reversalSpans.push(currentSpan);
        currentSpan = {
          type: rev.type,
          beat: rev.beat,
          startPd: rev.pd,
          endPd: rev.pd,
          startY: rev.prevY,
          endY: rev.currY,
          totalRise: rev.rise,
        };
      } else {
        currentSpan.endPd = rev.pd;
        currentSpan.endY = rev.currY;
        currentSpan.totalRise = Number((currentSpan.totalRise + rev.rise).toFixed(3));
      }
    }
    if (currentSpan) reversalSpans.push(currentSpan);

    return {
      waypoints,
      reversalSpans,
      sampleSlice: samples,
    };
  })()`);

  console.log('[0a Waypoint Table VaultX]:');
  console.table(vaultxTelemetry.waypoints);

  console.log('\n[0b VaultX Reversal Spans (Upward Motion)]:');
  console.log(JSON.stringify(vaultxTelemetry.reversalSpans, null, 2));

  // ----------------------------------------------------
  // Run Telemetry for Hospital
  // ----------------------------------------------------
  console.log('\n======================================================');
  console.log('0a & 0b: TELEMETRY ON HOSPITAL');
  console.log('======================================================\n');

  console.log('Loading hospital...');
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital', true)`);
  for (let i = 0; i < 40; i++) {
    const status = await evalJs(`window.__cortex_store.getState().status`);
    if (status === 'ready') break;
    await sleep(200);
  }
  await sleep(1000);

  const hospTelemetry = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const positions = s.positions;
    const strataMeta = s.strataMeta;
    const nodeStrata = s.nodeStrata;
    const godClassId = s.godClassId;
    const adapter = s.adapter;
    const narrativeStrata = [0, 1, 2];
    const numBeats = 5;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

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
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const fovRad = (45 * Math.PI) / 180;
    const aspect = 1440 / 900;
    const distH = (height * 1.25) / (2 * Math.tan(fovRad / 2));
    const distW = (width * 1.25) / (2 * Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(distH, distW);

    const framingPos = new THREE.Vector3(
      centerX + 0.12 * width,
      centerY + 0.08 * height,
      centerZ + dist
    );
    const framingLookAt = new THREE.Vector3(centerX, centerY, centerZ);

    const posPoints = [];
    const lookPoints = [];

    // W0: surface framing
    posPoints.push(new THREE.Vector3(centerX, centerY + height * 0.7 + 60, centerZ + 120));
    lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));

    // W1..W3: narrative strata
    narrativeStrata.forEach((sIdx, i) => {
      const meta = strataMeta.find((m) => m.stratumIndex === sIdx);
      if (meta) {
        let bandMaxZ = -Infinity;
        positions.forEach((p, nodeId) => {
          if (nodeStrata.get(nodeId) === sIdx) {
            if (p.z > bandMaxZ) bandMaxZ = p.z;
          }
        });
        if (bandMaxZ === -Infinity) bandMaxZ = centerZ;

        const dx = i % 2 === 0 ? 26 : -26;
        const dy = 7;
        const thinBandComp = meta.nodeCount < 8 ? (8 - meta.nodeCount) * 5 : 0;
        const dz = bandMaxZ + 34 + thinBandComp;

        posPoints.push(new THREE.Vector3(centerX + dx, meta.y + dy, dz));
        lookPoints.push(new THREE.Vector3(centerX, meta.y - meta.sag * 0.5, centerZ));
      } else {
        posPoints.push(new THREE.Vector3(centerX + 26, centerY, centerZ + 40));
        lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));
      }
    });

    // W4: God class orbit
    const godPos = godClassId ? positions.get(godClassId) : null;
    if (godPos) {
      posPoints.push(new THREE.Vector3(godPos.x + 18, godPos.y + 8, godPos.z + 32));
      lookPoints.push(new THREE.Vector3(godPos.x, godPos.y, godPos.z));
    } else {
      posPoints.push(new THREE.Vector3(centerX + 18, centerY + 8, centerZ + 32));
      lookPoints.push(new THREE.Vector3(centerX, centerY, centerZ));
    }

    // W5: Final instrument framing
    posPoints.push(framingPos);
    lookPoints.push(framingLookAt);

    const positionCurve = new THREE.CatmullRomCurve3(posPoints, false, 'catmullrom', 0.5);
    const lookAtCurve = new THREE.CatmullRomCurve3(lookPoints, false, 'catmullrom', 0.5);

    const SAMPLE_COUNT = 2000;
    const uWPos = [0];
    const uWLook = [0];
    const sampledPos = [];
    const sampledLook = [];

    for (let s = 0; s <= SAMPLE_COUNT; s++) {
      const u = s / SAMPLE_COUNT;
      sampledPos.push(positionCurve.getPointAt(u));
      sampledLook.push(lookAtCurve.getPointAt(u));
    }

    for (let b = 1; b < numBeats; b++) {
      const targetPos = posPoints[b];
      let bestUPos = b / numBeats;
      let minPosDist = Infinity;
      for (let s = 0; s <= SAMPLE_COUNT; s++) {
        const d = sampledPos[s].distanceTo(targetPos);
        if (d < minPosDist) {
          minPosDist = d;
          bestUPos = s / SAMPLE_COUNT;
        }
      }
      uWPos.push(bestUPos);

      const targetLook = lookPoints[b];
      let bestULook = b / numBeats;
      let minLookDist = Infinity;
      for (let s = 0; s <= SAMPLE_COUNT; s++) {
        const d = sampledLook[s].distanceTo(targetLook);
        if (d < minLookDist) {
          minLookDist = d;
          bestULook = s / SAMPLE_COUNT;
        }
      }
      uWLook.push(bestULook);
    }
    uWPos.push(1.0);
    uWLook.push(1.0);

    const waypoints = [];
    for (let i = 0; i < posPoints.length; i++) {
      const p = posPoints[i];
      const l = lookPoints[i];
      const pdStart = i === 0 ? 0 : (i - 1) / numBeats;
      const pdEnd = i / numBeats;
      waypoints.push({
        index: 'W' + i,
        pos: [Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))],
        lookAt: [Number(l.x.toFixed(2)), Number(l.y.toFixed(2)), Number(l.z.toFixed(2))],
        uWPos: Number(uWPos[i].toFixed(4)),
        uWLook: Number(uWLook[i].toFixed(4)),
        pdRange: pdStart.toFixed(3) + '..' + pdEnd.toFixed(3),
      });
    }

    const reversals = [];
    let prevCamY = null;
    let prevLookY = null;
    const NUM_SAMPLES = 400;

    for (let i = 0; i <= NUM_SAMPLES; i++) {
      const pd = i / NUM_SAMPLES;
      const rawBeat = Math.min(numBeats - 1, Math.floor(pd * numBeats));
      const local = pd * numBeats - rawBeat;

      const uPos = THREE.MathUtils.lerp(uWPos[rawBeat], uWPos[rawBeat + 1], local);
      const uLook = THREE.MathUtils.lerp(uWLook[rawBeat], uWLook[rawBeat + 1], local);

      const cam = positionCurve.getPointAt(uPos);
      const look = lookAtCurve.getPointAt(uLook);
      const beatNum = rawBeat + 1;

      if (prevCamY !== null) {
        const deltaCamY = cam.y - prevCamY;
        const deltaLookY = look.y - prevLookY;

        if (deltaCamY > 0.001) {
          reversals.push({
            type: 'camY',
            pd: Number(pd.toFixed(4)),
            beat: beatNum,
            prevY: Number(prevCamY.toFixed(3)),
            currY: Number(cam.y.toFixed(3)),
            rise: Number(deltaCamY.toFixed(3)),
          });
        }
        if (deltaLookY > 0.001) {
          reversals.push({
            type: 'lookY',
            pd: Number(pd.toFixed(4)),
            beat: beatNum,
            prevY: Number(prevLookY.toFixed(3)),
            currY: Number(look.y.toFixed(3)),
            rise: Number(deltaLookY.toFixed(3)),
          });
        }
      }

      prevCamY = cam.y;
      prevLookY = look.y;
    }

    const reversalSpans = [];
    let currentSpan = null;
    for (const rev of reversals) {
      if (!currentSpan || currentSpan.type !== rev.type || Math.abs(rev.pd - currentSpan.endPd) > (1 / NUM_SAMPLES) * 1.5) {
        if (currentSpan) reversalSpans.push(currentSpan);
        currentSpan = {
          type: rev.type,
          beat: rev.beat,
          startPd: rev.pd,
          endPd: rev.pd,
          startY: rev.prevY,
          endY: rev.currY,
          totalRise: rev.rise,
        };
      } else {
        currentSpan.endPd = rev.pd;
        currentSpan.endY = rev.currY;
        currentSpan.totalRise = Number((currentSpan.totalRise + rev.rise).toFixed(3));
      }
    }
    if (currentSpan) reversalSpans.push(currentSpan);

    return {
      waypoints,
      reversalSpans,
    };
  })()`);

  console.log('[0a Waypoint Table Hospital]:');
  console.table(hospTelemetry.waypoints);

  console.log('\n[0b Hospital Reversal Spans (Upward Motion)]:');
  console.log(JSON.stringify(hospTelemetry.reversalSpans, null, 2));

  await send('Browser.close');
  edge.kill();
  console.log('\nTelemetry finished.');
}

run().catch(console.error);
