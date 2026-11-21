'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4291;
const CDP_PORT = 9228;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json'
};

function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Chrome/Edge executable not found');
}

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0];
      const filePath = path.join(ROOT, cleanUrl === '/' ? 'src/popup/popup.html' : cleanUrl);
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function waitForJson(url, retries = 30) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      http.get(url, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      }).on('error', (err) => {
        if (left <= 0) return reject(err);
        setTimeout(() => attempt(left - 1), 250);
      });
    };
    attempt(retries);
  });
}

class SimpleCDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params?.exceptionDetails?.exception?.description || msg.params?.exceptionDetails?.text || 'Runtime error';
        this.errors.push(desc);
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 900));
  }

  close() {
    this.ws.close();
  }
}

async function run() {
  const chromePath = findChrome();
  const server = await startStaticServer();
  const userDataDir = path.join(ROOT, '.tmp-e2e-profile');
  fs.rmSync(userDataDir, { recursive: true, force: true });

  const proc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    'about:blank'
  ], { stdio: 'ignore' });

  let cdp = null;
  try {
    const targets = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    cdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    // Test 1: Brand-New 3-Tab Popup UI — AMOLED theme, Light toggle, Zero Overflow, Screenshot
    console.log('[E2E 1/3] Testing New 3-Tab Popup UI (AMOLED/Light + zero horizontal clipping)...');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 384, height: 640, deviceScaleFactor: 1, mobile: false });
    await cdp.navigate(`http://127.0.0.1:${PORT}/src/popup/popup.html`);

    // Capture screenshot of new AMOLED Popup UI
    const popupShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'tests', 'popup-preview.png'), Buffer.from(popupShot.data, 'base64'));

    const popupCheck = await cdp.eval(`(() => {
      const amoledBg = getComputedStyle(document.body).backgroundColor;
      const overflowX = document.documentElement.scrollWidth > 384;
      const modeCards = document.querySelectorAll('.mode-item').length;

      // Switch to Tab 3 (Sites) and check zero clipping on 3 action buttons
      document.querySelector('[data-tab="sites"]').click();
      const siteBtns = Array.from(document.querySelectorAll('#tab-sites .flat-btn'));
      const anyClipped = siteBtns.some(b => b.getBoundingClientRect().right > 384);

      // Switch to Tab 2 (Color & Tune), pick Cinema profile, toggle Anti-Flash, move slider
      document.querySelector('[data-tab="tune"]').click();
      const colorCount = document.querySelectorAll('.color-pill').length;
      document.querySelector('[data-color="cinema"]').click();
      const cpDesc = document.getElementById('colorProfileDesc').textContent;
      const playerBtnChecked = document.getElementById('optShowPlayerButton').checked;
      const slider = document.getElementById('rangeCas');
      slider.value = '60';
      slider.dispatchEvent(new Event('input'));
      const casText = document.getElementById('valCas').textContent;

      return { amoledBg, overflowX, anyClipped, modeCards, colorCount, cpDesc, playerBtnChecked, casText };
    })()`);

    // Capture screenshot of Tab 2 ("Цвет и текст") in AMOLED theme
    const tab2Shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'tests', 'popup-color-tab.png'), Buffer.from(tab2Shot.data, 'base64'));

    const lightBg = await cdp.eval(`(() => {
      document.getElementById('themeToggleBtn').click();
      return getComputedStyle(document.body).backgroundColor;
    })()`);

    console.log('[E2E 1/3] Popup result:', { ...popupCheck, lightBg });
    if (popupCheck.amoledBg !== 'rgb(0, 0, 0)') throw new Error('AMOLED background is not true black: ' + popupCheck.amoledBg);
    if (lightBg !== 'rgb(255, 255, 255)') throw new Error('Light background is not white: ' + lightBg);
    if (popupCheck.overflowX || popupCheck.anyClipped) throw new Error('Popup UI overflow/clipping detected');
    if (popupCheck.modeCards < 6 || popupCheck.colorCount !== 6 || !popupCheck.playerBtnChecked || popupCheck.casText !== '60%') {
      throw new Error('New popup controls failed: ' + JSON.stringify(popupCheck));
    }

    // Test 2: Onboarding GPU Benchmark — real WebGL2 compilation & timing of all 3 shaders
    console.log('[E2E 2/3] Testing Onboarding real WebGL2 GPU Benchmark...');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp.navigate(`http://127.0.0.1:${PORT}/src/pages/onboarding.html`);

    // Wait up to 20 seconds for real Anime4K v4 CNN shader compilation + GPU benchmark to complete
    let benchRes = null;
    for (let i = 0; i < 45; i++) {
      benchRes = await cdp.eval(`(() => {
        const area = document.getElementById('benchResultArea');
        if (!area || area.style.display === 'none') return null;
        return {
          gpuName: document.getElementById('gpuName').textContent,
          gpuClass: document.getElementById('gpuClass').textContent,
          fast: document.getElementById('scoreFast').textContent,
          balanced: document.getElementById('scoreBalanced').textContent,
          quality: document.getElementById('scoreQuality').textContent,
          ultra: document.getElementById('scoreUltra').textContent,
          flow: document.getElementById('scoreFlow').textContent,
          recTitle: document.getElementById('recTitle').textContent,
          recDetails: document.getElementById('recDetails').textContent
        };
      })()`);
      if (benchRes) break;
      await new Promise(r => setTimeout(r, 450));
    }

    console.log('[E2E 2/3] Benchmark result:', benchRes);
    if (!benchRes || (!benchRes.fast.includes('мс') && !benchRes.fast.includes('ms')) || (!benchRes.flow.includes('мс') && !benchRes.flow.includes('ms'))) {
      throw new Error('GPU Benchmark did not produce valid ms measurements');
    }

    // Test 3: Live 720p -> 2K Anime4K Max Pipeline, Split-Handle Guard, Disable Guard & Visual Screenshot
    console.log('[E2E 3/3] Testing Live Anime4K Max Pipeline, Split-Handle Guard & Visual Sharpness...');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
    await cdp.navigate(`http://127.0.0.1:${PORT}/demo/test-player.html`);
    await new Promise(r => setTimeout(r, 1200));

    const videoCheck = await cdp.eval(`(async () => {
      const api = window.LumaScaleContentApi;
      if (!api) return { error: 'Content API missing' };

      // 1) Verify split-handle and split button are strictly HIDDEN when splitScreen is false!
      api.applySettings({
        ...api.getSettings(),
        enabled: true,
        tier: 'ultra',
        mode: 'mode_gan',
        colorProfile: 'vivid',
        resolution: '1440p',
        interpolation: 'off',
        splitScreen: false,
        showHud: true
      });
      await new Promise(r => setTimeout(r, 1400));
      const handle = document.querySelector('.lumascale-split-handle');
      const handleWhenSplitOff = handle ? getComputedStyle(handle).display : 'missing';
      const controls = document.querySelector('.anipure-overlay-controls, .lumascale-overlay-controls');
      const splitBtn = controls ? controls.querySelector('[data-act="split"]') : null;
      const splitBtnWhenSplitOff = splitBtn ? getComputedStyle(splitBtn).display : 'missing';

      // 2) Turn split-screen ON and verify handle and split button appear
      api.applySettings({
        ...api.getSettings(),
        splitScreen: true,
        splitPosition: 0.5
      });
      await new Promise(r => setTimeout(r, 700));
      const handleWhenSplitOn = handle ? getComputedStyle(handle).display : 'missing';
      const splitBtnWhenSplitOn = splitBtn ? getComputedStyle(splitBtn).display : 'missing';
      const t = api.getTelemetry();
      const canvas = document.querySelector('.lumascale-canvas');
      const displayWhenOn = canvas ? getComputedStyle(canvas).display : 'missing';

      const toggleText = controls ? controls.querySelector('.ls-toggle-text').textContent : '';
      const initialOpacity = controls ? getComputedStyle(controls).opacity : '';
      const initialVisibility = controls ? getComputedStyle(controls).visibility : '';

      // Test corner hover hotspot triggers visibility and lingers for 1s before smooth fade-out
      const host = document.querySelector('.anipure-host, .lumascale-host');
      const classBefore = controls ? controls.className : 'no-ctrl';
      const hostRect = host ? host.getBoundingClientRect() : { right: 800, top: 0, width: 800, height: 450 };
      if (host) {
        host.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          clientX: hostRect.right - 20,
          clientY: hostRect.top + 20
        }));
      }
      const classAfter = controls ? controls.className : 'no-ctrl';
      await new Promise(r => setTimeout(r, 260));
      const activeOpacity = controls ? getComputedStyle(controls).opacity : '';

      if (host) host.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      const classAfterLeave = controls ? controls.className : 'no-ctrl';
      await new Promise(r => setTimeout(r, 1400));
      const postLeaveOpacity = controls ? getComputedStyle(controls).opacity : '';

      // Test interactive button clicks directly on the player
      const toggleBtn = controls ? controls.querySelector('[data-act="toggle"]') : null;
      const textBeforeClick = toggleBtn ? toggleBtn.querySelector('.ls-toggle-text').textContent : '';
      if (toggleBtn) toggleBtn.click();
      const textAfterClick = toggleBtn ? toggleBtn.querySelector('.ls-toggle-text').textContent : '';
      if (toggleBtn) toggleBtn.click(); // restore
      const textRestored = toggleBtn ? toggleBtn.querySelector('.ls-toggle-text').textContent : '';

      // Test that clicking toggle button does NOT leave controls stuck visible after mouse leaves!
      if (host) host.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      await new Promise(r => setTimeout(r, 1400));
      const postClickLeaveOpacity = controls ? getComputedStyle(controls).opacity : '';

      return {
        handleWhenSplitOff,
        handleWhenSplitOn,
        splitBtnWhenSplitOff,
        splitBtnWhenSplitOn,
        displayWhenOn,
        canvasW: canvas ? canvas.width : 0,
        canvasH: canvas ? canvas.height : 0,
        telemetry: t,
        overlayCheck: {
          toggleText,
          classBefore,
          classAfter,
          classAfterLeave,
          initialOpacity,
          initialVisibility,
          activeOpacity,
          postLeaveOpacity,
          postClickLeaveOpacity,
          textBeforeClick,
          textAfterClick,
          textRestored
        }
      };
    })()`);

    // Capture a real screenshot of the split-screen Anime4K comparison on the user's RTX 4060!
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(ROOT, 'tests', 'split-preview.png');
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));

    // 3) Regression test: disabling extension MUST hide canvas AND split handle immediately!
    const disableCheck = await cdp.eval(`(async () => {
      const api = window.LumaScaleContentApi;
      const canvas = document.querySelector('.lumascale-canvas');
      const handle = document.querySelector('.lumascale-split-handle');
      api.applySettings({ ...api.getSettings(), enabled: false });
      await new Promise(r => setTimeout(r, 200));
      const displayWhenOff = canvas ? getComputedStyle(canvas).display : 'missing';
      const handleWhenOff = handle ? getComputedStyle(handle).display : 'missing';

      api.applySettings({ ...api.getSettings(), enabled: true, splitScreen: false });
      await new Promise(r => setTimeout(r, 300));
      const displayAfterResume = canvas ? getComputedStyle(canvas).display : 'missing';
      const handleAfterResume = handle ? getComputedStyle(handle).display : 'missing';
      return { displayWhenOff, handleWhenOff, displayAfterResume, handleAfterResume };
    })()`);

    console.log('[E2E 3/3] Video pipeline result:', { ...videoCheck, ...disableCheck, screenshotSaved: shotPath });
    if (videoCheck.handleWhenSplitOff !== 'none') {
      throw new Error('Split handle was stuck visible when splitScreen=false: ' + videoCheck.handleWhenSplitOff);
    }
    if (videoCheck.splitBtnWhenSplitOff !== 'none') {
      throw new Error('Split button was visible when splitScreen=false: ' + videoCheck.splitBtnWhenSplitOff);
    }
    if (videoCheck.handleWhenSplitOn === 'none') {
      throw new Error('Split handle failed to appear when splitScreen=true');
    }
    if (videoCheck.splitBtnWhenSplitOn === 'none') {
      throw new Error('Split button failed to appear when splitScreen=true');
    }
    if (!videoCheck.overlayCheck || !videoCheck.overlayCheck.toggleText.includes('AniPure')) {
      throw new Error('Overlay toggle button text does not contain AniPure: ' + JSON.stringify(videoCheck.overlayCheck));
    }
    if (videoCheck.overlayCheck.activeOpacity !== '1') {
      throw new Error('Overlay controls did not become visible on mousemove: ' + JSON.stringify(videoCheck.overlayCheck));
    }
    if (videoCheck.overlayCheck.postLeaveOpacity !== '0') {
      throw new Error('Overlay controls failed to autohide on mouseleave: ' + JSON.stringify(videoCheck.overlayCheck));
    }
    const isRu = videoCheck.overlayCheck.textBeforeClick.includes('ВКЛ');
    const expectedBefore = isRu ? 'AniPure: ВКЛ' : 'AniPure: ON';
    const expectedAfter = isRu ? 'AniPure: ВЫКЛ' : 'AniPure: OFF';
    if (videoCheck.overlayCheck.textBeforeClick !== expectedBefore || videoCheck.overlayCheck.textAfterClick !== expectedAfter || videoCheck.overlayCheck.textRestored !== expectedBefore) {
      throw new Error('Overlay toggle button click test failed: ' + JSON.stringify(videoCheck.overlayCheck));
    }
    if (videoCheck.overlayCheck.postClickLeaveOpacity !== '0') {
      throw new Error('Controls remained stuck visible after clicking toggle: ' + JSON.stringify(videoCheck.overlayCheck));
    }
    if (videoCheck.displayWhenOn === 'none' || videoCheck.canvasW < 1920) {
      throw new Error('WebGL2 Anime4K canvas did not upscale properly: ' + JSON.stringify(videoCheck));
    }
    if (disableCheck.displayWhenOff !== 'none' || disableCheck.handleWhenOff !== 'none') {
      throw new Error('Canvas or handle stayed visible when disabled: ' + JSON.stringify(disableCheck));
    }
    if (disableCheck.displayAfterResume === 'none' || disableCheck.handleAfterResume !== 'none') {
      throw new Error('Resume state incorrect: ' + JSON.stringify(disableCheck));
    }
    if (cdp.errors.length > 0) {
      throw new Error('Runtime JS/WebGL errors detected: ' + cdp.errors.join(' | '));
    }

    console.log('[E2E] ALL 3 WEBGL2 + UI TESTS PASSED (100% PASS)');
  } finally {
    if (cdp) cdp.close();
    proc.kill();
    server.close();
    setTimeout(() => fs.rmSync(userDataDir, { recursive: true, force: true }), 400);
  }
}

run().catch((err) => {
  console.error('[E2E] FAILED:', err);
  process.exit(1);
});
