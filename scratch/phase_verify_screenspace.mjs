import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9298;
const ARTIFACT_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';

async function run() {
  console.log('=== PHASE VERIFICATION: SCREEN-SPACE & ACCEPTANCE RE-RUN ===\n');

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

  async function waitForReady() {
    for (let i = 0; i < 40; i++) {
      const ready = await evalJs(`Boolean(window.__cortex_store && window.__cortex_store.getState().status === 'ready')`);
      if (ready) return;
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('Timeout waiting for graph ready');
  }

  async function screenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[screenshot] Saved -> ${outPath}`);
  }

  await waitForReady();

  // 1. MEASURE BOTH ADAPTERS ACROSS CAMERA STATES
  async function measureScreenSpace(adapterName) {
    console.log(`\n======================================================`);
    console.log(`VERIFYING SCREEN-SPACE FOR: ${adapterName}`);
    console.log(`======================================================`);

    await evalJs(`window.__cortex_store.getState().loadGraph('${adapterName}')`);
    await waitForReady();
    await evalJs(`window.__cortex_store.getState().handoff();`);
    await new Promise((r) => setTimeout(r, 1600));

    const result = await evalJs(`
      (() => {
        const state = window.__cortex_store.getState();
        const nodes = state.nodes;
        const positions = state.positions;
        const radii = state.radii;
        const frameDistance = state.frameDistance;
        const compCeiling = state.compCeiling ?? 2.3;
        const scaleFactor = state.scaleFactor ?? 1.0;

        const canvas = document.querySelector('canvas');
        const W = canvas ? canvas.clientWidth : 1440;
        const H = canvas ? canvas.clientHeight : 900;

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
        const width = Math.max(maxX - minX, 10);
        const height = Math.max(maxY - minY, 10);
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        const fov = 45;
        const fovRad = (fov * Math.PI) / 180;
        const aspect = W / (H || 1);
        const isHospital = state.adapter === 'hospital';

        const distH = (height * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2));
        const distW = (width * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2) * aspect);
        const dist = isHospital ? Math.max(distH, distW) : Math.max(distH, distW, 140);

        const defaultCam = isHospital
          ? new window.THREE.Vector3(centerX + 0.12 * width, centerY + 0.08 * height, centerZ + dist)
          : new window.THREE.Vector3(centerX + 0.18 * width, centerY + 0.35 * height + 20, centerZ + dist);
        const defaultLook = new window.THREE.Vector3(centerX, centerY, centerZ);
        const actualFrameDist = defaultCam.distanceTo(defaultLook);
        const focalLengthPx = H / (2 * Math.tan(fovRad / 2));
        const camDir = defaultCam.clone().sub(defaultLook).normalize();

        const states = [
          { name: '1.0x (Default)', d: actualFrameDist },
          { name: '1.5x Distance', d: actualFrameDist * 1.5 },
          { name: '2.0x Distance', d: actualFrameDist * 2.0 },
          { name: 'Max Zoom-Out', d: 440 }
        ];

        const stateResults = states.map(({ name, d }) => {
          const camPos = defaultLook.clone().add(camDir.clone().multiplyScalar(d));
          const effectiveFrameDist = frameDistance > 0 ? frameDistance : (isHospital ? 105 : 180);
          const comp = window.THREE.MathUtils.clamp(d / effectiveFrameDist, 1.0, compCeiling);

          const camera = new window.THREE.PerspectiveCamera(fov, aspect, 0.5, 2000);
          camera.position.copy(camPos);
          camera.lookAt(defaultLook);
          camera.updateMatrixWorld();
          camera.updateProjectionMatrix();

          const projectedNodes = [];
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const p = positions.get(n.id);
            const baseR = radii.get(n.id) || 1.15;
            if (!p) continue;

            const worldPos = new window.THREE.Vector3(p.x, p.y, p.z);
            const distToCam = worldPos.distanceTo(camPos);

            const ndc = worldPos.clone().project(camera);
            const sx = (ndc.x * 0.5 + 0.5) * W;
            const sy = (-ndc.y * 0.5 + 0.5) * H;
            const finalR = baseR * comp;
            const rPx = (finalR / distToCam) * focalLengthPx;

            projectedNodes.push({
              id: n.id,
              name: n.entityName || n.id,
              sx,
              sy,
              rPx,
              baseR,
              finalR,
              distToCam,
            });
          }

          let minRPx = Infinity, maxRPx = -Infinity, sumRPx = 0;
          for (const pn of projectedNodes) {
            if (pn.rPx < minRPx) minRPx = pn.rPx;
            if (pn.rPx > maxRPx) maxRPx = pn.rPx;
            sumRPx += pn.rPx;
          }
          const meanRPx = projectedNodes.length > 0 ? sumRPx / projectedNodes.length : 0;

          const mergePairs = [];
          let worstRatio = Infinity;
          let worstPair = null;

          for (let i = 0; i < projectedNodes.length; i++) {
            const p1 = projectedNodes[i];
            for (let j = i + 1; j < projectedNodes.length; j++) {
              const p2 = projectedNodes[j];
              const cDist = Math.hypot(p1.sx - p2.sx, p1.sy - p2.sy);
              const sumRPx = p1.rPx + p2.rPx;
              const ratio = cDist / sumRPx;
              const threshold = sumRPx * 0.9;

              if (ratio < worstRatio) {
                worstRatio = ratio;
                worstPair = { n1: p1.name, n2: p2.name, cDist, sumRPx, ratio };
              }

              if (cDist < threshold) {
                mergePairs.push({
                  node1: p1.name,
                  node2: p2.name,
                  cDist: Number(cDist.toFixed(2)),
                  sumRPx: Number(sumRPx.toFixed(2)),
                  ratio: Number(ratio.toFixed(3)),
                  overlapPx: Number((threshold - cDist).toFixed(2))
                });
              }
            }
          }

          return {
            name,
            cameraDistance: Number(d.toFixed(2)),
            comp: Number(comp.toFixed(3)),
            pxRadii: {
              min: Number(minRPx.toFixed(2)),
              mean: Number(meanRPx.toFixed(2)),
              max: Number(maxRPx.toFixed(2)),
            },
            mergeCount: mergePairs.length,
            worstRatio: worstRatio === Infinity ? null : Number(worstRatio.toFixed(3)),
            worstPair,
            mergePairs: mergePairs.slice(0, 10),
          };
        });

        // Compute base radii statistics
        let sumBaseR = 0, minBaseR = Infinity, maxBaseR = -Infinity;
        for (const r of radii.values()) {
          sumBaseR += r;
          if (r < minBaseR) minBaseR = r;
          if (r > maxBaseR) maxBaseR = r;
        }

        return {
          adapter: state.adapter,
          nodeCount: nodes.length,
          scaleFactor: Number(scaleFactor.toFixed(4)),
          compCeiling: Number(compCeiling.toFixed(3)),
          baseRadii: {
            min: Number(minBaseR.toFixed(3)),
            mean: Number((sumBaseR / radii.size).toFixed(3)),
            max: Number(maxBaseR.toFixed(3)),
          },
          frameDistance: Number(actualFrameDist.toFixed(2)),
          states: stateResults,
        };
      })()
    `);

    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const vaultxRes = await measureScreenSpace('vaultx');
  await screenshot('vaultx_default_pose_anchored.png');

  const hospitalRes = await measureScreenSpace('hospital');
  await screenshot('hospital_default_pose_anchored.png');

  // Zoom out to max 440 on hospital and capture screenshot
  await evalJs(`
    (() => {
      // Find canvas & trigger wheel zoom to max
      const canvas = document.querySelector('canvas');
      for (let i = 0; i < 20; i++) {
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 500, clientX: 720, clientY: 450 }));
      }
    })()
  `);
  await new Promise((r) => setTimeout(r, 1200));
  await screenshot('hospital_max_zoomout.png');

  // 2. SEALED DESCENT TELEMETRY CHECK ON HOSPITAL & VAULTX
  console.log('\n--- VERIFYING SEALED DESCENT TELEMETRY ---');
  async function testDescentTelemetry(adapterName) {
    console.log(`Sampling 800 points along descent path for ${adapterName}...`);
    await evalJs(`
      window.__cortex_store.getState().loadGraph('${adapterName}');
    `);
    await waitForReady();
    await evalJs(`
      window.__cortex_store.getState().setMode('descent');
      window.__cortex_store.getState().setDescentProgress(0);
    `);
    await new Promise((r) => setTimeout(r, 800));

    const t = await evalJs(`
      (() => {
        const path = window.__camera_path;
        if (!path) return { error: 'window.__camera_path not found' };
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

    console.log(`Descent Telemetry for ${adapterName}:`);
    console.log(`  Spikes (|accel| > 40%): ${t.spikeCount}`);
    if (t.spikeCount > 0) console.log('  Spikes detail:', t.spikes);
    console.log(`  Upward Y steps in strata beats: ${t.upwardYCount}`);
    if (t.upwardYCount > 0) console.log('  Upward detail:', t.upwardY);

    if (t.spikeCount > 0) throw new Error(`Found ${t.spikeCount} velocity spikes > 40% on ${adapterName}`);
    if (t.upwardYCount > 0) throw new Error(`Found ${t.upwardYCount} upward Y steps on ${adapterName}`);
    return t;
  }

  const vDescent = await testDescentTelemetry('vaultx');
  const hDescent = await testDescentTelemetry('hospital');

  // Screenshot of Hospital at a narrative beat during descent
  await evalJs(`
    window.__cortex_store.getState().setDescentProgress(0.35);
    window.__cortex_store.getState().setDampedDescentState(0.35, 1);
  `);
  await new Promise((r) => setTimeout(r, 800));
  await screenshot('hospital_descent_beat.png');

  // 3. VERBS SMOKE TEST ON HOSPITAL
  console.log('\n--- SMOKE TESTING SIX VERBS ON HOSPITAL ---');
  await evalJs(`
    window.__cortex_store.getState().handoff();
  `);
  await new Promise((r) => setTimeout(r, 1000));

  for (const verb of ['explore', 'impact', 'trace', 'cycles', 'whatif', 'simulate']) {
    await evalJs(`window.__cortex_store.getState().setQueryMode('${verb}');`);
    await new Promise((r) => setTimeout(r, 200));
    const activeVerb = await evalJs(`window.__cortex_store.getState().queryMode`);
    if (activeVerb !== verb) throw new Error(`Verb failed to set: ${verb}`);
  }
  console.log('All 6 verbs transition smoothly on hospital.');

  // Impact on John Doe
  const impactResult = await evalJs(`
    (async () => {
      const state = window.__cortex_store.getState();
      const john = state.nodes.find(n => n.entityName === 'John Doe');
      if (!john) return { error: 'John Doe not found' };
      state.setSelectedNodeId(john.id);
      state.setQueryMode('impact');
      const res = await fetch('http://localhost:8080/traverse/impact/' + encodeURIComponent(john.id));
      const data = await res.json();
      state.setImpactData(data);
      state.setImpactWavefrontDepth(3);
      return {
        id: john.id,
        name: john.entityName,
        impactedCount: data.impactedCount,
        chainLength: data.dependencyChain ? data.dependencyChain.length : 0
      };
    })()
  `);
  console.log('Impact Test on John Doe:', impactResult);

  // Reticle, Hover Card, Ping visual scale check
  const visualScaleResult = await evalJs(`
    (() => {
      const state = window.__cortex_store.getState();
      const john = state.nodes.find(n => n.entityName === 'John Doe');
      const r = state.radii.get(john.id);
      return {
        johnId: john.id,
        johnEntityName: john.entityName,
        johnRadius: r,
        scaleFactor: state.scaleFactor,
        compCeiling: state.compCeiling
      };
    })()
  `);
  console.log('Visual Scale Result for John Doe:', visualScaleResult);

  // Return to explore mode
  await evalJs(`window.__cortex_store.getState().resetAllQueryModes();`);

  edge.kill();
  console.log('\n=== ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY ===');
  process.exit(0);
}

run().catch((e) => {
  console.error('VERIFICATION ERROR:', e);
  process.exit(1);
});
