import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function createMockCtx() {
  const state = { fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over',
    lineWidth: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', filter: 'none', shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, lineJoin: 'miter', lineCap: 'butt' };
  let pathRects = [];
  let clipRect = null;                 // active clip (mock honours ctx.clip())
  const clipStack = [];
  const ctx = {
    canvas: { width: 1920, height: 1080 },
    save() { clipStack.push(clipRect); }, restore() { clipRect = clipStack.pop() ?? null; },
    beginPath() { pathRects = []; }, closePath() {},
    moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    rect(x, y, w, h) { pathRects.push({ x, y, w, h }); },
    ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {}, drawImage() {},
    translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {},
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
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, rotate() {}, translate() {}, scale() {} }; },
  };
  ctx.__clip = () => clipRect;
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

function makeEnv(W, H, sc, st, cut, t, log) {
  const c = createMockCtx();
  const e = {
    ctx: c, W, H, sc, st, fx: J.defaultProject().fx, plan: { events: [] },
    cut, t, lt: t, ltb: t, pIn: 1, pOut: 0, step: 24, pass: 'main', scale: 1, allowFilter: true, beat: null, energy: null,
  };
  const colOf = (col, g) => (e.pass !== 'main' ? (g === false ? null : e.passColor) : col);
  e.draw = it => {
    const r = J.drawItem(e, it);
    let bb = r;
    const cl = c.__clip();
    if (bb && cl) {   // honour the mock clip rect
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

const W = 1920, H = 1080;
const SAFE_X = W * 0.05, SAFE_Y = H * 0.05;   // title-safe 5%
const MIN_MAIN = H * 0.028;                 // 30px @1080p — chữ lyric tối thiểu
const MIN_DECO = H * 0.02;                  // 21px @1080p — chữ phụ tối thiểu

const VN_WORDS = ['Giai', 'điệu', 'Ánh', 'ban', 'mai', 'vẫn', 'còn', 'đây', 'Kỷ', 'niệm', 'ngày', 'xưa', 'vang', 'vọng',
  'trong', 'ký', 'ức', 'của', 'chúng', 'ta', 'nhớ', 'mùa', 'hè', 'về', 'trên', 'phố', 'cổ', 'hoa', 'anh', 'đào',
  'rơi', 'rồi', 'khuya', 'sớm', 'mai'];
function vnText(n) { let out = [], i = 0; while (out.join(' ').replace(/\s/g, '').length < n) { out.push(VN_WORDS[i % VN_WORDS.length]); i++; } return out.join(' '); }
const JP_STR = '夜明けの光が丘を越えてゆく桜の花びら舞うその夜に遥か遠くあかり燃えてゆく';
function jpText(n) { let s = ''; while ([...s].length < n) s += JP_STR; return [...s].slice(0, n).join(''); }
const EN_WORDS = ['The', 'morning', 'light', 'is', 'breaking', 'through', 'the', 'window', 'onto', 'the', 'empty', 'street', 'again', 'and', 'we', 'follow', 'the', 'silence', 'home'];
function enText(n) { let out = [], i = 0; while (out.join(' ').replace(/\s/g, '').length < n) { out.push(EN_WORDS[i % EN_WORDS.length]); i++; } return out.join(' '); }

function fitsMax(L) { let m = 0; for (let n = 1; n <= 120; n++) if (!L.fits || L.fits(n)) m = n; return m || 120; }

const only = process.argv[2] ? process.argv[2].split(',') : null;
const report = [];
for (const key of J.order('layout')) {
  if (only && !only.some(o => key.includes(o))) continue;
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
    J.mainDraw = (e, it) => { const r = orig(e, it); log.main.push({ size: it.size, bb: r, text: it.text }); return r; };
    const cut = { text, lineText: text, seed: 1, dur: 2.4, inDur: 0.3, outDur: 0.3, stagger: 0.04, params, scheme: 0, words: [], treat: 'none', treatP: {} };
    const e2 = makeEnv(W, H, st.schemes[0], st, cut, 1, log);
    let err = null;
    try { L.render(e2); } catch (e) { err = e.message; }
    J.mainDraw = orig;
    if (err) { rows.push({ label, err }); continue; }
    const mainSizes = log.main.map(m => m.size);
    const size = mainSizes.length ? Math.max(...mainSizes) : 0;
    // union of ALL drawn text bboxes (main + deco)
    const MAIN_ONLY = !!process.env.AUDIT_MAIN;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, has = false;
    for (const m of (MAIN_ONLY ? log.main : log.main.concat(log.deco))) {
      const b = m.bb; if (!b || !isFinite(b.x0)) continue; has = true;
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    const decoSizes = log.deco.map(d => d.size).filter(s => s > 0);
    const decoMin = decoSizes.length ? Math.min(...decoSizes) : null;
    let over = '';
    if (has) {
      const o = [];
      if (x0 < SAFE_X) o.push('L');
      if (x1 > W - SAFE_X) o.push('R');
      if (y0 < SAFE_Y) o.push('T');
      if (y1 > H - SAFE_Y) o.push('B');
      over = o.join('');
    }
    rows.push({ label, size, decoMin, over, bb: has ? { x0, y0, x1, y1 } : null });
  }
  const problems = rows.filter(r => r.err || r.over || (r.size > 0 && r.size < MIN_MAIN) || (r.decoMin != null && r.decoMin < MIN_DECO));
  if (!problems.length) continue;
  report.push('### ' + key);
  for (const r of problems) {
    if (r.err) { report.push(`  ${r.label.padEnd(9)} ERROR ${r.err}`); continue; }
    const f = [];
    if (r.over) f.push('OVER:' + r.over);
    if (r.size > 0 && r.size < MIN_MAIN) f.push('SMALL:' + r.size.toFixed(0));
    if (r.decoMin != null && r.decoMin < MIN_DECO) f.push('deco:' + r.decoMin.toFixed(0));
    report.push(`  ${r.label.padEnd(9)} ${f.join(' ').padEnd(22)} textbb=${r.bb ? [r.bb.x0, r.bb.y0, r.bb.x1, r.bb.y1].map(v => Math.round(v)).join(',') : 'null'} main=${r.size.toFixed(1)}`);
  }
}
console.log(report.join('\n'));
console.log('\nproblem layouts:', report.filter(l => l.startsWith('### ')).length, 'rows:', report.length - report.filter(l => l.startsWith('### ')).length);
