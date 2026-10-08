import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9280;

async function run() {
  console.log('=== PHASE 0: SCREEN-SPACE MEASUREMENT (LIVE BASELINE) ===\n');

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

  await waitForReady();

  async function measureScreenSpace(adapterName) {
    console.log(`\n======================================================`);
    console.log(`MEASURING SCREEN-SPACE FOR: ${adapterName}`);
    console.log(`======================================================`);

    await evalJs(`window.__cortex_store.getState().loadGraph('${adapterName}')`);
    await waitForReady();
    await evalJs(`window.__cortex_store.getState().handoff();`);
    await new Promise((r) => setTimeout(r, 1500));

    // Measure across 3 camera states: default (1.0x), 1.5x, max (440)
    const result = await evalJs(`
      (() => {
        const state = window.__cortex_store.getState();
        const nodes = state.nodes;
        const positions = state.positions;
        const radii = state.radii;
        const frameDistance = state.frameDistance;

        // Find canvas & three camera
        const canvas = document.querySelector('canvas');
        const W = canvas ? canvas.clientWidth : 1440;
        const H = canvas ? canvas.clientHeight : 900;

        // Compute world center & default framing pose
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
        const worldCenter = new window.THREE.Vector3(centerX, centerY, centerZ);

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
          { name: 'Max Zoom-Out', d: 440 }
        ];

        const stateResults = states.map(({ name, d }) => {
          const camPos = defaultLook.clone().add(camDir.clone().multiplyScalar(d));
          const effectiveFrameDist = frameDistance > 0 ? frameDistance : (isHospital ? 105 : 180);
          const comp = window.THREE.MathUtils.clamp(d / effectiveFrameDist, 1.0, 2.3);

          // Build view & projection matrix
          const camera = new window.THREE.PerspectiveCamera(fov, aspect, 0.5, 2000);
          camera.position.copy(camPos);
          camera.lookAt(defaultLook);
          camera.updateMatrixWorld();
          camera.updateProjectionMatrix();

          // Project every node
          const projectedNodes = [];
          for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const p = positions.get(n.id);
            const baseR = radii.get(n.id) || 1.15;
            if (!p) continue;

            const worldPos = new window.THREE.Vector3(p.x, p.y, p.z);
            const distToCam = worldPos.distanceTo(camPos);

            // Screen position in pixels
            const ndc = worldPos.clone().project(camera);
            const sx = (ndc.x * 0.5 + 0.5) * W;
            const sy = (-ndc.y * 0.5 + 0.5) * H;

            // Pixel radius with distance compensation
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

          // Compute px radius min/mean/max
          let minRPx = Infinity, maxRPx = -Infinity, sumRPx = 0;
          for (const pn of projectedNodes) {
            if (pn.rPx < minRPx) minRPx = pn.rPx;
            if (pn.rPx > maxRPx) maxRPx = pn.rPx;
            sumRPx += pn.rPx;
          }
          const meanRPx = projectedNodes.length > 0 ? sumRPx / projectedNodes.length : 0;

          // Check visual merge pairs: center distance < (r1px + r2px) * 0.9
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

        return {
          adapter: state.adapter,
          nodeCount: nodes.length,
          frameDistance: Number(actualFrameDist.toFixed(2)),
          states: stateResults,
        };
      })()
    `);

    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const vaultx = await measureScreenSpace('vaultx');
  const hospital = await measureScreenSpace('hospital');

  edge.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
