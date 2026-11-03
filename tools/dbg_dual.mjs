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
    measureText(t) { return { width: String(t).length * 10 }; }, clip() {}, setLineDash() {}, getLineDash() { return []; },
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
console.log('styles fonts', JSON.stringify(st.fonts));
const rng = J.rng(J.h(J.sid('x'), 3, 7));
const P = J.LAYOUTS['cinDualColumn'].plan(rng, { text: 'A', n: 1, W: 1920, H: 1080, dur: 2 }, st);
console.log('plan', JSON.stringify(P));
const o = { track: 0.02, lead: 1.34 };
const a = 'Ánh ban mai', b = 'vẫn còn đây';
console.log('fit', J.fitSize(a + '\n' + b, P.font, 1920 * 0.4, 1080 * 0.44, o));
const size = Math.min(J.fitSize(a + '\n' + b, P.font, 1920 * 0.4, 1080 * 0.44, o), 1080 * 0.055);
console.log('size', size);
console.log('meas a', JSON.stringify(J.measure({ text: a, font: P.font, size, track: 0.02, lead: 1.34 })));
console.log('meas b', JSON.stringify(J.measure({ text: b, font: P.font, size, track: 0.02, lead: 1.34 })));
