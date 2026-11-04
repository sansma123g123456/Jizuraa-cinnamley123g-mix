import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const amvLibCode = fs.readFileSync(path.join(rootDir, 'amv_asset_library.js'), 'utf8');
const amvMgrCode = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8');

function extractScripts(htmlContent) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const list = [];
  let match;
  while ((match = scriptRegex.exec(htmlContent)) !== null) list.push(match[1]);
  return list;
}

function createMockCtx() {
  const calls = [];
  const state = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', filter: 'none', shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, lineJoin: 'miter', lineCap: 'butt' };
  const ctx = {
    canvas: { width: 1920, height: 1080 },
    save() { calls.push('save'); }, restore() { calls.push('restore'); },
    beginPath() { calls.push('beginPath'); }, closePath() { calls.push('closePath'); },
    moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, rect() {},
    fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); },
    fillRect() { calls.push('fillRect'); }, strokeRect() { calls.push('strokeRect'); }, clearRect() { calls.push('clearRect'); },
    fillText() { calls.push('fillText'); }, strokeText() { calls.push('strokeText'); },
    drawImage() { calls.push('drawImage'); },
    translate() { calls.push('translate'); }, rotate() { calls.push('rotate'); }, scale() { calls.push('scale'); }, transform() { calls.push('transform'); }, setTransform() { calls.push('setTransform'); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return { setTransform() {} }; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    measureText(t) { return { width: String(t).length * 10 }; },
    clip() { calls.push('clip'); }, setLineDash() { calls.push('setLineDash'); }, getLineDash() { return []; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    set fillStyle(v) { state.fillStyle = v; }, get fillStyle() { return state.fillStyle; },
    set strokeStyle(v) { state.strokeStyle = v; }, get strokeStyle() { return state.strokeStyle; },
    set globalAlpha(v) { state.globalAlpha = v; }, get globalAlpha() { return state.globalAlpha; },
    set globalCompositeOperation(v) { state.globalCompositeOperation = v; }, get globalCompositeOperation() { return state.globalCompositeOperation; },
    set lineWidth(v) { state.lineWidth = v; }, get lineWidth() { return state.lineWidth; },
    set font(v) { state.font = v; }, get font() { return state.font; },
    set textAlign(v) { state.textAlign = v; }, get textAlign() { return state.textAlign; },
    set textBaseline(v) { state.textBaseline = v; }, get textBaseline() { return state.textBaseline; },
    set filter(v) { state.filter = v; }, get filter() { return state.filter; },
    set lineJoin(v) { state.lineJoin = v; }, get lineJoin() { return state.lineJoin; },
    set lineCap(v) { state.lineCap = v; }, get lineCap() { return state.lineCap; },
    set shadowColor(v) { state.shadowColor = v; }, get shadowColor() { return state.shadowColor; },
    set shadowBlur(v) { state.shadowBlur = v; }, get shadowBlur() { return state.shadowBlur; },
    set shadowOffsetX(v) { state.shadowOffsetX = v; }, get shadowOffsetX() { return state.shadowOffsetX; },
    set shadowOffsetY(v) { state.shadowOffsetY = v; }, get shadowOffsetY() { return state.shadowOffsetY; },
    set imageSmoothingEnabled(v) { state.imageSmoothingEnabled = v; }, get imageSmoothingEnabled() { return state.imageSmoothingEnabled; },
  };
  return ctx;
}

function createMockEnvironment() {
  const env = {
    console,
    performance: { now: () => Date.now() },
    setTimeout: (fn, ms) => { env._metrics.timeouts.push({ fn, ms }); return env._metrics.timeouts.length; },
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    Date, Math, JSON, URL, Blob: class {}, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder,
    navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: () => {} } },
    location: { protocol: 'file:', href: 'file:///index.html', hostname: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    document: {
      documentElement: { lang: 'vi', style: {} },
      createElement: () => ({ getContext: () => createMockCtx(), width: 0, height: 0, style: {}, addEventListener: () => {}, appendChild: () => {} }),
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      body: { appendChild: () => {}, style: {} },
      head: { appendChild: () => {} },
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    _metrics: { timeouts: [] },
  };
  env.window = env;
  env.globalThis = env;
  env.self = env;
  env.document.defaultView = env;
  return env;
}

const scripts = extractScripts(rawHtml);

function boot() {
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(scripts[4], context);
  return env;
}

const NEW = {
  layout: ['cinTitleCard', 'cinSplitFrame', 'cinVerticalDrift', 'cinNeonSign', 'cinSubtitleSafe', 'cinStackKanji',
    'cinKickerTitle', 'cinNewsTicker', 'cinPosterBig', 'cinCornerStack', 'cinDualColumn', 'cinMarqueeBox',
    'cinKaraokeHighlight', 'cinMorseCode', 'cinHexSlice'],
  enter: ['cinSlamIn', 'cinCascadeIn', 'cinIrisFocus', 'cinWhipIn', 'cinTypeOn', 'cinBeatZoom',
    'cinShatterIn', 'cinBlurBloomIn'],
  hold: ['cinFlickerHold', 'cinGlowBreathe', 'cinSplitFlicker', 'cinBeatPulse', 'cinWaveShift', 'cinGlitchPulse',
    'cinKineticUnderline', 'cinHexMorphHold'],
  exit: ['cinBurnOut', 'cinSplitExit', 'cinPixelDissolve', 'cinScatterOut', 'cinReverseExit', 'cinVerticalBlur',
    'cinLightLeakExit', 'cinSliceApartExit'],
  decor: ['cinFilmGate', 'cinAnamorphicFlare', 'cinTimecode', 'cinLetterboxBars', 'cinFilmDust', 'cinLensFlare',
    'cinSprocketHoles', 'cinDiagonalRule', 'cinNeonFrame', 'cinFilmLeader', 'cinSubtitleBar', 'cinDarkFrame',
    'cinBeatLetterbox', 'cinParallaxDust'],
  treat: ['cinChromeText', 'cinHologram', 'cinOutlineNeon', 'cinGradientSweep', 'cinRetroPrint', 'cinStencilBreak',
    'cinChromaticRamp', 'cinHalftoneDots'],
  bg: ['cinStageSpotlight', 'cinNeonGrid', 'cinRainBokeh', 'cinAuroraRift', 'cinHalftoneSun', 'cinDustMotes',
    'cinStarfield', 'cinInkWash', 'cinTunnelLights', 'cinCityBokeh', 'cinLaserGrid', 'cinCloudscape',
    'cinAudioParticles'],
  cam: ['cinKickPunch', 'cinSlowOrbit', 'cinSnapIn', 'cinHandheldShake', 'cinDutchAngle', 'cinZoomBreath',
    'cinRollingShutter', 'cinVertigoPush', 'cinCraneUp', 'cinSpinDolly', 'cinImpactShake', 'cinLensBreath',
    'cinParallaxPush'],
  fx: ['cinPrismShift', 'cinBarGlitch', 'cinVignettePulse', 'cinScanlineRoll', 'cinRGBStutter', 'cinEchoTrail',
    'cinVHSChroma', 'cinGlitchBlocks', 'cinChromaticWave', 'cinMirrorSplit', 'cinFlashFrames', 'cinDipToBlack',
    'cinFilmCountdown'],
  trans: ['cinFlashCut', 'cinWhipWipe', 'cinLightLeak', 'cinFilmBurn', 'cinIrisCircle', 'cinShutterBars',
    'cinInkSpread', 'cinVerticalSlide', 'cinSlicePush', 'cinDipToColor', 'cinZoomBlurTrans', 'cinRibbonWipe',
    'cinHexMosaic', 'cinGlitchSliceSwap'],
};

test('CIN MIX native techniques are registered in all 10 groups', () => {
  const env = boot();
  const J = env.J;
  for (const [g, keys] of Object.entries(NEW)) {
    for (const k of keys) {
      assert.ok(J.registry(g)[k], `${g}.${k} must be registered`);
      assert.ok(J.order(g).includes(k), `${g}.${k} must appear in J.order`);
      assert.ok(J.registry(g)[k].name, `${g}.${k} must have a name`);
    }
  }
});

test('CIN MIX techniques render preview plans without throwing', () => {
  const env = boot();
  const J = env.J;
  const project = J.defaultProject();
  for (const [g, keys] of Object.entries(NEW)) {
    for (const k of keys) {
      const plan = J.previewPlan(project, g, k);
      assert.ok(plan && plan.cuts.length, `${g}.${k} must produce a preview plan`);
      const ctx = createMockCtx();
      // render several frames so enter/exit/hold all get exercised
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.max(0.4, plan.duration);
        J.Renderer.prototype.frame.call(new J.Renderer(), ctx, plan, t, { scale: 0.1, fast: true, noHud: true });
      }
    }
  }
});

test('CIN MIX techniques survive the renderer post pipeline', () => {
  const env = boot();
  const J = env.J;
  const project = J.defaultProject();
  const r = new J.Renderer();
  for (const g of ['fx', 'trans', 'bg', 'cam', 'decor']) {
    for (const k of NEW[g]) {
      const plan = J.previewPlan(project, g, k);
      const ctx = createMockCtx();
      for (let i = 0; i < 6; i++) {
        r.frame(ctx, plan, (i / 6) * Math.max(0.4, plan.duration), { scale: 0.1, fast: true, noHud: true });
      }
    }
  }
});
