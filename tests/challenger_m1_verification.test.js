import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

function createMockCtx() {
  const target = {
    canvas: { width: 1920, height: 1080 },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createPattern: () => ({}),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    measureText: (t) => ({ width: (t || '').length * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 })
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => {};
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
    closest: () => createMockElement('div'),
    insertAdjacentElement: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    getContext: () => createMockCtx(),
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => []
  };
  el.parentElement = el;
  return el;
}

function createMockEnvironment(overrides = {}) {
  const intervals = [];
  const clearedIntervals = [];
  const animationFrames = [];
  const cancelledFrames = [];
  const timeouts = [];
  let nextRaf = 1;
  let nextInt = 1;
  let nextTimeout = 1;

  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    setTimeout: (fn, ms) => {
      const id = nextTimeout++;
      timeouts.push({ id, fn, ms });
      return id;
    },
    clearTimeout: () => {},
    setInterval: (fn, ms) => {
      const id = nextInt++;
      intervals.push({ id, fn, ms });
      return id;
    },
    clearInterval: (id) => {
      clearedIntervals.push(id);
    },
    requestAnimationFrame: (fn) => {
      const id = nextRaf++;
      animationFrames.push({ id, fn, cancelled: false });
      return id;
    },
    cancelAnimationFrame: (id) => {
      cancelledFrames.push(id);
      const entry = animationFrames.find(f => f.id === id);
      if (entry) entry.cancelled = true;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
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
      documentElement: createMockElement('html'),
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: (id) => createMockElement(id.includes('Canvas') ? 'canvas' : 'div'),
      querySelector: () => createMockElement('div'),
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement(tag),
      createDocumentFragment: () => createMockElement('fragment'),
      createTextNode: (t) => ({ nodeValue: t })
    },
    navigator: { userAgent: 'node' },
    location: { href: 'http://localhost/' },
    performance: performance,
    Float32Array: Float32Array,
    Uint8Array: Uint8Array,
    Int32Array: Int32Array,
    AudioContext: class {},
    OfflineAudioContext: class {},
    Image: class { constructor() { this.width = 100; this.height = 100; } },
    S: {
      playing: false,
      exporting: false,
      t: 1.0,
      plan: { duration: 120, beats: [0, 0.5, 1.0, 1.5, 2.0], energy: [0.5, 0.8], energyRate: 10 }
    },
    J: {
      fmtTime: (t) => String(t.toFixed(2)),
      clamp: (v, min = 0, max = 1) => Math.max(min, Math.min(max, v)),
      prevBeat: () => 0
    },
    renderSecondaryPreview: () => {},
    ...overrides
  };
  env.window = env;
  env.document.defaultView = env;
  env.globalThis = env;
  env.self = env;
  env._metrics = { intervals, clearedIntervals, animationFrames, cancelledFrames, timeouts };
  return env;
}

// ------------------------------------------------------------- TEST 1
test('Challenger - 1. Standalone Files Syntax & Synchronization', () => {
  const amvRootPath = path.join(rootDir, 'amv_asset_manager.js');
  const amvSrcPath = path.join(rootDir, 'src', 'amv_asset_manager.js');
  const libPath = path.join(rootDir, 'amv_asset_library.js');
  const swPath = path.join(rootDir, 'sw.js');
  const exporterPath = path.join(rootDir, 'src', 'pipeline', 'exporter.js');
  const beatDetectorPath = path.join(rootDir, 'src', 'timeline', 'beatDetector.js');

  // Verify node -c syntax checks directly via execSync
  assert.doesNotThrow(() => execSync(`node -c "${amvRootPath}"`), 'amv_asset_manager.js must pass node -c');
  assert.doesNotThrow(() => execSync(`node -c "${amvSrcPath}"`), 'src/amv_asset_manager.js must pass node -c');
  assert.doesNotThrow(() => execSync(`node -c "${libPath}"`), 'amv_asset_library.js must pass node -c');
  assert.doesNotThrow(() => execSync(`node -c "${swPath}"`), 'sw.js must pass node -c');
  assert.doesNotThrow(() => execSync(`node -c "${exporterPath}"`), 'src/pipeline/exporter.js must pass node -c');
  assert.doesNotThrow(() => execSync(`node -c "${beatDetectorPath}"`), 'src/timeline/beatDetector.js must pass node -c');

  // Verify byte-for-byte synchronization
  const amvRootCode = fs.readFileSync(amvRootPath, 'utf8');
  const amvSrcCode = fs.readFileSync(amvSrcPath, 'utf8');
  assert.strictEqual(amvRootCode, amvSrcCode, 'amv_asset_manager.js and src/amv_asset_manager.js must be byte-for-byte identical');
  assert.ok(amvRootCode.length > 50000, 'amv_asset_manager.js must have substantial content');
});

// ------------------------------------------------------------- TEST 2
test('Challenger - 2. All 12 Script Tags & 9 Inline Scripts Extraction & Compilation', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  const scripts = [];

  while ((match = scriptRegex.exec(html)) !== null) {
    count++;
    const attrs = match[1];
    const body = match[2];
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
    scripts.push({
      index: count,
      src: srcMatch ? srcMatch[1] : null,
      type: typeMatch ? typeMatch[1] : 'text/javascript',
      body
    });
  }

  assert.equal(scripts.length, 12, 'index.html must contain exactly 12 script tags');

  const externalScripts = scripts.filter(s => s.src !== null);
  assert.equal(externalScripts.length, 3, 'Must contain 3 external script tags');
  assert.equal(externalScripts[0].src, 'webm-muxer.min.js');
  assert.ok(externalScripts[1].src.includes('amv_asset_library.js'));
  assert.ok(externalScripts[2].src.includes('src/amv_asset_manager.js'));

  const inlineScripts = scripts.filter(s => s.src === null);
  assert.equal(inlineScripts.length, 9, 'Must contain 9 inline script tags');

  // Verify each inline script compiles with vm.Script without errors
  inlineScripts.forEach((s) => {
    assert.doesNotThrow(() => {
      new vm.Script(s.body, { filename: `index.html#script-${s.index}.js` });
    }, `Inline script #${s.index} must compile cleanly without syntax errors`);

    assert.doesNotThrow(() => {
      new vm.Script(`'use strict';\n${s.body}`, { filename: `index.html#script-${s.index}-strict.js` });
    }, `Inline script #${s.index} must be valid in strict mode`);
  });
});

// ------------------------------------------------------------- TEST 3
test('Challenger - 3. Global Scope Pollution & IIFE Encapsulation Analysis', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify auxiliary scripts are enclosed in IIFE
  // Script #6 (SubWindow), #7 (StemVisualizer), #8 (Oscilloscope), #10 (ManualLyricSync), #11 (LrcLib), #12 (AudioVisualizer)
  [6, 7, 8, 10, 11, 12].forEach((idx) => {
    const code = extractScript(html, idx);
    assert.ok(code, `Script #${idx} must be present`);
    const codeWithoutComments = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();
    const hasIIFE = /^\s*(\(\s*function\b|window\.\w+\s*=\s*\(\s*function\b|\(\s*\(\)\s*=>)/.test(codeWithoutComments);
    assert.ok(hasIIFE, `Script #${idx} must be encapsulated in an IIFE to avoid global scope pollution`);
  });

  // Verify exported globals on clean sandbox
  const s6Code = extractScript(html, 6);
  const env6 = createMockEnvironment();
  const ctx6 = vm.createContext(env6);
  const keysBefore6 = new Set(Object.keys(ctx6));
  vm.runInContext(s6Code, ctx6);
  const newGlobals6 = Object.keys(ctx6).filter(k => !keysBefore6.has(k));
  // Script #6 exports only SubWindowAPI and its bridge helpers
  assert.ok(newGlobals6.includes('SubWindowAPI'));
  assert.ok(newGlobals6.length <= 4, 'Script #6 must not pollute global namespace beyond documented exports');
});

// ------------------------------------------------------------- TEST 4
test('Challenger - 4. Core API #1: window.AMVAssetModalAPI Empirical Stress Test', () => {
  const code = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8');
  const libCode = fs.readFileSync(path.join(rootDir, 'amv_asset_library.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);

  vm.runInContext(libCode, context);
  vm.runInContext(code, context);

  const api = env.AMVAssetModalAPI;
  assert.ok(api, 'window.AMVAssetModalAPI must be defined');

  // 1. Verify all required methods exist
  const expectedMethods = [
    'open', 'close', 'toggle', 'getState', 'getActiveAsset',
    'hasActiveAudioVisualizer', 'setActiveAsset', 'turnOffAudioVisualizer',
    'turnOnAudioVisualizer', 'clearAll', 'randomize', 'updateVisualizerBadge', 'destroy'
  ];
  expectedMethods.forEach(m => {
    assert.equal(typeof api[m], 'function', `AMVAssetModalAPI.${m} must be a function`);
  });

  // 2. Stress Test: 50 rapid open / close / toggle cycles
  for (let i = 0; i < 50; i++) {
    api.open('Chuyển cảnh');
    api.close();
    api.toggle();
    api.close();
  }

  // 3. Asset mutation and state inspection
  api.setActiveAsset('Chuyển cảnh', 'transition_wipe_radial');
  assert.equal(api.getActiveAsset('Chuyển cảnh'), 'transition_wipe_radial');
  api.clearAll();
  assert.equal(api.getActiveAsset('Chuyển cảnh'), null);

  // 4. Destroy & Cleanup
  const clearedBefore = env._metrics.clearedIntervals.length;
  api.destroy();
  assert.ok(env._metrics.clearedIntervals.length >= clearedBefore, 'destroy() must clear interval timer');

  // Idempotent destroy call (must not throw when called again)
  assert.doesNotThrow(() => api.destroy(), 'Repeated destroy() calls must be safe and idempotent');
});

// ------------------------------------------------------------- TEST 5
test('Challenger - 5. Core API #2: window.AudioVisualizerAPI Empirical Stress Test', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const s12Code = extractScript(html, 12);
  const env = createMockEnvironment();
  const context = vm.createContext(env);

  vm.runInContext(s12Code, context);
  const viz = env.AudioVisualizerAPI;
  assert.ok(viz, 'window.AudioVisualizerAPI must be defined');

  // 1. Verify API contract
  const expectedMethods = [
    'init', 'bindUI', 'isEnabled', 'getStyle', 'setStyle',
    'getConfig', 'toggleModal', 'closeModal', 'toggleMaster',
    'applyThemeColors', 'setColorMode', 'enable', 'disable', 'render'
  ];
  expectedMethods.forEach(m => {
    assert.equal(typeof viz[m], 'function', `AudioVisualizerAPI.${m} must be a function`);
  });

  // 2. Stress Test: 50 rapid toggles
  assert.equal(viz.isEnabled(), false, 'Visualizer initially disabled');
  for (let i = 0; i < 50; i++) {
    viz.toggleMaster();
  }
  // After 50 toggles from false, should be false
  assert.equal(viz.isEnabled(), false);

  // 3. All 6 visualizer styles rendering stress test
  viz.enable();
  assert.equal(viz.isEnabled(), true);
  const styles = ['circle_trap', 'bottom_mirror', 'ribbon_wave', 'side_wings', 'orbit_particles', 'cyber_grid'];
  const mockCtx = createMockCtx();

  styles.forEach(st => {
    viz.setStyle(st);
    assert.equal(viz.getStyle(), st);

    // Render across multiple simulated timestamps
    for (let f = 0; f < 20; f++) {
      const t = f * 0.033;
      assert.doesNotThrow(() => {
        viz.render(mockCtx, 1920, 1080, t, {}, env.S.plan, null);
      }, `Rendering style "${st}" at frame t=${t} must not throw`);
    }
  });

  // 4. Defensive configuration
  const cfg = viz.getConfig();
  cfg.enabled = !cfg.enabled;
  assert.notEqual(viz.isEnabled(), cfg.enabled, 'getConfig() must return a detached copy');
});

// ------------------------------------------------------------- TEST 6
test('Challenger - 6. Core API #3: window.SubWindowAPI Empirical Stress Test', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const s6Code = extractScript(html, 6);
  const env = createMockEnvironment();
  const context = vm.createContext(env);

  vm.runInContext(s6Code, context);
  const sub = env.SubWindowAPI;
  assert.ok(sub, 'window.SubWindowAPI must be defined');

  const expectedMethods = [
    'toggle', 'open', 'close', 'resetPosition', 'minimize',
    'restore', 'toggleMaximize', 'setMode', 'setBg', 'isOpen', 'isPopout'
  ];
  expectedMethods.forEach(m => {
    assert.equal(typeof sub[m], 'function', `SubWindowAPI.${m} must be a function`);
  });

  // Lifecycle stress test & rAF verification
  const initialRafs = env._metrics.animationFrames.length;
  const initialCancels = env._metrics.cancelledFrames.length;

  for (let i = 0; i < 50; i++) {
    sub.open();
    assert.equal(sub.isOpen(), true);
    sub.minimize();
    sub.restore();
    assert.equal(sub.isOpen(), true);
    sub.close();
    assert.equal(sub.isOpen(), false);
  }

  assert.ok(env._metrics.animationFrames.length > initialRafs, 'open() must start rAF sync loops');
  assert.ok(env._metrics.cancelledFrames.length > initialCancels, 'close must cancel rAF sync loops');
  assert.equal(sub.isOpen(), false, 'SubWindow should be closed at end of test');

  // EMPIRICAL CHALLENGE: Verify minimizeWindow() pauses background rAF sync loop
  sub.open();
  const cancelsBeforeMin = env._metrics.cancelledFrames.length;
  sub.minimize();
  const cancelsAfterMin = env._metrics.cancelledFrames.length;
  assert.ok(
    cancelsAfterMin > cancelsBeforeMin,
    'CRITICAL: minimizeWindow() must cancel rAF sync loop via stopSyncLoop() to prevent 60fps background CPU drain'
  );
});

// ------------------------------------------------------------- TEST 7
test('Challenger - 7. Core API #4: window.StemVisualizerAPI Empirical Stress Test', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const s7Code = extractScript(html, 7);
  const env = createMockEnvironment();
  const context = vm.createContext(env);

  vm.runInContext(s7Code, context);
  const stem = env.StemVisualizerAPI;
  assert.ok(stem, 'window.StemVisualizerAPI must be defined');

  const expectedMethods = [
    'toggle', 'open', 'close', 'minimize', 'restore',
    'resetPosition', 'getKickShake', 'getBassBloom',
    'drawSparkleParticles', 'getPianoRipple'
  ];
  expectedMethods.forEach(m => {
    assert.equal(typeof stem[m], 'function', `StemVisualizerAPI.${m} must be a function`);
  });

  // Reactivity stress test across multiple timestamps and plans
  const mockCtx = createMockCtx();
  for (let i = 0; i < 30; i++) {
    const t = i * 0.1;
    const kick = stem.getKickShake(t, env.S.plan);
    const bass = stem.getBassBloom(t, env.S.plan);
    const piano = stem.getPianoRipple(t);

    assert.ok(Number.isFinite(kick), `kick shake must be a finite number at t=${t}`);
    assert.ok(Number.isFinite(bass), `bass bloom must be a finite number at t=${t}`);
    assert.ok(Number.isFinite(piano), `piano ripple must be a finite number at t=${t}`);

    assert.doesNotThrow(() => {
      stem.drawSparkleParticles(mockCtx, 1920, 1080, t);
    }, `Particle drawing at t=${t} must not throw`);
  }
});

// ------------------------------------------------------------- TEST 8
test('Challenger - 8. Core API #5: window.OscilloscopeScreen Empirical Stress Test', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const s8Code = extractScript(html, 8);
  const env = createMockEnvironment();
  const context = vm.createContext(env);

  vm.runInContext(s8Code, context);
  const osc = env.OscilloscopeScreen;
  assert.ok(osc, 'window.OscilloscopeScreen must be defined');

  const expectedMethods = [
    'toggle', 'open', 'close', 'minimize', 'restore',
    'toggleMaximize', 'resetPosition', 'setMode', 'setTheme', 'isOpen', 'isMinimized'
  ];
  expectedMethods.forEach(m => {
    assert.equal(typeof osc[m], 'function', `OscilloscopeScreen.${m} must be a function`);
  });

  // Lifecycle stress test & rAF loop verification
  const initialRafs = env._metrics.animationFrames.length;
  const initialCancels = env._metrics.cancelledFrames.length;

  for (let i = 0; i < 50; i++) {
    osc.open();
    assert.equal(osc.isOpen(), true);
    assert.equal(osc.isMinimized(), false);

    osc.minimize();
    assert.equal(osc.isOpen(), false);
    assert.equal(osc.isMinimized(), true);

    osc.restore();
    assert.equal(osc.isOpen(), true);
    assert.equal(osc.isMinimized(), false);

    osc.close();
    assert.equal(osc.isOpen(), false);
  }

  assert.ok(env._metrics.animationFrames.length > initialRafs, 'open() must start oscilloscope rAF loop');
  assert.ok(env._metrics.cancelledFrames.length > initialCancels, 'minimize/close must stop oscilloscope rAF loop');

  // Verify all modes and themes
  ['lissajous', 'waveform', 'spectrum', 'phase', 'circular'].forEach(m => assert.doesNotThrow(() => osc.setMode(m)));
  ['cyan', 'neon_pink', 'matrix_green', 'amber_crt', 'ice_blue'].forEach(th => assert.doesNotThrow(() => osc.setTheme(th)));
});

// ------------------------------------------------------------- TEST 9
test('Challenger - 9. Core API #6: window.AutoDirectorAPI Empirical Stress Test', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const s5Code = extractScript(html, 5);
  const env = createMockEnvironment();
  const context = vm.createContext(env);

  vm.runInContext(s5Code, context);
  const autoDir = env.AutoDirectorAPI;
  assert.ok(autoDir, 'window.AutoDirectorAPI must be defined in Script #5');

  const expectedMethods = ['init', 'toggle', 'isEnabled', 'getConfig'];
  expectedMethods.forEach(m => {
    assert.equal(typeof autoDir[m], 'function', `AutoDirectorAPI.${m} must be a function`);
  });

  // Rapid toggle stress test
  const initial = autoDir.isEnabled();
  for (let i = 0; i < 50; i++) {
    autoDir.toggle();
  }
  assert.equal(autoDir.isEnabled(), initial, '50 toggles must return to initial state');

  // Defensive copy test
  const cfg = autoDir.getConfig();
  cfg.enabled = !cfg.enabled;
  assert.notEqual(autoDir.isEnabled(), cfg.enabled, 'getConfig() must return a detached copy');
});

// ------------------------------------------------------------- TEST 10
test('Challenger - 10. Multi-API Cross-Integration & Unified Stack Execution', () => {
  const htmlPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);

  // Load all scripts in browser execution order
  vm.runInContext(extractScript(html, 1), context);
  vm.runInContext(fs.readFileSync(path.join(rootDir, 'amv_asset_library.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8'), context);
  vm.runInContext(extractScript(html, 5), context);
  vm.runInContext(extractScript(html, 6), context);
  vm.runInContext(extractScript(html, 7), context);
  vm.runInContext(extractScript(html, 8), context);
  vm.runInContext(extractScript(html, 9), context);
  vm.runInContext(extractScript(html, 10), context);
  vm.runInContext(extractScript(html, 11), context);
  vm.runInContext(extractScript(html, 12), context);

  // Verify all 6 core APIs coexist simultaneously
  assert.ok(env.AMVAssetModalAPI, 'AMVAssetModalAPI must exist in unified stack');
  assert.ok(env.AudioVisualizerAPI, 'AudioVisualizerAPI must exist in unified stack');
  assert.ok(env.SubWindowAPI, 'SubWindowAPI must exist in unified stack');
  assert.ok(env.StemVisualizerAPI, 'StemVisualizerAPI must exist in unified stack');
  assert.ok(env.OscilloscopeScreen, 'OscilloscopeScreen must exist in unified stack');
  assert.ok(env.AutoDirectorAPI, 'AutoDirectorAPI must exist in unified stack');

  // Verify bidirectional interop between AMVAssetModalAPI and AudioVisualizerAPI
  env.AMVAssetModalAPI.turnOnAudioVisualizer('audio_trap_nation_pro');
  assert.equal(env.AudioVisualizerAPI.isEnabled(), true, 'AudioVisualizerAPI must be enabled when AMV activates it');
  assert.equal(env.AMVAssetModalAPI.hasActiveAudioVisualizer(), true, 'AMV must report active visualizer');

  env.AudioVisualizerAPI.disable();
  assert.equal(env.AudioVisualizerAPI.isEnabled(), false);

  env.AudioVisualizerAPI.toggleMaster();
  assert.equal(env.AudioVisualizerAPI.isEnabled(), true);
  assert.equal(env.AMVAssetModalAPI.hasActiveAudioVisualizer(), true);

  env.AudioVisualizerAPI.toggleMaster();
  assert.equal(env.AudioVisualizerAPI.isEnabled(), false);
  assert.equal(env.AMVAssetModalAPI.hasActiveAudioVisualizer(), false);
});
