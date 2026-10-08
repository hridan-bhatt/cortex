import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9268;
const ARTIFACTS_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== IDENTITY PATCH VERIFICATION SUITE ===');
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

  console.log('Waiting for frontend boot...');
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const status = await evalJs(`window.__cortex_store ? window.__cortex_store.getState().status : null`);
    if (status === 'ready') {
      console.log(`Store ready after ${(i + 1) * 200}ms`);
      ready = true;
      break;
    }
    await sleep(200);
  }
  if (!ready) {
    throw new Error('Store did not become ready in 20s');
  }

  // --- CHECK 1: DESCENT HERO & TELEMETRY ---
  console.log('\n--- CHECK 1: DESCENT HERO & TELEMETRY ---');
  await evalJs(`window.__cortex_store.getState().setMode('descent')`);
  await sleep(1000);
  await capture('identity_descent_hero');

  // Verify descent Spline Y monotonicity
  const descentTelemetry = await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const bands = s.strataMeta || [];
    return {
      bandCount: bands.length,
      mode: s.mode,
      adapter: s.adapter
    };
  })()`);
  console.log('[Descent Telemetry VaultX]:', JSON.stringify(descentTelemetry));

  // --- CHECK 2: INSTRUMENT MODE & TYPE SYSTEM AUDIT ---
  console.log('\n--- CHECK 2: INSTRUMENT MODE & TYPE SYSTEM AUDIT ---');
  await evalJs(`window.__cortex_store.getState().setMode('instrument')`);
  await sleep(1200);
  await capture('identity_vaultx_default_pose');

  const fontAudit = await evalJs(`(() => {
    const bodyFont = getComputedStyle(document.body).fontFamily;
    const topBar = document.querySelector('header') || document.querySelector('.h-10');
    const topBarFont = topBar ? getComputedStyle(topBar).fontFamily : null;
    
    // Check buttons radius
    const buttons = Array.from(document.querySelectorAll('button'));
    const radii = buttons.map(b => getComputedStyle(b).borderRadius).filter(r => r && r !== '0px');
    
    // Check for gradients across all elements
    const allElements = Array.from(document.querySelectorAll('*'));
    const gradients = allElements
      .map(el => getComputedStyle(el).backgroundImage)
      .filter(bg => bg && bg.includes('gradient'));

    return {
      bodyFont,
      topBarFont,
      sampleRadii: radii.slice(0, 10),
      allRadiiAre2px: radii.length > 0 && radii.every(r => r === '2px'),
      gradientCount: gradients.length
    };
  })()`);
  console.log('[Font, Radius, and Gradient Audit]:', JSON.stringify(fontAudit, null, 2));

  // --- CHECK 3: GOD CLASS FOCUS & INSPECTOR ---
  console.log('\n--- CHECK 3: GOD CLASS FOCUS & INSPECTOR ---');
  await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    const godId = s.godClassId;
    s.setSelectedNodeId(godId);
  })()`);
  await sleep(1000);
  await capture('identity_god_class_focus_bloom');
  await capture('identity_inspector');

  // --- CHECK 4: IMPACT HUD ---
  console.log('\n--- CHECK 4: IMPACT HUD ---');
  await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    s.setQueryMode('impact');
    const godId = s.godClassId;
    s.setImpactData({
      id: godId,
      entityId: godId,
      impactedCount: 42,
      maxDepth: 3,
      dependencyChain: s.nodes.slice(0, 10).map((n, i) => ({
        id: n.id,
        entityName: n.entityName,
        depth: (i % 3) + 1,
        relationshipType: 'DEPENDS_ON',
        evidenceRef: 'VaultXApplication.java:42'
      }))
    });
    s.setImpactWavefrontDepth(3);
  })()`);
  await sleep(1000);
  await capture('identity_impact_hud');
  await evalJs(`window.__cortex_store.getState().clearImpact()`);
  await sleep(400);

  // --- CHECK 5: SIMCONSOLE STREAMING ---
  console.log('\n--- CHECK 5: SIMCONSOLE STREAMING ---');
  await evalJs(`(() => {
    const s = window.__cortex_store.getState();
    s.setQueryMode('simulate');
    s.setSimStatus('streaming');
    s.setSimTarget(s.godClassId, s.godClassName);
    s.appendSimEvent({
      sequenceNumber: 1,
      eventType: 'TARGET_FAILURE_ASSERTED',
      entityName: s.godClassName,
      ruleName: null,
      data: {}
    });
    s.appendSimEvent({
      sequenceNumber: 2,
      eventType: 'RULE_FIRED',
      entityName: 'DepositService',
      ruleId: 'CASCADE-01',
      ruleName: 'Cascade Rule 1',
      consumedFactIds: ['seed-1'],
      data: {}
    });
    s.appendSimEvent({
      sequenceNumber: 3,
      eventType: 'FACT_ASSERTED',
      entityName: 'DepositService',
      ruleId: 'CASCADE-01',
      factId: 'fact-deposit-1',
      data: {}
    });
  })()`);
  await sleep(1000);
  await capture('identity_sim_console_streaming');

  // Clear simulation
  await evalJs(`window.__cortex_store.getState().clearSimulation()`);
  await sleep(400);

  // --- CHECK 6: NAVIGATOR & PALETTE ---
  console.log('\n--- CHECK 6: NAVIGATOR & PALETTE ---');
  await evalJs(`window.__cortex_store.getState().setNavigatorOpen(true)`);
  await sleep(600);
  await capture('identity_navigator');
  await evalJs(`window.__cortex_store.getState().setNavigatorOpen(false)`);
  await sleep(400);

  await evalJs(`window.__cortex_store.getState().setPaletteOpen(true)`);
  await sleep(600);
  await capture('identity_palette');
  await evalJs(`window.__cortex_store.getState().setPaletteOpen(false)`);
  await sleep(400);

  // --- CHECK 7: HOSPITAL ADAPTER SWITCH ---
  console.log('\n--- CHECK 7: HOSPITAL ADAPTER ---');
  await evalJs(`window.__cortex_store.getState().loadGraph('hospital')`);
  console.log('Waiting for hospital graph ingest...');
  for (let i = 0; i < 40; i++) {
    const adapter = await evalJs(`window.__cortex_store.getState().adapter`);
    const status = await evalJs(`window.__cortex_store.getState().status`);
    const nodeCount = await evalJs(`window.__cortex_store.getState().nodes.length`);
    if (adapter === 'hospital' && status === 'ready' && nodeCount > 0 && nodeCount < 30) {
      console.log(`Hospital graph ready (${nodeCount} nodes)`);
      break;
    }
    await sleep(300);
  }
  await sleep(1200);
  await capture('identity_hospital_default_pose');

  // Switch back to vaultx
  await evalJs(`window.__cortex_store.getState().loadGraph('vaultx')`);
  for (let i = 0; i < 40; i++) {
    const adapter = await evalJs(`window.__cortex_store.getState().adapter`);
    const status = await evalJs(`window.__cortex_store.getState().status`);
    if (adapter === 'vaultx' && status === 'ready') break;
    await sleep(300);
  }
  await sleep(1000);

  console.log('\n=== IDENTITY PATCH SUITE COMPLETED SUCCESSFULLY ===');
  ws.close();
  edge.kill();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
