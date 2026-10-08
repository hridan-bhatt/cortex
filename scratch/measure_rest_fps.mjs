import { spawn } from 'child_process';
import http from 'http';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9260;

async function measureFps() {
  console.log('--- Launching Edge to measure rest FPS ---');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
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

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text || 'Eval error');
    }
    return r.result?.value;
  }

  // Wait for graph to be loaded
  console.log('Waiting for graph to be ready in instrument mode...');
  await new Promise((r) => setTimeout(r, 2500));

  // Measure rest FPS over 3 seconds
  console.log('Measuring rAF timestamps over 3000ms...');
  const result = await evaluate(`
    new Promise((resolve) => {
      const timestamps = [];
      let start = performance.now();
      function tick(now) {
        timestamps.push(now);
        if (now - start < 3000) {
          requestAnimationFrame(tick);
        } else {
          // Calculate frame intervals
          const diffs = [];
          for (let i = 1; i < timestamps.length; i++) {
            diffs.push(timestamps[i] - timestamps[i-1]);
          }
          const totalTime = timestamps[timestamps.length - 1] - timestamps[0];
          const fps = ((timestamps.length - 1) / totalTime) * 1000;
          resolve({
            frames: timestamps.length,
            durationMs: totalTime,
            fps: Math.round(fps * 10) / 10,
            avgIntervalMs: Math.round((totalTime / (timestamps.length - 1)) * 100) / 100
          });
        }
      }
      requestAnimationFrame(tick);
    })
  `);

  console.log('REST FPS RESULT:', JSON.stringify(result, null, 2));

  ws.close();
  edge.kill();
  return result;
}

measureFps().catch((err) => {
  console.error(err);
  process.exit(1);
});
