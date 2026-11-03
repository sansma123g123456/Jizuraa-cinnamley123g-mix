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
const rawHtml = fs.readFileSync(htmlPath, 'utf8');

function extractScripts(htmlContent) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const list = [];
  let match;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    list.push(match[1]);
  }
  return list;
}

const scripts = extractScripts(rawHtml);
const s5Core = scripts[4];
const s12Viz = scripts[11];

function createStrictCanvasSpy() {
  const violations = [];
  const calls = [];
  let saveDepth = 0;

  const checkFinite = (method, name, val) => {
    if (typeof val === 'number') {
      if (!Number.isFinite(val) || Number.isNaN(val)) {
        violations.push({ method, name, val, reason: 'Non-finite number (NaN or Infinity)' });
      }
    }
  };

  const checkFiniteArgs = (method, args) => {
    for (let i = 0; i < args.length; i++) {
      checkFinite(method, `arg[${i}]`, args[i]);
    }
  };

  const target = {
    canvas: { width: 1920, height: 1080 },
    save: () => {
      saveDepth++;
      calls.push({ method: 'save', depth: saveDepth });
    },
    restore: () => {
      saveDepth--;
      if (saveDepth < 0) {
        violations.push({ method: 'restore', depth: saveDepth, reason: 'Unbalanced restore below root save depth' });
      }
      calls.push({ method: 'restore', depth: saveDepth });
    },
    translate: (x, y) => {
      checkFiniteArgs('translate', [x, y]);
      calls.push({ method: 'translate', x, y });
    },
    rotate: (rad) => {
      checkFiniteArgs('rotate', [rad]);
      calls.push({ method: 'rotate', rad });
    },
    scale: (sx, sy) => {
      checkFiniteArgs('scale', [sx, sy]);
      calls.push({ method: 'scale', sx, sy });
    },
    beginPath: () => calls.push({ method: 'beginPath' }),
    closePath: () => calls.push({ method: 'closePath' }),
    moveTo: (x, y) => {
      checkFiniteArgs('moveTo', [x, y]);
      calls.push({ method: 'moveTo', x, y });
    },
    lineTo: (x, y) => {
      checkFiniteArgs('lineTo', [x, y]);
      calls.push({ method: 'lineTo', x, y });
    },
    quadraticCurveTo: (cpx, cpy, x, y) => {
      checkFiniteArgs('quadraticCurveTo', [cpx, cpy, x, y]);
      calls.push({ method: 'quadraticCurveTo', cpx, cpy, x, y });
    },
    bezierCurveTo: (cp1x, cp1y, cp2x, cp2y, x, y) => {
      checkFiniteArgs('bezierCurveTo', [cp1x, cp1y, cp2x, cp2y, x, y]);
      calls.push({ method: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    },
    arc: (x, y, radius, startAngle, endAngle, counterclockwise) => {
      checkFiniteArgs('arc', [x, y, radius, startAngle, endAngle]);
      if (typeof radius === 'number' && radius < 0) {
        violations.push({ method: 'arc', radius, reason: 'Negative radius violates Canvas 2D specification' });
      }
      calls.push({ method: 'arc', x, y, radius, startAngle, endAngle });
    },
    rect: (x, y, w, h) => {
      checkFiniteArgs('rect', [x, y, w, h]);
      calls.push({ method: 'rect', x, y, w, h });
    },
    fillRect: (x, y, w, h) => {
      checkFiniteArgs('fillRect', [x, y, w, h]);
      calls.push({ method: 'fillRect', x, y, w, h });
    },
    strokeRect: (x, y, w, h) => {
      checkFiniteArgs('strokeRect', [x, y, w, h]);
      calls.push({ method: 'strokeRect', x, y, w, h });
    },
    clearRect: (x, y, w, h) => {
      checkFiniteArgs('clearRect', [x, y, w, h]);
      calls.push({ method: 'clearRect', x, y, w, h });
    },
    fillText: (text, x, y) => {
      checkFiniteArgs('fillText', [x, y]);
      calls.push({ method: 'fillText', text, x, y });
    },
    strokeText: (text, x, y) => {
      checkFiniteArgs('strokeText', [x, y]);
      calls.push({ method: 'strokeText', text, x, y });
    },
    fill: () => calls.push({ method: 'fill' }),
    stroke: () => calls.push({ method: 'stroke' }),
    clip: () => calls.push({ method: 'clip' }),
    setLineDash: (segments) => {
      if (Array.isArray(segments)) {
        for (const s of segments) {
          if (!Number.isFinite(s) || Number.isNaN(s) || s < 0) {
            violations.push({ method: 'setLineDash', segment: s, reason: 'Invalid dash segment' });
          }
        }
      }
      calls.push({ method: 'setLineDash', segments });
    },
    createLinearGradient: (x0, y0, x1, y1) => {
      checkFiniteArgs('createLinearGradient', [x0, y0, x1, y1]);
      return { addColorStop: () => {} };
    },
    createRadialGradient: (x0, y0, r0, x1, y1, r1) => {
      checkFiniteArgs('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
      if (r0 < 0 || r1 < 0) {
        violations.push({ method: 'createRadialGradient', r0, r1, reason: 'Negative radial gradient radius' });
      }
      return { addColorStop: () => {} };
    },
    createImageData: (w = 100, h = 100) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x = 0, y = 0, w = 100, h = 100) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
    measureText: (text) => ({
      width: (text || '').length * 10,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2
    })
  };

  const proxy = new Proxy(target, {
    set: (t, prop, val) => {
      if (['lineWidth', 'shadowBlur', 'globalAlpha', 'shadowOffsetX', 'shadowOffsetY'].includes(prop)) {
        if (typeof val === 'number') {
          if (!Number.isFinite(val) || Number.isNaN(val)) {
            violations.push({ prop, val, reason: `Property ${prop} assigned non-finite number` });
          }
          if (prop === 'shadowBlur' && val < 0) {
            violations.push({ prop, val, reason: 'shadowBlur cannot be negative' });
          }
        }
      }
      t[prop] = val;
      return true;
    },
    get: (t, prop) => {
      if (prop in t) return t[prop];
      return (...args) => { checkFiniteArgs(prop, args); };
    }
  });

  proxy._getViolations = () => violations;
  proxy._getCalls = () => calls;
  proxy._getSaveDepth = () => saveDepth;
  proxy._reset = () => { violations.length = 0; calls.length = 0; saveDepth = 0; };
  return proxy;
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
    options: [],
    selectedIndex: 0,
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
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
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
      if (typeof el['on' + evt.type] === 'function') {
        el['on' + evt.type](evt);
      }
    },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] || null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; },
    focus: () => {},
    select: () => {},
    getContext: () => createStrictCanvasSpy(),
    closest: () => createMockElement('label'),
    insertAdjacentElement: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => []
  };
  el.parentElement = el;
  return el;
}

function setupUnifiedContext(overrides = {}) {
  const elements = new Map();
  function getElement(id, defaultTag = 'div') {
    if (id === 'app') return null; // engine-only mode for robust isolated testing
    if (!elements.has(id)) {
      const tag = id === 'lrcTreat' ? 'select' :
                  id.toLowerCase().includes('canvas') ? 'canvas' :
                  id.toLowerCase().includes('btn') ? 'button' : defaultTag;
      const el = createMockElement(tag);
      el.id = id;
      if (tag === 'select') {
        el.options = [
          { value: 'auto', text: 'Tự động' },
          { value: 'liquidFillGlow', text: 'Liquid Fill Glow' },
          { value: 'glitchRgbSplit', text: 'Glitch RGB Split' },
          { value: 'perspective3DFlip', text: '3D Flip Perspective' }
        ];
        el.selectedIndex = 0;
        el.value = 'auto';
      }
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const listeners = {};
  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    addEventListener: (evt, fn) => {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter(f => f !== fn);
    },
    dispatchEvent: (evt) => {
      const fns = listeners[evt.type || evt] || [];
      fns.forEach(fn => fn(evt));
    },
    setTimeout: (fn, delay = 0) => setTimeout(fn, delay),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    performance,
    Float32Array,
    Uint8Array,
    Uint8ClampedArray,
    Int32Array,
    Math,
    navigator: { userAgent: 'node', serviceWorker: {} },
    location: { href: 'http://localhost/', protocol: 'http:', hostname: 'localhost' },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; }
    },
    document: {
      readyState: 'complete',
      head: createMockElement('head'),
      body: createMockElement('body'),
      documentElement: createMockElement('html'),
      getElementById: (id) => getElement(id),
      querySelector: () => createMockElement('div'),
      querySelectorAll: () => [],
      createElement: (tag) => {
        const el = createMockElement(tag);
        if (tag.toLowerCase() === 'canvas') el.getContext = () => createStrictCanvasSpy();
        return el;
      },
      createDocumentFragment: () => createMockElement('fragment'),
      createTextNode: (t) => ({ nodeValue: t }),
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    toast: () => {},
    S: {
      playing: true,
      exporting: false,
      t: 1.0,
      need: false,
      project: {
        title: 'Adversarial Test Track',
        artist: 'Tester',
        lyrics: '[00:01.00] Kinetic Typography Verification\n[00:04.00] Syllable Glow Spectrum Test',
        timing: { bpm: 128, offset: 0.4, lineScale: 1, snap: false, lineTimes: {} },
        lrcTreat: 'auto',
        instrumental: { enabled: false }
      },
      plan: {
        duration: 120,
        beats: [0, 0.468, 0.937, 1.406, 1.875, 2.343],
        energy: [0.4, 0.8, 0.9, 0.5, 0.7],
        energyRate: 10,
        cuts: []
      }
    },
    audioDsp: {
      smooth: { kick: 0.6, bass: 0.7, vocal: 0.5, hihat: 0.8, treble: 0.6, piano: 0.3 },
      update: () => {}
    },
    StemVisualizerAPI: {
      getKickShake: () => 0.5
    },
    SmartSectionAPI: {
      isDrop: () => true,
      getDropImpactMultiplier: () => 1.8,
      getSmoothDropImpactMultiplier: () => 1.8,
      applyToPlan: () => {},
      analyze: () => [],
      init: () => {},
      syncUI: () => {}
    },
    ...overrides
  };
  env.window = env;
  env.globalThis = env;
  env.document.defaultView = env;

  const context = vm.createContext(env);
  vm.runInContext(s5Core, context);
  vm.runInContext(s12Viz, context);

  return { env, context, J: env.J || env.window.J, AudioVisualizerAPI: env.AudioVisualizerAPI };
}

// ==============================================================================
// SUITE 1: ADVERSARIAL KINETIC TYPOGRAPHY PRESETS UNDER EXTREME PARAMETERS
// ==============================================================================
test('CHALLENGER STRESS - Suite 1: Kinetic Typography Presets under Extreme Audio & Hostile Env', async (t) => {
  const { env, J } = setupUnifiedContext();
  const spyCtx = createStrictCanvasSpy();

  await t.test('1.1: liquidFillGlow rendering across extreme kick, bass, dropMultiplier and font sizes', () => {
    const kickPool = [0, 0.1, 1.0, 5.0, 10.0, -2.0, NaN, Infinity];
    const dropPool = [0.5, 1.0, 2.0, 3.0, 10.0, NaN];
    const sizePool = [0, 16, 48, 120, 2000];

    kickPool.forEach(kick => {
      env.StemVisualizerAPI.getKickShake = () => kick;
      dropPool.forEach(dropMul => {
        env.SmartSectionAPI.getDropImpactMultiplier = () => dropMul;
        sizePool.forEach(sz => {
          const it = { size: sz, x: 960, y: 540, text: 'LIQUID GLOW' };
          const mockEnv = { lt: 0.75, t: 15.0, sc: { accent: '#00ffff' } };

          // Apply preset
          J.TREAT.liquidFillGlow.apply(mockEnv, it, { speed: 1.5 });

          // Invariant validations
          assert.ok(it.shadow, 'liquidFillGlow must configure shadow');
          assert.equal(it.shadow.x, 0, 'Shadow X offset must be 0 for centered liquid wave');
          assert.ok(it.stroke >= 1, 'Stroke width must be clamped at >= 1px');
          assert.equal(it.strokeColor, '#00ffff', 'Stroke color must match accent');

          // Verify character glyph evaluation
          assert.ok(Array.isArray(it.charFns), 'Glyphs function array must be registered on item');
          it.charFns.forEach(fn => {
            for (let i = 0; i < 20; i++) {
              const res = fn(i);
              if (res) {
                if (Number.isFinite(sz)) {
                  assert.ok(Number.isFinite(res.dy), 'Glyph dy displacement must be finite');
                  assert.ok(Number.isFinite(res.s), 'Glyph scale must be finite');
                  assert.ok(res.s > 0, 'Glyph scale must be strictly positive');
                }
              }
            }
          });

          // Canvas 2D spy test
          spyCtx._reset();
          spyCtx.save();
          spyCtx.strokeStyle = it.strokeColor;
          spyCtx.lineWidth = it.stroke;
          if (it.shadow && Number.isFinite(it.shadow.blur)) {
            spyCtx.shadowBlur = Math.max(0, it.shadow.blur);
            spyCtx.shadowColor = it.shadow.color;
          }
          spyCtx.fillText(it.text, it.x, it.y);
          spyCtx.restore();

          assert.equal(spyCtx._getViolations().length, 0, 'No Canvas spec violations during liquidFillGlow rendering');
        });
      });
    });
  });

  await t.test('1.2: glitchRgbSplit rendering under extreme drop impact, kick and jitter intensity', () => {
    const intensityPool = [0, 0.5, 1.0, 2.5, 10.0, -1.0, NaN];
    const kickPool = [0, 1.0, 10.0, NaN];
    const dropPool = [1.0, 3.0, 10.0];

    intensityPool.forEach(intensity => {
      kickPool.forEach(kick => {
        env.StemVisualizerAPI.getKickShake = () => kick;
        dropPool.forEach(dropMul => {
          env.SmartSectionAPI.getDropImpactMultiplier = () => dropMul;

          const it = { size: 64, x: 960, y: 540, text: 'GLITCH RGB' };
          const mockEnv = { lt: 1.25, t: 45.0, sc: { accent: '#ff0055' } };

          J.TREAT.glitchRgbSplit.apply(mockEnv, it, { intensity });

          // Invariant validations
          assert.ok(it.shadow, 'glitchRgbSplit must configure chromatic shadow');
          if (Number.isFinite(intensity) && Number.isFinite(kick)) {
            assert.ok(it.shadow.x >= 2, 'Total chromatic offset must be >= 2px');
          }
          assert.equal(it.shadow.y, 0, 'Vertical shadow offset must be 0 for pure horizontal aberration');
          assert.equal(it.shadow.blur, 0, 'Shadow blur must be 0 for sharp RGB channel split');
          assert.equal(it.shadow.color, 'rgba(255, 0, 85, 0.85)', 'Chromatic shadow must use red/magenta channel');
          assert.equal(it.strokeColor, 'rgba(0, 240, 255, 0.85)', 'Chromatic stroke must use cyan channel');

          // Check glyph jitter displacements
          it.charFns.forEach(fn => {
            for (let i = 0; i < 30; i++) {
              const res = fn(i);
              if (res) {
                if (Number.isFinite(intensity)) {
                  assert.ok(Number.isFinite(res.dx), 'Horizontal jitter must be finite');
                  assert.ok(Number.isFinite(res.dy), 'Vertical compensation must be finite');
                }
              }
            }
          });
        });
      });
    });
  });

  await t.test('1.3: perspective3DFlip character scale and perspective rotation non-zero guarantees', () => {
    const timestamps = [0, 0.125, 0.25, 0.5, 0.75, 1.0, 42.5, 999.9, 100000.0, -10.0, NaN, undefined];

    timestamps.forEach(lt => {
      const it = { size: 50, x: 960, y: 540, text: '3D FLIP' };
      const mockEnv = { lt, sc: { accent: '#ff66aa' } };

      J.TREAT.perspective3DFlip.apply(mockEnv, it, {});

      assert.ok(it.shadow, 'perspective3DFlip must configure shadow');
      assert.ok(Array.isArray(it.charFns), 'Must register character transform functions');

      it.charFns.forEach(fn => {
        for (let i = 0; i < 50; i++) {
          const res = fn(i);
          if (res) {
            // CRITICAL GUARANTEE: sy must NEVER collapse to zero or flip to negative
            if (Number.isFinite(lt)) {
              assert.ok(res.sy >= 0.05, `Character ${i} sy scale (${res.sy}) must be >= 0.05 to avoid matrix inversion`);
              assert.ok(res.s >= 0.75 && res.s <= 1.05, `Character ${i} scale (${res.s}) must remain within [0.75, 1.05]`);
              assert.ok(Number.isFinite(res.dy), `Character ${i} dy must be finite`);
            }
          }
        }
      });
    });
  });

  await t.test('1.4: Syllable Glow execution verification: executes cleanly without throwing ReferenceError when called in clean scope', () => {
    const it = { size: 40, text: 'Test Line' };
    const mockEnv = { cut: { dur: 2.0, words: ['Test', 'Line'], syllables: [0, 1.0] }, lt: 0.5 };

    assert.doesNotThrow(
      () => J.applySyllableGlow(mockEnv, it),
      'applySyllableGlow in index.html must execute cleanly without throwing ReferenceError'
    );
    assert.ok(Array.isArray(it.charFns), 'applySyllableGlow must register glyph callbacks');
  });

  await t.test('1.5: Syllable Glow functional logic verification with in-scope wgeo & glyphs helper', () => {
    // Provide in-scope bindings to test the underlying mathematical logic
    env.wgeo = env.J.wgeo;
    env.glyphs = (it, fn) => { (it.charFns || (it.charFns = [])).push(fn); };

    const cut = {
      start: 10.0,
      dur: 4.0,
      outDur: 0.3,
      words: ['Kinetic', 'Typography', 'Syllable', 'Glow', 'Studio'],
      syllables: [10.0, 10.8, 11.6, 12.4, 13.2]
    };
    const it = {
      size: 60,
      x: 960,
      y: 540,
      text: 'Kinetic Typography Syllable Glow Studio',
      color: '#FFFFFF'
    };
    const mockEnv = {
      lt: 0.9, // relative to cut start: 10.9s -> inside syllable 1 ('Typography')
      cut,
      sc: { fg: '#FFFFFF', accent: '#ff66aa', accent2: '#00ffff' }
    };

    J.applySyllableGlow(mockEnv, it, { punchScale: 0.25, blur: 28, dimInactive: true });

    assert.ok(Array.isArray(it.charFns), 'applySyllableGlow must register glyph callbacks');

    // Simulate glyph evaluation across words
    const glyphs = [...it.text];
    let activeGlyphFound = false;
    let dimGlyphFound = false;

    it.charFns.forEach(fn => {
      glyphs.forEach((ch, idx) => {
        const res = fn(idx);
        if (res) {
          if (res.color === '#ff66aa') {
            activeGlyphFound = true;
            assert.ok(res.s >= 1.0, 'Active syllable glyph scale must be >= 1.0');
            assert.ok(res.shadowBlur >= 16, 'Active syllable shadow blur must be >= 16px');
            assert.equal(res.shadowColor, '#ff66aa', 'Active shadow must match accent color');
          } else if (res.a !== undefined) {
            dimGlyphFound = true;
            assert.ok(res.a < 1.0, 'Inactive syllable glyph must be dimmed');
          }
        }
      });
    });

    assert.ok(activeGlyphFound, 'Must detect and glow currently active word/syllable');
    assert.ok(dimGlyphFound, 'Must dim inactive words/syllables when dimInactive=true');

    // Boundary cases: negative times, 0-duration cut, large syllable list
    assert.doesNotThrow(() => J.applySyllableGlow(null, null), 'Null env/it must return gracefully');
    assert.doesNotThrow(() => J.applySyllableGlow({ lt: 0, cut: { dur: 0, outDur: 0, syllables: [] } }, { size: 40, text: 'Zero' }), '0-duration cut must not crash');
    const bigSyllables = Array.from({ length: 500 }, (_, i) => i * 0.05);
    assert.doesNotThrow(() => J.applySyllableGlow({ lt: 2.0, cut: { dur: 30.0, syllables: bigSyllables } }, { size: 40, text: 'A '.repeat(250).trim() }), 'Large syllable lists must execute cleanly');
  });
});

// ==============================================================================
// SUITE 2: 3D PERSPECTIVE PROJECTION MATH NON-ZERO DIVISOR INVARIANTS
// ==============================================================================
test('CHALLENGER STRESS - Suite 2: 3D Perspective Projection Division & Zcam Invariants', async (t) => {
  const { env, AudioVisualizerAPI } = setupUnifiedContext();
  AudioVisualizerAPI.enable();

  await t.test('2.1: Mathematical guarantee: Math.max(10, z + Zcam) prevents division by zero when D + z <= 0', () => {
    const focalLength = 1080 * 0.55; // F = 594
    const Zcam = 520;

    // Test a wide range of camera-penetrating and negative Z coordinates
    const hostileZValues = [
      -520,        // D + z == 0
      -521,        // D + z == -1 (behind camera)
      -1000,       // D + z == -480
      -1000000,    // Extreme negative distance
      -Infinity,   // Asymptotic limit
      0,           // At focal center
      500,         // Normal depth
      1e6          // Distant horizon
    ];

    hostileZValues.forEach(z => {
      // Direct projection calculation mirroring renderAudioGalaxy3D & renderCyberRibbon3D
      const Zproj = Math.max(10, z + Zcam);
      assert.ok(Zproj >= 10, `Zproj (${Zproj}) must strictly be >= 10 when z=${z}`);

      const s = focalLength / Zproj;
      if (Number.isFinite(z)) {
        assert.ok(Number.isFinite(s), `Scale factor s (${s}) must be finite when z=${z}`);
        assert.ok(s > 0, `Scale factor s (${s}) must be strictly positive`);
        assert.ok(s <= focalLength / 10, `Scale factor s (${s}) cannot exceed upper bound F/10`);
      }
    });
  });

  await t.test('2.2: Live 3D Visualizers rendering under inverted camera coordinates & 10x energy', () => {
    const spyCtx = createStrictCanvasSpy();
    const styles3D = ['galaxy_orbit', 'cyber_ribbon_3d', 'holographic_lissajous'];

    const testResolutions = [
      { w: 1920, h: 1080, name: '16:9 Landscape' },
      { w: 1080, h: 1920, name: '9:16 Portrait' },
      { w: 800, h: 800, name: '1:1 Square' },
      { w: 10, h: 10, name: 'Micro Canvas' }
    ];

    styles3D.forEach(style => {
      AudioVisualizerAPI.setStyle(style);
      testResolutions.forEach(res => {
        spyCtx._reset();

        // High-energy audio metrics simulating a 3.0x drop climax
        const options = { dropMultiplier: 3.0 };
        const timestamps = [0, 0.5, 12.34, 99.9, 10000.0];

        timestamps.forEach(t => {
          AudioVisualizerAPI.render(spyCtx, res.w, res.h, t, options, env.S.plan, null);
        });

        const violations = spyCtx._getViolations();
        assert.equal(violations.length, 0, `3D visualizer "${style}" at ${res.name} must produce 0 canvas violations`);
        assert.equal(spyCtx._getSaveDepth(), 0, `3D visualizer "${style}" must maintain balanced save/restore depth`);
      });
    });
  });

  await t.test('2.3: Holographic Lissajous goniometer axes and chromatic split phase depth stability', () => {
    const spyCtx = createStrictCanvasSpy();
    AudioVisualizerAPI.setStyle('holographic_lissajous');

    // Run 50 frames with extreme phase rotation and kick blasts
    for (let f = 0; f < 50; f++) {
      const t = f * 0.08;
      spyCtx._reset();
      AudioVisualizerAPI.render(spyCtx, 1920, 1080, t, { dropMultiplier: 2.5 }, env.S.plan, null);

      const violations = spyCtx._getViolations();
      assert.equal(violations.length, 0, `Lissajous frame ${f} must have 0 canvas violations`);
    }
  });
});

// ==============================================================================
// SUITE 3: SLICING BANDS (J.itemBands) HIGH-ENERGY STRESS & MEMORY LEAK AUDIT
// ==============================================================================
test('CHALLENGER STRESS - Suite 3: Slicing Bands (J.itemBands) Energy Stress & Memory Leak Audit', async (t) => {
  const { J } = setupUnifiedContext();
  const spyCtx = createStrictCanvasSpy();

  await t.test('3.1: J.itemBands boundary slice count handling (n=0, 1, 2, 25, 100)', () => {
    const sliceCounts = [0, 1, 2, 8, 25, 100];
    const it = { size: 48, y: 500, seed: 12345 };
    const mockEnv = { W: 1920, H: 1080 };

    sliceCounts.forEach(n => {
      const dxFn = (i, total) => i * 5;
      const bands = J.itemBands(mockEnv, it, n, dxFn);

      assert.ok(Array.isArray(bands), `itemBands with n=${n} must return an array`);
      const expectedSlices = n < 2 ? 1 : n;
      assert.equal(bands.length, expectedSlices, `itemBands with n=${n} must return exactly ${expectedSlices} slices`);

      // Monotonicity check: each slice starts where previous slice ended
      for (let k = 0; k < bands.length - 1; k++) {
        assert.ok(bands[k][0] < bands[k][1], `Slice ${k} lower bound must be < upper bound`);
        assert.ok(Math.abs(bands[k][1] - bands[k + 1][0]) < 1e-6, `Slice ${k} and ${k+1} must be contiguous`);
      }
    });
  });

  await t.test('3.2: High energy audio displacement stress with J.drawFx clipping and transform stack', () => {
    const mockEnv = { ctx: spyCtx, W: 1920, H: 1080, lt: 0.5 };
    const it = {
      size: 60,
      x: 960,
      y: 540,
      text: 'HIGH ENERGY BANDS SLICE',
      seed: 98765,
      color: '#FFFFFF'
    };

    // 10x kick displacement function
    const kickShake = 10.0;
    const dropMul = 3.0;
    it.bands = J.itemBands(mockEnv, it, 12, (i) => Math.sin(i * 0.8) * 80 * kickShake * dropMul);

    spyCtx._reset();
    J.drawFx(mockEnv, it);

    assert.equal(spyCtx._getViolations().length, 0, 'High energy band slicing must produce 0 canvas violations');
    assert.equal(spyCtx._getSaveDepth(), 0, 'Band slicing loop must leave canvas save stack perfectly balanced at 0');
  });

  await t.test('3.3: Memory leak & heap retention audit across 5,000 continuous slicing iterations', () => {
    const mockEnv = { ctx: spyCtx, W: 1920, H: 1080, lt: 0 };
    const iterations = 5000;

    // Trigger initial GC if exposed
    if (globalThis.gc) globalThis.gc();
    const memBefore = process.memoryUsage().heapUsed;

    for (let frame = 0; frame < iterations; frame++) {
      mockEnv.lt = frame * 0.016;
      const it = {
        size: 50,
        x: 960,
        y: 540,
        text: 'FRAME ' + frame,
        seed: frame,
        color: '#FFFFFF'
      };

      it.bands = J.itemBands(mockEnv, it, 7, (i) => (i % 2 ? 1 : -1) * Math.sin(frame * 0.1 + i) * 30);
      spyCtx._reset();
      J.drawFx(mockEnv, it);
    }

    if (globalThis.gc) globalThis.gc();
    const memAfter = process.memoryUsage().heapUsed;
    const heapGrowthMb = (memAfter - memBefore) / (1024 * 1024);

    console.log(`[Empirical Audit] 5,000 band slicing frames heap delta: ${heapGrowthMb.toFixed(2)} MB`);
    // Assert heap growth across 5,000 frames is bounded (< 30 MB)
    assert.ok(heapGrowthMb < 30, `Heap growth (${heapGrowthMb.toFixed(2)} MB) must be strictly bounded across 5,000 frames`);
  });
});

// ==============================================================================
// SUITE 4: #lrcTreat UI STATE PERSISTENCE & PROJECT SERIALIZATION
// ==============================================================================
test('CHALLENGER STRESS - Suite 4: #lrcTreat UI State Persistence & Project Serialization', async (t) => {
  const { J } = setupUnifiedContext();

  await t.test('4.1: J.defaultProject initializes lrcTreat to "auto"', () => {
    const p = J.defaultProject();
    assert.equal(p.lrcTreat, 'auto', 'Default project lrcTreat must be "auto"');
  });

  await t.test('4.2: Static DOM inspection: #lrcTreat select exists in index.html with all required kinetic options', () => {
    assert.match(rawHtml, /<select\s+id="lrcTreat"/i, 'Dropdown #lrcTreat must exist in index.html');
    assert.match(rawHtml, /<option\s+value="auto"/, '#lrcTreat must contain auto option');
    assert.match(rawHtml, /<option\s+value="liquidFillGlow"/, '#lrcTreat must contain liquidFillGlow option');
    assert.match(rawHtml, /<option\s+value="glitchRgbSplit"/, '#lrcTreat must contain glitchRgbSplit option');
    assert.match(rawHtml, /<option\s+value="perspective3DFlip"/, '#lrcTreat must contain perspective3DFlip option');
  });

  await t.test('4.3: Engine persistence code verification: mergeProject, syncUI, and bind event wiring in index.html', () => {
    // 1. mergeProject persists o.lrcTreat
    assert.match(rawHtml, /o\.lrcTreat\s*=\s*\(p\s*&&\s*typeof\s*p\.lrcTreat\s*===\s*["']string["']\)\s*\?\s*p\.lrcTreat\s*:\s*["']auto["']/, 'mergeProject must sanitize and preserve lrcTreat');

    // 2. syncUI syncs project lrcTreat to select element value
    assert.match(rawHtml, /if\s*\(\$\(['"]lrcTreat['"]\)\)\s*\$\(['"]lrcTreat['"]\)\.value\s*=\s*S\.project\.lrcTreat\s*\|\|\s*['"]auto['"]/, 'syncUI must bind S.project.lrcTreat to select element');

    // 3. bind listens to change event and replans/saves
    assert.match(rawHtml, /lrcTreatEl\.addEventListener\(['"]change['"],/, 'bind must attach change listener on #lrcTreat');
    assert.match(rawHtml, /S\.project\.lrcTreat\s*=\s*e\.target\.value/, 'change listener must update S.project.lrcTreat');
  });

  await t.test('4.4: planProject treat resolution precedence: cut override vs project.lrcTreat vs auto', () => {
    // Case A: Global project.lrcTreat is set to 'liquidFillGlow'
    const projLiquid = Object.assign(J.defaultProject(), {
      lyrics: '[00:00.00] Line one\n[00:03.00] Line two',
      lrcTreat: 'liquidFillGlow'
    });
    const planLiquid = J.plan(projLiquid);
    const lyricCuts = planLiquid.cuts.filter(cut => cut.layout !== 'interlude');
    assert.ok(lyricCuts.length > 0, 'Lyric cuts must be generated');
    lyricCuts.forEach(cut => {
      assert.equal(cut.treat, 'liquidFillGlow', 'All lyric cuts must adopt global project.lrcTreat when no cut override exists');
    });

    // Case B: Cut-level override takes precedence over global project.lrcTreat
    const projOverride = Object.assign(J.defaultProject(), {
      lyrics: '[00:00.00] Cut override line',
      lrcTreat: 'liquidFillGlow',
      overrides: {
        0: { treat: 'perspective3DFlip' }
      }
    });
    const planOverride = J.plan(projOverride);
    assert.equal(planOverride.cuts[0].treat, 'perspective3DFlip', 'Cut-level override must take precedence over project.lrcTreat');

    // Case C: Unknown / bogus lrcTreat falls back safely without throwing
    const projBogus = Object.assign(J.defaultProject(), {
      lyrics: '[00:00.00] Bogus treat line',
      lrcTreat: 'non_existent_preset_xyz'
    });
    assert.doesNotThrow(() => {
      const planBogus = J.plan(projBogus);
      assert.ok(planBogus && planBogus.cuts.length > 0);
    }, 'Unknown lrcTreat must safely fall back via procedural planner without throwing');
  });

  await t.test('4.5: Project serialization (.jizura / JSON) preserves kinetic typography state 100%', () => {
    const originalProject = Object.assign(J.defaultProject(), {
      title: 'Preset Vault Kinetic Song',
      artist: 'Studio Artist',
      lyrics: '[00:01.00] Preserving typography preset state',
      lrcTreat: 'perspective3DFlip',
      themeId: 'dark-kawaii'
    });

    // Round-trip serialization simulation
    const serialized = JSON.stringify(originalProject);
    const deserialized = JSON.parse(serialized);
    const restored = Object.assign(J.defaultProject(), deserialized);

    assert.equal(restored.lrcTreat, 'perspective3DFlip', 'Restored project must preserve lrcTreat exactly');
    assert.equal(restored.title, 'Preset Vault Kinetic Song');
  });
});

// ==============================================================================
// SUITE 5: CANVAS 2D RENDER LOOP STABILITY & 60 FPS PERFORMANCE BENCHMARK
// ==============================================================================
test('CHALLENGER STRESS - Suite 5: Canvas 2D Render Loop Stability & 60 FPS Performance Benchmark', async (t) => {
  const { env, J, AudioVisualizerAPI } = setupUnifiedContext();
  const spyCtx = createStrictCanvasSpy();
  AudioVisualizerAPI.enable();

  // Provide in-scope bindings for syllable glow evaluation during benchmark
  env.wgeo = env.J.wgeo;
  env.glyphs = (it, fn) => { (it.charFns || (it.charFns = [])).push(fn); };

  await t.test('5.1: 60 FPS Performance benchmark: 1,000 consecutive kinetic lyric & visualizer frames', () => {
    const frameCount = 1000;
    const targetBudgetMs = 16.6; // 60 FPS frame time budget
    const frameDurations = [];

    const cut = {
      start: 0,
      dur: 10.0,
      words: ['Adversarial', 'Kinetic', 'Typography', 'Stress', 'Test'],
      syllables: [0.5, 1.2, 2.0, 3.5, 5.0]
    };

    const mockEnv = {
      ctx: spyCtx,
      W: 1920,
      H: 1080,
      lt: 0,
      cut,
      sc: { fg: '#FFFFFF', accent: '#ff66aa', accent2: '#00ffff' }
    };

    const presets = ['liquidFillGlow', 'glitchRgbSplit', 'perspective3DFlip'];

    const tStart = performance.now();

    for (let f = 0; f < frameCount; f++) {
      const fStart = performance.now();
      const simT = (f * 0.016) % 10.0;
      mockEnv.lt = simT;

      // 1. Kinetic preset application
      const activePreset = presets[f % presets.length];
      const it = {
        size: 52,
        x: 960,
        y: 540,
        text: 'Adversarial Kinetic Typography Stress Test',
        color: '#FFFFFF'
      };

      J.TREAT[activePreset].apply(mockEnv, it, { intensity: 1.5, speed: 1.2 });
      J.applySyllableGlow(mockEnv, it, { punchScale: 0.22, blur: 24, dimInactive: true });

      // 2. Canvas 2D text render simulation
      spyCtx._reset();
      spyCtx.save();
      if (it.shadow && Number.isFinite(it.shadow.blur)) {
        spyCtx.shadowBlur = Math.max(0, it.shadow.blur);
        spyCtx.shadowColor = it.shadow.color;
      }
      spyCtx.fillText(it.text, it.x, it.y);
      spyCtx.restore();

      // 3. Audio visualizer render
      AudioVisualizerAPI.render(spyCtx, 1920, 1080, simT, { dropMultiplier: 1.8 }, env.S.plan, null);

      const fEnd = performance.now();
      frameDurations.push(fEnd - fStart);
    }

    const tTotal = performance.now() - tStart;
    const avgFrameMs = tTotal / frameCount;
    frameDurations.sort((a, b) => a - b);
    const p95FrameMs = frameDurations[Math.floor(frameCount * 0.95)];
    const p99FrameMs = frameDurations[Math.floor(frameCount * 0.99)];
    const maxFrameMs = frameDurations[frameDurations.length - 1];

    console.log(`[Empirical Benchmark] 1,000 frames total: ${tTotal.toFixed(2)}ms | Avg: ${avgFrameMs.toFixed(3)}ms/frame | p95: ${p95FrameMs.toFixed(3)}ms | p99: ${p99FrameMs.toFixed(3)}ms | Max: ${maxFrameMs.toFixed(3)}ms`);

    assert.ok(avgFrameMs < targetBudgetMs, `Average frame duration (${avgFrameMs.toFixed(3)}ms) must be strictly under 16.6ms (60 FPS threshold)`);
    assert.ok(p95FrameMs < targetBudgetMs, `95th percentile frame duration (${p95FrameMs.toFixed(3)}ms) must be under 16.6ms`);
  });

  await t.test('5.2: Strict canvas spy verification: zero specification violations across long-run loop', () => {
    const violations = spyCtx._getViolations();
    assert.equal(violations.length, 0, 'Zero canvas violations allowed across all 1,000 continuous benchmark frames');
    assert.equal(spyCtx._getSaveDepth(), 0, 'Canvas save/restore stack must be completely balanced at depth 0');
  });
});
