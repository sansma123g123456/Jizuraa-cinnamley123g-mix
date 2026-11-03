// Render one layout at several times and report the worst clipping, so we can tell
// a *static* layout bug apart from a transient camera/zoom effect.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function createMockCtx() {
  const state = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', filter: 'none', shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, lineJoin: 'miter', lineCap: 'butt' };
  let pathRects = [], clipRect = null, M = [1, 0, 0, 1, 0, 0];
  const clipStack = [], MStack = [];
  const ctx = {
    canvas: { width: 1920, height: 1080 },
    save() { clipStack.push(clipRect); MStack.push(M); }, restore() { clipRect = clipStack.pop() ?? null; M = MStack.pop() ?? [1, 0, 0, 1, 0, 0]; },
    beginPath() { pathRects = []; }, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    rect(x, y, w, h) { pathRects.push({ x, y, w, h }); }, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    translate(x, y) { M = mul(M, [1, 0, 0, 1, x, y]); }, rotate(a) { const c = Math.cos(a), s = Math.sin(a); M = mul(M, [c, s, -s, c, 0, 0]); },
    scale(x, y) { M = mul(M, [x, 0, 0, y, 0, 0]); }, transform(a, b, c, d, e, f) { M = mul(M, [a, b, c, d, e, f]); }, setTransform(a, b, c, d, e, f) { M = [a, b, c, d, e, f]; },
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; }, createPattern() { return { setTransform() {} }; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    measureText(t) {
      const s = String(t); const m = /(\d+(?:\.\d+)?)px/.exec(state.font); const px = m ? parseFloat(m[1]) : 10;
      let w = 0;
      for (const ch of s) { const c = ch.codePointAt(0);
        if (c > 0x2e80) w += 1.0; else if (ch === ' ') w += 0.3; else if (ch >= '0' && ch <= '9') w += 0.56;
        else if (ch >= 'A' && ch <= 'Z') w += 0.66; else if (ch >= 'a' && ch <= 'z') w += 0.52;
        else if ('.,:;!|\'"()[]'.includes(ch)) w += 0.3; else w += 0.55; }
      return { width: w * px };
    },
    clip() { if (pathRects.length) clipRect = pathRects[pathRects.length - 1]; },
    setLineDash() {}, getLineDash() { return []; },
    getTransform() { return { a: M[0], b: M[1], c: M[2], d: M[3], e: M[4], f: M[5], rotate() {}, translate() {}, scale() {} }; },
  };
  ctx.__clip = () => clipRect; ctx.__m = () => M;
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
const tBB = (bb, m) => { const p = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]].map(q => apply(m, q[0], q[1])); return { x0: Math.min(...p.map(q => q[0])), x1: Math.max(...p.map(q => q[0])), y0: Math.min(...p.map(q => q[1])), y1: Math.max(...p.map(q => q[1])) }; };

const W = 1920, H = 1080;
function makeEnv(sc, st, cut, t) {
  const c = createMockCtx();
  const e = { ctx: c, W, H, sc, st, fx: J.defaultProject().fx, plan: { events: [] }, cut, t, lt: t, ltb: t, pIn: 1, pOut: 0, step: 24, pass: 'main', scale: 1, allowFilter: true, beat: null, energy: null };
  e.draw = it => J.drawItem(e, it);
  e.rect = () => {}; e.line = () => {}; e.polyPartial = () => {}; e.circle = () => {}; e.arc = () => {};
  e.rrect = () => {}; e.poly = () => {}; e.blob = () => {};
  return e;
}
const VN_WORDS = ['Giai', 'điệu', 'Ánh', 'ban', 'mai', 'vẫn', 'còn', 'đây', 'Kỷ', 'niệm', 'ngày', 'xưa', 'vang', 'vọng', 'trong', 'ký', 'ức', 'của', 'chúng', 'ta', 'nhớ', 'mùa', 'hè', 'về', 'trên', 'phố', 'cổ', 'hoa', 'anh', 'đào', 'rơi', 'rồi', 'khuya', 'sớm', 'mai'];
function vnText(n) { let o = [], i = 0; while (o.join(' ').replace(/\s/g, '').length < n) { o.push(VN_WORDS[i % VN_WORDS.length]); i++; } return o.join(' '); }
const JP_STR = '夜明けの光が丘を越えてゆく桜の花びら舞うその夜に遥か遠くあかり燃えてゆく';
function jpText(n) { let s = ''; while ([...s].length < n) s += JP_STR; return [...s].slice(0, n).join(''); }

const key = process.argv[2];
const L = J.LAYOUTS[key];
const st = J.resolveStyle(J.defaultProject());
for (const [label, n] of [['vn8', 8], ['vn12', 12], ['jp13', 13]]) {
  const text = label === 'jp13' ? jpText(13) : vnText(n);
  const rng = J.rng(J.h(J.sid('layout:' + key + ':' + label), 3, 7));
  const params = L.plan(rng, { text, n: [...text.replace(/\s/g, '')].length, W, H, dur: 2.4 }, st) || {};
  console.log('---', key, label, JSON.stringify(params));
  for (const t of [0.4, 0.8, 1.2, 1.8, 2.05]) {
    const log = [];
    const orig = J.mainDraw;
    J.mainDraw = (e, it) => { const m = e.ctx.__m(); const r = orig(e, it); log.push({ size: it.size, bb: r ? tBB(r, m) : null }); return r; };
    const cut = { text, lineText: text, seed: 1, dur: 2.4, inDur: 0.3, outDur: 0.3, stagger: 0.04, params, scheme: 0, words: [], treat: 'none', treatP: {} };
    const e2 = makeEnv(st.schemes[0], st, cut, t);
    try { L.render(e2); } catch (e) { console.log('  t=' + t + ' ERR ' + e.message); }
    J.mainDraw = orig;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, has = false;
    for (const m of log) { const b = m.bb; if (!b) continue; has = true; x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    console.log('  t=' + t + (has ? ` bb=${[x0, y0, x1, y1].map(v => Math.round(v)).join(',')} size=${Math.max(...log.map(m => m.size)).toFixed(0)}` : ' (none)'));
  }
}
