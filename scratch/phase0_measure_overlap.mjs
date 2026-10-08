import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9260;

async function run() {
  console.log('=== PHASE 0: MEASURING OVERLAP ON BOTH ADAPTERS ===\n');

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

  async function analyzeAdapter(adapterName) {
    console.log(`\n========================================`);
    console.log(`ANALYZING ADAPTER: ${adapterName}`);
    console.log(`========================================`);

    await evalJs(`window.__cortex_store.getState().loadGraph('${adapterName}')`);
    await waitForReady();
    await new Promise((r) => setTimeout(r, 600));

    const analysis = await evalJs(`
      (() => {
        const state = window.__cortex_store.getState();
        const nodes = state.nodes;
        const positions = state.positions;
        const radii = state.radii;
        const strataMeta = state.strataMeta;
        const degrees = state.degrees;

        const nodeCount = nodes.length;
        let minR = Infinity, maxR = -Infinity;
        let sumR = 0;

        for (const n of nodes) {
          const r = radii.get(n.id) || 1.15;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          sumR += r;
        }
        const meanR = nodeCount > 0 ? sumR / nodeCount : 0;

        // Bounding box
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
        const depth = maxZ - minZ;
        const diagonal = Math.sqrt(width * width + height * height + depth * depth);

        // Check all pairs for overlap: distance < (r1 + r2 + 0.8)
        const overlaps = [];
        let worstRatio = Infinity;
        let worstPair = null;

        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          const p1 = positions.get(n1.id);
          const r1 = radii.get(n1.id) || 1.15;
          if (!p1) continue;

          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const p2 = positions.get(n2.id);
            const r2 = radii.get(n2.id) || 1.15;
            if (!p2) continue;

            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            const dz = p1.z - p2.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const sumRadii = r1 + r2;
            const threshold = sumRadii + 0.8;

            if (dist < threshold) {
              const ratio = dist / sumRadii;
              if (ratio < worstRatio) {
                worstRatio = ratio;
                worstPair = { n1: n1.entityName || n1.id, n2: n2.entityName || n2.id, dist, sumRadii, ratio };
              }
              overlaps.push({
                node1: n1.entityName || n1.id,
                node2: n2.entityName || n2.id,
                r1: Number(r1.toFixed(3)),
                r2: Number(r2.toFixed(3)),
                sumRadii: Number(sumRadii.toFixed(3)),
                dist: Number(dist.toFixed(3)),
                ratio: Number(ratio.toFixed(3)),
                dx: Number(dx.toFixed(2)),
                dy: Number(dy.toFixed(2)),
                dz: Number(dz.toFixed(2)),
              });
            }
          }
        }

        // Compute framing distance (matching useDescentCamera logic)
        const fovRad = (45 * Math.PI) / 180;
        const aspect = 1440 / 900;
        const isHospital = state.adapter === 'hospital';
        const distH = (height * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2));
        const distW = (width * (isHospital ? 1.25 : 1.1)) / (2 * Math.tan(fovRad / 2) * aspect);
        const framingDist = isHospital ? Math.max(distH, distW) : Math.max(distH, distW, 140);

        return {
          adapter: state.adapter,
          nodeCount,
          minR: Number(minR.toFixed(3)),
          maxR: Number(maxR.toFixed(3)),
          meanR: Number(meanR.toFixed(3)),
          bbox: {
            minX: Number(minX.toFixed(2)), maxX: Number(maxX.toFixed(2)), width: Number(width.toFixed(2)),
            minY: Number(minY.toFixed(2)), maxY: Number(maxY.toFixed(2)), height: Number(height.toFixed(2)),
            minZ: Number(minZ.toFixed(2)), maxZ: Number(maxZ.toFixed(2)), depth: Number(depth.toFixed(2)),
            diagonal: Number(diagonal.toFixed(2)),
          },
          framingDist: Number(framingDist.toFixed(2)),
          strata: strataMeta.map(s => ({
            stratumIndex: s.stratumIndex,
            label: s.label,
            nodeCount: s.nodeCount,
            bandWidth: Number(s.bandWidth.toFixed(2)),
            y: Number(s.y.toFixed(2)),
            sag: s.sag
          })),
          overlapCount: overlaps.length,
          worstRatio: worstRatio === Infinity ? null : Number(worstRatio.toFixed(3)),
          worstPair,
          overlaps: overlaps.slice(0, 20),
        };
      })()
    `);

    console.log(`Node count: ${analysis.nodeCount}`);
    console.log(`Radius range: [${analysis.minR}, ${analysis.maxR}], mean: ${analysis.meanR}`);
    console.log(`Bounding Box: width=${analysis.bbox.width}, height=${analysis.bbox.height}, depth=${analysis.bbox.depth}, diag=${analysis.bbox.diagonal}`);
    console.log(`Framing distance: ${analysis.framingDist}`);
    console.log(`Strata:`, JSON.stringify(analysis.strata, null, 2));
    console.log(`Overlap pairs (dist < r1 + r2 + 0.8): ${analysis.overlapCount}`);
    console.log(`Worst overlap ratio: ${analysis.worstRatio}`);
    if (analysis.worstPair) {
      console.log(`Worst pair: ${analysis.worstPair.n1} <-> ${analysis.worstPair.n2}, dist=${analysis.worstPair.dist.toFixed(3)}, sumRadii=${analysis.worstPair.sumRadii.toFixed(3)}, ratio=${analysis.worstPair.ratio.toFixed(3)}`);
    }
    if (analysis.overlaps.length > 0) {
      console.log(`Sample overlaps:\n`, JSON.stringify(analysis.overlaps.slice(0, 10), null, 2));
    }
    return analysis;
  }

  const vaultxAnalysis = await analyzeAdapter('vaultx');
  const hospitalAnalysis = await analyzeAdapter('hospital');

  edge.kill();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
