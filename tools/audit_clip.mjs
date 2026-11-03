// Focused scan: find LAYOUTS whose *lyric text* is genuinely clipped by the frame edge.
// The mock canvas keeps a real 2D transform so layouts that draw inside a rotated /
// translated group are measured in true screen space (no false positives).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

const mul = (m, n) => [            // m * n  (both [a,b,c,d,e,f])
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function createMockCtx() {
  const state = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', filter: 'none', shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, lineJoin: 'miter', lineCap: 'butt' };
  let pathRects = [];
  let clipRect = null;
  const clipStack = [];
  let M = [1, 0, 0, 1, 0, 0];            // current transform
  const MStack = [];
  const ctx = {
    canvas: { width: 1920, height: 1080 },
    save() { clipStack.push(clipRect); MStack.push(M); },
    restore() { clipRect = clipStack.pop() ?? null; M = MStack.pop() ?? [1, 0, 0, 1, 0, 0]; },
    beginPath() { pathRects = []; }, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    rect(x, y, w, h) { pathRects.push({ x, y, w, h }); }, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    translate(x, y) { M = mul(M, [1, 0, 0, 1, x, y]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); M = mul(M, [c, s, -s, c, 0, 0]); },
    scale(x, y) { M = mul(M, [x, 0, 0, y, 0, 0]); },
    transform(a, b, c, d, e, f) { M = mul(M, [a, b, c, d, e, f]); },
    setTransform(a, b, c, d, e, f) { M = [a, b, c, d, e, f]; },
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return { setTransform() {} }; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    measureText(t) {
      const s = String(t);
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      const px = m ? parseFloat(m[1]) : 10;
      let w = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0);
        if (c > 0x2e80) w += 1.0;
        else if (ch === ' ') w += 0.3;
        else if (ch >= '0' && ch <= '9') w += 0.56;
        else if (ch >= 'A' && ch <= 'Z') w += 0.66;
        else if (ch >= 'a' && ch <= 'z') w += 0.52;
        else if ('.,:;!|\'"()[]'.includes(ch)) w += 0.3;
        else if ('ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ'.includes(ch)) w += 0.6;
        else if ('àáâãèéêìíòóôõùúăđĩũơư'.includes(ch)) w += 0.52;
        else w += 0.55;
      }
      return { width: w * px };
    },
    clip() { if (pathRects.length) clipRect = pathRects[pathRects.length - 1]; },
    setLineDash() {}, getLineDash() { return []; },
    getTransform() { return { a: M[0], b: M[1], c: M[2], d: M[3], e: M[4], f: M[5], rotate() {}, translate() {}, scale() {} }; },
  };
  ctx.__clip = () => clipRect;
  ctx.__m = () => M;
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

/* map a design-space bbox through the ambient canvas transform */
function transformBB(bb, m) {
  const pts = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]].map(p => apply(m, p[0], p[1]));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function makeEnv(W, H, sc, st, cut, t, log) {
  const c = createMockCtx();
  const e = {
    ctx: c, W, H, sc, st, fx: J.defaultProject().fx, plan: { events: [] },
    cut, t, lt: t, ltb: t, pIn: 1, pOut: 0, step: 24, pass: 'main', scale: 1, allowFilter: true, beat: null, energy: null,
  };
  e.draw = it => {
    const m = c.__m();
    const r = J.drawItem(e, it);
    let bb = r ? transformBB(r, m) : null;
    const cl = c.__clip();
    if (bb && cl) {
      const x0 = Math.max(bb.x0, cl.x), x1 = Math.min(bb.x1, cl.x + cl.w);
      const y0 = Math.max(bb.y0, cl.y), y1 = Math.min(bb.y1, cl.y + cl.h);
      if (x1 > x0 && y1 > y0) bb = Object.assign({}, bb, { x0, x1, y0, y1 }); else bb = null;
    }
    log.deco.push({ size: it.size, bb, text: it.text }); return bb;
  };
  e.rect = () => {}; e.line = () => {}; e.polyPartial = () => {}; e.circle = () => {}; e.arc = () => {};
  e.rrect = () => {}; e.poly = () => {}; e.blob = () => {};
  return e;
}

const W = Number(process.env.AUDIT_W || 1920), H = Number(process.env.AUDIT_H || 1080);
const EDGE = 0;
const SAFE = 0.05;
const MIN_MAIN = Math.min(W, H) * 0.028;

const VN_WORDS = ['Giai', 'điệu', 'Ánh', 'ban', 'mai', 'vẫn', 'còn', 'đây', 'Kỷ', 'niệm', 'ngày', 'xưa', 'vang', 'vọng',
  'trong', 'ký', 'ức', 'của', 'chúng', 'ta', 'nhớ', 'mùa', 'hè', 'về', 'trên', 'phố', 'cổ', 'hoa', 'anh', 'đào',
  'rơi', 'rồi', 'khuya', 'sớm', 'mai'];
function vnText(n) { let out = [], i = 0; while (out.join(' ').replace(/\s/g, '').length < n) { out.push(VN_WORDS[i % VN_WORDS.length]); i++; } return out.join(' '); }
const JP_STR = '夜明けの光が丘を越えてゆく桜の花びら舞うその夜に遥か遠くあかり燃えてゆく';
function jpText(n) { let s = ''; while ([...s].length < n) s += JP_STR; return [...s].slice(0, n).join(''); }
const EN_WORDS = ['The', 'morning', 'light', 'is', 'breaking', 'through', 'the', 'window', 'onto', 'the', 'empty', 'street', 'again', 'and', 'we', 'follow', 'the', 'silence', 'home'];
function enText(n) { let out = [], i = 0; while (out.join(' ').replace(/\s/g, '').length < n) { out.push(EN_WORDS[i % EN_WORDS.length]); i++; } return out.join(' '); }

function fitsMax(L) { let m = 0; for (let n = 1; n <= 120; n++) if (!L.fits || L.fits(n)) m = n; return m || 120; }

for (const key of J.order('layout')) {
  if (process.env.AUDIT_ONLY && !process.env.AUDIT_ONLY.split(',').some(o => key.includes(o))) continue;
  const L = J.LAYOUTS[key];
  if (!L || L.special) continue;
  const nMax = fitsMax(L);
  const texts = [];
  for (const n of [1, 4, 8, 12, 16, 20, 24, 28, 32, 40, 50, 60]) { if (n <= nMax) texts.push(['vn' + n, vnText(n)]); }
  if (nMax >= 13) texts.push(['jp13', jpText(13)]);
  if (nMax >= 20) texts.push(['en20', enText(20)]);
  const rows = [];
  for (const [label, text] of texts) {
    const nGlyph = [...text.replace(/\s+/g, '')].length;
    if (L.fits && !L.fits(nGlyph)) continue;
    const st = J.resolveStyle(J.defaultProject());
    const rng = J.rng(J.h(J.sid('layout:' + key + ':' + label), 3, 7));
    let params = {};
    try { params = L.plan(rng, { text, n: nGlyph, W, H, dur: 2.4 }, st) || {}; } catch (e) { params = {}; }
    const log = { main: [], deco: [] };
    const orig = J.mainDraw;
    J.mainDraw = (e, it) => {
      const m = e.ctx.__m ? e.ctx.__m() : [1, 0, 0, 1, 0, 0];
      const r = orig(e, it);
      let bb = r ? transformBB(r, m) : null;
      if (bb && it.rot) {
        // drawItem ignores per-item rotation in its bbox — recompute it here
        const a = it.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        const ox = r.cx != null ? r.cx : it.x, oy = r.cy != null ? r.cy : it.y;
        const pt = (x, y) => { const dx = x - ox, dy = y - oy; return [ox + dx * c - dy * s, oy + dx * s + dy * c]; };
        const q = [pt(r.x0, r.y0), pt(r.x1, r.y0), pt(r.x1, r.y1), pt(r.x0, r.y1)].map(p => apply(m, p[0], p[1]));
        bb = { x0: Math.min(...q.map(p => p[0])), x1: Math.max(...q.map(p => p[0])), y0: Math.min(...q.map(p => p[1])), y1: Math.max(...q.map(p => p[1])) };
      }
      log.main.push({ size: it.size, bb, text: it.text });
      return r;
    };
    const cut = { text, lineText: text, seed: 1, dur: 2.4, inDur: 0.3, outDur: 0.3, stagger: 0.04, params, scheme: 0, words: [], treat: 'none', treatP: {} };
    const e2 = makeEnv(W, H, st.schemes[0], st, cut, 1, log);
    let err = null;
    try { L.render(e2); } catch (e) { err = e.message; }
    J.mainDraw = orig;
    if (err) { console.log(`  ${key.padEnd(20)} ${label.padEnd(6)} ERROR ${err}`); continue; }
    const size = log.main.length ? Math.max(...log.main.map(m => m.size)) : 0;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, has = false;
    for (const m of log.main) {
      const b = m.bb; if (!b || !isFinite(b.x0)) continue; has = true;
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    if (!has) continue;
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
    const outL = Math.max(0, EDGE - x0), outR = Math.max(0, x1 - (W - EDGE));
    const outT = Math.max(0, EDGE - y0), outB = Math.max(0, y1 - (H - EDGE));
    const outRatio = ((outL + outR) * bh + (outT + outB) * bw) / (bw * bh);
    const sL = Math.max(0, W * SAFE - x0), sR = Math.max(0, x1 - W * (1 - SAFE));
    const sT = Math.max(0, H * SAFE - y0), sB = Math.max(0, y1 - H * (1 - SAFE));
    const sRatio = ((sL + sR) * bh + (sT + sB) * bw) / (bw * bh);
    rows.push({ label, size, outRatio, sRatio, bb: { x0, y0, x1, y1 } });
  }
  for (const r of rows) {
    if (r.outRatio > 0.06) console.log(`  ${key.padEnd(20)} ${r.label.padEnd(6)} CLIP  out=${(r.outRatio * 100).toFixed(0)}% safe=${(r.sRatio * 100).toFixed(0)}% size=${r.size.toFixed(0)} bb=${[r.bb.x0, r.bb.y0, r.bb.x1, r.bb.y1].map(v => Math.round(v)).join(',')}`);
    else if (r.sRatio > 0.04) console.log(`  ${key.padEnd(20)} ${r.label.padEnd(6)} HUG   out=${(r.outRatio * 100).toFixed(0)}% safe=${(r.sRatio * 100).toFixed(0)}% size=${r.size.toFixed(0)} bb=${[r.bb.x0, r.bb.y0, r.bb.x1, r.bb.y1].map(v => Math.round(v)).join(',')}`);
    if (r.size > 0 && r.size < MIN_MAIN) console.log(`  ${key.padEnd(20)} ${r.label.padEnd(6)} SMALL size=${r.size.toFixed(0)}`);
  }
}
