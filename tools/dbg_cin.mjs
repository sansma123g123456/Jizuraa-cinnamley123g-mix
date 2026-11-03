import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
function createMockCtx() {
  const state = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', filter: 'none', shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, lineJoin: 'miter', lineCap: 'butt' };
  const ctx = {
    canvas: { width: 1920, height: 1080 }, save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {},
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return { setTransform() {} }; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    measureText(t) {
      const s = String(t); const m = /(\d+(?:\.\d+)?)px/.exec(state.font); const px = m ? parseFloat(m[1]) : 10;
      let w = 0;
      for (const ch of s) { const c = ch.codePointAt(0);
        if (c > 0x2e80) w += 1.0; else if (ch === ' ') w += 0.3;
        else if (ch >= '0' && ch <= '9') w += 0.56; else if (ch >= 'A' && ch <= 'Z') w += 0.66; else if (ch >= 'a' && ch <= 'z') w += 0.52;
        else if ('.,:;!|\'"()[]'.includes(ch)) w += 0.3;
        else if ('ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ'.includes(ch)) w += 0.6;
        else if ('àáâãèéêìíòóôõùúăđĩũơư'.includes(ch)) w += 0.52; else w += 0.55; }
      return { width: w * px };
    },
    clip() {}, setLineDash() {}, getLineDash() { return []; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, rotate() {}, translate() {}, scale() {} }; },
  };
  for (const k of ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'filter', 'lineJoin', 'lineCap', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'imageSmoothingEnabled'])
    Object.defineProperty(ctx, k, { get() { return state[k]; }, set(v) { state[k] = v; } });
  return ctx;
}
const env = {
  console: { log() {}, warn() {}, error() {} }, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, Date, Math, JSON, URL,
  navigator: { userAgent: 'node' }, location: { protocol: 'file:', href: 'file:///index.html', hostname: '' },
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
  document: { documentElement: { lang: 'vi', style: {} }, createElement: () => ({ getContext: () => createMockCtx(), width: 0, height: 0, style: {}, addEventListener: () => {}, appendChild: () => {} }), getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {}, body: { appendChild: () => {}, style: {} }, head: { appendChild: () => {} } },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};
env.window = env; env.globalThis = env; env.self = env; env.document.defaultView = env;
const ctx = vm.createContext(env); vm.runInContext(scripts[4], ctx);
const J = env.J;
const st = J.resolveStyle(J.defaultProject());
const W = 1920, H = 1080;

const cases = [
  ['cinVerticalDrift', 'Giai điệu Ánh ban mai vẫn còn đây'],
  ['cinStackKanji', 'Giai điệu Ánh ban mai vẫn còn đây'],
  ['cinDualColumn', 'Giai điệu Ánh ban mai vẫn còn đây Kỷ niệm ngày xưa'],
  ['cinPosterBig', 'Giai điệu Ánh ban mai'],
  ['cinNewsTicker', 'Giai điệu Ánh ban mai vẫn còn đây'],
  ['cinCornerStack', 'Giai điệu Ánh ban mai vẫn còn đây'],
];
for (const [key, text] of cases) {
  const L = J.LAYOUTS[key];
  const rng = J.rng(J.h(J.sid('dbg:' + key), 3, 7));
  const P = L.plan(rng, { text, n: J.glyphCount(text), W, H, dur: 2.4 }, st);
  console.log('===', key, 'text=', JSON.stringify(text));
  console.log('  glyphCount=', J.glyphCount(text), 'params=', JSON.stringify(P));
  if (key === 'cinVerticalDrift' || key === 'cinStackKanji') {
    const n = Math.max(1, J.glyphCount(text));
    const size = Math.min(H * (P.size || 0.13), W * 0.22, (H * 0.82) / n);
    console.log('  computed size=', size.toFixed(1), ' (H*0.82/n=', (H * 0.82 / n).toFixed(1), ')');
    console.log('  measured vertical=', JSON.stringify((({ w, h }) => ({ w: +w.toFixed(1), h: +h.toFixed(1) }))(J.measure({ text, font: P.font, size, vertical: true, track: 0.06, lead: 1.28 }))));
  }
  if (key === 'cinDualColumn') {
    const arr = [...text.replace(/\s+/g, ' ')].filter(c => c !== ' ');
    const half = Math.ceil(arr.length / 2);
    const a = arr.slice(0, half).join(' '), b = arr.slice(half).join(' ');
    const o = { track: 0.02, lead: 1.34 };
    const size = Math.min(J.fitSize(a + '\n' + b, P.font, W * 0.4, H * 0.44, o), H * 0.055);
    console.log('  size=', size.toFixed(1), 'colW=', W * 0.4, 'rx=', W * 0.73);
    console.log('  meas a=', J.measure({ text: a, font: P.font, size, track: 0.02, lead: 1.34 }).w.toFixed(1), 'meas b=', J.measure({ text: b, font: P.font, size, track: 0.02, lead: 1.34 }).w.toFixed(1));
    console.log('  b right edge=', (W * 0.73 + J.measure({ text: b, font: P.font, size, track: 0.02, lead: 1.34 }).w).toFixed(1), '/', W);
  }
  if (key === 'cinPosterBig') {
    const numSize = Math.min(H * 0.42, W * 0.26);
    console.log('  numSize=', numSize.toFixed(1), 'nx=', W * 0.16, 'numW=', J.measure({ text: P.num, font: (st.fonts.display && st.fonts.display[0]) || 'gothic_black', size: numSize, track: -0.02 }).w.toFixed(1));
    console.log('  num left edge=', (W * 0.16 - J.measure({ text: P.num, font: (st.fonts.display && st.fonts.display[0]) || 'gothic_black', size: numSize, track: -0.02 }).w / 2).toFixed(1));
  }
  if (key === 'cinNewsTicker') {
    const size = Math.min(H * (P.size || 0.03), W * 0.05);
    console.log('  size=', size.toFixed(1), 'y=', H * 0.93, 'barH=', (size * 1.9).toFixed(1));
  }
}
