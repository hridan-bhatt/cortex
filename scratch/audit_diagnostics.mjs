import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9275;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runAudit() {
  console.log('--- Launching Headless Edge for Audit ---');
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

  const networkRequests = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Network.requestWillBeSent') {
      networkRequests.push({
        url: msg.params.request.url,
        method: msg.params.request.method,
        type: msg.params.type,
      });
    } else if (msg.method === 'Network.responseReceived') {
      const existing = networkRequests.find(r => r.url === msg.params.response.url);
      if (existing) {
        existing.status = msg.params.response.status;
        existing.mimeType = msg.params.response.mimeType;
      }
    }
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
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Page.enable');

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res?.exceptionDetails) {
      console.error('[eval exception]', JSON.stringify(res.exceptionDetails));
    }
    return res?.result?.value;
  };

  console.log('Waiting for frontend boot and store ready...');
  for (let i = 0; i < 100; i++) {
    const status = await evalJs(`window.__cortex_store ? window.__cortex_store.getState().status : null`);
    if (status === 'ready') {
      console.log(`Store ready after ${(i + 1) * 200}ms`);
      break;
    }
    await sleep(200);
  }

  // AUDIT B: FONT TRUTH
  console.log('\n=== AUDIT B: FONT TRUTH ===');
  const fontChecks = await evalJs(`(() => {
    const check1 = document.fonts.check('13px "Instrument Sans"');
    const check1Var = document.fonts.check('13px "Instrument Sans Variable"');
    const check2 = document.fonts.check('11px "JetBrains Mono"');
    const checkInter = document.fonts.check('13px "Inter"');
    const checkPlex = document.fonts.check('13px "IBM Plex Sans"');
    
    const loadedFaces = [];
    document.fonts.forEach(f => {
      loadedFaces.push({ family: f.family, status: f.status, weight: f.weight, style: f.style });
    });

    // Element computed font families
    const bodyF = getComputedStyle(document.body).fontFamily;
    const h1F = document.querySelector('h1') ? getComputedStyle(document.querySelector('h1')).fontFamily : 'no-h1';
    const monoEl = document.querySelector('.font-mono') ? getComputedStyle(document.querySelector('.font-mono')).fontFamily : 'no-mono';

    return {
      'document.fonts.check("13px \"Instrument Sans\"")': check1,
      'document.fonts.check("13px \"Instrument Sans Variable\"")': check1Var,
      'document.fonts.check("11px \"JetBrains Mono\"")': check2,
      'document.fonts.check("13px \"Inter\"")': checkInter,
      'document.fonts.check("13px \"IBM Plex Sans\"")': checkPlex,
      loadedFaces,
      computed: {
        body: bodyF,
        h1: h1F,
        sampleMono: monoEl
      }
    };
  })()`);

  console.log('Font Checks:', JSON.stringify(fontChecks, null, 2));

  // Network font files
  const fontNetworkRequests = networkRequests.filter(r => r.url.endsWith('.woff2') || r.url.endsWith('.woff') || r.url.includes('font'));
  console.log('Font Network Requests:', JSON.stringify(fontNetworkRequests, null, 2));

  // AUDIT C: BACKDROP STATE
  console.log('\n=== AUDIT C: BACKDROP STATE ===');
  const backdropState = await evalJs(`(() => {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    const canvas = document.querySelector('canvas');
    let rendererClearColor = null;
    let sceneFog = null;
    let sceneBg = null;
    if (window.__three_renderer) {
      const c = new window.THREE.Color();
      window.__three_renderer.getClearColor(c);
      rendererClearColor = { hex: '#' + c.getHexString(), r: c.r, g: c.g, b: c.b };
    }
    if (window.__three_scene) {
      sceneBg = window.__three_scene.background;
      sceneFog = window.__three_scene.fog ? {
        color: '#' + window.__three_scene.fog.color.getHexString(),
        near: window.__three_scene.fog.near,
        far: window.__three_scene.fog.far
      } : null;
    }

    return {
      bodyBg,
      htmlBg,
      canvasPresent: Boolean(canvas),
      rendererClearColor,
      sceneFog,
      sceneBg
    };
  })()`);
  console.log('Backdrop State:', JSON.stringify(backdropState, null, 2));

  // AUDIT 45 ITEMS ON LIVE APP
  console.log('\n=== AUDIT 45 ITEMS ON LIVE APP ===');
  const domAudit = await evalJs(`(() => {
    const s = window.__cortex_store.getState();

    // 1 & 2: Hero section & Landing page sections
    const headlines = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
      tag: h.tagName,
      text: h.textContent.trim(),
      classes: h.className,
      computedFont: getComputedStyle(h).fontFamily,
      computedSize: getComputedStyle(h).fontSize,
      computedWeight: getComputedStyle(h).fontWeight,
      computedColor: getComputedStyle(h).color,
      computedTracking: getComputedStyle(h).letterSpacing
    }));

    const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim(),
      classes: b.className,
      radius: getComputedStyle(b).borderRadius,
      bg: getComputedStyle(b).backgroundColor,
      border: getComputedStyle(b).border,
      boxShadow: getComputedStyle(b).boxShadow,
      transform: getComputedStyle(b).transform,
      transition: getComputedStyle(b).transition
    }));

    // Check for emojis
    const emojiRegex = /\\p{Extended_Pictographic}/u;
    const textNodes = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while (n = walk.nextNode()) {
      if (emojiRegex.test(n.nodeValue)) {
        textNodes.push(n.nodeValue.trim());
      }
    }

    // Check for gradients in DOM
    const elementsWithGradient = [];
    const elementsWithGlass = [];
    const elementsWithShadow = [];
    const elementsWithPillRadius = [];

    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        elementsWithGradient.push({ tag: el.tagName, class: el.className, bg: cs.backgroundImage });
      }
      if (cs.backdropFilter && cs.backdropFilter.includes('blur')) {
        elementsWithGlass.push({ tag: el.tagName, class: el.className, filter: cs.backdropFilter, bg: cs.backgroundColor });
      }
      if (cs.boxShadow && cs.boxShadow !== 'none') {
        elementsWithShadow.push({ tag: el.tagName, class: el.className, shadow: cs.boxShadow });
      }
      const br = cs.borderRadius;
      if (br && parseFloat(br) > 8) {
        elementsWithPillRadius.push({ tag: el.tagName, class: el.className, radius: br });
      }
    });

    // Check links (#)
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      href: a.getAttribute('href'),
      text: a.textContent.trim()
    }));

    return {
      headlines,
      buttonCount: allButtons.length,
      sampleButtons: allButtons.slice(0, 10),
      emojisFound: textNodes,
      elementsWithGradient,
      elementsWithGlass,
      elementsWithShadowCount: elementsWithShadow.length,
      elementsWithPillRadius,
      links,
      queryMode: s.queryMode,
      mode: s.mode,
      adapter: s.adapter,
      nodeCount: s.nodes.length
    };
  })()`);

  console.log('DOM Audit Summary:', JSON.stringify(domAudit, null, 2));

  // RESPONSIVENESS AUDIT (1920, 1440, 1366x768, 1280)
  console.log('\n=== RESPONSIVENESS AUDIT ===');
  const breakpoints = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 800 }
  ];

  const responsiveResults = [];
  for (const bp of breakpoints) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: bp.width,
      height: bp.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(400);

    const bpCheck = await evalJs(`(() => {
      const topBar = document.querySelector('header') || document.querySelector('.h-10');
      const verbRail = document.querySelector('aside') || document.querySelector('.fixed.left-0');
      const bodyOverflowX = document.body.scrollWidth > window.innerWidth;
      const topBarRect = topBar ? topBar.getBoundingClientRect() : null;
      const verbRailRect = verbRail ? verbRail.getBoundingClientRect() : null;

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        hasHorizontalOverflow: bodyOverflowX,
        scrollWidth: document.body.scrollWidth,
        topBarVisible: Boolean(topBar && topBarRect && topBarRect.width > 0),
        verbRailVisible: Boolean(verbRail && verbRailRect && verbRailRect.height > 0)
      };
    })()`);
    responsiveResults.push(bpCheck);
  }
  console.log('Responsive Results:', JSON.stringify(responsiveResults, null, 2));

  // Reset viewport
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  // VERIFY DESCENT MODE DOM
  console.log('\n=== AUDIT DESCENT MODE DOM ===');
  await evalJs(`window.__cortex_store.getState().setMode('descent')`);
  await sleep(800);
  const descentDom = await evalJs(`(() => {
    const heroH1 = document.querySelector('h1');
    const heroButtons = Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent.trim(),
      classes: b.className
    }));
    const overlay = document.querySelector('[data-descent-overlay]') || document.querySelector('.fixed.inset-0') || document.querySelector('main');
    return {
      h1: heroH1 ? {
        text: heroH1.textContent.trim(),
        classes: heroH1.className,
        computedFont: getComputedStyle(heroH1).fontFamily,
        computedSize: getComputedStyle(heroH1).fontSize,
        computedTracking: getComputedStyle(heroH1).letterSpacing
      } : null,
      buttons: heroButtons,
      overlayClasses: overlay ? overlay.className : null
    };
  })()`);
  console.log('Descent DOM:', JSON.stringify(descentDom, null, 2));

  // Reset to instrument mode
  await evalJs(`window.__cortex_store.getState().setMode('instrument')`);
  await sleep(400);

  ws.close();
  edge.kill();
  console.log('\n--- Headless Edge Audit Complete ---');
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
