import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('FX Sliders — Invariant: Exactly 12 script tags in index.html', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const count = (html.match(/<script\b/gi) || []).length;
  assert.equal(count, 12, `index.html must maintain strictly 12 script tags, but found ${count}`);
});

test('FX Sliders — Range maximum increased to 5 (500%)', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(
    html.includes('id="fx_${k}" type="range" min="0" max="5" step="0.01"'),
    'fx slider must have min="0" max="5" step="0.01"'
  );
});

test('FX Sliders — High density calculation (fx.density = 5.0) remains positive and safe', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(
    html.includes('const L = Math.max(0.12, fx.density <= 1 ? J.lerp(1.3, 0.5, fx.density) : (0.5 / (1 + (fx.density - 1) * 0.75)));'),
    'L must be guarded against negative durations when fx.density > 1'
  );

  // Test the math directly
  const J = { lerp: (a, b, t) => a + (b - a) * t };
  function calcL(density) {
    return Math.max(0.12, density <= 1 ? J.lerp(1.3, 0.5, density) : (0.5 / (1 + (density - 1) * 0.75)));
  }

  assert.equal(calcL(0), 1.3);
  assert.equal(calcL(0.5), 0.9);
  assert.equal(calcL(1.0), 0.5);
  assert.ok(calcL(2.0) < 0.5 && calcL(2.0) > 0.12, 'L at density 2.0 should be faster than 0.5s');
  assert.ok(calcL(5.0) >= 0.12 && calcL(5.0) < 0.15, 'L at density 5.0 should be ~0.125s (8 cuts/sec)');
});

test('FX Sliders — Texture vignette alpha remains valid (<= 0.95) at 500%', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(
    html.includes('Math.min(0.95, 0.28 * (fx.texture ?? 0.6))'),
    'Vignette alpha must be capped to prevent Canvas gradient exception at 500%'
  );

  function calcAlpha(texture) {
    return Math.min(0.95, 0.28 * (texture ?? 0.6));
  }

  assert.ok(calcAlpha(0.6) < 0.2);
  assert.equal(calcAlpha(5.0), 0.95, 'At texture=5.0 (500%), alpha must be safely clamped to 0.95');
});

test('FX Sliders — 500% Clamping Protection (Alpha, Shake, Chroma, Decor, Probabilities)', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  // 1. Paper texture alpha clamped
  assert.ok(
    html.includes('Math.min(1.0, J.lum(sc.bg) < 0.4 ? paperAmt * 0.06 : paperAmt * 0.85)'),
    'paper globalAlpha must be clamped to 1.0 max'
  );

  // 2. Post FX bloom, scan, grain alphas clamped
  assert.ok(html.includes('ctx.globalAlpha = Math.min(1.0, glow * 0.55);'), 'glow globalAlpha clamped');
  assert.ok(html.includes('ctx.globalAlpha = Math.min(1.0, scan * 0.28);'), 'scan globalAlpha clamped');
  assert.ok(html.includes('ctx.globalAlpha = Math.min(1.0, gr * 0.2);'), 'grain overlay globalAlpha clamped');
  assert.ok(html.includes('ctx.globalAlpha = Math.min(1.0, gr * 0.035);'), 'grain source-over globalAlpha clamped');

  // 3. Shake and Chroma bounds
  assert.ok(html.includes('const maxSh = Math.min(W * 0.06, 48 * u);'), 'maxSh screen shake boundary present');
  assert.ok(html.includes('const effChroma = Math.min(10.0, chroma);'), 'effChroma ghosting pass offset bounded');

  // 4. Decor and Treat bounds
  assert.ok(html.includes('const minD = Math.max(0, Math.min(20, fx.decorMin != null ? Math.round(+fx.decorMin) : 0));'), 'decor min bound present');
  assert.ok(html.includes('const maxD = Math.max(minD, Math.min(20, fx.decorMax != null ? Math.round(+fx.decorMax) : 20));'), 'decor max bound present');
  assert.ok(html.includes('count = Math.max(minD, Math.min(maxD, count));'), 'decor count clamped by minD and maxD');
  assert.ok(html.includes('id="fx_decor_min"'), 'fx_decor_min UI input present');
  assert.ok(html.includes('id="fx_decor_max"'), 'fx_decor_max UI input present');
  assert.ok(html.includes('!rng.chance(Math.min(0.85, 0.18 + 0.42 * Math.min(1.5, fx.decor ?? 0.5)'), 'pickTreat capped at 0.85 chance');

  // 5. bgSwitch bounds
  assert.ok(html.includes('rng.chance(Math.min(0.85, 0.25 + (fx.bgSwitch ?? 0.35)))'), 'line bgSwitch capped at 0.85');
});

test('Theme & AMV — Decor Min/Max, 1-Click Sync, Studio Reactive UI', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const amv = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8');

  // 1. Studio Reactive Theme and Dynamic Scheme Color Adaptation
  assert.ok(html.includes('data-theme="studio-reactive"'), 'studio-reactive theme selector option exists');
  assert.ok(html.includes(':root[data-theme="studio-reactive"]'), 'studio-reactive CSS definitions exist');
  assert.ok(html.includes('--studio-primary'), 'studio-primary CSS variable defined');
  assert.ok(html.includes('--studio-secondary'), 'studio-secondary CSS variable defined');
  assert.ok(html.includes('id="btnStudioVu"'), 'btnStudioVu header button exists');
  assert.ok(html.includes('window.StudioReactiveUI = (function()'), 'window.StudioReactiveUI module exists');
  assert.ok(html.includes('syncScheme: syncScheme'), 'syncScheme exported on StudioReactiveUI');
  assert.ok(html.includes('window.StudioReactiveUI.update(S.t, S.plan);'), 'StudioReactiveUI update is hooked in draw loop');

  // 2. Real Frequency (Hz) Reactivity
  assert.ok(html.includes('getFrequencySpectrum: function(barCount, t, plan)'), 'audioDsp exports getFrequencySpectrum');
  assert.ok(html.includes('computeFrequencySpectrum'), 'computeFrequencySpectrum function present');
  assert.ok(html.includes('getFrequencyData: (barCount, t, plan) =>'), 'AudioVisualizerAPI exports getFrequencyData');
  assert.ok(html.includes('window.isFxOn ='), 'window.isFxOn global safe guard present');

  // 3. AMV 1-Click Sync
  assert.ok(amv.includes('id="amvBtnSyncThemeOnce"'), 'amvBtnSyncThemeOnce button exists in AMV modal header');
  assert.ok(amv.includes('function syncAllActiveAssetsToTheme()'), 'syncAllActiveAssetsToTheme function exists in amv_asset_manager');
  assert.ok(amv.includes('syncThemeOneClick: syncAllActiveAssetsToTheme'), 'syncThemeOneClick exported on AMVAssetModalAPI');
  assert.ok(amv.includes('state.customParams[preset.id].__themeSync = false'), '1-click sync locks colors statically');
});
