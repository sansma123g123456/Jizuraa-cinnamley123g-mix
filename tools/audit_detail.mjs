import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function createMockCtx() {
  const state = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', filter: 'none', shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, lineJoin: 'miter', lineCap: 'butt' };
  const ctx = {
    canvas: { width: 1920, height: 1080 },
    save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {},
    fillText() {}, strokeText() {}, drawImage() {},
    translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return { setTransform() {} }; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    measureText(t) { return { width: String(t).length * 10 }; },
    clip() {}, setLineDash() {}, getLineDash() { return []; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, rotate() {}, translate() {}, scale() {} }; },
  };
  for (const k of ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'font', 'textAlign', 'textBaseline', 'filter', 'lineJoin', 'lineCap', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'imageSmoothingEnabled']) {
    Object.defineProperty(ctx, k, { get() { return state[k]; }, set(v) { state[k] = v; } });
  }
  return ctx;
}

const env = {
  console: { log() {}, warn() {}, error() {} }, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, Date, Math, JSON, URL,
  navigator: { userAgent: 'node' }, location: { protocol: 'file:', href: 'file:///index.html', hostname: '' },
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
  document: {
    documentElement: { lang: 'vi', style: {} },
    createElement: () => ({ getContext: () => createMockCtx(), width: 0, height: 0, style: {}, addEventListener: () => {}, appendChild: () => {} }),
    getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
    addEventListener: () => {}, body: { appendChild: () => {}, style: {} }, head: { appendChild: () => {} },
  },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};
env.window = env; env.globalThis = env; env.self = env; env.document.defaultView = env;
const ctx = vm.createContext(env);
vm.runInContext(scripts[4], ctx);
const J = env.J;

function makeEnv(W, H, sc, st, cut, t, log) {
  const c = createMockCtx();
  const e = {
    ctx: c, W, H, sc, st, fx: J.defaultProject().fx, plan: { events: [] },
    cut, t, lt: t, ltb: t, pIn: 1, pOut: 0, step: 24, pass: 'main', scale: 1, allowFilter: true, beat: null, energy: null,
  };
  const colOf = (col, g) => (e.pass !== 'main' ? (g === false ? null : e.passColor) : col);
  e.draw = it => { log.deco.push(it); return J.drawItem(e, it); };
  e.rect = (x, y, w, h, col, a = 1, g = true) => { const k = colOf(col, g); if (!k || a <= 0) return; c.globalAlpha = a; c.fillStyle = k; c.fillRect(x, y, w, h); c.globalAlpha = 1; };
  e.line = (pts, col, lw = 1, a = 1, g = true) => { const k = colOf(col, g); if (!k || a <= 0 || pts.length < 2) return; c.globalAlpha = a; c.strokeStyle = k; c.lineWidth = lw; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.stroke(); c.globalAlpha = 1; };
  e.polyPartial = (pts, pr, col, lw = 1, a = 1, g = true) => { if (pr <= 0) return; e.line(pts, col, lw, a, g); };
  e.circle = (cx, cy, r, fill, stroke, lw = 1, a = 1, g = true) => { if (r <= 0 || a <= 0) return; c.globalAlpha = a; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); if (fill) { c.fillStyle = colOf(fill, g); c.fill(); } if (stroke) { c.strokeStyle = colOf(stroke, g); c.lineWidth = lw; c.stroke(); } c.globalAlpha = 1; };
  e.arc = (cx, cy, r, a0, a1, col, lw = 1, a = 1, g = true) => { const k = colOf(col, g); if (!k || a <= 0) return; c.globalAlpha = a; c.strokeStyle = k; c.lineWidth = lw; c.beginPath(); c.arc(cx, cy, r, a0 * J.DEG, a1 * J.DEG); c.stroke(); c.globalAlpha = 1; };
  e.rrect = (x, y, w, h, r, fill, a = 1, g = true, stroke, lw = 1) => { if (a <= 0) return; c.globalAlpha = a; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (fill) { c.fillStyle = colOf(fill, g); c.fill(); } if (stroke) { c.strokeStyle = colOf(stroke, g); c.lineWidth = lw; c.stroke(); } c.globalAlpha = 1; };
  e.poly = (pts, col, a = 1, g = true) => { const k = colOf(col, g); if (!k || a <= 0) return; c.globalAlpha = a; c.fillStyle = k; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); c.globalAlpha = 1; };
  e.blob = (pts, col, a = 1, g = true) => { const k = colOf(col, g); if (!k || a <= 0) return; c.globalAlpha = a; c.fillStyle = k; c.beginPath(); const n = pts.length, mid = i => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2]; const m0 = mid(0); c.moveTo(m0[0], m0[1]); for (let i = 1; i <= n; i++) { const p = pts[i % n], m = mid(i); c.quadraticCurveTo(p[0], p[1], m[0], m[1]); } c.closePath(); c.fill(); c.globalAlpha = 1; };
  return e;
}

const TEXTS = [
  ['vn-short', 'Giai điệu'],
  ['vn-mid', 'Ánh ban mai vẫn còn đây'],
  ['vn-long', 'Kỷ niệm ngày xưa vang vọng trong ký ức'],
  ['jp', '夜明けの光が丘を越えてゆく'],
  ['en', 'The morning light is breaking through'],
];
const W = 1920, H = 1080;
const only = process.argv[2] ? process.argv[2].split(',') : null;

for (const key of J.order('layout')) {
  if (only && !only.some(o => key.includes(o))) continue;
  const L = J.LAYOUTS[key];
  if (!L || L.special) continue;
  const lines = [];
  for (const [label, text] of TEXTS) {
    const st = J.resolveStyle(J.defaultProject());
    const rng = J.rng(J.h(J.sid('layout:' + key + ':' + label), 3, 7));
    let params = {};
    try { params = L.plan(rng, { text, n: [...text].length, W, H, dur: 2.4 }, st) || {}; } catch (e) { params = {}; }
    const log = { main: [], deco: [] };
    const orig = J.mainDraw;
    J.mainDraw = (e, it) => { log.main.push({ size: it.size, text: it.text }); return orig(e, it); };
    const cut = { text, lineText: text, seed: 1, dur: 2.4, inDur: 0.3, outDur: 0.3, stagger: 0.04, params, scheme: 0, words: [], treat: 'none', treatP: {} };
    const e2 = makeEnv(W, H, st.schemes[0], st, cut, 1, log);
    let bb = null, err = null;
    try { bb = L.render(e2); } catch (e) { err = e.message; }
    J.mainDraw = orig;
    if (err) { lines.push(`  ${label.padEnd(9)} ERROR ${err}`); continue; }
    const mainSizes = log.main.map(m => m.size);
    const size = mainSizes.length ? Math.max(...mainSizes) : 0;
    const decoSizes = log.deco.map(d => d.size);
    const decoMin = decoSizes.length ? Math.min(...decoSizes) : null;
    const m = bb && isFinite(bb.x0) ? { l: Math.round(bb.x0), t: Math.round(bb.y0), r: Math.round(W - bb.x1), b: Math.round(H - bb.y1) } : null;
    lines.push(`  ${label.padEnd(9)} main=${size.toFixed(1).padStart(6)}px deco=${decoMin == null ? '-' : decoMin.toFixed(0) + 'px'} margins(l,t,r,b)=${m ? `${m.l},${m.t},${m.r},${m.b}` : 'null'}`);
  }
  console.log(`${key}`);
  console.log(lines.join('\n'));
}
