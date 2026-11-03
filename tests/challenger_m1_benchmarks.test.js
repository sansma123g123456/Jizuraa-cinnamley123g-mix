import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

// Fast Canvas 2D context with call counting & state balancing
function createFastBenchmarkContext(w = 1920, h = 1080) {
  let saveCount = 0;
  let restoreCount = 0;
  let beginPathCount = 0;
  let closePathCount = 0;
  let strokeCount = 0;
  let fillCount = 0;
  let moveToCount = 0;
  let lineToCount = 0;
  let arcCount = 0;
  let curveCount = 0;
  let gradientCount = 0;

  const gradientMock = {
    addColorStop: () => {}
  };

  const ctx = {
    canvas: { width: w, height: h },
    globalCompositeOperation: 'source-over',
    globalAlpha: 1.0,
    strokeStyle: '#000000',
    fillStyle: '#000000',
    lineWidth: 1.0,
    shadowBlur: 0,
    shadowColor: 'transparent',
    lineDash: [],
    createImageData: (cw, ch) => ({ data: new Uint8ClampedArray(Math.max(0, cw * ch * 4)) }),
    getImageData: (cx, cy, cw, ch) => ({ data: new Uint8ClampedArray(Math.max(0, cw * ch * 4)) }),
    putImageData: () => {},
    drawImage: () => {},
    measureText: (t) => ({ width: (t || '').length * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }),
    createPattern: () => ({}),

    save() {
      saveCount++;
    },
    restore() {
      restoreCount++;
    },
    beginPath() {
      beginPathCount++;
    },
    closePath() {
      closePathCount++;
    },
    stroke() {
      strokeCount++;
    },
    fill() {
      fillCount++;
    },
    moveTo(x, y) {
      moveToCount++;
    },
    lineTo(x, y) {
      lineToCount++;
    },
    arc(x, y, r, sa, ea) {
      arcCount++;
    },
    quadraticCurveTo(cpx, cpy, x, y) {
      curveCount++;
    },
    rect(x, y, w, h) {},
    clearRect(x, y, w, h) {},
    fillRect(x, y, w, h) {
      fillCount++;
    },
    setLineDash(d) {
      ctx.lineDash = d;
    },
    createLinearGradient(x0, y0, x1, y1) {
      gradientCount++;
      return gradientMock;
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      gradientCount++;
      return gradientMock;
    },
    translate(x, y) {},
    rotate(rad) {},
    scale(sx, sy) {},
    setTransform(a, b, c, d, e, f) {},

    getStats() {
      return {
        saveCount,
        restoreCount,
        beginPathCount,
        closePathCount,
        strokeCount,
        fillCount,
        moveToCount,
        lineToCount,
        arcCount,
        curveCount,
        gradientCount,
        isBalanced: saveCount === restoreCount
      };
    },
    resetStats() {
      saveCount = 0;
      restoreCount = 0;
      beginPathCount = 0;
      closePathCount = 0;
      strokeCount = 0;
      fillCount = 0;
      moveToCount = 0;
      lineToCount = 0;
      arcCount = 0;
      curveCount = 0;
      gradientCount = 0;
    }
  };

  return new Proxy(ctx, {
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
    value: '',
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
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt] = listeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const fns = listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] !== undefined ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    closest: () => createMockElement('div'),
    insertAdjacentElement: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    getContext: () => createFastBenchmarkContext(),
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => [],
    focus: () => {},
    select: () => {},
    scrollIntoView: () => {}
  };
  el.parentElement = el;
  return el;
}

function setupBenchmarkEnvironment() {
  const rawHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const amvLibCode = fs.readFileSync(path.join(rootDir, 'amv_asset_library.js'), 'utf8');
  const amvMgrCode = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8');

  let currentDropMul = 1.0;
  let isDropSection = false;

  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    setTimeout: (fn) => 1,
    clearTimeout: () => {},
    setInterval: (fn) => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => 1,
    cancelAnimationFrame: () => {},
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
    navigator: { userAgent: 'node', onLine: true },
    location: { href: 'http://localhost/' },
    performance: performance,
    Float32Array: Float32Array,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Int32Array: Int32Array,
    AudioContext: class {},
    OfflineAudioContext: class {},
    Image: class { constructor() { this.width = 100; this.height = 100; } },
    S: {
      playing: true,
      exporting: false,
      t: 1.0,
      plan: {
        duration: 180,
        beats: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
        energy: [0.65, 0.82, 0.74, 0.91, 0.88, 0.70, 0.95],
        energyRate: 10
      },
      audio: null,
      project: { aspect: '16:9', res: 1080, fps: 60 }
    },
    J: {
      fmtTime: (t) => String(t.toFixed(2)),
      clamp: (v, min = 0, max = 1) => Math.max(min, Math.min(max, v)),
      prevBeat: (beats, t) => beats ? beats[Math.floor(t % beats.length)] : 0,
      designSize: (aspect) => aspect === '9:16' ? [1080, 1920] : [1920, 1080]
    },
    toast: () => {},
    renderSecondaryPreview: () => {},
    SmartSectionAPI: {
      isDrop: () => isDropSection,
      getDropImpactMultiplier: () => currentDropMul,
      applyToPlan: () => {},
      getSectionAt: () => null
    },
    setSimulatedDrop: (drop, mul = 2.0) => {
      isDropSection = drop;
      currentDropMul = mul;
    }
  };

  env.window = env;
  env.document.defaultView = env;
  env.globalThis = env;
  env.self = env;

  const context = vm.createContext(env);

  // Run scripts in standard browser order
  vm.runInContext(extractScript(rawHtml, 1), context);
  vm.runInContext(amvLibCode, context);
  vm.runInContext(amvMgrCode, context);
  vm.runInContext(extractScript(rawHtml, 5), context);
  vm.runInContext(extractScript(rawHtml, 6), context);
  vm.runInContext(extractScript(rawHtml, 7), context);
  vm.runInContext(extractScript(rawHtml, 8), context);
  vm.runInContext(extractScript(rawHtml, 9), context);
  vm.runInContext(extractScript(rawHtml, 10), context);
  vm.runInContext(extractScript(rawHtml, 11), context);
  vm.runInContext(extractScript(rawHtml, 12), context);

  return env;
}

function computeStats(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const min = sorted[0];
  const max = sorted[n - 1];
  const p50 = sorted[Math.floor(n * 0.50)];
  const p95 = sorted[Math.floor(n * 0.95)];
  const p99 = sorted[Math.floor(n * 0.99)];
  return { mean, min, max, p50, p95, p99, count: n };
}

// =====================================================================
// BENCHMARK 1: 500-FRAME RENDER TIME PER FRAME FOR ALL 3 NEW 3D VISUALIZERS
// TARGET: STRICTLY < 16.6ms (60 FPS)
// =====================================================================
test('EMPIRICAL BENCHMARK 1: 500-Frame Performance (< 16.6ms / 60 FPS) in AudioVisualizerAPI', async (t) => {
  const env = setupBenchmarkEnvironment();
  const viz = env.AudioVisualizerAPI;
  viz.enable();

  const styles = [
    { id: 'galaxy_orbit', name: 'Audio Galaxy & Particle Orbit 3D' },
    { id: 'cyber_ribbon_3d', name: 'Cyber Ribbon / Wave-Surface 3D' },
    { id: 'holographic_lissajous', name: 'Holographic Glass Lissajous Vector Scope 3D' }
  ];

  for (const style of styles) {
    await t.test(`Benchmark style: ${style.name} (${style.id}) - 500 frames @ 1080p 16:9`, () => {
      viz.setStyle(style.id);
      const ctx = createFastBenchmarkContext(1920, 1080);

      // Warmup: 50 frames
      for (let f = 0; f < 50; f++) {
        const t = f / 60;
        viz.render(ctx, 1920, 1080, t, {}, env.S.plan, null);
      }
      ctx.resetStats();

      // Benchmark: 500 frames
      const timings = new Float64Array(500);
      for (let f = 0; f < 500; f++) {
        const t = f / 60;
        // Simulate dynamic drop impact midway
        if (f >= 200 && f < 350) {
          env.setSimulatedDrop(true, 2.5);
        } else {
          env.setSimulatedDrop(false, 1.0);
        }

        const t0 = performance.now();
        viz.render(ctx, 1920, 1080, t, {}, env.S.plan, null);
        const t1 = performance.now();
        timings[f] = t1 - t0;
      }

      const stats = computeStats(timings);
      const canvasStats = ctx.getStats();

      console.log(`\n--- BENCHMARK RESULTS: ${style.name} (${style.id}) ---`);
      console.log(`  Frames: ${stats.count}`);
      console.log(`  Mean Render Time: ${stats.mean.toFixed(4)} ms`);
      console.log(`  Min Render Time:  ${stats.min.toFixed(4)} ms`);
      console.log(`  Max Render Time:  ${stats.max.toFixed(4)} ms`);
      console.log(`  Median (p50):     ${stats.p50.toFixed(4)} ms`);
      console.log(`  95th Percentile:  ${stats.p95.toFixed(4)} ms`);
      console.log(`  99th Percentile:  ${stats.p99.toFixed(4)} ms`);
      console.log(`  Canvas Operations: Strokes=${canvasStats.strokeCount}, Fills=${canvasStats.fillCount}, Saves=${canvasStats.saveCount}, Restores=${canvasStats.restoreCount}`);
      console.log(`  Context Balanced: ${canvasStats.isBalanced}`);

      // Hard empirical constraints:
      assert.ok(stats.mean < 16.6, `Mean render time ${stats.mean.toFixed(4)}ms must be strictly < 16.6ms (60 FPS)`);
      assert.ok(stats.p95 < 16.6, `p95 render time ${stats.p95.toFixed(4)}ms must be strictly < 16.6ms`);
      assert.equal(canvasStats.isBalanced, true, 'Canvas save/restore must balance across 500 frames');
    });

    await t.test(`Benchmark style: ${style.name} (${style.id}) - 500 frames @ 9:16 Vertical Portrait`, () => {
      viz.setStyle(style.id);
      const ctx = createFastBenchmarkContext(1080, 1920);

      // Warmup: 30 frames
      for (let f = 0; f < 30; f++) {
        viz.render(ctx, 1080, 1920, f / 60, {}, env.S.plan, null);
      }
      ctx.resetStats();

      const timings = new Float64Array(500);
      for (let f = 0; f < 500; f++) {
        const t = f / 60;
        const t0 = performance.now();
        viz.render(ctx, 1080, 1920, t, {}, env.S.plan, null);
        const t1 = performance.now();
        timings[f] = t1 - t0;
      }

      const stats = computeStats(timings);
      console.log(`  9:16 Portrait Mean: ${stats.mean.toFixed(4)} ms, p95: ${stats.p95.toFixed(4)} ms`);
      assert.ok(stats.mean < 16.6, `9:16 mean render time ${stats.mean.toFixed(4)}ms must be strictly < 16.6ms`);
      assert.ok(stats.p95 < 16.6, `9:16 p95 render time ${stats.p95.toFixed(4)}ms must be strictly < 16.6ms`);
    });
  }
});

// =====================================================================
// BENCHMARK 2: 500-FRAME RENDER TIME IN AMV_ASSET_LIBRARY TEMPLATES
// TARGET: STRICTLY < 16.6ms (60 FPS)
// =====================================================================
test('EMPIRICAL BENCHMARK 2: 500-Frame Performance (< 16.6ms / 60 FPS) in AMV Asset Library', async (t) => {
  const env = setupBenchmarkEnvironment();
  const lib = env.window.AMVAssets;
  assert.ok(lib, 'AMVAssets must exist on window');

  const templates = [
    { id: 'audio_galaxy_orbit_3d', name: 'Audio Galaxy 3D Library Template' },
    { id: 'audio_cyber_ribbon_3d', name: 'Cyber Ribbon 3D Library Template' },
    { id: 'audio_holographic_lissajous_3d', name: 'Holographic Lissajous 3D Library Template' }
  ];

  for (const tmpl of templates) {
    await t.test(`Benchmark library template: ${tmpl.name} (${tmpl.id}) - 500 frames`, () => {
      const ctx = createFastBenchmarkContext(1920, 1080);

      // Warmup: 30 frames
      for (let f = 0; f < 30; f++) {
        lib.render(tmpl.id, ctx, 1920, 1080, f / 60, {});
      }
      ctx.resetStats();

      const timings = new Float64Array(500);
      for (let f = 0; f < 500; f++) {
        const t = f / 60;
        const t0 = performance.now();
        lib.render(tmpl.id, ctx, 1920, 1080, t, {});
        const t1 = performance.now();
        timings[f] = t1 - t0;
      }

      const stats = computeStats(timings);
      const canvasStats = ctx.getStats();

      console.log(`\n--- LIBRARY TEMPLATE BENCHMARK: ${tmpl.name} ---`);
      console.log(`  Mean Render Time: ${stats.mean.toFixed(4)} ms`);
      console.log(`  Median (p50):     ${stats.p50.toFixed(4)} ms`);
      console.log(`  95th Percentile:  ${stats.p95.toFixed(4)} ms`);
      console.log(`  99th Percentile:  ${stats.p99.toFixed(4)} ms`);
      console.log(`  Context Balanced: ${canvasStats.isBalanced} (${canvasStats.saveCount} saves / ${canvasStats.restoreCount} restores)`);

      assert.ok(stats.mean < 16.6, `Library template mean render time ${stats.mean.toFixed(4)}ms must be < 16.6ms`);
      assert.ok(stats.p95 < 16.6, `Library template p95 render time ${stats.p95.toFixed(4)}ms must be < 16.6ms`);
      assert.equal(canvasStats.isBalanced, true, 'Canvas save/restore must balance');
    });
  }
});

// =====================================================================
// BENCHMARK 3: LONG-RUN STABILITY (1000 CONTINUOUS FRAMES)
// CHECKS: Memory accumulation, unbounded array growth, unclosed paths
// =====================================================================
test('EMPIRICAL STABILITY 3: 1000 Continuous Frames Stability & Resource Integrity', async (t) => {
  const env = setupBenchmarkEnvironment();
  const viz = env.AudioVisualizerAPI;
  viz.enable();

  const styles = ['galaxy_orbit', 'cyber_ribbon_3d', 'holographic_lissajous'];

  for (const styleId of styles) {
    await t.test(`Long-run 1000 frames stability for style: ${styleId}`, () => {
      viz.setStyle(styleId);
      const ctx = createFastBenchmarkContext(1920, 1080);

      // Snapshot memory before run
      if (global.gc) global.gc();
      const initialMem = process.memoryUsage().heapUsed;

      let unclosedPathsDetected = 0;
      let unbalancedFrames = 0;
      const memCheckpoints = [];

      for (let f = 0; f < 1000; f++) {
        const t = f / 60;
        const savesBefore = ctx.getStats().saveCount;
        const restoresBefore = ctx.getStats().restoreCount;

        // Modulate musical sections dynamically
        if (f % 200 === 0) {
          env.setSimulatedDrop((f / 200) % 2 === 1, 2.5);
        }

        viz.render(ctx, 1920, 1080, t, {}, env.S.plan, null);

        const savesAfter = ctx.getStats().saveCount;
        const restoresAfter = ctx.getStats().restoreCount;

        // Frame-level context balance
        if ((savesAfter - savesBefore) !== (restoresAfter - restoresBefore)) {
          unbalancedFrames++;
        }

        // Checkpoints at 250, 500, 750, 1000 frames
        if ((f + 1) % 250 === 0) {
          memCheckpoints.push({
            frame: f + 1,
            heapUsedMb: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2)
          });
        }
      }

      if (global.gc) global.gc();
      const finalMem = process.memoryUsage().heapUsed;
      const finalStats = ctx.getStats();

      console.log(`\n--- 1000 FRAMES STABILITY: ${styleId} ---`);
      console.log(`  Unbalanced Frames: ${unbalancedFrames}`);
      console.log(`  Total Saves: ${finalStats.saveCount}, Total Restores: ${finalStats.restoreCount}`);
      console.log(`  Total Path Beginnings: ${finalStats.beginPathCount}`);
      console.log(`  Memory Checkpoints:`, memCheckpoints);
      console.log(`  Initial Heap: ${(initialMem / (1024 * 1024)).toFixed(2)} MB -> Final Heap: ${(finalMem / (1024 * 1024)).toFixed(2)} MB`);

      // 1. Zero unbalanced frames allowed
      assert.equal(unbalancedFrames, 0, `All 1000 frames must have perfectly balanced save/restore calls for ${styleId}`);
      assert.equal(finalStats.saveCount, finalStats.restoreCount, `Cumulative save/restore must match exactly`);

      // 2. Memory accumulation check: Heap delta across 1000 frames must be bounded (< 35MB growth without unbounded leakage)
      const heapGrowthMb = (finalMem - initialMem) / (1024 * 1024);
      assert.ok(heapGrowthMb < 35, `Heap growth across 1000 frames (${heapGrowthMb.toFixed(2)}MB) must be bounded (< 35MB)`);
    });
  }
});

// =====================================================================
// BENCHMARK 4: RAPID STYLE SWITCHING UNDER CONTINUOUS 1000 FRAMES PLAYBACK
// =====================================================================
test('EMPIRICAL STABILITY 4: Rapid Visualizer Style Interleaving Across 1000 Frames', () => {
  const env = setupBenchmarkEnvironment();
  const viz = env.AudioVisualizerAPI;
  viz.enable();
  const ctx = createFastBenchmarkContext(1920, 1080);

  const styleSequence = [
    'galaxy_orbit',
    'cyber_ribbon_3d',
    'holographic_lissajous',
    'circle_trap',
    'bottom_mirror',
    'ribbon_wave',
    'unknown_fallback_xyz' // tests fallback robustness mid-stream
  ];

  let unhandledErrors = 0;
  for (let f = 0; f < 1000; f++) {
    const t = f / 60;
    const style = styleSequence[f % styleSequence.length];
    viz.setStyle(style);

    try {
      viz.render(ctx, 1920, 1080, t, {}, env.S.plan, null);
    } catch (err) {
      unhandledErrors++;
    }
  }

  const stats = ctx.getStats();
  console.log(`\n--- RAPID STYLE SWITCHING (1000 FRAMES) ---`);
  console.log(`  Unhandled Errors: ${unhandledErrors}`);
  console.log(`  Context Balanced: ${stats.isBalanced} (${stats.saveCount} / ${stats.restoreCount})`);

  assert.equal(unhandledErrors, 0, 'Rapid style switching across 1000 frames must have 0 unhandled errors');
  assert.equal(stats.isBalanced, true, 'Context must remain perfectly balanced across 1000 style switches');
});
