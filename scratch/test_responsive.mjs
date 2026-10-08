import { spawn } from 'child_process';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9285;

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--no-first-run',
    '--window-size=1440,900',
    'http://localhost:3000',
  ]);
  await new Promise((r) => setTimeout(r, 2000));
  const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const ws = new WebSocket(list[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res) => {
      const mid = id++;
      const handler = (e) => {
        const m = JSON.parse(e.data);
        if (m.id === mid) {
          ws.removeEventListener('message', handler);
          res(m.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');

  // Wait for store
  for (let i = 0; i < 40; i++) {
    const r = await send('Runtime.evaluate', {
      expression: 'window.__cortex_store ? window.__cortex_store.getState().status : null',
      returnByValue: true,
    });
    if (r.result?.value === 'ready') break;
    await new Promise((r) => setTimeout(r, 200));
  }

  await send('Runtime.evaluate', {
    expression: 'window.__cortex_store.getState().setMode("instrument")',
  });
  await new Promise((r) => setTimeout(r, 1000));

  const bps = [1920, 1440, 1366, 1280];
  for (const w of bps) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 400));
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const topBar = document.querySelector("header");
        const tbW = topBar ? topBar.scrollWidth : 0;
        const tbClient = topBar ? topBar.clientWidth : 0;
        return {
          viewportWidth: window.innerWidth,
          bodyScrollWidth: document.body.scrollWidth,
          hasBodyHorizontalOverflow: document.body.scrollWidth > window.innerWidth,
          topBarScrollWidth: tbW,
          topBarClientWidth: tbClient,
          topBarOverflows: tbW > tbClient
        };
      })()`,
      returnByValue: true,
    });
    console.log(JSON.stringify(r.result?.value));
  }

  ws.close();
  edge.kill();
}

run().catch(console.error);
