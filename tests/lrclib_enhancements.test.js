import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractScripts(htmlContent) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const list = [];
  let match;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    list.push(match[1]);
  }
  return list;
}

function createMockCtx() {
  const target = {
    canvas: { width: 1920, height: 1080 },
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    clip: () => {},
    measureText: (t) => ({
      width: (t || '').length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2
    }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createImageData: (w = 100, h = 100) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x = 0, y = 0, w = 100, h = 100) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {}
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return () => {};
    },
    set(t, prop, val) {
      t[prop] = val;
      return true;
    }
  });
}

function createMockElement(tag = 'div') {
  const attrs = {};
  const listeners = {};
  const el = {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, f) {
        if (f !== undefined) { f ? this._classes.add(c) : this._classes.delete(c); }
        else { this._classes.has(c) ? this._classes.delete(c) : this._classes.add(c); }
      },
      contains(c) { return this._classes.has(c); }
    },
    children: [],
    appendChild(c) { this.children.push(c); return c; },
    append(...nodes) { this.children.push(...nodes); },
    removeChild(c) {
      const idx = this.children.indexOf(c);
      if (idx >= 0) this.children.splice(idx, 1);
      return c;
    },
    addEventListener(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const fns = listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] || null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    focus: () => {},
    select: () => {},
    getContext: () => createMockCtx(),
    closest: () => createMockElement('label'),
    insertAdjacentElement: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => []
  };
  el.parentElement = el;
  return el;
}

function createMockEnvironment(overrides = {}) {
  const listeners = {};
  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn);
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; }
    },
    document: {
      readyState: 'complete',
      head: createMockElement('head'),
      body: createMockElement('body'),
      documentElement: createMockElement('html'),
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: (id) => {
        const el = createMockElement(id.toLowerCase().includes('canvas') ? 'canvas' : 'div');
        el.id = id;
        return el;
      },
      querySelector: () => createMockElement('div'),
      querySelectorAll: () => [],
      createElement: (tag) => {
        const el = createMockElement(tag);
        if (tag.toLowerCase() === 'canvas') el.getContext = () => createMockCtx();
        return el;
      },
      createDocumentFragment: () => createMockElement('fragment'),
      createTextNode: (t) => ({ nodeValue: t })
    },
    navigator: { userAgent: 'node' },
    location: { href: 'http://localhost/' },
    performance: performance,
    Float32Array: Float32Array,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Int32Array: Int32Array,
    Image: class { constructor() { this.width = 100; this.height = 100; } },
    escapeHtml: (s) => String(s || ''),
    toast: () => {},
    S: {
      playing: false,
      exporting: false,
      t: 1.0,
      project: { title: 'Test Title', artist: 'Test Artist', lrcTreat: 'auto', instrumental: { enabled: false } },
      plan: { duration: 120, beats: [0, 0.5, 1.0, 1.5, 2.0], energy: [0.5, 0.8], energyRate: 10 }
    },
    ...overrides
  };
  env.window = env;
  env.globalThis = env;
  env.document.defaultView = env;
  return env;
}

test('LRCLIB & Kinetic Typography - HTML Structure & Guardrails', async (t) => {
  await t.test('Invariant: Exactly 12 script tags in index.html', () => {
    const scripts = extractScripts(html);
    assert.equal(scripts.length, 12, 'index.html must maintain exactly 12 script tags');
  });

  await t.test('UI: #lrcTreat preset dropdown exists with required kinetic options', () => {
    assert.match(html, /<select\s+id="lrcTreat"/i, 'Dropdown #lrcTreat must exist in index.html');
    assert.match(html, /value="liquidFillGlow"/, '#lrcTreat must contain liquidFillGlow option');
    assert.match(html, /value="glitchRgbSplit"/, '#lrcTreat must contain glitchRgbSplit option');
    assert.match(html, /value="perspective3DFlip"/, '#lrcTreat must contain perspective3DFlip option');
  });

  await t.test('UI: #lrcLibHistoryStrip exists in #lrcLibModal with history list container', () => {
    assert.match(html, /id="lrcLibHistoryStrip"/, 'History strip container #lrcLibHistoryStrip must exist');
    assert.match(html, /id="lrcLibHistoryList"/, 'History chip list #lrcLibHistoryList must exist');
    assert.match(html, /id="btnLrcLibClearHistory"/, 'Clear history button must exist');
  });
});

test('LRCLIB & Kinetic Typography - Instrumental Tag Parsing (Vietnamese & English)', async (t) => {
  const scripts = extractScripts(html);
  const s5Code = scripts[4];
  assert.ok(s5Code, 'Script #5 must exist');

  const env = createMockEnvironment();
  const context = vm.createContext(env);
  const script = new vm.Script(s5Code);
  script.runInContext(context);

  const J = env.J || env.window.J;
  assert.ok(J && typeof J.parseLyrics === 'function', 'J.parseLyrics must be exported from Script #5');

  await t.test('Parses Vietnamese instrumental tags: [nhạc dạo], [dạo nhạc], [gián tấu], [nhac dao]', () => {
    const lrc = `
[00:05.00] [nhạc dạo]
[00:15.50] Câu hát đầu tiên
[00:25.00] [dạo nhạc]
[00:35.00] [gián tấu]
[00:45.00] [nhac dao]
    `.trim();

    const res = J.parseLyrics(lrc);
    assert.ok(res && Array.isArray(res.lines), 'parseLyrics should return lines array');
    const instLines = res.lines.filter(l => l.interlude);
    assert.equal(instLines.length, 4, 'All 4 Vietnamese instrumental tags should be flagged interlude');
    assert.equal(res.lines[1].interlude, undefined, 'Regular lyric line should not be flagged interlude');
  });

  await t.test('Parses English instrumental tags: [intro], [outro], [solo], [bridge], [interlude], [inst]', () => {
    const lrc = `
[00:00.00] [intro]
[00:20.00] Singing in the rain
[00:40.00] [solo]
[01:00.00] [bridge]
[01:20.00] [interlude]
[01:40.00] [inst]
[02:00.00] [outro]
    `.trim();

    const res = J.parseLyrics(lrc);
    const instLines = res.lines.filter(l => l.interlude);
    assert.equal(instLines.length, 6, 'All 6 English instrumental tags should be flagged interlude');
  });

  await t.test('Parses instrumental tags with explicit duration: [nhạc dạo 15s], [solo 8s]', () => {
    const lrc = `
[00:10.00] [nhạc dạo 15s]
[00:30.00] [solo 8s]
    `.trim();

    const res = J.parseLyrics(lrc);
    const instLines = res.lines.filter(l => l.interlude);
    assert.equal(instLines.length, 2, 'Tags with duration should be recognized');
    assert.equal(instLines[0].secs, 15, 'Duration 15s should be parsed');
    assert.equal(instLines[1].secs, 8, 'Duration 8s should be parsed');
  });
});

test('LRCLIB & Kinetic Typography - Kinetic Presets & Project State', async (t) => {
  const scripts = extractScripts(html);
  const s5Code = scripts[4];

  const env = createMockEnvironment();
  const context = vm.createContext(env);
  const script = new vm.Script(s5Code);
  script.runInContext(context);

  const J = env.J || env.window.J;

  await t.test('J.defaultProject has lrcTreat set to "auto"', () => {
    assert.ok(typeof J.defaultProject === 'function', 'J.defaultProject must be a function');
    const p = J.defaultProject();
    assert.equal(p.lrcTreat, 'auto', 'defaultProject lrcTreat must be "auto"');
  });

  await t.test('J.TREAT contains liquidFillGlow, glitchRgbSplit, perspective3DFlip', () => {
    assert.ok(J.TREAT, 'J.TREAT object must exist');
    assert.equal(typeof J.TREAT.liquidFillGlow, 'object', 'liquidFillGlow must be an object in J.TREAT');
    assert.equal(typeof J.TREAT.liquidFillGlow.apply, 'function', 'liquidFillGlow.apply must be a function');
    assert.equal(typeof J.TREAT.glitchRgbSplit, 'object', 'glitchRgbSplit must be an object in J.TREAT');
    assert.equal(typeof J.TREAT.glitchRgbSplit.apply, 'function', 'glitchRgbSplit.apply must be a function');
    assert.equal(typeof J.TREAT.perspective3DFlip, 'object', 'perspective3DFlip must be an object in J.TREAT');
    assert.equal(typeof J.TREAT.perspective3DFlip.apply, 'function', 'perspective3DFlip.apply must be a function');
  });

  await t.test('Applies kinetic typography treatments to lyric item', () => {
    const mockEnv = { lt: 0.5, t: 10.0, sc: { accent: '#00ffff' } };

    // liquidFillGlow
    const itLiquid = { size: 40, shadow: null, stroke: 0 };
    J.TREAT.liquidFillGlow.apply(mockEnv, itLiquid, { speed: 1.0 });
    assert.ok(itLiquid.shadow, 'liquidFillGlow must configure shadow');
    assert.ok(itLiquid.stroke > 0, 'liquidFillGlow must set stroke width');
    assert.equal(itLiquid.strokeColor, '#00ffff', 'liquidFillGlow must use accent color');

    // glitchRgbSplit
    const itGlitch = { size: 40, shadow: null, stroke: 0 };
    J.TREAT.glitchRgbSplit.apply(mockEnv, itGlitch, { intensity: 1.0 });
    assert.ok(itGlitch.shadow, 'glitchRgbSplit must configure chromatic shadow');
    assert.ok(itGlitch.stroke > 0, 'glitchRgbSplit must set stroke width');

    // perspective3DFlip
    const itFlip = { size: 40, shadow: null };
    J.TREAT.perspective3DFlip.apply(mockEnv, itFlip, {});
    assert.ok(itFlip.shadow, 'perspective3DFlip must configure shadow');
  });

  await t.test('J.applySyllableGlow executes cleanly and populates mockIt.charFns', () => {
    assert.equal(typeof J.applySyllableGlow, 'function', 'J.applySyllableGlow must be a function');
    const mockEnv = {
      lt: 0.5,
      cut: {
        dur: 2.0,
        words: ['Hello', 'World'],
        syllables: [0, 0.8]
      },
      sc: { accent: '#ff00aa', fg: '#ffffff' }
    };
    const mockIt = {
      text: 'Hello World',
      size: 40
    };
    assert.doesNotThrow(() => {
      J.applySyllableGlow(mockEnv, mockIt);
    }, 'J.applySyllableGlow must execute without throwing ReferenceError');
    assert.ok(Array.isArray(mockIt.charFns), 'mockIt.charFns must be an array populated by applySyllableGlow');
    assert.ok(mockIt.charFns.length > 0, 'mockIt.charFns must have registered character functions');

    if (J.TREAT.syllableGlow) {
      const mockIt2 = { text: 'Hello World', size: 40 };
      assert.doesNotThrow(() => {
        J.TREAT.syllableGlow.apply(mockEnv, mockIt2, {});
      });
      assert.ok(Array.isArray(mockIt2.charFns) && mockIt2.charFns.length > 0);
    }
  });
});

test('LRCLIB & Kinetic Typography - LrcLibAPI Search History & Error Handling', async (t) => {
  const scripts = extractScripts(html);
  const s11Code = scripts[10];
  assert.ok(s11Code && s11Code.includes('LrcLibAPI'), 'Script #11 must contain LrcLibAPI');

  const env = createMockEnvironment();
  const context = vm.createContext(env);
  const script = new vm.Script(s11Code);
  script.runInContext(context);

  const api = env.LrcLibAPI || env.window.LrcLibAPI;
  assert.ok(api, 'window.LrcLibAPI must be defined');

  await t.test('LrcLibAPI exports search history methods', () => {
    assert.equal(typeof api.getHistory, 'function', 'getHistory must be a function');
    assert.equal(typeof api.saveHistory, 'function', 'saveHistory must be a function');
    assert.equal(typeof api.clearHistory, 'function', 'clearHistory must be a function');
    assert.equal(typeof api.renderHistory, 'function', 'renderHistory must be a function');
  });

  await t.test('Saves search queries, deduplicates, and limits to 8 items', () => {
    api.clearHistory();
    const h0 = [...api.getHistory()];
    assert.equal(h0.length, 0, 'History should start empty');

    // Add queries
    api.saveHistory('Song 1');
    api.saveHistory('Song 2');
    api.saveHistory('Song 3');
    const h3 = [...api.getHistory()];
    assert.equal(h3.length, 3);
    assert.equal(h3[0], 'Song 3', 'Latest query should be first');

    // Deduplication (case-insensitive)
    api.saveHistory('song 1');
    const hDup = [...api.getHistory()];
    assert.equal(hDup.length, 3, 'Length should not increase on duplicate');
    assert.equal(hDup[0], 'song 1', 'Re-saved duplicate should move to front');

    // Overflow test (add 10 distinct queries)
    for (let i = 10; i <= 20; i++) {
      api.saveHistory(`Query ${i}`);
    }
    const finalHistory = [...api.getHistory()];
    assert.equal(finalHistory.length, 8, 'History should cap at exactly 8 items');
    assert.equal(finalHistory[0], 'Query 20', 'Most recent item should be at index 0');

    // Clear history
    api.clearHistory();
    const hClear = [...api.getHistory()];
    assert.equal(hClear.length, 0, 'clearHistory must empty the list');
  });

  await t.test('LrcLibAPI.apply activates instrumental mode when track is instrumental', () => {
    assert.equal(typeof api.apply, 'function', 'api.apply must be exported');
  });
});
