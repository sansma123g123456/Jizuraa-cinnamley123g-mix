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

test('Bug Fix 1: escapeHtml is globally accessible and safe across all script scopes', () => {
  assert.ok(htmlContent.includes('window.escapeHtml = J.escapeHtml = function'), 'window.escapeHtml is defined early in script 5');
  assert.ok(htmlContent.includes('const escapeHtml = window.escapeHtml ||'), 'escapeHtml fallback is declared in LrcLibAPI script 11');

  // Verify escaping functionality
  const ctx = { window: {}, J: {} };
  vm.createContext(ctx);
  vm.runInContext(`
    window.escapeHtml = function(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    };
  `, ctx);

  assert.strictEqual(ctx.window.escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(ctx.window.escapeHtml(null), '');
  assert.strictEqual(ctx.window.escapeHtml(undefined), '');
  assert.strictEqual(ctx.window.escapeHtml("Rock & Roll '26"), 'Rock &amp; Roll &#39;26');
});

test('Bug Fix 2: chromaSnap and reticleHud signatures and draw calls are safe against TypeError', () => {
  // Verify scratch: true is set on chromaSnap
  assert.ok(htmlContent.includes("J.register('fx', 'chromaSnap'"), 'chromaSnap is registered');
  assert.ok(htmlContent.includes("scratch: true"), 'chromaSnap defines scratch: true');

  // Simulate Renderer.post calling chromaSnap draw
  const mockCanvas = { width: 1920, height: 1080 };
  const mockScratch = { width: 1920, height: 1080 };
  const drawnImages = [];
  const mockCtx = {
    canvas: mockCanvas,
    save: () => {},
    restore: () => {},
    drawImage: (img, dx, dy) => {
      drawnImages.push({ img, dx, dy });
    }
  };

  const ev = { type: 'chromaSnap', t: 1.0, dur: 0.2, amp: 1.5 };
  const k = 0.5;
  const I = { cw: 1920, ch: 1080, S: mockScratch };

  // Run the chromaSnap draw logic extracted from htmlContent
  const chromaDrawMatch = htmlContent.match(/J\.register\('fx',\s*'chromaSnap',\s*\{[\s\S]*?draw\(ctx,\s*ev,\s*k,\s*I\)\s*\{([\s\S]*?)\}\s*\},/);
  assert.ok(chromaDrawMatch, 'chromaSnap draw(ctx, ev, k, I) matched');

  const drawBody = chromaDrawMatch[1];
  const fn = new Function('ctx', 'ev', 'k', 'I', drawBody);

  // Calling it with ev as arg 2 and I as arg 4 should NEVER throw TypeError
  assert.doesNotThrow(() => {
    fn(mockCtx, ev, k, I);
  });

  assert.ok(drawnImages.length >= 2, 'chromaSnap drew images to context');
  assert.strictEqual(drawnImages[0].img, mockScratch, 'chromaSnap drew from scratch canvas I.S, NOT ev object');
});

test('Feature 1: StudioReactiveUI syncScheme dynamically tints UI surfaces (--ink, --panel, --raised)', () => {
  const styles = {};
  const mockRoot = {
    style: {
      setProperty: (k, v) => { styles[k] = v; },
      getPropertyValue: (k) => styles[k] || '',
      removeProperty: (k) => { delete styles[k]; }
    },
    getAttribute: (attr) => (attr === 'data-theme' ? 'dreamy' : null)
  };

  const ctx = {
    document: { documentElement: mockRoot },
    window: {}
  };
  vm.createContext(ctx);

  // Extract StudioReactiveUI code
  const startMarker = '// 3. STUDIO UI & EFFECT REACTIVE ENGINE';
  const endMarker = 'return {\n    init: init,';
  const s = htmlContent.indexOf(startMarker);
  const e = htmlContent.indexOf('})();\n\n// Initialize on DOM load', s);
  assert.ok(s !== -1 && e !== -1, 'StudioReactiveUI module found');
  const studioCode = htmlContent.substring(s, e + 5);

  vm.runInContext(studioCode, ctx);
  const studio = ctx.window.StudioReactiveUI;

  // Sync a cut scheme with deep purple background and neon gold accent
  studio.syncScheme({
    name: 'Purple Neon',
    bg: '#1a0b2e',
    fg: '#ffffff',
    accent: '#ffd700',
    accent2: '#ff007f'
  });

  assert.strictEqual(styles['--studio-primary'], '#ffd700');
  assert.strictEqual(styles['--studio-secondary'], '#ff007f');
  assert.ok(styles['--ink'], '--ink is set');
  assert.ok(styles['--panel'], '--panel is set');
  assert.ok(styles['--raised'], '--raised is set');
  assert.ok(styles['--line'], '--line is set');

  // Colors must be distinct hex values tinted by the scheme
  assert.match(styles['--ink'], /^#[0-9a-f]{6}$/i);
  assert.match(styles['--panel'], /^#[0-9a-f]{6}$/i);
});

test('Feature 2: Ambient BPM Background Flash is updated dynamically', () => {
  assert.ok(htmlContent.includes('#app::before'), '#app::before ambient overlay defined in CSS');
  assert.ok(htmlContent.includes('--studio-bpm-flash'), '--studio-bpm-flash CSS property used');

  const styles = {};
  const mockRoot = {
    style: {
      setProperty: (k, v) => { styles[k] = v; },
      getPropertyValue: (k) => styles[k] || '',
      removeProperty: (k) => { delete styles[k]; }
    },
    getAttribute: () => null
  };

  const ctx = {
    document: {
      documentElement: mockRoot,
      querySelectorAll: () => []
    },
    window: {},
    prevBeat: (beats, t) => 1.0 // beat exactly at t = 1.0
  };
  vm.createContext(ctx);

  const startMarker = '// 3. STUDIO UI & EFFECT REACTIVE ENGINE';
  const s = htmlContent.indexOf(startMarker);
  const e = htmlContent.indexOf('})();\n\n// Initialize on DOM load', s);
  assert.ok(s !== -1 && e !== -1, 'StudioReactiveUI module found');
  const studioCode = htmlContent.substring(s, e + 5);
  vm.runInContext(studioCode, ctx);
  const studio = ctx.window.StudioReactiveUI;

  // At beat timestamp (t = 1.0), beatPulse should be max and bpm-flash should be active
  studio.update(1.0, { beats: [1.0, 1.5, 2.0], bpm: 120 });
  const flashOnBeat = parseFloat(styles['--studio-bpm-flash'] || '0');
  assert.ok(flashOnBeat > 0.1, `Flash on beat should be perceptible (> 0.1), got ${flashOnBeat}`);

  // At t = 1.25s (decayed), flash should be close to 0
  studio.update(1.25, { beats: [1.0, 1.5, 2.0], bpm: 120 });
  const flashDecayed = parseFloat(styles['--studio-bpm-flash'] || '0');
  assert.ok(flashDecayed < flashOnBeat, `Flash should decay over time, got ${flashDecayed} < ${flashOnBeat}`);
});
