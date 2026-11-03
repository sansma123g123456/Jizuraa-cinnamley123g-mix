// Perf probe: measures per-frame render time + GC attribution for the 3 studio visualizers.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { PerformanceObserver } from 'node:perf_hooks';

const rootDir = process.cwd();
const rawHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const amvLibCode = fs.readFileSync(path.join(rootDir, 'amv_asset_library.js'), 'utf8');
const amvMgrCode = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8');

function extractScript(html, i) {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m, idx = 1;
  while ((m = re.exec(html)) !== null) { if (idx === i) return m[1]; idx++; }
  return null;
}

let save = 0, restore = 0;
const gradMock = { addColorStop: () => {} };
const ctx = {
  canvas: { width: 1920, height: 1080 }, globalCompositeOperation: 'source-over', globalAlpha: 1,
  strokeStyle: '#000', fillStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: 'transparent', lineDash: [],
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData: () => {}, drawImage: () => {}, measureText: t => ({ width: (t || '').length * 10 }),
  createPattern: () => ({}), save() { save++; }, restore() { restore++; },
  beginPath() {}, closePath() {}, stroke() {}, fill() {}, moveTo() {}, lineTo() {}, arc() {},
  quadraticCurveTo() {}, rect() {}, clearRect() {}, fillRect() {}, setLineDash(d) { ctx.lineDash = d; },
  createLinearGradient: () => gradMock, createRadialGradient: () => gradMock,
  translate() {}, rotate() {}, scale() {}, setTransform() {}
};
const pctx = new Proxy(ctx, {
  get(t, p) { if (p in t) return t[p]; return () => {}; },
  set(t, p, v) { t[p] = v; return true; }
});

let currentDropMul = 1.0, isDropSection = false;
function el(tag = 'div') {
  const e = { tagName: tag.toUpperCase(), value: '', dataset: {}, style: {},
    classList: { _c: new Set(), add(c) { this._c.add(c); }, remove(c) { this._c.delete(c); }, toggle() {}, contains(c) { return this._c.has(c); } },
    children: [], appendChild(c) { return c; }, append() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() {}, setAttribute() {}, getAttribute() { return null; }, removeAttribute() {}, hasAttribute() { return false; },
    closest: () => el('div'), insertAdjacentElement() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    getContext: () => (typeof pctx !== 'undefined' ? pctx : ctx), querySelector: () => el('div'), querySelectorAll: () => [], focus() {}, select() {}, scrollIntoView() {} };
  e.parentElement = e; return e;
}

const env = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
  requestAnimationFrame: () => 1, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
  document: { readyState: 'complete', head: el('head'), body: el('body'), documentElement: el('html'),
    addEventListener() {}, removeEventListener() {}, getElementById: id => el(id.includes('Canvas') ? 'canvas' : 'div'),
    querySelector: () => el('div'), querySelectorAll: () => [], createElement: t => el(t),
    createDocumentFragment: () => el('frag'), createTextNode: t => ({ nodeValue: t }) },
  navigator: { userAgent: 'node', onLine: true }, location: { href: 'http://localhost/' },
  performance, Float32Array, Uint8Array, Uint8ClampedArray, Int32Array,
  AudioContext: class {}, OfflineAudioContext: class {},
  Image: class { constructor() { this.width = 100; this.height = 100; } },
  S: { playing: true, exporting: false, t: 1.0,
    plan: { duration: 180, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], energy: [0.65, 0.82, 0.74, 0.91, 0.88, 0.7, 0.95], energyRate: 10 },
    audio: null, project: { aspect: '16:9', res: 1080, fps: 60 } },
  J: { fmtTime: t => String(t.toFixed(2)), clamp: (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)),
    prevBeat: (beats, t) => beats ? beats[Math.floor(t % beats.length)] : 0,
    designSize: a => a === '9:16' ? [1080, 1920] : [1920, 1080] },
  toast() {}, renderSecondaryPreview() {},
  SmartSectionAPI: { isDrop: () => isDropSection, getDropImpactMultiplier: () => currentDropMul, applyToPlan() {}, getSectionAt: () => null },
  setSimulatedDrop: (d, m = 2) => { isDropSection = d; currentDropMul = m; }
};
env.window = env; env.document.defaultView = env; env.globalThis = env; env.self = env;

const context = vm.createContext(env);
for (const s of [extractScript(rawHtml, 1), amvLibCode, amvMgrCode, ...[5, 6, 7, 8, 9, 10, 11, 12].map(i => extractScript(rawHtml, i))]) {
  vm.runInContext(s, context);
}

const viz = env.AudioVisualizerAPI;
viz.enable();

let gcTotal = 0;
const obs = new PerformanceObserver(list => { for (const e of list.getEntries()) gcTotal += e.duration; });
obs.observe({ entryTypes: ['gc'] });

const styles = ['galaxy_orbit', 'cyber_ribbon_3d', 'holographic_lissajous'];
for (const style of styles) {
  viz.setStyle(style);
  for (let f = 0; f < 50; f++) viz.render(pctx, 1920, 1080, f / 60, {}, env.S.plan, null);
  const N = 500;
  const times = new Float64Array(N);
  const gcBefore = gcTotal;
  for (let f = 0; f < N; f++) {
    const t0 = performance.now();
    viz.render(pctx, 1920, 1080, f / 60, {}, env.S.plan, null);
    times[f] = performance.now() - t0;
  }
  const gcInRun = gcTotal - gcBefore;
  const s = [...times].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / N;
  const p50 = s[Math.floor(N * 0.5)], p95 = s[Math.floor(N * 0.95)], p99 = s[Math.floor(N * 0.99)];
  const over16 = s.filter(v => v >= 16.6).length;
  console.log(`${style.padEnd(22)} mean=${mean.toFixed(3)} p50=${p50.toFixed(3)} p95=${p95.toFixed(3)} p99=${p99.toFixed(3)} max=${s[N-1].toFixed(3)} frames>=16.6ms=${over16}/${N} gcPause=${gcInRun.toFixed(1)}ms`);
}
console.log('save/restore balance:', save, restore, save === restore);
