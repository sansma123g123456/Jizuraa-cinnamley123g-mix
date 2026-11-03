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

class TestEnvironment {
  constructor(overrides = {}) {
    this.rafIdCounter = 1;
    this.timerIdCounter = 1;
    this.activeRafs = new Map(); // id -> callback
    this.allRafHistory = [];
    this.cancelledRafs = [];
    this.activeIntervals = new Map(); // id -> { fn, ms }
    this.clearedIntervals = [];
    this.activeTimeouts = new Map();
    this.clearedTimeouts = [];

    this.windowListeners = new Map(); // evt -> array of fns
    this.documentListeners = new Map();
    this.elementListenerTotal = 0;
    this.elementsCreated = [];

    const self = this;

    const mockElementFactory = (tag = 'div', id = '') => {
      const elListeners = new Map();
      const el = {
        tagName: tag.toUpperCase(),
        id: id,
        dataset: {},
        style: {},
        value: '',
        innerHTML: '',
        innerText: '',
        textContent: '',
        scrollIntoView: () => {},
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
          const idx = this.children.indexOf(child);
          if (idx >= 0) this.children.splice(idx, 1);
          return child;
        },
        addEventListener(evt, fn) {
          if (!elListeners.has(evt)) elListeners.set(evt, []);
          elListeners.get(evt).push(fn);
          self.elementListenerTotal++;
        },
        removeEventListener(evt, fn) {
          if (elListeners.has(evt)) {
            const arr = elListeners.get(evt);
            const idx = arr.indexOf(fn);
            if (idx >= 0) {
              arr.splice(idx, 1);
              self.elementListenerTotal--;
            }
          }
        },
        dispatchEvent(evt) {
          const arr = elListeners.get(evt.type) || [];
          arr.forEach(fn => fn(evt));
        },
        _getListeners(evt) {
          return elListeners.get(evt) || [];
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
            createLinearGradient: () => ({ addColorStop: () => {} }),
            fillRect: () => {},
            strokeRect: () => {},
            fillText: () => {},
            measureText: () => ({ width: 50 }),
            arc: () => {},
            ellipse: () => {},
            rect: () => {},
            clip: () => {},
            setLineDash: () => {},
            getLineDash: () => []
          };
        },
        getBoundingClientRect() {
          return { left: 100, top: 100, width: 400, height: 300, right: 500, bottom: 400 };
        },
        offsetWidth: 400,
        offsetHeight: 300,
        offsetParent: {}, // truthy so previewTick considers canvas visible
        querySelector: (sel) => mockElementFactory('div'),
        querySelectorAll: () => []
      };
      self.elementsCreated.push(el);
      return el;
    };

    this.mockElementFactory = mockElementFactory;
    this.domElementRegistry = new Map();

    const getOrCreateElement = (id) => {
      if (!this.domElementRegistry.has(id)) {
        const tag = id.toLowerCase().includes('canvas') ? 'canvas' : 'div';
        this.domElementRegistry.set(id, mockElementFactory(tag, id));
      }
      return this.domElementRegistry.get(id);
    };

    let simulatedTime = 1000;

    this.env = {
      console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
      performance: {
        now: () => simulatedTime
      },
      setTimeout: (fn, ms = 0) => {
        const id = self.timerIdCounter++;
        self.activeTimeouts.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => {
        self.clearedTimeouts.push(id);
        self.activeTimeouts.delete(id);
      },
      setInterval: (fn, ms) => {
        const id = self.timerIdCounter++;
        self.activeIntervals.set(id, { fn, ms });
        return id;
      },
      clearInterval: (id) => {
        self.clearedIntervals.push(id);
        self.activeIntervals.delete(id);
      },
      requestAnimationFrame: (fn) => {
        const id = self.rafIdCounter++;
        self.activeRafs.set(id, fn);
        self.allRafHistory.push(id);
        return id;
      },
      cancelAnimationFrame: (id) => {
        self.cancelledRafs.push(id);
        self.activeRafs.delete(id);
      },
      addEventListener: (evt, fn) => {
        if (!self.windowListeners.has(evt)) self.windowListeners.set(evt, []);
        self.windowListeners.get(evt).push(fn);
      },
      removeEventListener: (evt, fn) => {
        if (self.windowListeners.has(evt)) {
          const arr = self.windowListeners.get(evt);
          const idx = arr.indexOf(fn);
          if (idx >= 0) arr.splice(idx, 1);
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
        head: mockElementFactory('head', 'head'),
        body: mockElementFactory('body', 'body'),
        addEventListener: (evt, fn) => {
          if (!self.documentListeners.has(evt)) self.documentListeners.set(evt, []);
          self.documentListeners.get(evt).push(fn);
        },
        removeEventListener: (evt, fn) => {
          if (self.documentListeners.has(evt)) {
            const arr = self.documentListeners.get(evt);
            const idx = arr.indexOf(fn);
            if (idx >= 0) arr.splice(idx, 1);
          }
        },
        getElementById: (id) => getOrCreateElement(id),
        querySelector: (sel) => mockElementFactory('div'),
        querySelectorAll: () => [],
        createElement: (tag) => mockElementFactory(tag)
      },
      innerWidth: 1920,
      innerHeight: 1080,
      S: {
        playing: false,
        need: false,
        t: 0,
        plan: { duration: 180, beats: [0, 0.5, 1.0, 1.5, 2.0] },
        renderer: {
          frame: () => {}
        }
      },
      J: {
        Renderer: function() {},
        fmtTime: (t) => String(t.toFixed(2)),
        cutAt: () => null,
        prevBeat: (beats, t) => {
          if (!beats || !beats.length) return null;
          let last = null;
          for (const b of beats) {
            if (b <= t) last = b;
            else break;
          }
          return last;
        },
        clamp: (v, min = 0, max = 1) => Math.max(min, Math.min(max, v)),
        uiApi: { toast: () => {} }
      },
      renderSecondaryPreview: () => {},
      ...overrides
    };

    this.env.window = this.env;
    this.env.document.defaultView = this.env;

    this.advanceSimulatedTime = (ms) => {
      simulatedTime += ms;
    };
  }

  // Flushes pending animation frames (one generation) with given simulated timestamp
  flushRafs(timestamp = 1000) {
    this.advanceSimulatedTime(16.6);
    const queue = Array.from(this.activeRafs.entries());
    this.activeRafs.clear();
    for (const [id, callback] of queue) {
      try {
        callback(timestamp);
      } catch (err) {
        throw err;
      }
    }
    return queue.length;
  }

  // Flushes N generations of animation frames (to check for continuous looping)
  drainRafs(maxRounds = 5, timestamp = 1000) {
    let rounds = 0;
    let totalExecuted = 0;
    while (this.activeRafs.size > 0 && rounds < maxRounds) {
      totalExecuted += this.flushRafs(timestamp + rounds * 16.6);
      rounds++;
    }
    return { rounds, totalExecuted, remaining: this.activeRafs.size };
  }

  // Trigger one interval tick for all active intervals
  tickIntervals() {
    const intervals = Array.from(this.activeIntervals.values());
    for (const { fn } of intervals) {
      fn();
    }
  }

  getTotalWindowListenerCount() {
    let count = 0;
    for (const fns of this.windowListeners.values()) {
      count += fns.length;
    }
    return count;
  }

  getTotalDocumentListenerCount() {
    let count = 0;
    for (const fns of this.documentListeners.values()) {
      count += fns.length;
    }
    return count;
  }
}

// ==============================================================================
// TEST 1: SubWindowAPI Stress Test & Minimize Lifecycle Check
// ==============================================================================
test('CHALLENGER STRESS - SubWindowAPI Rapid Open/Close & Minimize rAF Lifecycle', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const subWindowScript = extractScript(html, 6);
  assert.ok(subWindowScript, 'Script #6 (SubWindowAPI) must exist');

  const testEnv = new TestEnvironment();
  const context = vm.createContext(testEnv.env);
  vm.runInContext(subWindowScript, context);

  const subWin = testEnv.env.SubWindowAPI;
  assert.ok(subWin, 'SubWindowAPI must be defined');

  // Verify initial state
  assert.equal(subWin.isOpen(), false);
  assert.equal(testEnv.activeRafs.size, 0, 'No rAF should be active initially');

  // Stress: 100 Rapid Open/Close cycles synchronously
  for (let i = 0; i < 100; i++) {
    subWin.open();
    assert.equal(subWin.isOpen(), true);
    subWin.close();
    assert.equal(subWin.isOpen(), false);
  }

  // Verify all rAFs are cancelled after close()
  assert.equal(testEnv.activeRafs.size, 0, 'No pending rAFs allowed after close()');

  // Stress: Open -> Tick rAF -> Close -> Flush rAF
  for (let i = 0; i < 50; i++) {
    subWin.open();
    testEnv.flushRafs(1000 + i * 16.6);
    assert.ok(testEnv.activeRafs.size > 0, 'Should re-queue rAF while open');
    subWin.close();
    assert.equal(testEnv.activeRafs.size, 0, 'Closing must cancel active rAF');
  }

  // CRITICAL CHALLENGE: Minimize behavior
  // According to worker claims: "closeWindow() and minimizeWindow() call stopSyncLoop()"
  // And "freeing 100% of background frame budget when minimized".
  subWin.open();
  assert.equal(subWin.isOpen(), true);
  assert.equal(testEnv.activeRafs.size, 1, '1 rAF active when open');

  subWin.minimize();

  // Test whether the rAF loop actually stopped
  const activeAfterMinimize = testEnv.activeRafs.size;

  // Now drain RAFs. If loop is stopped, 0 new frames will be scheduled.
  const drainResult = testEnv.drainRafs(5);

  console.log(`[Empirical Result] SubWindow minimize test: active immediately after minimize = ${activeAfterMinimize}, totalExecuted across 5 rounds = ${drainResult.totalExecuted}, remaining = ${drainResult.remaining}`);

  // Assertions:
  assert.equal(activeAfterMinimize, 0, 'CRITICAL: SubWindow loop must be stopped immediately when minimize() is called (stopSyncLoop must be called)');
  assert.equal(drainResult.totalExecuted, 0, 'CRITICAL: SubWindow must NOT continue executing rAF frames when minimized');
  assert.equal(drainResult.remaining, 0, 'CRITICAL: SubWindow must have 0 remaining rAFs when minimized');
});

// ==============================================================================
// TEST 2: OscilloscopeScreen Stress Test & Minimize Lifecycle Check
// ==============================================================================
test('CHALLENGER STRESS - OscilloscopeScreen Rapid Open/Close & Minimize rAF Lifecycle', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const oscScript = extractScript(html, 8);
  assert.ok(oscScript, 'Script #8 (OscilloscopeScreen) must exist');

  const testEnv = new TestEnvironment();
  const context = vm.createContext(testEnv.env);
  vm.runInContext(oscScript, context);

  const osc = testEnv.env.OscilloscopeScreen;
  assert.ok(osc, 'OscilloscopeScreen must be defined');

  // Verify initial state
  assert.equal(osc.isOpen(), false);
  assert.equal(testEnv.activeRafs.size, 0, 'No rAF initially');

  // Stress: 100 Rapid Open/Close cycles
  for (let i = 0; i < 100; i++) {
    osc.open();
    assert.equal(osc.isOpen(), true);
    osc.close();
    assert.equal(osc.isOpen(), false);
  }
  assert.equal(testEnv.activeRafs.size, 0, 'Oscilloscope rAF must be cleared after close()');

  // Stress: Open -> Tick rAF -> Close
  for (let i = 0; i < 50; i++) {
    osc.open();
    testEnv.flushRafs(1000 + i * 16.6);
    assert.ok(testEnv.activeRafs.size > 0, 'Should re-queue rAF while open');
    osc.close();
    assert.equal(testEnv.activeRafs.size, 0, 'Closing must cancel active rAF');
  }

  // Minimize behavior
  osc.open();
  assert.equal(testEnv.activeRafs.size, 1);
  osc.minimize();
  assert.equal(testEnv.activeRafs.size, 0, 'Oscilloscope loop must be stopped when minimized');

  const drainResult = testEnv.drainRafs(5);
  assert.equal(drainResult.totalExecuted, 0, 'Oscilloscope must not execute frames when minimized');

  // Restore behavior
  osc.restore();
  assert.equal(osc.isOpen(), true);
  assert.equal(testEnv.activeRafs.size, 1, 'Oscilloscope loop must resume upon restore()');
  osc.close();
  assert.equal(testEnv.activeRafs.size, 0);
});

// ==============================================================================
// TEST 3: ManualLyricSyncAPI Rapid Open/Close Lifecycle
// ==============================================================================
test('CHALLENGER STRESS - ManualLyricSyncAPI Rapid Open/Close & Tick Check', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const syncScript = extractScript(html, 10);
  assert.ok(syncScript, 'Script #10 (ManualLyricSyncAPI) must exist');

  const testEnv = new TestEnvironment();
  testEnv.env.S.project = {
    lyrics: '[00:01.00] First test line\n[00:05.50] Second test line'
  };

  const context = vm.createContext(testEnv.env);
  vm.runInContext(syncScript, context);

  const sync = testEnv.env.ManualLyricSyncAPI;
  assert.ok(sync, 'ManualLyricSyncAPI must be defined');

  // Initial state closed
  assert.equal(sync.isOpen(), false);
  assert.equal(testEnv.activeRafs.size, 0);

  // Stress: 100 Rapid Open/Close
  for (let i = 0; i < 100; i++) {
    sync.open();
    assert.equal(sync.isOpen(), true);
    sync.close();
    assert.equal(sync.isOpen(), false);
  }
  assert.equal(sync.isOpen(), false);
  assert.equal(testEnv.activeRafs.size, 0, 'rAF must be stopped when closed');

  // Open -> Flush -> Close
  for (let i = 0; i < 50; i++) {
    sync.open();
    assert.equal(testEnv.activeRafs.size, 1, 'Loop should be active after open');
    testEnv.flushRafs(1000 + i * 16.6);
    sync.close();
    assert.equal(testEnv.activeRafs.size, 0, 'Loop must be stopped after close');
  }
});

// ==============================================================================
// TEST 4: AMVAssetModalAPI Lifecycle, Preview Loop & Interval Cleanup
// ==============================================================================
test('CHALLENGER STRESS - AMVAssetModalAPI Rapid Open/Close, Canvas Map & Hook Interval', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');

  // Scenario A: Renderer ready at init
  {
    const testEnv = new TestEnvironment();
    const context = vm.createContext(testEnv.env);
    vm.runInContext(code, context);

    const api = testEnv.env.AMVAssetModalAPI;
    assert.ok(api);

    // Initial hook interval should be cleared immediately because J.Renderer and S.renderer exist
    assert.equal(testEnv.activeIntervals.size, 0, 'hookInterval must be cleared immediately when renderer exists');

    // Rapid open/close 100 times
    for (let i = 0; i < 100; i++) {
      api.open();
      api.close();
    }
    assert.equal(api.getState().isOpen, false);
    assert.equal(testEnv.activeRafs.size, 0, 'No active preview rAF after closeModal');

    // Destroy
    api.destroy();
    assert.equal(testEnv.activeRafs.size, 0);
    assert.equal(testEnv.activeIntervals.size, 0);
  }

  // Scenario B: Renderer NOT ready at init, becomes ready later
  {
    const testEnv = new TestEnvironment({
      J: {},
      S: {}
    });
    const context = vm.createContext(testEnv.env);
    vm.runInContext(code, context);

    // Interval should be active polling for renderer
    assert.equal(testEnv.activeIntervals.size, 1, 'hookInterval must be active when renderer is not yet available');

    // Simulate 3 ticks without renderer
    testEnv.tickIntervals();
    testEnv.tickIntervals();
    testEnv.tickIntervals();
    assert.equal(testEnv.activeIntervals.size, 1, 'Interval continues while renderer is missing');

    // Attach J.Renderer
    testEnv.env.J.Renderer = function() {};
    testEnv.tickIntervals();

    // Now hook should have succeeded and cleared the interval
    assert.equal(testEnv.activeIntervals.size, 0, 'Interval must be cleared once renderer attaches and hook succeeds');
  }
});

// ==============================================================================
// TEST 5: Event Listener Count Stability Across 100 Cycles & Re-binds
// ==============================================================================
test('CHALLENGER STRESS - Event Listener Stability Across 100 Open/Close Cycles', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const subWindowScript = extractScript(html, 6);
  const oscScript = extractScript(html, 8);

  const testEnv = new TestEnvironment();
  const context = vm.createContext(testEnv.env);

  vm.runInContext(subWindowScript, context);
  vm.runInContext(oscScript, context);

  // Baseline listener counts
  const baselineWin = testEnv.getTotalWindowListenerCount();
  const baselineDoc = testEnv.getTotalDocumentListenerCount();
  const baselineEl = testEnv.elementListenerTotal;

  // Run 100 open/close cycles on both SubWindow and Oscilloscope
  for (let i = 0; i < 100; i++) {
    testEnv.env.SubWindowAPI.open();
    testEnv.env.SubWindowAPI.close();
    testEnv.env.OscilloscopeScreen.open();
    testEnv.env.OscilloscopeScreen.close();
  }

  const afterWin = testEnv.getTotalWindowListenerCount();
  const afterDoc = testEnv.getTotalDocumentListenerCount();
  const afterEl = testEnv.elementListenerTotal;

  console.log(`[Empirical Result] Window listeners: ${baselineWin} -> ${afterWin}`);
  console.log(`[Empirical Result] Document listeners: ${baselineDoc} -> ${afterDoc}`);
  console.log(`[Empirical Result] Element listeners: ${baselineEl} -> ${afterEl}`);

  assert.equal(afterWin, baselineWin, 'Window listeners must NOT proliferate during open/close cycles');
  assert.equal(afterDoc, baselineDoc, 'Document listeners must NOT proliferate during open/close cycles');
  assert.equal(afterEl, baselineEl, 'Element listeners must NOT proliferate during open/close cycles');
});
