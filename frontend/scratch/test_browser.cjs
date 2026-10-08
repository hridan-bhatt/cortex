const { spawn } = require('child_process');
const http = require('http');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edgeArgs = [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000',
  ];

  console.log('Launching headless Edge...');
  const edgeProc = spawn(edgePath, edgeArgs, { stdio: 'ignore' });

  // Wait for remote debugging port to become available
  let pageTarget = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const targets = await httpGetJson('http://127.0.0.1:9222/json');
      pageTarget = targets.find((t) => t.type === 'page' && t.url.includes('3000'));
      if (pageTarget) break;
    } catch (e) {}
  }

  if (!pageTarget) {
    console.error('Failed to connect to Edge page target');
    edgeProc.kill();
    process.exit(1);
  }

  console.log('Connected to Edge target:', pageTarget.webSocketDebuggerUrl);

  const WebSocket = global.WebSocket || require('ws');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let idCounter = 1;
  const callbacks = new Map();
  const consoleLogs = [];

  function sendCmd(method, params = {}) {
    return new Promise((resolve) => {
      const id = idCounter++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('open', async () => {
    console.log('WebSocket open, enabling Runtime and Console...');
    await sendCmd('Runtime.enable');
    await sendCmd('Console.enable');

    // Wait for graph load & initial render
    console.log('Waiting for graph ingestion/loading...');
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const res = await sendCmd('Runtime.evaluate', {
        expression: 'Boolean(window.__cortex_store && window.__cortex_store.getState().nodes.length > 0)',
        returnByValue: true,
      });
      if (res.result && res.result.value) {
        console.log('Graph loaded in browser!');
        break;
      }
    }

    // 1. Check title & Beat 0 hero word
    const titleRes = await sendCmd('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true,
    });
    console.log('Document title:', titleRes.result?.value);

    const heroRes = await sendCmd('Runtime.evaluate', {
      expression: 'document.querySelector("h1") ? document.querySelector("h1").innerText : "none"',
      returnByValue: true,
    });
    console.log('Hero text:', heroRes.result?.value);

    // 2. Read Zustand Store state
    const storeStateRes = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const s = window.__cortex_store.getState();
        return {
          mode: s.mode,
          nodeCount: s.nodes.length,
          edgeCount: s.edges.length,
          strataCounts: s.strataCounts,
          godClassName: s.godClassName,
          godClassId: s.godClassId,
          godClassOutDegree: s.godClassOutDegree,
          currentBeatIndex: s.currentBeatIndex,
          dampedDescentProgress: s.dampedDescentProgress,
        };
      })()`,
      returnByValue: true,
    });
    console.log('Initial Store State:', JSON.stringify(storeStateRes.result?.value, null, 2));

    // 3. Test Handoff to instrument mode
    console.log('Testing handoff to instrument mode...');
    await sendCmd('Runtime.evaluate', {
      expression: 'window.__cortex_store.getState().handoff()',
      returnByValue: true,
    });
    await sleep(1500);

    const handoffStateRes = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const s = window.__cortex_store.getState();
        const inspectorOpen = document.querySelector("aside") && document.querySelector("aside").classList.contains("translate-x-0");
        const inspectorHeader = document.querySelector("aside h2") ? document.querySelector("aside h2").innerText : null;
        return {
          mode: s.mode,
          selectedNodeId: s.selectedNodeId,
          isGodSelected: s.selectedNodeId === s.godClassId,
          inspectorOpen,
          inspectorHeader,
        };
      })()`,
      returnByValue: true,
    });
    console.log('Handoff State:', JSON.stringify(handoffStateRes.result?.value, null, 2));

    // 4. Test FPS measurement
    console.log('Measuring FPS in instrument mode...');
    const fpsRes = await sendCmd('Runtime.evaluate', {
      expression: `new Promise(resolve => {
        let frames = 0;
        const start = performance.now();
        function loop() {
          frames++;
          if (performance.now() - start > 1000) {
            resolve(Math.round((frames * 1000) / (performance.now() - start)));
          } else {
            requestAnimationFrame(loop);
          }
        }
        requestAnimationFrame(loop);
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Instrument Mode FPS:', fpsRes.result?.value);

    // 5. Test Impact Mode on AuditEventRepository
    console.log('Testing Impact Analysis on AuditEventRepository...');
    const impactRes = await sendCmd('Runtime.evaluate', {
      expression: `(async () => {
        const s = window.__cortex_store.getState();
        const repo = s.nodes.find(n => n.entityName === 'AuditEventRepository');
        if (!repo) return { error: 'AuditEventRepository not found' };
        
        s.setSelectedNodeId(repo.id);
        s.setQueryMode('impact');
        
        // Trigger impact fetch
        const res = await fetch('http://localhost:8080/traverse/impact/' + encodeURIComponent(repo.entityId || repo.id));
        const data = await res.json();
        s.setImpactData(data);
        s.setImpactWavefrontDepth(data.dependencyChain.reduce((max, i) => Math.max(max, i.depth), 0));
        
        return {
          target: repo.entityName,
          impactedCount: data.impactedCount,
          chainLength: data.dependencyChain.length,
          sampleChain: data.dependencyChain.slice(0, 3),
        };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('Impact Test Result:', JSON.stringify(impactRes.result?.value, null, 2));

    await sleep(1000);

    // 6. Check Impact HUD rendered in DOM
    const hudRes = await sendCmd('Runtime.evaluate', {
      expression: `(() => {
        const hud = document.querySelector(".w-\\\\[440px\\\\]");
        const countEl = hud ? hud.querySelector("span.text-\\\\[28px\\\\]") : null;
        return {
          hudPresent: Boolean(hud),
          displayedCount: countEl ? countEl.innerText : null,
        };
      })()`,
      returnByValue: true,
    });
    console.log('HUD Verification:', JSON.stringify(hudRes.result?.value, null, 2));

    console.log('\n--- Captured Browser Console Logs ---');
    consoleLogs.forEach((log) => console.log(log));

    ws.close();
    edgeProc.kill();
    process.exit(0);
  });

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data);
      callbacks.delete(data.id);
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map((a) => a.value || a.description || '').join(' ');
      consoleLogs.push(`[browser console] ${args}`);
    }
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
