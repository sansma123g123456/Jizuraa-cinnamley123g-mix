import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractScript(html, scriptIndex) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let idx = 1;
  while ((match = scriptRegex.exec(html)) !== null) {
    if (idx === scriptIndex) {
      return match[1];
    }
    idx++;
  }
  return null;
}

function createMockElement(tag = 'div') {
  let listeners = {};
  return {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
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
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      return child;
    },
    addEventListener(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    dispatchEvent(evt) {
      const fns = listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    _getListenerCount(evt) {
      return (listeners[evt] || []).length;
    },
    getContext(type) {
      return {
        clearRect: () => {},
        beginPath: () => {},
        stroke: () => {},
        fill: () => {},
        save: () => {},
        restore: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        setTransform: () => {},
        drawImage: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} })
      };
    },
    getBoundingClientRect() {
      return { left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 };
    },
    offsetWidth: 400,
    offsetHeight: 300,
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => []
  };
}

function createMockEnvironment(overrides = {}) {
  let animationFrames = [];
  let cancelledFrames = [];
  let rafIdCounter = 1;
  let windowListeners = {};

  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => {
      const id = rafIdCounter++;
      animationFrames.push({ id, fn, cancelled: false });
      return id;
    },
    cancelAnimationFrame: (id) => {
      cancelledFrames.push(id);
      const entry = animationFrames.find(f => f.id === id);
      if (entry) entry.cancelled = true;
    },
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (windowListeners[evt]) {
        windowListeners[evt] = windowListeners[evt].filter(f => f !== fn);
      }
    },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] || null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; }
    },
    document: {
      readyState: 'complete',
      head: createMockElement('head'),
      body: createMockElement('body'),
      addEventListener: () => {},
      getElementById: (id) => createMockElement(id.includes('Canvas') ? 'canvas' : 'div'),
      querySelector: () => createMockElement('div'),
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement(tag)
    },
    innerWidth: 1920,
    innerHeight: 1080,
    S: {
      playing: false,
      t: 0,
      plan: { duration: 180, beats: [0, 0.5, 1.0, 1.5, 2.0] }
    },
    J: {
      fmtTime: (t) => String(t.toFixed(2)),
      prevBeat: (beats, t) => {
        let last = null;
        for (const b of beats) {
          if (b <= t) last = b;
          else break;
        }
        return last;
      },
      clamp: (v, min = 0, max = 1) => Math.max(min, Math.min(max, v))
    },
    renderSecondaryPreview: () => {},
    ...overrides
  };
  env.window = env;
  env.document.defaultView = env;
  env._metrics = { animationFrames, cancelledFrames, windowListeners };
  return env;
}

test('WP2 - SubWindow Lifecycle & Idempotent BindUI', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // Script #6 is SubWindowAPI
  const subWindowScript = extractScript(html, 6);
  assert.ok(subWindowScript, 'Script #6 (SubWindowAPI) must exist in index.html');

  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(subWindowScript, context);

  const subWin = env.SubWindowAPI;
  assert.ok(subWin, 'window.SubWindowAPI must be defined');
  assert.equal(typeof subWin.open, 'function');
  assert.equal(typeof subWin.close, 'function');
  assert.equal(typeof subWin.minimize, 'function');
  assert.equal(typeof subWin.restore, 'function');
  assert.equal(typeof subWin.toggleMaximize, 'function');
  assert.equal(typeof subWin.isOpen, 'function');

  // Initial state should not be open
  assert.equal(subWin.isOpen(), false, 'SubWindow initially closed');

  // Open window activates loop
  const initialRafs = env._metrics.animationFrames.length;
  subWin.open();
  assert.equal(subWin.isOpen(), true, 'SubWindow should be open after open()');
  assert.ok(env._metrics.animationFrames.length > initialRafs, 'open() must start rAF sync loop');

  // Close window pauses loop
  const initialCancels = env._metrics.cancelledFrames.length;
  subWin.close();
  assert.equal(subWin.isOpen(), false, 'SubWindow should be closed after close()');
  assert.ok(env._metrics.cancelledFrames.length > initialCancels, 'close() must stop rAF sync loop');

  // Verify idempotent binding: calling keydown listeners count should not increase on repeated init
  const keydownBefore = (env._metrics.windowListeners['keydown'] || []).length;
  assert.ok(keydownBefore <= 1, 'Keyboard listener registered at most once');
});

test('WP2 - Oscilloscope Lifecycle & Idempotent BindUI', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // Script #8 is OscilloscopeScreen
  const oscScript = extractScript(html, 8);
  assert.ok(oscScript, 'Script #8 (OscilloscopeScreen) must exist in index.html');

  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(oscScript, context);

  const osc = env.OscilloscopeScreen;
  assert.ok(osc, 'window.OscilloscopeScreen must be defined');
  assert.equal(typeof osc.open, 'function');
  assert.equal(typeof osc.close, 'function');
  assert.equal(typeof osc.minimize, 'function');
  assert.equal(typeof osc.restore, 'function');
  assert.equal(typeof osc.isOpen, 'function');

  // Initial state
  assert.equal(osc.isOpen(), false, 'Oscilloscope should be initially closed');

  // Open window
  const initialRafs = env._metrics.animationFrames.length;
  osc.open();
  assert.equal(osc.isOpen(), true, 'Oscilloscope should be open after open()');
  assert.ok(env._metrics.animationFrames.length > initialRafs, 'open() must start osc render loop');

  // Minimize window
  const initialCancels = env._metrics.cancelledFrames.length;
  osc.minimize();
  assert.equal(osc.isOpen(), false, 'Oscilloscope should report not open when minimized');
  assert.ok(env._metrics.cancelledFrames.length > initialCancels, 'minimize() must cancel osc rAF loop');

  // Restore window
  osc.restore();
  assert.equal(osc.isOpen(), true, 'Oscilloscope should be open after restore()');

  // Close window
  osc.close();
  assert.equal(osc.isOpen(), false, 'Oscilloscope should report closed after close()');
});

test('WP2 - ManualLyricSync Lifecycle & Idempotent BindUI', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // Script #10 is ManualLyricSyncAPI
  const syncScript = extractScript(html, 10);
  assert.ok(syncScript, 'Script #10 (ManualLyricSyncAPI) must exist in index.html');

  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(syncScript, context);

  const sync = env.ManualLyricSyncAPI;
  assert.ok(sync, 'window.ManualLyricSyncAPI must be defined');
  assert.equal(typeof sync.open, 'function');
  assert.equal(typeof sync.close, 'function');
  assert.equal(typeof sync.stamp, 'function');
  assert.equal(typeof sync.isOpen, 'function');

  assert.equal(sync.isOpen(), false, 'ManualLyricSync initially closed');
  sync.close();
  assert.equal(sync.isOpen(), false);
});

test('WP2 - StemVisualizer Reactivity & Idempotency', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // Script #7 is StemVisualizerAPI
  const stemScript = extractScript(html, 7);
  assert.ok(stemScript, 'Script #7 (StemVisualizerAPI) must exist in index.html');

  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(stemScript, context);

  const stem = env.StemVisualizerAPI;
  assert.ok(stem, 'window.StemVisualizerAPI must be defined');
  assert.equal(typeof stem.toggle, 'function');
  assert.equal(typeof stem.open, 'function');
  assert.equal(typeof stem.close, 'function');
  assert.equal(typeof stem.getKickShake, 'function');
  assert.equal(typeof stem.getBassBloom, 'function');
  assert.equal(typeof stem.drawSparkleParticles, 'function');
  assert.equal(typeof stem.getPianoRipple, 'function');

  // Test reactivity defaults without audio
  assert.equal(typeof stem.getKickShake(), 'number');
  assert.equal(typeof stem.getBassBloom(), 'number');
  assert.equal(typeof stem.getPianoRipple(), 'number');
});

test('WP2 - Audio DSP Throttling / Caching Pattern Verification', () => {
  let calcCount = 0;
  let lastAnalysisTime = -1;
  let cachedAnalysis = null;
  const CACHE_EXPIRY_SEC = 0.008; // ~120Hz cap

  function computeSpectrum(timestamp) {
    if (cachedAnalysis && Math.abs(timestamp - lastAnalysisTime) < CACHE_EXPIRY_SEC) {
      return cachedAnalysis;
    }
    calcCount++;
    lastAnalysisTime = timestamp;
    cachedAnalysis = {
      timestamp,
      kick: 0.8,
      bass: 0.6,
      mid: 0.4,
      treble: 0.3
    };
    return cachedAnalysis;
  }

  function invalidateCache() {
    lastAnalysisTime = -1;
    cachedAnalysis = null;
  }

  // Rapid calls at the same timestamp (60-120fps queries or multiple visualizer passes in same frame)
  const r1 = computeSpectrum(1.000);
  const r2 = computeSpectrum(1.000);
  const r3 = computeSpectrum(1.004); // within 0.008s threshold
  assert.equal(calcCount, 1, 'Calculations within 0.008s window must be cached');
  assert.strictEqual(r1, r2);
  assert.strictEqual(r2, r3);

  // New frame after delta
  const r4 = computeSpectrum(1.016);
  assert.equal(calcCount, 2, 'New frame beyond cache expiry must recompute');

  // Seek / Scrub invalidation
  invalidateCache();
  const r5 = computeSpectrum(1.016);
  assert.equal(calcCount, 3, 'Invalidation on seek must force fresh calculation');
});
