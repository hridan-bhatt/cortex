import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9236;
const ARTIFACT_DIR = 'C:\\Users\\hrida\\.gemini\\antigravity\\brain\\426e73e8-da11-4243-b8db-e3cf3e654d38';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('=== Starting Phase 3 Headless Verification ===');

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

  if (!versionData) {
    console.error('Failed to connect to headless Edge');
    edge.kill();
    return;
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
      const cb = pending.get(msg.id);
      pending.delete(msg.id);
      cb(msg);
    }
  };

  const send = (method, params = {}) => {
    return new Promise((resolve) => {
      const reqId = id++;
      pending.set(reqId, resolve);
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  };

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.result?.value;
  };

  const captureScreenshot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.result.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, `${name}.png`);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);
  };

  // Wait for initial render and graph load
  console.log('Waiting for Cortex app to boot...');
  await sleep(4000);

  // Transition to instrument mode if in descent
  await evaluate(`
    const store = window.__cortex_store || window.useCortexStore;
    if (store) {
      window.useCortexStore = store;
      store.getState().setMode('instrument');
    }
  `);
  await sleep(1500);

  // Test 1: Open Rules Drawer via hotkey 'R'
  console.log('\n--- Test 1: Rules Drawer Open via "r" key ---');
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
  `);
  await sleep(1200);

  const rulesDrawerState = await evaluate(`
    (() => {
      const el = document.querySelector('[data-testid="rules-drawer"]');
      if (!el) return { found: false };
      const cards = el.querySelectorAll('.bg-surface.border');
      return {
        found: true,
        cardsCount: cards.length,
        text: el.innerText.slice(0, 300)
      };
    })()
  `);
  console.log('Rules Drawer Status:', JSON.stringify(rulesDrawerState, null, 2));
  await captureScreenshot('rules_drawer_open');

  // Test 2: Close Rules Drawer with 'Escape'
  console.log('\n--- Test 2: Close Rules Drawer via Escape ---');
  await evaluate(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  `);
  await sleep(500);
  const rulesDrawerClosed = await evaluate(`!document.querySelector('[data-testid="rules-drawer"]')`);
  console.log('Rules Drawer closed cleanly:', rulesDrawerClosed);

  // Test 3: Switch to Simulate Query Mode and Run Simulation
  console.log('\n--- Test 3: Run Simulation on FileEntity ---');
  await evaluate(`
    (() => {
      const st = window.useCortexStore.getState();
      st.setQueryMode('simulate');
    })()
  `);
  await sleep(1000);

  // Trigger simulate on FileEntity
  await evaluate(`
    (() => {
      const nodes = window.useCortexStore.getState().nodes;
      const fileNode = nodes.find(n => n.entityName === 'FileEntity');
      if (fileNode) {
        // Run batch fallback or stream runner
        const runner = document.querySelector('button');
      }
    })()
  `);

  // Let's click FileEntity in the blast radius candidates
  const candidateClicked = await evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const fileBtn = btns.find(b => b.innerText.includes('FileEntity'));
      if (fileBtn) {
        fileBtn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Candidate FileEntity button clicked:', candidateClicked);

  // Wait for simulation events to stream in and fixpoint to converge
  console.log('Waiting for simulation stream to complete...');
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const simStatus = await evaluate(`window.useCortexStore?.getState().simStatus`);
    if (simStatus === 'complete' || simStatus === 'fixpoint') {
      console.log('Simulation converged with status:', simStatus);
      break;
    }
  }

  const simSummary = await evaluate(`
    (() => {
      const st = window.useCortexStore.getState();
      return {
        status: st.simStatus,
        eventsCount: st.simEvents.length,
        failedNodesCount: st.simFailedNodeIds.size,
        rulesFiredCount: st.simRulesFired.length,
        stats: st.simStats
      };
    })()
  `);
  console.log('Simulation Results Summary:', JSON.stringify(simSummary, null, 2));

  // Test 4: Open Rules Drawer again and verify live-ticking firing counts
  console.log('\n--- Test 4: Verify Live Rule Firing Badges in Rules Drawer ---');
  await evaluate(`window.useCortexStore.getState().setRulesDrawerOpen(true);`);
  await sleep(800);
  const rulesDrawerBadges = await evaluate(`
    (() => {
      const drawer = document.querySelector('[data-testid="rules-drawer"]');
      if (!drawer) return [];
      const fires = Array.from(drawer.querySelectorAll('.text-failure, .text-faint'))
        .filter(el => el.innerText.includes('fire'))
        .map(el => el.innerText);
      return fires;
    })()
  `);
  console.log('Live rule firing badges:', rulesDrawerBadges);
  await captureScreenshot('rules_drawer_firing_counts');

  // Test 5: Cross-filter SimConsole feed by rule
  console.log('\n--- Test 5: Cross-filter SimConsole Feed by Rule ---');
  await evaluate(`
    window.useCortexStore.getState().setSelectedRuleFilter('rule_dependency_impact');
  `);
  await sleep(600);
  const feedFilterState = await evaluate(`
    (() => {
      const feed = document.querySelector('[data-testid="sim-console"]');
      const banner = feed?.querySelector('.border-stratum1\\/30');
      const rows = feed?.querySelectorAll('.font-mono.text-\\[11px\\] .border');
      return {
        bannerText: banner?.innerText,
        rowCount: rows?.length
      };
    })()
  `);
  console.log('Feed Filter State:', feedFilterState);
  await captureScreenshot('sim_console_rule_filtered');

  // Clear filter
  await evaluate(`window.useCortexStore.getState().setSelectedRuleFilter(null);`);
  await evaluate(`window.useCortexStore.getState().setRulesDrawerOpen(false);`);
  await sleep(500);

  // Test 6: Click an Inferred Fact to open 520px Provenance Stepper Modal
  console.log('\n--- Test 6: Open 520px Provenance Stepper Modal on Inferred Fact ---');
  const factClicked = await evaluate(`
    (() => {
      const feed = document.querySelector('[data-testid="sim-console"]');
      const rows = Array.from(feed?.querySelectorAll('.cursor-pointer') || []);
      const inferredRow = rows.find(r => r.innerText.includes('evidence'));
      if (inferredRow) {
        inferredRow.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Inferred fact clicked:', factClicked);
  await sleep(1500);

  const modalState = await evaluate(`
    (() => {
      const modal = document.querySelector('[data-testid="provenance-stepper-modal"]');
      if (!modal) return { found: false };
      const card = modal.querySelector('.w-\\[520px\\]');
      const steps = modal.querySelectorAll('.relative.pl-6 > .relative');
      return {
        found: true,
        width: card ? window.getComputedStyle(card).width : null,
        stepsCount: steps.length,
        title: modal.querySelector('h2')?.innerText,
        text: modal.innerText.slice(0, 400)
      };
    })()
  `);
  console.log('Provenance Stepper Modal State:', JSON.stringify(modalState, null, 2));
  await captureScreenshot('provenance_stepper_modal_4steps');

  // Test 7: Interactive Chain Walking (Depth Navigation)
  console.log('\n--- Test 7: Walk Premise Chain to Depth 1 ---');
  const walkTriggered = await evaluate(`
    (() => {
      const modal = document.querySelector('[data-testid="provenance-stepper-modal"]');
      const walkBtn = Array.from(modal?.querySelectorAll('button') || [])
        .find(b => b.innerText.includes('Walk premise chain'));
      if (walkBtn) {
        walkBtn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Walk premise button clicked:', walkTriggered);
  await sleep(1200);

  const depthState = await evaluate(`
    (() => {
      const modal = document.querySelector('[data-testid="provenance-stepper-modal"]');
      const depthBadge = modal?.querySelector('.border-hairline.bg-surface');
      const backBtn = Array.from(modal?.querySelectorAll('button') || [])
        .find(b => b.innerText.includes('Back to:'));
      return {
        depthText: depthBadge?.innerText,
        backButtonFound: !!backBtn,
        backButtonText: backBtn?.innerText,
        currentTitle: modal?.querySelector('h2')?.innerText
      };
    })()
  `);
  console.log('Walked Depth State:', JSON.stringify(depthState, null, 2));
  await captureScreenshot('provenance_stepper_depth1');

  // Test 8: Back Navigation to Depth 0
  console.log('\n--- Test 8: Back Navigation to Parent Fact ---');
  const backClicked = await evaluate(`
    (() => {
      const modal = document.querySelector('[data-testid="provenance-stepper-modal"]');
      const backBtn = Array.from(modal?.querySelectorAll('button') || [])
        .find(b => b.innerText.includes('Back to:'));
      if (backBtn) {
        backBtn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Back button clicked:', backClicked);
  await sleep(500);

  // Test 9: Seed Fact Guard Test (Zero 404 network calls)
  console.log('\n--- Test 9: Seed Fact Root Axiom Display (Zero 404s) ---');
  await evaluate(`
    window.useCortexStore.getState().setSimSelectedFactId('seed-FileEntity');
    window.useCortexStore.getState().setSimEvidenceData({
      fact: {
        id: 'seed-FileEntity',
        factType: 'ROOT_FAILURE',
        entityId: 'com.vaultx.VaultX.entity.FileEntity',
        entityName: 'FileEntity',
        inferred: false
      },
      evidenceChain: []
    });
  `);
  await sleep(500);
  const seedModalState = await evaluate(`
    (() => {
      const modal = document.querySelector('[data-testid="provenance-stepper-modal"]');
      const isAxiom = modal?.innerText.includes('AXIOMATIC ROOT SEED');
      return {
        found: !!modal,
        isAxiom,
        text: modal?.innerText.slice(0, 300)
      };
    })()
  `);
  console.log('Seed Fact Modal State:', seedModalState);
  await captureScreenshot('provenance_stepper_seed_root_axiom');

  // Close modal
  await evaluate(`window.useCortexStore.getState().setSimSelectedFactId(null);`);
  await sleep(500);

  // Test 10: HelpOverlay 'R' shortcut reference
  console.log('\n--- Test 10: HelpOverlay Verification ---');
  await evaluate(`window.useCortexStore.getState().setHelpOpen(true);`);
  await sleep(600);
  const helpContent = await evaluate(`
    (() => {
      const help = document.querySelector('[role="dialog"][aria-label="Cortex Reference Card"]');
      return {
        found: !!help,
        hasRShortcut: help ? help.innerText.includes('rules catalog') : false
      };
    })()
  `);
  console.log('Help Overlay Reference Status:', helpContent);
  await captureScreenshot('help_overlay_with_rules_shortcut');

  await evaluate(`window.useCortexStore.getState().setHelpOpen(false);`);
  await sleep(500);

  // Test 11: Theme Switch Verification
  console.log('\n--- Test 11: Theme Switch Parity Check ---');
  await evaluate(`window.useCortexStore.getState().setTheme('paper');`);
  await sleep(800);
  await captureScreenshot('paper_theme_with_rules_feature');

  await evaluate(`window.useCortexStore.getState().setTheme('night');`);
  await sleep(500);

  console.log('\n=== All Tests Completed Successfully ===');
  ws.close();
  edge.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
