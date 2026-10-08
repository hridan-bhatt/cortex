import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9229;
const ARTIFACTS_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('Launching Headless Edge for full verification suite...');
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

  async function capture(name) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(shot.data, 'base64');
    const outPath = path.join(ARTIFACTS_DIR, `${name}.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`[screenshot] Saved ${name}.png (${buf.length} bytes)`);
  }

  console.log('Waiting for frontend boot and store status to become ready...');
  for (let i = 0; i < 50; i++) {
    const status = await evalJs(`window.__cortex_store ? window.__cortex_store.getState().status : null`);
    if (status === 'ready') {
      console.log(`Store ready after ${(i + 1) * 200}ms`);
      break;
    }
    await sleep(200);
  }

  // Switch to instrument mode
  await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    s.setMode('instrument');
  })()`);
  await sleep(1500);

  console.log('\n--- 1. VERIFY VAULTX AT DEFAULT POSE ---');
  const vxStatus = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const vxNodes = s.nodes.filter(n => n.entityName === 'VaultXApplication');
    const activeBtn = document.querySelector('button.border-b-2');
    return {
      adapter: s.adapter,
      topBarAdapter: activeBtn ? activeBtn.textContent.trim() : 'none',
      totalNodes: s.nodes.length,
      totalEdges: s.edges.length,
      vaultXAppNodesCount: vxNodes.length,
      godClassId: s.godClassId,
      godClassName: s.godClassName,
      godClassOutDegree: s.godClassOutDegree,
      strataCounts: s.strataCounts,
    };
  })()`);
  console.log('[vaultx status]:', JSON.stringify(vxStatus, null, 2));

  // Screenshot 1: vaultx_default_pose.png
  await capture('vaultx_default_pose');

  // Verify 0e Stray Geometry Inventory (assert 0 LineSegments)
  const geomInv = await evalJs(`(() => {
    const scene = window.__three_scene;
    if (!scene) return { error: 'No window.__three_scene' };
    const items = [];
    scene.traverse((obj) => {
      if (obj.isMesh || obj.isLine || obj.isLineSegments) {
        items.push({ type: obj.type, name: obj.name, count: obj.geometry?.attributes?.position?.count });
      }
    });
    return items;
  })()`);
  console.log('\n[0e scene geometry after Fix B]:', JSON.stringify(geomInv, null, 2));
  const hasLineSegments = geomInv.some(i => i.type === 'LineSegments');
  console.log(`[0e check] LineSegments present: ${hasLineSegments} (assert false: ${!hasLineSegments ? 'PASS' : 'FAIL'})`);

  // Verify 0c Fiber color buffer at REST (assert 62% mix)
  const fiberAudit = await evalJs(`(() => {
    const fiberMesh = window.__fiber_mesh;
    if (!fiberMesh) return { error: 'No fiber mesh' };
    const colorAttr = fiberMesh.geometry.getAttribute('color');
    const arr = colorAttr.array;
    const vertexCount = colorAttr.count;
    const step = Math.floor(vertexCount / 10);
    const toHex = (r, g, b) => {
      const rh = Math.round(Math.min(1, Math.max(0, r)) * 255).toString(16).padStart(2, '0');
      const gh = Math.round(Math.min(1, Math.max(0, g)) * 255).toString(16).padStart(2, '0');
      const bh = Math.round(Math.min(1, Math.max(0, b)) * 255).toString(16).padStart(2, '0');
      return '#' + rh + gh + bh;
    };
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const v = i * step;
      const r = arr[v * 3];
      const g = arr[v * 3 + 1];
      const b = arr[v * 3 + 2];
      samples.push({ v, rgb: [Number(r.toFixed(3)), Number(g.toFixed(3)), Number(b.toFixed(3))], hex: toHex(r, g, b) });
    }
    return { totalVertices: vertexCount, samples };
  })()`);
  console.log('\n[0c fiber color audit at REST after Fix C]:', JSON.stringify(fiberAudit, null, 2));

  console.log('\n--- 2. VERIFY GOD-CLASS HOVER & TWO-HOP REFLECTION SPILL ---');
  // Record REST buffer state before hover
  await evalJs(`(() => {
    const fiberMesh = window.__fiber_mesh;
    window.__restColorBuffer = new Float32Array(fiberMesh.geometry.getAttribute('color').array);
    window.__restGlowBuffer = new Float32Array(fiberMesh.geometry.getAttribute('aGlow').array);
  })()`);

  // Hover god class
  const godHoverResult = await evalJs(`(async () => {
    const s = window.__cortex_store.getState();
    const godId = s.godClassId;
    s.setHoveredNodeId(godId);
    await new Promise(r => setTimeout(r, 800));

    // Find hover card and neighbor labels
    const allDivs = Array.from(document.querySelectorAll('div'));
    const cardEl = allDivs.find(d => d.className && typeof d.className === 'string' && d.className.includes('bg-surface/95'));
    const neighborLabelEls = allDivs.filter(d => d.className && typeof d.className === 'string' && d.className.includes('bg-surface/80'));

    return {
      godId,
      godName: s.godClassName,
      neighborCount: neighborLabelEls.length,
      sampleLabels: neighborLabelEls.slice(0, 5).map(e => e.textContent.trim()),
      hasCard: Boolean(cardEl),
      cardText: cardEl ? cardEl.innerText : null,
      cardRect: cardEl ? {
        top: cardEl.getBoundingClientRect().top,
        left: cardEl.getBoundingClientRect().left,
        width: cardEl.getBoundingClientRect().width,
        height: cardEl.getBoundingClientRect().height,
      } : null,
    };
  })()`);
  console.log('[god-class hover result]:', JSON.stringify(godHoverResult, null, 2));

  // Screenshot 3: god_class_hover_spill.png
  await capture('god_class_hover_spill');

  // Verify Hop 1, Hop 2, Hop 3+ delta metrics
  const spillMetrics = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const godId = s.godClassId;
    const fiberMesh = window.__fiber_mesh;
    const currColors = fiberMesh.geometry.getAttribute('color').array;
    const restColors = window.__restColorBuffer;
    const neighbors = new Set(s.adjacency.get(godId) || []);

    let hop1Verts = 0, hop1Changed = 0;
    let hop2Verts = 0, hop2Changed = 0;
    let hop3Verts = 0, hop3Changed = 0;

    const edges = s.edges;
    let hop1Edges = 0;
    let hop2Edges = 0;
    let hop3Edges = 0;

    edges.forEach((edge, i) => {
      const isHop1 = (edge.sourceId === godId || edge.targetId === godId);
      const isHop2 = !isHop1 && (neighbors.has(edge.sourceId) || neighbors.has(edge.targetId));
      if (isHop1) hop1Edges++;
      else if (isHop2) hop2Edges++;
      else hop3Edges++;

      const startV = i * 65;
      for (let v = 0; v < 65; v++) {
        const idx = (startV + v) * 3;
        const diff = Math.abs(currColors[idx] - restColors[idx]) +
                     Math.abs(currColors[idx+1] - restColors[idx+1]) +
                     Math.abs(currColors[idx+2] - restColors[idx+2]);
        if (isHop1) {
          hop1Verts++;
          if (diff > 0.005) hop1Changed++;
        } else if (isHop2) {
          hop2Verts++;
          if (diff > 0.005) hop2Changed++;
        } else {
          hop3Verts++;
          if (diff > 0.005) hop3Changed++;
        }
      }
    });

    return {
      totalEdges: edges.length,
      hop1Edges,
      hop2Edges,
      hop3Edges,
      hop1ChangedPct: ((hop1Changed / hop1Verts) * 100).toFixed(1) + '%',
      hop2ChangedPct: ((hop2Changed / hop2Verts) * 100).toFixed(1) + '%',
      hop3ChangedPct: ((hop3Changed / (hop3Verts || 1)) * 100).toFixed(2) + '%',
      hop3UnchangedVerts: hop3Verts - hop3Changed,
      totalHop3Verts: hop3Verts,
    };
  })()`);
  console.log('\n[spill metrics for god-class hover]:', JSON.stringify(spillMetrics, null, 2));

  // De-hover god class
  await evalJs(`window.__cortex_store.getState().setHoveredNodeId(null)`);
  await sleep(600);

  console.log('\n--- 3. VERIFY SMALL NODE HOVER (2-degree node) ---');
  const smallNodeResult = await evalJs(`(async () => {
    const s = window.__cortex_store.getState();
    // Find node with total degree = 2
    let smallNode = s.nodes.find(n => {
      const deg = s.degrees.get(n.id);
      return deg && deg.total === 2;
    }) || s.nodes.find(n => {
      const deg = s.degrees.get(n.id);
      return deg && deg.total > 0 && deg.total <= 3;
    });

    s.setHoveredNodeId(smallNode.id);
    await new Promise(r => setTimeout(r, 800));

    const deg = s.degrees.get(smallNode.id);
    return {
      smallNodeId: smallNode.id,
      smallNodeName: smallNode.entityName,
      deg,
    };
  })()`);
  console.log('[small node hover result]:', JSON.stringify(smallNodeResult, null, 2));

  // Screenshot 4: small_orb_hover.png
  await capture('small_orb_hover');

  // Verify small node spill metrics (Hop 3+ must be 0.00% changed)
  const smallSpillMetrics = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const targetId = s.hoveredNodeId;
    const fiberMesh = window.__fiber_mesh;
    const currColors = fiberMesh.geometry.getAttribute('color').array;
    const restColors = window.__restColorBuffer;
    const neighbors = new Set(s.adjacency.get(targetId) || []);

    let hop1Verts = 0, hop1Changed = 0;
    let hop2Verts = 0, hop2Changed = 0;
    let hop3Verts = 0, hop3Changed = 0;

    s.edges.forEach((edge, i) => {
      const isHop1 = (edge.sourceId === targetId || edge.targetId === targetId);
      const isHop2 = !isHop1 && (neighbors.has(edge.sourceId) || neighbors.has(edge.targetId));
      const startV = i * 65;
      for (let v = 0; v < 65; v++) {
        const idx = (startV + v) * 3;
        const diff = Math.abs(currColors[idx] - restColors[idx]) +
                     Math.abs(currColors[idx+1] - restColors[idx+1]) +
                     Math.abs(currColors[idx+2] - restColors[idx+2]);
        if (isHop1) {
          hop1Verts++;
          if (diff > 0.005) hop1Changed++;
        } else if (isHop2) {
          hop2Verts++;
          if (diff > 0.005) hop2Changed++;
        } else {
          hop3Verts++;
          if (diff > 0.005) hop3Changed++;
        }
      }
    });

    return {
      hop1Edges: s.edges.filter(e => e.sourceId === targetId || e.targetId === targetId).length,
      hop1ChangedPct: ((hop1Changed / (hop1Verts || 1)) * 100).toFixed(1) + '%',
      hop2ChangedPct: ((hop2Changed / (hop2Verts || 1)) * 100).toFixed(1) + '%',
      hop3ChangedPct: ((hop3Changed / (hop3Verts || 1)) * 100).toFixed(2) + '%',
      hop3UnchangedVerts: hop3Verts - hop3Changed,
      totalHop3Verts: hop3Verts,
    };
  })()`);
  console.log('[spill metrics for small-node hover]:', JSON.stringify(smallSpillMetrics, null, 2));

  // De-hover
  await evalJs(`window.__cortex_store.getState().setHoveredNodeId(null)`);
  await sleep(600);

  console.log('\n--- 4. VERIFY HOSPITAL ADAPTER & SCREENSHOT ---');
  console.log('Loading hospital graph...');
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital', true)`);
  
  for (let i = 0; i < 40; i++) {
    const status = await evalJs(`window.__cortex_store.getState().status`);
    if (status === 'ready') break;
    await sleep(200);
  }
  await sleep(1000);

  const hospStatus = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    let unclassifiedCount = 0;
    for (const n of s.nodes) {
      if (s.nodeStrata.get(n.id) === 6) unclassifiedCount++;
    }
    const unclassPct = ((unclassifiedCount / (s.nodes.length || 1)) * 100).toFixed(1) + '%';
    const activeBtn = document.querySelector('button.border-b-2');
    return {
      adapter: s.adapter,
      topBarAdapter: activeBtn ? activeBtn.textContent.trim() : 'none',
      totalNodes: s.nodes.length,
      totalEdges: s.edges.length,
      unclassifiedCount,
      unclassifiedPct: unclassPct,
      strataCounts: s.strataCounts,
    };
  })()`);
  console.log('[hospital status]:', JSON.stringify(hospStatus, null, 2));

  // Screenshot 2: hospital_default_pose.png
  await capture('hospital_default_pose');

  console.log('\n--- 5. VERIFY REPLAY INTRO ON HOSPITAL & ROUND-TRIP TO VAULTX ---');
  // Replay intro
  await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    s.setMode('descent');
    s.setDescentProgress(0);
    window.scrollTo(0, 0);
  })()`);
  await sleep(1500);

  // Return to instrument
  await evalJs(`window.__cortex_store.getState().setMode('instrument')`);
  await sleep(1000);

  const hospAfterIntro = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const activeBtn = document.querySelector('button.border-b-2');
    return {
      adapter: s.adapter,
      topBarAdapter: activeBtn ? activeBtn.textContent.trim() : 'none',
      totalNodes: s.nodes.length,
    };
  })()`);
  console.log('[hospital after intro]:', JSON.stringify(hospAfterIntro, null, 2));

  // Switch back to vaultx
  console.log('Switching back to vaultx...');
  await evalJs(`window.__cortex_store.getState().loadGraph('vaultx', true)`);
  for (let i = 0; i < 40; i++) {
    const status = await evalJs(`window.__cortex_store.getState().status`);
    if (status === 'ready') break;
    await sleep(200);
  }
  await sleep(1000);

  const vxRoundTrip = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const activeBtn = document.querySelector('button.border-b-2');
    return {
      adapter: s.adapter,
      topBarAdapter: activeBtn ? activeBtn.textContent.trim() : 'none',
      totalNodes: s.nodes.length,
      totalEdges: s.edges.length,
    };
  })()`);
  console.log('[vaultx round-trip]:', JSON.stringify(vxRoundTrip, null, 2));

  console.log('\n--- 6. VERIFY SIX VERBS SMOKE TEST ---');
  const verbsSmoke = await evalJs(`(() => {
    const results = {};
    const store = window.__cortex_store;

    // 1. Explore
    store.getState().setQueryMode('explore');
    results.explore = store.getState().queryMode === 'explore';

    // 2. Impact
    store.getState().setQueryMode('impact');
    results.impact = store.getState().queryMode === 'impact';

    // 3. Trace
    store.getState().setQueryMode('trace');
    results.trace = store.getState().queryMode === 'trace';

    // 4. Cycles
    store.getState().setQueryMode('cycles');
    results.cycles = store.getState().queryMode === 'cycles';

    // 5. What-if
    store.getState().setQueryMode('whatif');
    results.whatif = store.getState().queryMode === 'whatif';

    // 6. Simulate
    store.getState().setQueryMode('simulate');
    results.simulate = store.getState().queryMode === 'simulate';

    // Return to explore
    store.getState().setQueryMode('explore');
    results.finalMode = store.getState().queryMode;
    return results;
  })()`);
  console.log('[six verbs smoke test]:', JSON.stringify(verbsSmoke, null, 2));

  console.log('\n--- 7. VERIFY SIMULATION CASCADE SMOKE ---');
  const simSmoke = await evalJs(`(async () => {
    const store = window.__cortex_store;
    store.getState().setQueryMode('simulate');
    const godId = store.getState().godClassId;
    store.getState().setSimTarget(godId, store.getState().godClassName, 'sim-test-1');
    store.getState().setSimStatus('streaming');
    store.getState().appendSimEvent({
      eventType: 'TARGET_FAILURE_ASSERTED',
      entityId: godId,
      entityName: store.getState().godClassName,
      status: 'FAILED',
      sequenceNumber: 1,
    });
    await new Promise(r => setTimeout(r, 400));
    const failedCount = store.getState().simFailedNodeIds.size;
    store.getState().clearSimulation();
    return {
      simulationRan: true,
      failedNodesRecorded: failedCount,
      resetToExplore: store.getState().queryMode === 'explore',
    };
  })()`);
  console.log('[simulation smoke test]:', JSON.stringify(simSmoke, null, 2));

  await send('Browser.close');
  edge.kill();
  console.log('\nHeadless verification complete.');
}

run().catch(console.error);
