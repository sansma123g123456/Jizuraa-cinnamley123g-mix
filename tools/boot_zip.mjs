import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const DIR = process.argv[2] || '.tmp_extract';
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const scripts = [];
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html))) scripts.push(m[1]);

function mockCtx() {
  const st = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', filter: 'none', shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, lineJoin: 'miter', lineCap: 'butt' };
  const c = {
    canvas: { width: 1920, height: 1080 },
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, rect() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {},
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({ setTransform() {} }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    measureText: t => ({ width: String(t).length * 10 }),
    clip() {}, setLineDash() {}, getLineDash: () => [], getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  return c;
}
function bootEnv() {
  const env = {
    console, performance: { now: () => Date.now() },
    setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    setInterval: () => 0, clearInterval: () => {},
    Date, Math, JSON, URL, Blob: class {}, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, WeakMap, Map, Set,
    navigator: { userAgent: 'node', serviceWorker: { register: () => Promise.resolve(), addEventListener: () => {} } },
    location: { protocol: 'file:', href: 'file:///index.html', hostname: '', search: '' },
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    document: {
      documentElement: { lang: 'vi', style: {} },
      createElement: () => ({ getContext: () => mockCtx(), width: 0, height: 0, style: {}, addEventListener: () => {}, appendChild: () => {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }),
      getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: () => {},
      body: { appendChild: () => {}, style: {}, classList: { add() {}, remove() {}, contains: () => false } },
      head: { appendChild: () => {} },
    },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  env.window = env; env.globalThis = env; env.self = env; env.document.defaultView = env;
  return env;
}

console.log('DIR=' + DIR + ' scripts=' + scripts.length);
const env = bootEnv();
const ctx = vm.createContext(env);
try {
  vm.runInContext(scripts[4], ctx);
  const J = env.J;
  console.log('J booted OK');
  const groups = ['layout', 'enter', 'hold', 'exit', 'decor', 'treat', 'bg', 'cam', 'fx', 'trans'];
  let total = 0;
  for (const g of groups) { const n = J.order(g).length; total += n; console.log('  ' + g + ': ' + n); }
  console.log('total techniques: ' + total);
  const plan = J.previewPlan(J.defaultProject(), 'layout', 'center');
  const r = new J.Renderer();
  for (let i = 0; i < 8; i++) r.frame(mockCtx(), plan, i * 0.5, { scale: 0.1, fast: true, noHud: true });
  console.log('renderer OK');
  // AMV library + manager
  const env2 = bootEnv();
  const ctx2 = vm.createContext(env2);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'amv_asset_library.js'), 'utf8'), ctx2);
  console.log('AMVAssets OK: ' + Object.keys(env2.AMVAssets || {}).length + ' exports');
  const env3 = bootEnv();
  const ctx3 = vm.createContext(env3);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'src', 'amv_asset_manager.js'), 'utf8'), ctx3);
  console.log('AMVManager OK');
} catch (e) {
  console.log('FAILED: ' + e.message + '\n' + e.stack);
  process.exit(1);
}
