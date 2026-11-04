/**
 * Phase-4 UX regression suite.
 *
 * Guards the three UX surfaces added in Phase 4:
 *
 *   1. window.JizuraShare  - project share links (config packed into the
 *                            URL fragment, media stripped, versioned)
 *   2. window.JizuraUndo   - the project-SETTINGS undo/redo stack (a stack
 *                            that is separate from the lyric history)
 *   3. window.JizuraTouch  - mobile canvas gestures (pinch zoom, double tap,
 *                            swipe seek / swipe volume)
 *
 * The tests are static (they read the shipped `index.html`) plus a few
 * behavioural checks that run the real code in a sandbox.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const readIndex = () => fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

/** Extract the n-th (1-based) <script> body from an HTML string. */
function extractScript(html, scriptIndex) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 1;
  while ((match = scriptRegex.exec(html)) !== null) {
    if (idx === scriptIndex) return match[1];
    idx++;
  }
  return null;
}

/** Find which inline script holds a given marker. */
function scriptIndexOf(html, marker) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 1;
  while ((match = scriptRegex.exec(html)) !== null) {
    if (match[1].includes(marker)) return idx;
    idx++;
  }
  return -1;
}

/**
 * Extract a top-level function declaration (name + body) by brace matching.
 * The engine script is ~2.7 MB, so tests slice out only what they need
 * instead of booting the whole app.
 */
function extractFunction(src, name) {
  const decl = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  if (!decl) return null;
  const open = src.indexOf('{', decl.index + decl[0].length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(decl.index, i + 1);
    }
  }
  return null;
}

/** Extract a `const NAME = ...;` / `let NAME = ...;` declaration. */
function extractConst(src, name) {
  const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`).exec(src);
  if (!m) return null;
  let i = src.indexOf('=', m.index) + 1;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === '{') {
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) return src.slice(m.index, j + 1);
      }
    }
    return null;
  }
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ';' && depth === 0) return src.slice(m.index, j + 1);
  }
  return src.slice(m.index);
}

/** Extract a `window.NAME = { ... };` assignment block. */
function extractWindowAssignment(src, name) {
  const m = new RegExp(`window\\.${name}\\s*=\\s*\\{`).exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, i + 1);
    }
  }
  return null;
}

/** A tiny sandbox that can host the extracted share/undo helpers. */
function createSandbox(overrides = {}) {
  const env = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    location: { href: 'https://example.com/app/', hash: '' },
    history: { replaceState() {} },
    S: { project: { title: 'Demo', theme: 'kawaii', aspect: '9:16' }, plan: { beats: [0, 1] } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      readyState: 'complete',
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => ({ getContext: () => ({}) }),
    },
    addEventListener() {},
    removeEventListener() {},
    confirm: () => false,
    toast() {},
    collectProjectState() {},
    applyFullProject() {},
    window: null,
  };
  Object.assign(env, overrides);
  env.window = env;
  env.globalThis = env;
  env.self = env;
  return vm.createContext(env);
}

// ------------------------------------------------------------- SHARE LINK
test('ux: the project share link UI exists in the vault', () => {
  const html = readIndex();
  for (const id of ['btnShareLink', 'shareLinkBox', 'shareLinkInput', 'btnCopyShareLink', 'shareLinkNote']) {
    assert.ok(html.includes(`id="${id}"`), `the vault must expose #${id}`);
  }
});

test('ux: JizuraShare is exposed with the documented contract', () => {
  const html = readIndex();
  assert.ok(/window\.JizuraShare\s*=\s*\{/.test(html), 'window.JizuraShare must be defined');
  const idx = scriptIndexOf(html, 'window.JizuraShare');
  assert.ok(idx > 0, 'JizuraShare must live inside an inline script');
  const code = extractScript(html, idx);
  for (const member of ['makeLink', 'applyFromLink', 'readFromLocation', 'VERSION']) {
    assert.ok(code.includes(member), `JizuraShare must expose ${member}`);
  }
});

test('ux: the share link uses a versioned, base64url, media-free payload', () => {
  const html = readIndex();
  assert.ok(/const SHARE_VERSION\s*=\s*1/.test(html), 'the share payload must be versioned');
  // base64url alphabet (no +, no /) so the link survives chat apps
  assert.ok(/replace\(\/\\\+\/g, '-'\)/.test(html), 'the encoder must map + to -');
  assert.ok(/replace\(\/\\\/\/g, '_'\)/.test(html), 'the encoder must map / to _');
  // the heavy media must be stripped from the shared payload
  for (const key of ['character', 'character2', 'background', 'audio', 'dataUrl']) {
    assert.ok(
      new RegExp(`delete\\s+cfg\\.media\\.${key}`).test(html),
      `the share payload must strip media.${key}`
    );
  }
});

test('ux: the share link round-trips a project configuration', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'window.JizuraShare'));
  assert.ok(code, 'the share script must be extractable');

  const parts = [
    extractConst(code, 'SHARE_VERSION'),
    extractFunction(code, 'b64urlEncode'),
    extractFunction(code, 'b64urlDecode'),
    extractFunction(code, 'buildSharePayload'),
    extractFunction(code, 'makeShareLink'),
    extractFunction(code, 'applySharePayload'),
    extractFunction(code, 'readShareFromLocation'),
    extractWindowAssignment(code, 'JizuraShare'),
  ].filter(Boolean);
  assert.equal(parts.length, 8, 'every share helper must be extractable');

  const ctx = createSandbox();
  assert.doesNotThrow(() => vm.runInContext(parts.join('\n'), ctx), 'the share helpers must run standalone');

  const share = ctx.window.JizuraShare;
  assert.ok(share, 'JizuraShare must be reachable from the sandbox');
  assert.equal(share.VERSION, 1);

  const link = share.makeLink();
  assert.ok(link.startsWith('https://example.com/app/#p='), `the link must carry the fragment: ${link}`);
  const fragment = link.slice(link.indexOf('#p=') + 3);
  assert.ok(/^[A-Za-z0-9\-_]+$/.test(fragment), 'the fragment must be base64url');

  const payload = share.applyFromLink(link);
  assert.equal(payload.v, 1);
  assert.equal(payload.t, 'Demo');
  assert.equal(payload.p.theme, 'kawaii');
  assert.equal(payload.p.aspect, '9:16');
});

test('ux: the share link strips the heavy media payload', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'window.JizuraShare'));
  const parts = [
    extractConst(code, 'SHARE_VERSION'),
    extractFunction(code, 'b64urlEncode'),
    extractFunction(code, 'b64urlDecode'),
    extractFunction(code, 'buildSharePayload'),
    extractFunction(code, 'makeShareLink'),
    extractFunction(code, 'applySharePayload'),
    extractFunction(code, 'readShareFromLocation'),
    extractWindowAssignment(code, 'JizuraShare'),
  ].filter(Boolean);

  const ctx = createSandbox({
    S: {
      project: {
        title: 'Heavy',
        theme: 'kawaii',
        media: {
          character: 'data:image/png;base64,AAAA',
          character2: 'data:image/png;base64,BBBB',
          background: 'data:image/png;base64,CCCC',
          audio: 'data:audio/mp3;base64,DDDD',
          dataUrl: 'data:image/png;base64,EEEE',
        },
      },
      plan: { beats: [] },
    },
  });
  vm.runInContext(parts.join('\n'), ctx);

  const link = ctx.window.JizuraShare.makeLink();
  const payload = ctx.window.JizuraShare.applyFromLink(link);
  assert.ok(payload.p.media, 'the media container itself may stay');
  for (const key of ['character', 'character2', 'background', 'audio', 'dataUrl']) {
    assert.equal(payload.p.media[key], undefined, `media.${key} must be stripped from the share payload`);
  }
});

test('ux: the share link rejects garbage and future versions', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'window.JizuraShare'));
  const parts = [
    extractConst(code, 'SHARE_VERSION'),
    extractFunction(code, 'b64urlEncode'),
    extractFunction(code, 'b64urlDecode'),
    extractFunction(code, 'buildSharePayload'),
    extractFunction(code, 'makeShareLink'),
    extractFunction(code, 'applySharePayload'),
    extractFunction(code, 'readShareFromLocation'),
    extractWindowAssignment(code, 'JizuraShare'),
  ].filter(Boolean);

  const ctx = createSandbox();
  vm.runInContext(parts.join('\n'), ctx);
  const share = ctx.window.JizuraShare;

  assert.throws(() => share.applyFromLink('https://example.com/app/#nothing=1'),
    /không chứa dữ liệu chia sẻ/, 'a link without a payload must be rejected');

  // a valid base64url payload with an unknown version must be refused
  const future = Buffer.from(JSON.stringify({ v: 99, t: 'x', p: {} }), 'utf8').toString('base64url');
  assert.throws(() => share.applyFromLink(`https://example.com/app/#p=${future}`),
    /phiên bản/i, 'a future payload version must be refused');
});

// ------------------------------------------------------------- UNDO / REDO
test('ux: the settings undo/redo buttons and shortcuts are wired', () => {
  const html = readIndex();
  assert.ok(html.includes('id="btnUndoSettings"'), 'the settings undo button must exist');
  assert.ok(html.includes('id="btnRedoSettings"'), 'the settings redo button must exist');
  assert.ok(/e\.altKey\s*&&\s*e\.code\s*===\s*'KeyZ'/.test(html),
    'Ctrl+Alt+Z must trigger the settings undo');
  assert.ok(/e\.altKey\s*&&\s*e\.code\s*===\s*'KeyY'/.test(html),
    'Ctrl+Alt+Y must trigger the settings redo');
});

test('ux: JizuraUndo is exposed with the documented contract', () => {
  const html = readIndex();
  assert.ok(/window\.JizuraUndo\s*=\s*\{/.test(html), 'window.JizuraUndo must be defined');
  const code = extractScript(html, scriptIndexOf(html, 'window.JizuraUndo'));
  for (const member of ['push', 'undo', 'redo', 'canUndo', 'canRedo', 'clear']) {
    assert.ok(code.includes(member), `JizuraUndo must expose ${member}`);
  }
  // the stack must be separate from the lyric history (ED)
  assert.ok(/const PD = \{ undo: \[\], redo: \[\] \}/.test(html), 'PD must be its own stack');
  assert.ok(/const PD_MAX = \d+/.test(html), 'the stack must be bounded');
});

test('ux: the settings stack snapshots settings but never media', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'function pdSnapshot()'));
  const fn = extractFunction(code, 'pdSnapshot');
  assert.ok(fn, 'pdSnapshot must be extractable');
  for (const key of ['theme', 'aspect', 'fx', 'timing', 'visualizer', 'amv', 'overrides', 'exportRange']) {
    assert.ok(fn.includes(key), `the settings snapshot must cover ${key}`);
  }
  assert.ok(!/\bmedia\b\s*:/.test(fn), 'the settings snapshot must not capture media payloads');
});

test('ux: the settings stack is a bounded push/pop stack', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'function pdPush()'));
  const fn = extractFunction(code, 'pdPush');
  assert.ok(fn, 'pdPush must be extractable');
  assert.ok(/PD\.undo\.push/.test(fn), 'pdPush must push onto the undo stack');
  assert.ok(/PD\.redo\s*=\s*\[\]/.test(fn), 'a new push must invalidate the redo stack');
  assert.ok(/PD_MAX/.test(fn), 'the stack must respect the PD_MAX bound');
});

// ------------------------------------------------------------- TOUCH
test('ux: JizuraTouch is exposed with the documented contract', () => {
  const html = readIndex();
  assert.ok(/window\.JizuraTouch\s*=\s*\{/.test(html), 'window.JizuraTouch must be defined');
  const code = extractScript(html, scriptIndexOf(html, 'window.JizuraTouch'));
  for (const member of ['scale', 'reset', 'set']) {
    assert.ok(code.includes(member), `JizuraTouch must expose ${member}`);
  }
});

test('ux: the touch gestures cover pinch, double tap, seek and volume', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'function initTouchGestures()'));
  const fn = extractFunction(code, 'initTouchGestures');
  assert.ok(fn, 'initTouchGestures must be extractable');
  assert.ok(/touchstart/.test(fn) && /touchmove/.test(fn) && /touchend/.test(fn),
    'the gesture handlers must listen to the touch events');
  assert.ok(/pinch/i.test(fn), 'the pinch gesture must be implemented');
  assert.ok(/double|tap/i.test(fn), 'the double-tap gesture must be implemented');
  assert.ok(/\bseek\s*\(/.test(fn), 'a horizontal swipe must seek');
  assert.ok(/AP\.setVol/.test(fn), 'a vertical swipe must change the volume');
});

test('ux: the pinch zoom is clamped and applied as a GPU transform', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'const TOUCH_ZOOM ='));
  const decl = extractConst(code, 'TOUCH_ZOOM');
  assert.ok(decl, 'TOUCH_ZOOM must be extractable');
  assert.ok(/min:\s*0\.5/.test(decl) && /max:\s*3/.test(decl), 'the zoom range must be clamped');
  const apply = extractFunction(code, 'applyTouchZoom');
  assert.ok(apply, 'applyTouchZoom must be extractable');
  assert.ok(/style\.transform\s*=\s*'scale\(/.test(apply),
    'the zoom must be a CSS transform (the render pipeline stays untouched)');
});

test('ux: a re-plan resets the pinch zoom', () => {
  const html = readIndex();
  const code = extractScript(html, scriptIndexOf(html, 'function replan()'));
  const fn = extractFunction(code, 'replan');
  assert.ok(fn, 'replan must be extractable');
  assert.ok(/resetTouchZoom/.test(fn),
    'a new plan has a new layout - the stale zoom must be reset');
});

test('ux: the Phase-4 UX code is mirrored into every deployment copy', () => {
  const root = readIndex();
  const mirrors = [
    path.join(rootDir, 'JIZURA CIN MIX', 'index.html'),
    path.join(rootDir, 'public', 'index.html'),
    path.join(rootDir, 'cloudflare_dist', 'index.html'),
  ];
  for (const p of mirrors) {
    if (!fs.existsSync(p)) continue; // a mirror may legitimately be absent
    const src = fs.readFileSync(p, 'utf8');
    for (const marker of ['window.JizuraShare', 'window.JizuraUndo', 'window.JizuraTouch']) {
      assert.ok(src.includes(marker), `${p} must contain ${marker}`);
    }
  }
});

test('ux: the 12-script invariant survives the Phase-4 additions', () => {
  const html = readIndex();
  assert.equal((html.match(/<script\b/g) || []).length, 12,
    'index.html must keep exactly 12 script tags');
});
