import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const amvAssetsJs = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf-8');

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

function extractThemeBlock(html) {
  const startMarker = '// ---------- Kawaii & Studio Multi-Theme Switcher (6 Themes) ----------';
  const endMarker = '// hooks for hosts that embed the app';
  const s = html.indexOf(startMarker);
  const e = html.indexOf(endMarker);
  if (s !== -1 && e !== -1) {
    return html.substring(s, e);
  }
  return null;
}

function createDOMStub() {
  const elements = {};

  function makeEl(id, tag = 'div') {
    const classList = {
      _classes: new Set(),
      add: (c) => classList._classes.add(c),
      remove: (c) => classList._classes.delete(c),
      toggle: (c, force) => {
        if (force !== undefined) {
          if (force) classList._classes.add(c);
          else classList._classes.delete(c);
        } else {
          if (classList._classes.has(c)) classList._classes.delete(c);
          else classList._classes.add(c);
        }
      },
      contains: (c) => classList._classes.has(c)
    };

    const el = {
      id: id,
      tagName: tag.toUpperCase(),
      classList: classList,
      style: {},
      dataset: {},
      textContent: '',
      innerHTML: '',
      checked: false,
      value: '',
      children: [],
      querySelectorAll: (sel) => [],
      querySelector: (sel) => null,
      setAttribute: (k, v) => { el[k] = v; el.dataset[k] = v; },
      getAttribute: (k) => el[k] || el.dataset[k] || null,
      addEventListener: () => {},
      removeEventListener: () => {},
      remove: () => {},
      contains: () => false,
      onclick: null,
      onchange: null,
      oninput: null
    };
    return el;
  }

  const stubDocument = {
    readyState: 'complete',
    documentElement: {
      setAttribute: (k, v) => { stubDocument.documentElement[k] = v; },
      getAttribute: (k) => stubDocument.documentElement[k] || null,
      classList: {
        _classes: new Set(),
        add: (c) => stubDocument.documentElement.classList._classes.add(c),
        remove: (c) => stubDocument.documentElement.classList._classes.delete(c),
        contains: (c) => stubDocument.documentElement.classList._classes.has(c)
      },
      dataset: {},
      style: {
        setProperty: (k, v) => { stubDocument.documentElement.style[k] = v; },
        getPropertyValue: (k) => stubDocument.documentElement.style[k] || ''
      }
    },
    getElementById: (id) => {
      if (!elements[id]) {
        elements[id] = makeEl(id);
      }
      return elements[id];
    },
    querySelector: (sel) => {
      if (sel.startsWith('#')) return stubDocument.getElementById(sel.slice(1));
      return makeEl('mock-query');
    },
    querySelectorAll: (sel) => [],
    createElement: (tag) => makeEl(`mock-${Date.now()}`, tag),
    head: { appendChild: () => {} },
    body: {
      classList: {
        _classes: new Set(),
        add: (c) => stubDocument.body.classList._classes.add(c),
        remove: (c) => stubDocument.body.classList._classes.delete(c),
        contains: (c) => stubDocument.body.classList._classes.has(c)
      },
      appendChild: () => {}
    },
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  return { stubDocument, elements };
}

function createMockEnvironment(stubDocument, overrides = {}) {
  const env = {
    document: stubDocument,
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] !== undefined ? this.store[k] : null; },
      setItem(k, v) { this.store[k] = String(v); }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: (fn, ms) => {
      const id = setTimeout(fn, ms || 0);
      if (id && id.unref) id.unref();
      return id;
    },
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => {
      const id = setInterval(fn, ms || 100);
      if (id && id.unref) id.unref();
      return id;
    },
    clearInterval: (id) => clearInterval(id),
    console: console,
    location: { href: '', reload: () => {} },
    $: (id) => stubDocument.getElementById(id),
    J: { uiApi: {} },
    S: {},
    ...overrides
  };
  env.window = env;
  env.globalThis = env;
  return env;
}

// ---------------------------------------------------------------------------
// TEST 1: CSS Theme Variables for 4 Kawaii Themes & Legacy Themes
// ---------------------------------------------------------------------------
test('Milestone 2 - Feature 7: Kawaii Theme CSS Variable Definitions', () => {
  // Check CSS selectors in index.html
  assert.match(htmlContent, /\[data-theme="dark-kawaii"\]/, 'dark-kawaii CSS rule exists');
  assert.match(htmlContent, /\[data-theme="white-kawaii"\]/, 'white-kawaii CSS rule exists');
  assert.match(htmlContent, /\[data-theme="white-blue-kawaii"\]/, 'white-blue-kawaii CSS rule exists');
  assert.match(htmlContent, /\[data-theme="dark-blue-kawaii"\]/, 'dark-blue-kawaii CSS rule exists');

  // 1. Dark Kawaii (Kuromi Goth)
  assert.match(htmlContent, /--ink:\s*#0c0914/, 'dark-kawaii --ink is #0c0914');
  assert.match(htmlContent, /--amber:\s*#ff66aa/, 'dark-kawaii --amber is #ff66aa');
  assert.match(htmlContent, /--cyan:\s*#66ffff/, 'dark-kawaii --cyan is #66ffff');

  // 2. White Kawaii (Sakura Sweet)
  assert.match(htmlContent, /--ink:\s*#faf8ff/, 'white-kawaii --ink is #faf8ff');
  assert.match(htmlContent, /--amber:\s*#ff6699/, 'white-kawaii --amber is #ff6699');
  assert.match(htmlContent, /--cyan:\s*#ffb6c1/, 'white-kawaii --cyan is #ffb6c1');

  // 3. White Blue Kawaii (Cinnamoroll Sky)
  assert.match(htmlContent, /--ink:\s*#f4f8fb/, 'white-blue-kawaii --ink is #f4f8fb');
  assert.match(htmlContent, /--amber:\s*#2dd4bf/, 'white-blue-kawaii --amber is #2dd4bf');
  assert.match(htmlContent, /--cyan:\s*#a8f0e5/, 'white-blue-kawaii --cyan is #a8f0e5');

  // 4. Dark Blue Kawaii (Midnight Cyan/Mint)
  assert.match(htmlContent, /--ink:\s*#061a23/, 'dark-blue-kawaii --ink is #061a23');
  assert.match(htmlContent, /--amber:\s*#00ffc8/, 'dark-blue-kawaii --amber is #00ffc8');
  assert.match(htmlContent, /--rose:\s*#38bdf8/, 'dark-blue-kawaii --rose is #38bdf8');

  // Existing themes check
  assert.match(htmlContent, /:root\s*\{[^}]*--ink:\s*#0c0c0e/i, 'classic dark theme intact');
  assert.match(htmlContent, /\[data-theme="dreamy"\]/, 'dreamy theme intact');
});

// ---------------------------------------------------------------------------
// TEST 2: Theme Selector Dropdown Items and Swatches
// ---------------------------------------------------------------------------
test('Milestone 2 - Feature 7: Theme Selector Dropdown HTML & Swatches', () => {
  // Theme selector dropdown items
  assert.match(htmlContent, /data-theme="classic"[\s\S]*?Cổ Điển/);
  assert.match(htmlContent, /data-theme="dark-kawaii"[\s\S]*?Dark Kawaii \(Kuromi\)/);
  assert.match(htmlContent, /data-theme="white-kawaii"[\s\S]*?White Kawaii \(Sakura Sweet\)/);
  assert.match(htmlContent, /data-theme="white-blue-kawaii"[\s\S]*?White Xanh Nhạt \(Cinnamoroll\)/);
  assert.match(htmlContent, /data-theme="dark-blue-kawaii"[\s\S]*?Dark Xanh Nhạt \(Midnight Cyan\)/);
  assert.match(htmlContent, /data-theme="dreamy"[\s\S]*?Mộng Mơ \(Dreamy Neon\)/);

  // Check swatch dots color
  assert.match(htmlContent, /background:#0c0914;[\s\S]*?background:#ff66aa;[\s\S]*?background:#66ffff;/, 'Kuromi swatch dots');
  assert.match(htmlContent, /background:#faf8ff;[\s\S]*?background:#ffb6c1;/, 'Sakura swatch dots');
  assert.match(htmlContent, /background:#f4f8fb;[\s\S]*?background:#a8f0e5;[\s\S]*?background:#2dd4bf;/, 'Cinnamoroll swatch dots');
  assert.match(htmlContent, /background:#061a23;[\s\S]*?background:#00ffc8;[\s\S]*?background:#0ea5e9;/, 'Midnight Cyan swatch dots');
});

// ---------------------------------------------------------------------------
// TEST 3: Dynamic Theme Switching & Sync Architecture (Feature 8)
// ---------------------------------------------------------------------------
test('Milestone 2 - Feature 8: Dynamic Theme Sync & APIs', () => {
  const { stubDocument } = createDOMStub();

  let visualizerThemeCalled = null;
  let visualizerCustomPal = null;
  let amvModalThemeCalled = null;

  const mockContext = createMockEnvironment(stubDocument, {
    AudioVisualizerAPI: {
      applyThemeColors: (t, p) => {
        visualizerThemeCalled = t;
        visualizerCustomPal = p;
        return { primary: '#ff66aa', secondary: '#66ffff' };
      }
    },
    AMVAssetModalAPI: {
      applyThemeSync: (t, p) => {
        amvModalThemeCalled = t;
      }
    },
    drawTimeline: () => {}
  });

  const themeCode = extractThemeBlock(htmlContent);
  assert.ok(themeCode, 'Theme block extracted');

  vm.createContext(mockContext);
  vm.runInContext(themeCode, mockContext);

  // 1. Verify THEMES_MAP contains 6 themes with palette
  const themesMap = vm.runInContext('THEMES_MAP', mockContext);
  assert.ok(themesMap, 'THEMES_MAP exists');
  assert.strictEqual(Object.keys(themesMap).length, 6, 'Contains 6 themes');

  assert.ok(themesMap['dark-kawaii']?.palette, 'dark-kawaii has palette');
  assert.strictEqual(themesMap['dark-kawaii'].palette.primary, '#ff66aa');
  assert.strictEqual(themesMap['dark-kawaii'].palette.secondary, '#66ffff');

  assert.ok(themesMap['white-kawaii']?.palette, 'white-kawaii has palette');
  assert.strictEqual(themesMap['white-kawaii'].palette.primary, '#ffb6c1');
  assert.strictEqual(themesMap['white-kawaii'].palette.secondary, '#ff758f');

  assert.ok(themesMap['white-blue-kawaii']?.palette, 'white-blue-kawaii has palette');
  assert.strictEqual(themesMap['white-blue-kawaii'].palette.secondary, '#38bdf8');

  assert.ok(themesMap['dark-blue-kawaii']?.palette, 'dark-blue-kawaii has palette');
  assert.strictEqual(themesMap['dark-blue-kawaii'].palette.primary, '#00ffc8');

  // 2. Verify global API functions exist
  assert.strictEqual(typeof mockContext.setTheme, 'function', 'window.setTheme is a function');
  assert.strictEqual(typeof mockContext.applyTheme, 'function', 'window.applyTheme is a function');
  assert.strictEqual(typeof mockContext.getTheme, 'function', 'window.getTheme is a function');

  // 3. Test applyTheme invocation and synchronization
  mockContext.applyTheme('dark-kawaii');
  assert.strictEqual(mockContext.getTheme(), 'dark-kawaii', 'Current theme updated to dark-kawaii');
  assert.strictEqual(mockContext.document.documentElement.getAttribute('data-theme'), 'dark-kawaii', 'HTML root data-theme updated');
  assert.strictEqual(visualizerThemeCalled, 'dark-kawaii', 'AudioVisualizerAPI.applyThemeColors invoked with dark-kawaii');
  assert.strictEqual(amvModalThemeCalled, 'dark-kawaii', 'AMVAssetModalAPI.applyThemeSync invoked with dark-kawaii');

  // 4. Test Cinnamoroll theme switch
  mockContext.setTheme('white-blue-kawaii');
  assert.strictEqual(mockContext.getTheme(), 'white-blue-kawaii', 'Current theme updated to white-blue-kawaii');
  assert.strictEqual(visualizerThemeCalled, 'white-blue-kawaii');
  assert.strictEqual(amvModalThemeCalled, 'white-blue-kawaii');
});

// ---------------------------------------------------------------------------
// TEST 4: AMVAssetModalAPI applyThemeSync Method (amv_asset_manager.js)
// ---------------------------------------------------------------------------
test('Milestone 2 - Feature 8: AMVAssetModalAPI Theme Sync (amv_asset_manager.js)', () => {
  const { stubDocument, elements } = createDOMStub();
  const mockContext = createMockEnvironment(stubDocument);

  vm.createContext(mockContext);
  vm.runInContext(amvAssetsJs, mockContext);

  const api = mockContext.AMVAssetModalAPI;
  assert.ok(api, 'AMVAssetModalAPI is defined');
  assert.strictEqual(typeof api.applyThemeSync, 'function', 'AMVAssetModalAPI.applyThemeSync is a function');

  // Call applyThemeSync with dark-kawaii
  api.applyThemeSync('dark-kawaii', { primary: '#ff66aa', secondary: '#66ffff' });

  // Badge swatch element should have gradient styling applied
  const swatchEl = elements['amvActiveThemeSwatch'];
  assert.ok(swatchEl, '#amvActiveThemeSwatch element was referenced');
  assert.ok(swatchEl.style.background.includes('#ff66aa'), 'Swatch background contains primary #ff66aa');
  assert.ok(swatchEl.style.boxShadow.includes('#ff66aa'), 'Swatch boxShadow contains glow');

  // Clean up
  api.destroy();
});

// ---------------------------------------------------------------------------
// TEST 5: Dynamic Color Harmonizer Engine (Feature 9)
// ---------------------------------------------------------------------------
test('Milestone 2 - Feature 9: ColorHarmonizer Math & Scaling', () => {
  const { stubDocument } = createDOMStub();

  let mockMultiplier = 1.0;
  const mockContext = createMockEnvironment(stubDocument, {
    SmartSectionAPI: {
      getDropImpactMultiplier: (t) => mockMultiplier,
      getSmoothDropImpactMultiplier: (t, p) => mockMultiplier
    },
    S: { t: 5.0, exportT: 5.0 }
  });

  const script12 = extractScript(htmlContent, 12);
  assert.ok(script12, 'Script 12 extracted');

  vm.createContext(mockContext);
  vm.runInContext(script12, mockContext);

  const harmonizer = mockContext.ColorHarmonizer;
  assert.ok(harmonizer, 'window.ColorHarmonizer exists');
  assert.strictEqual(typeof harmonizer.getAdjustedStyle, 'function', 'getAdjustedStyle is a function');
  assert.strictEqual(typeof harmonizer.getSmoothMultiplier, 'function', 'getSmoothMultiplier is a function');
  assert.strictEqual(typeof harmonizer.getHarmonizedAt, 'function', 'getHarmonizedAt is a function');

  // Case 1: At 1.0x (Calm baseline)
  // Saturation formula: 0.95 + (mul - 1.0) * (0.35 / 2.0)
  // Bloom radius formula: Math.round(10 * mul)
  const style1x = harmonizer.getAdjustedStyle('#ff66aa', 1.0);
  assert.strictEqual(style1x.baseColor, '#ff66aa');
  assert.strictEqual(style1x.saturation, 0.95);
  assert.strictEqual(style1x.bloomRadius, 10);
  assert.ok(style1x.filterCss.includes('saturate(0.95)'));
  assert.ok(style1x.filterCss.includes('0 0 10px #ff66aa'));

  // Case 2: At 2.0x (High energy)
  const style2x = harmonizer.getAdjustedStyle('#ff66aa', 2.0);
  assert.strictEqual(style2x.saturation, 1.125);
  assert.strictEqual(style2x.bloomRadius, 20);
  assert.ok(style2x.filterCss.includes('saturate(1.13)'));
  assert.ok(style2x.filterCss.includes('0 0 20px #ff66aa'));

  // Case 3: At 3.0x (Maximum Drop Impact)
  const style3x = harmonizer.getAdjustedStyle('#66ffff', 3.0);
  assert.strictEqual(style3x.saturation, 1.30);
  assert.strictEqual(style3x.bloomRadius, 30);
  assert.ok(style3x.filterCss.includes('saturate(1.30)'));
  assert.ok(style3x.filterCss.includes('0 0 30px #66ffff'));

  // Case 4: Clamping check (< 1.0x clamps to 1.0x, > 3.0x clamps to 3.0x)
  const styleSub1 = harmonizer.getAdjustedStyle('#ffffff', 0.5);
  assert.strictEqual(styleSub1.saturation, 0.95);
  assert.strictEqual(styleSub1.bloomRadius, 10);

  const styleSuper3 = harmonizer.getAdjustedStyle('#ffffff', 5.0);
  assert.strictEqual(styleSuper3.saturation, 1.30);
  assert.strictEqual(styleSuper3.bloomRadius, 30);

  // Case 5: Dynamic getHarmonizedAt uses smooth multiplier from section plan
  const planWithDrop = {
    sections: [{ type: 'chorus', start: 10.0, end: 20.0, label: 'Chorus' }]
  };
  const styleHarm = harmonizer.getHarmonizedAt(15.0, '#ff66aa', planWithDrop);
  // At default 1.8x: saturation = 0.95 + 0.8 * 0.175 = 1.09, bloomRadius = 18
  assert.strictEqual(styleHarm.bloomRadius, 18);
  assert.strictEqual(styleHarm.saturation, 1.09);
});

// ---------------------------------------------------------------------------
// TEST 6: SmartSectionAPI Smooth Multiplier Hermite Cubic Transitions (Feature 9)
// ---------------------------------------------------------------------------
test('Milestone 2 - Feature 9: SmartSectionAPI Smooth Transitions', () => {
  const { stubDocument } = createDOMStub();
  const mockContext = createMockEnvironment(stubDocument);

  const script12 = extractScript(htmlContent, 12);
  vm.createContext(mockContext);
  vm.runInContext(script12, mockContext);

  const smartSec = mockContext.SmartSectionAPI;
  assert.ok(smartSec, 'window.SmartSectionAPI exists');
  assert.strictEqual(typeof smartSec.getSmoothDropImpactMultiplier, 'function', 'getSmoothDropImpactMultiplier exported');

  const testPlan = {
    sections: [
      { type: 'verse', start: 0.0, end: 10.0, label: 'Verse 1' },
      { type: 'build', start: 10.0, end: 14.0, label: 'Build-up' },
      { type: 'chorus', start: 14.0, end: 24.0, label: 'Chorus 1' },
      { type: 'verse', start: 24.0, end: 34.0, label: 'Verse 2' }
    ]
  };

  // Target max multiplier is 1.8 by default
  const targetMax = 1.8;

  // 1. Verse section (Calm): multiplier is strictly 1.0
  const mulVerse = smartSec.getSmoothDropImpactMultiplier(5.0, testPlan);
  assert.strictEqual(mulVerse, 1.0, 'In calm verse, multiplier is 1.0');

  // 2. Build-up section: progressive quadratic ease up to min(1.30, targetMax)
  const mulBuildStart = smartSec.getSmoothDropImpactMultiplier(10.0, testPlan);
  const mulBuildMid = smartSec.getSmoothDropImpactMultiplier(12.0, testPlan);
  const mulBuildEnd = smartSec.getSmoothDropImpactMultiplier(13.9, testPlan);
  assert.strictEqual(mulBuildStart, 1.0, 'Build-up start begins at 1.0');
  assert.ok(mulBuildMid > 1.0 && mulBuildMid < 1.30, 'Build-up midpoint ramps smoothly');
  assert.ok(mulBuildEnd > mulBuildMid && mulBuildEnd <= 1.30, 'Build-up end nears max build boost (<= 1.30)');

  // 3. Chorus entrance: 0.6s Hermite smoothstep cubic curve u^2*(3 - 2*u)
  // At start (t = 14.0): u = 0 -> 1.0
  const mulChorusStart = smartSec.getSmoothDropImpactMultiplier(14.0, testPlan);
  assert.strictEqual(mulChorusStart, 1.0, 'Chorus start t=14.0 is 1.0');

  // At t = 14.3s: dtIn = 0.3s, u = 0.5.
  // Cubic smoothstep: 0.5^2 * (3 - 2*0.5) = 0.25 * 2.0 = 0.5
  // Expected: 1.0 + (1.8 - 1.0) * 0.5 = 1.40
  const mulChorusHalfRamp = smartSec.getSmoothDropImpactMultiplier(14.3, testPlan);
  assert.ok(Math.abs(mulChorusHalfRamp - 1.40) < 1e-4, `Chorus ramp midpoint is exactly 1.40 (got ${mulChorusHalfRamp})`);

  // At t = 14.6s: dtIn = 0.6s, u = 1.0 -> 1.8
  const mulChorusFullRamp = smartSec.getSmoothDropImpactMultiplier(14.6, testPlan);
  assert.ok(Math.abs(mulChorusFullRamp - targetMax) < 1e-4, 'Chorus reaches targetMax at end of 0.6s attack');

  // 4. Chorus sustained body (t = 18.0s)
  const mulChorusBody = smartSec.getSmoothDropImpactMultiplier(18.0, testPlan);
  assert.strictEqual(mulChorusBody, targetMax, 'Chorus body sustains targetMax');

  // 5. Chorus exit: 0.6s decay before end (t = 23.7s, dtOut = 0.3s)
  const mulChorusExitMid = smartSec.getSmoothDropImpactMultiplier(23.7, testPlan);
  assert.ok(Math.abs(mulChorusExitMid - 1.40) < 1e-4, 'Chorus exit halfway ease equals 1.40');

  // 6. Chorus release tail: 0.8s decay after end (t = 24.4s, dt = 0.4s into tail, u = 0.5)
  // Cubic smoothstep ease: 0.5 -> 1.40
  const mulReleaseTail = smartSec.getSmoothDropImpactMultiplier(24.4, testPlan);
  assert.ok(Math.abs(mulReleaseTail - 1.40) < 1e-4, `Release tail midpoint equals 1.40 (got ${mulReleaseTail})`);

  // After 0.8s tail (t = 25.0s): decays back to 1.0
  const mulAfterTail = smartSec.getSmoothDropImpactMultiplier(25.0, testPlan);
  assert.strictEqual(mulAfterTail, 1.0, 'After 0.8s tail, multiplier is 1.0');
});

// ---------------------------------------------------------------------------
// TEST 7: AudioVisualizerAPI Theme Palette Resolution
// ---------------------------------------------------------------------------
test('Milestone 2 - Feature 8: AudioVisualizerAPI Theme Palette Resolution', () => {
  const { stubDocument } = createDOMStub();

  let activeTheme = 'classic';
  const mockContext = createMockEnvironment(stubDocument, {
    getTheme: () => activeTheme
  });

  const script12 = extractScript(htmlContent, 12);
  vm.createContext(mockContext);
  vm.runInContext(script12, mockContext);

  const vizApi = mockContext.AudioVisualizerAPI;
  assert.ok(vizApi, 'AudioVisualizerAPI exists');
  assert.strictEqual(typeof vizApi.applyThemeColors, 'function', 'applyThemeColors exists');

  // Check dark-kawaii palette returned
  const darkKawaiiPal = vizApi.applyThemeColors('dark-kawaii');
  assert.strictEqual(darkKawaiiPal.primary, '#ff66aa');
  assert.strictEqual(darkKawaiiPal.secondary, '#66ffff');

  // Check white-kawaii palette returned
  const whiteKawaiiPal = vizApi.applyThemeColors('white-kawaii');
  assert.strictEqual(whiteKawaiiPal.primary, '#ffb6c1');
  assert.strictEqual(whiteKawaiiPal.secondary, '#ff758f');

  // Check white-blue-kawaii palette returned
  const cinnamorollPal = vizApi.applyThemeColors('white-blue-kawaii');
  assert.strictEqual(cinnamorollPal.secondary, '#38bdf8');

  // Check dark-blue-kawaii palette returned
  const midnightPal = vizApi.applyThemeColors('dark-blue-kawaii');
  assert.strictEqual(midnightPal.primary, '#00ffc8');
  assert.strictEqual(midnightPal.secondary, '#38bdf8');
});
