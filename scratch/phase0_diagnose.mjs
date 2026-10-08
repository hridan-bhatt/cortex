import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9227;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==========================================
// 0b: BACKEND DUPLICATE & ACCUMULATION SCAN
// ==========================================
async function run0b() {
  console.log('\n======================================================');
  console.log('PHASE 0b: BACKEND DUPLICATE SCAN & ACCUMULATION TEST');
  console.log('======================================================\n');

  // 1. Ingest vaultx
  console.log('[0b] 1. Ingesting vaultx (Pass 1)...');
  const resp1 = await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });
  const data1 = await resp1.json();
  console.log('[0b] Pass 1 ingest response:', JSON.stringify(data1));

  const g1 = await fetch('http://localhost:8080/graph?limit=5000').then((r) => r.json());
  const nodes1Count = g1.nodes ? g1.nodes.length : 0;
  const edges1Count = g1.edges ? g1.edges.length : 0;
  console.log(`[0b] Pass 1 VaultX graph: nodes=${nodes1Count}, edges=${edges1Count}`);

  // Duplicate scan on vaultx
  const vaultxByName = new Map();
  for (const n of (g1.nodes || [])) {
    if (!vaultxByName.has(n.entityName)) vaultxByName.set(n.entityName, []);
    vaultxByName.get(n.entityName).push(n);
  }
  const vaultxDupes = Array.from(vaultxByName.entries()).filter(([k, v]) => v.length > 1);
  console.log(`[0b] VaultX duplicate entityNames count: ${vaultxDupes.length}`);
  for (const [name, list] of vaultxDupes) {
    const details = list.map((n) => {
      const deg = g1.edges.filter((e) => e.sourceId === n.id || e.targetId === n.id).length;
      return { id: n.id, entityId: n.entityId, entityType: n.entityType, degree: deg };
    });
    console.log(`  - "${name}" (${list.length} instances):`, JSON.stringify(details));
  }

  // 2. Ingest hospital
  console.log('\n[0b] 2. Ingesting hospital (Pass 2)...');
  const resp2 = await fetch('http://localhost:8080/ingest?adapter=hospital', { method: 'POST' });
  const data2 = await resp2.json();
  console.log('[0b] Pass 2 ingest response:', JSON.stringify(data2));

  const g2 = await fetch('http://localhost:8080/graph?limit=5000').then((r) => r.json());
  const nodes2Count = g2.nodes ? g2.nodes.length : 0;
  const edges2Count = g2.edges ? g2.edges.length : 0;
  console.log(`[0b] Pass 2 Hospital graph: nodes=${nodes2Count}, edges=${edges2Count}`);

  // Duplicate scan on hospital
  const hospByName = new Map();
  for (const n of (g2.nodes || [])) {
    if (!hospByName.has(n.entityName)) hospByName.set(n.entityName, []);
    hospByName.get(n.entityName).push(n);
  }
  const hospDupes = Array.from(hospByName.entries()).filter(([k, v]) => v.length > 1);
  console.log(`[0b] Hospital duplicate entityNames count: ${hospDupes.length}`);

  // 3. Ingest vaultx again
  console.log('\n[0b] 3. Ingesting vaultx again (Pass 3)...');
  const resp3 = await fetch('http://localhost:8080/ingest?adapter=vaultx', { method: 'POST' });
  const data3 = await resp3.json();
  console.log('[0b] Pass 3 ingest response:', JSON.stringify(data3));

  const g3 = await fetch('http://localhost:8080/graph?limit=5000').then((r) => r.json());
  const nodes3Count = g3.nodes ? g3.nodes.length : 0;
  const edges3Count = g3.edges ? g3.edges.length : 0;
  console.log(`[0b] Pass 3 VaultX graph: nodes=${nodes3Count}, edges=${edges3Count}`);

  console.log('\n[0b] ACCUMULATION VERDICT:');
  console.log(`  Pass 1 VaultX: nodes=${nodes1Count}, edges=${edges1Count}`);
  console.log(`  Pass 2 Hospital: nodes=${nodes2Count}, edges=${edges2Count}`);
  console.log(`  Pass 3 VaultX: nodes=${nodes3Count}, edges=${edges3Count}`);
  if (nodes1Count === nodes3Count && edges1Count === edges3Count) {
    console.log('  >>> PASS: Graph counts match exactly. Backend clears graph upon ingest (NO ACCUMULATION across ingests).');
  } else {
    console.log('  >>> FAIL / ACCUMULATION BUG: Pass 1 count != Pass 3 count!');
  }

  return { g1, g2, g3, vaultxDupes, hospDupes };
}

// ==========================================
// 0a, 0c, 0d, 0e: HEADLESS BROWSER AUDIT
// ==========================================
async function runBrowserAudit() {
  console.log('\n======================================================');
  console.log('LAUNCHING HEADLESS EDGE FOR 0a, 0c, 0d, 0e');
  console.log('======================================================\n');

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

  console.log('Waiting for app ready...');
  await sleep(4000);

  // Transition to instrument mode
  await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    s.setMode('instrument');
  })()`);
  await sleep(1000);

  // ------------------------------------------------------
  // 0a. ADAPTER DESYNC TRACE
  // ------------------------------------------------------
  console.log('\n======================================================');
  console.log('PHASE 0a: ADAPTER DESYNC TRACE');
  console.log('======================================================\n');

  async function getTransitionState(label) {
    return await evalJs(`(() => {
      const s = window.__cortex_store.getState();
      const nodes = s.nodes || [];
      const types = {};
      let unclassifiedCount = 0;
      for (const n of nodes) {
        types[n.entityType] = (types[n.entityType] || 0) + 1;
        const stratum = s.nodeStrata ? s.nodeStrata.get(n.id) : undefined;
        if (stratum === undefined || stratum === 6) {
          unclassifiedCount++;
        }
      }
      const sortedTypes = Object.entries(types).sort((a,b) => b[1] - a[1]);
      const topType = sortedTypes[0] ? sortedTypes[0][0] + ' (' + sortedTypes[0][1] + ')' : 'none';
      const unclassPct = nodes.length > 0 ? ((unclassifiedCount / nodes.length) * 100).toFixed(1) + '%' : '0%';

      // TopBar active adapter text
      const activeBtn = document.querySelector('button.border-b-2');
      const topBarRendered = activeBtn ? activeBtn.textContent.trim() : 'none';

      return {
        label: '${label}',
        storeAdapter: s.adapter,
        nodeCount: nodes.length,
        edgeCount: (s.edges || []).length,
        topEntityType: topType,
        unclassifiedCount,
        unclassifiedPct: unclassPct,
        topBarRendered,
      };
    })()`);
  }

  // Step 1: Initial load
  const step1 = await getTransitionState('1. Initial Load');
  console.log('[0a] Transition 1 (Initial Load):', JSON.stringify(step1, null, 2));

  // Step 2: Switch to hospital
  console.log('\n[0a] Switching to hospital...');
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital', true)`);
  await sleep(3000);
  const step2 = await getTransitionState('2. Switch to Hospital');
  console.log('[0a] Transition 2 (Switch to Hospital):', JSON.stringify(step2, null, 2));

  // Step 3: Replay intro
  console.log('\n[0a] Replaying intro...');
  await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    s.setMode('descent');
    s.setDescentProgress(0);
    window.scrollTo(0, 0);
  })()`);
  await sleep(1500);
  const step3 = await getTransitionState('3. Replay Intro (in descent mode)');
  console.log('[0a] Transition 3 (Replay Intro):', JSON.stringify(step3, null, 2));

  // Return to instrument mode
  await evalJs(`window.__cortex_store.getState().setMode('instrument')`);
  await sleep(1000);
  const step3b = await getTransitionState('3b. Return to Instrument after Intro');
  console.log('[0a] Transition 3b (Return to Instrument):', JSON.stringify(step3b, null, 2));

  // Step 4: Switch back to vaultx
  console.log('\n[0a] Switching back to vaultx...');
  await evalJs(`window.__cortex_store.getState().loadGraph('vaultx', true)`);
  await sleep(3000);
  const step4 = await getTransitionState('4. Switch back to VaultX');
  console.log('[0a] Transition 4 (Switch back to VaultX):', JSON.stringify(step4, null, 2));

  // ------------------------------------------------------
  // 0c. FIBER COLOR AUDIT
  // ------------------------------------------------------
  console.log('\n======================================================');
  console.log('PHASE 0c: FIBER COLOR AUDIT (explore mode, REST)');
  console.log('======================================================\n');

  const fiberAudit = await evalJs(`(() => {
    const fiberMesh = window.__fiber_mesh;
    if (!fiberMesh) return { error: 'No window.__fiber_mesh available' };

    const colorAttr = fiberMesh.geometry.getAttribute('color');
    if (!colorAttr) return { error: 'Fiber geometry has no color attribute' };

    const arr = colorAttr.array;
    const vertexCount = colorAttr.count;
    const samples = [];
    const step = Math.floor(vertexCount / 10);

    const toHex = (r, g, b) => {
      const rh = Math.round(Math.min(1, Math.max(0, r)) * 255).toString(16).padStart(2, '0');
      const gh = Math.round(Math.min(1, Math.max(0, g)) * 255).toString(16).padStart(2, '0');
      const bh = Math.round(Math.min(1, Math.max(0, b)) * 255).toString(16).padStart(2, '0');
      return '#' + rh + gh + bh;
    };

    for (let i = 0; i < 10; i++) {
      const v = i * step;
      const r = arr[v * 3];
      const g = arr[v * 3 + 1];
      const b = arr[v * 3 + 2];
      samples.push({
        vertexIndex: v,
        rgb: [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3))],
        hex: toHex(r, g, b)
      });
    }

    return {
      totalVertices: vertexCount,
      samples,
    };
  })()`);

  console.log('[0c] Fiber Color Buffer Audit at REST:', JSON.stringify(fiberAudit, null, 2));

  // ------------------------------------------------------
  // 0d. LABEL CAP AUDIT (Highest-degree node hover)
  // ------------------------------------------------------
  console.log('\n======================================================');
  console.log('PHASE 0d: LABEL CAP AUDIT & HIGHEST-DEGREE HOVER');
  console.log('======================================================\n');

  const labelAudit = await evalJs(`(async () => {
    const s = window.__cortex_store.getState();
    const godId = s.godClassId;
    const godName = s.godClassName;
    const godDeg = s.godClassOutDegree;

    // Set hovered node to god class
    s.setHoveredNodeId(godId);
    await new Promise(r => setTimeout(r, 800));

    // Find cards and labels
    const allDivs = Array.from(document.querySelectorAll('div'));
    const cardEl = allDivs.find(d => d.className && typeof d.className === 'string' && d.className.includes('bg-surface/95'));
    const neighborLabelEls = allDivs.filter(d => d.className && typeof d.className === 'string' && d.className.includes('bg-surface/80'));

    return {
      godId,
      godName,
      godDeg,
      hoveredNodeId: s.hoveredNodeId,
      neighborLabelsCount: neighborLabelEls.length,
      sampleNeighborLabels: neighborLabelEls.slice(0, 5).map(el => el.textContent.trim()),
      hasHoverCard: Boolean(cardEl),
      cardText: cardEl ? cardEl.innerText : null,
      cardRect: cardEl ? {
        top: cardEl.getBoundingClientRect().top,
        left: cardEl.getBoundingClientRect().left,
        width: cardEl.getBoundingClientRect().width,
        height: cardEl.getBoundingClientRect().height,
      } : null,
    };
  })()`);

  console.log('[0d] Highest-degree node hover audit:', JSON.stringify(labelAudit, null, 2));

  // ------------------------------------------------------
  // 0e. STRAY GEOMETRY INVENTORY
  // ------------------------------------------------------
  console.log('\n======================================================');
  console.log('PHASE 0e: STRAY GEOMETRY INVENTORY');
  console.log('======================================================\n');

  const geometryInventory = await evalJs(`(() => {
    const scene = window.__three_scene;
    if (!scene) return { error: 'No window.__three_scene' };

    const inventory = [];

    scene.traverse((obj) => {
      if (obj.isMesh || obj.isLine || obj.isLineSegments || obj.isPoints) {
        const type = obj.type;
        const geomType = obj.geometry ? obj.geometry.type : 'none';
        const matType = obj.material ? (Array.isArray(obj.material) ? obj.material.map(m=>m.type).join(',') : obj.material.type) : 'none';
        const vertexCount = obj.geometry?.attributes?.position?.count || 0;
        const name = obj.name || 'unnamed';
        
        let classification = 'unknown';
        if (obj.isInstancedMesh) {
          classification = 'nodes (instancedMesh)';
        } else if (obj.geometry?.attributes?.aRiverActive) {
          classification = 'fibers';
        } else if (obj.type === 'LineLoop' || obj.name?.includes('lasso')) {
          classification = 'lasso';
        } else if (obj.type === 'Mesh' && obj.geometry?.type === 'RingGeometry') {
          classification = 'reticle / ring';
        } else if (obj.type === 'LineSegments') {
          classification = 'lineSegments (likely strata band hairlines)';
        }

        inventory.push({
          type,
          geomType,
          matType,
          vertexCount,
          name,
          classification,
        });
      }
    });

    return inventory;
  })()`);

  console.log('[0e] Scene geometry inventory:', JSON.stringify(geometryInventory, null, 2));

  // Close browser and exit
  await send('Browser.close');
  edge.kill();
  console.log('\nHeadless Edge closed.');
}

async function main() {
  try {
    await run0b();
    await runBrowserAudit();
    console.log('\n======================================================');
    console.log('PHASE 0 COMPLETE — ALL DIAGNOSTICS LOGGED ACCURATELY');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Phase 0 error:', err);
  }
}

main();
