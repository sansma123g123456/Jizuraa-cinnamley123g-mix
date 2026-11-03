/**
 * Audio Visualizer OFF regression suite.
 *
 * Bug: pressing the "TẮT" (OFF) button only disabled `AudioVisualizerAPI`, but the AMV
 * asset pipeline kept rendering an audio-reactive preset because of an unconditional
 * fallback in `renderAMVFrame()`:
 *
 *   const rawAudioId = activeAssets['Phản ứng âm thanh'] || resolveActiveAudioVisualizerId();
 *   const audioAssetId = resolvedAudioPreset ? ... : (rawAudioId || 'audio_trap_nation_pro');
 *
 * With `rawAudioId === null` the pipeline silently fell back to
 * 'audio_trap_nation_pro', so the visualizer kept drawing on the canvas after the user
 * had switched it off.
 *
 * Fix: an explicit `audioVisualizerOff` flag in the AMV state. When it is set, the audio
 * layer is skipped entirely (no fallback) and `resolveActiveAudioVisualizerId()` returns
 * null. The flag is persisted, restored and kept in sync with `AudioVisualizerAPI`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rawHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const amvLibCode = fs.readFileSync(path.join(rootDir, 'amv_asset_library.js'), 'utf8');
const amvMgrCode = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8');

function extractScript(html, scriptIndex) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match, idx = 1;
  while ((match = scriptRegex.exec(html)) !== null) {
    if (idx === scriptIndex) return match[1];
    idx++;
  }
  return null;
}

function createMockCtx() {
  const calls = [];
  const target = {
    canvas: { width: 1920, height: 1080 },
    calls,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createPattern: () => ({}),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    measureText: (t) => ({ width: (t || '').length * 10 })
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(t, prop, val) { t[prop] = val; return true; }
  });
}

// The mock environment lives in the E2E suite; reuse it so both suites see the same world.
const suiteSrc = fs.readFileSync(path.join(rootDir, 'tests', 'e2e_v2_suite.test.js'), 'utf8');
const harnessEnd = suiteSrc.indexOf('// Reference Harmonizer');
const harnessSrc = suiteSrc.slice(0, harnessEnd)
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '')
  .replace(/const __filename = fileURLToPath\(import\.meta\.url\);/gm, '')
  .replace(/const __dirname = path\.dirname\(__filename\);/gm, '');

const harnessFactory = new Function('fs', 'path', 'vm', 'performance', '__dirname', '__filename',
  harnessSrc + '\nreturn { createMockEnvironment, extractScript };');
const { createMockEnvironment } = harnessFactory(
  fs, path, vm, performance, __dirname, __filename
);

function boot() {
  const env = createMockEnvironment({});
  const context = vm.createContext(env);
  vm.runInContext(extractScript(rawHtml, 1), context);
  vm.runInContext(amvLibCode, context);
  vm.runInContext(amvMgrCode, context);
  for (const i of [5, 6, 7, 8, 9, 10, 11, 12]) vm.runInContext(extractScript(rawHtml, i), context);
  [...env._metrics.timeouts].forEach(t => { try { t.fn(); } catch (e) {} });
  return env;
}

test('Visualizer OFF: turning it off clears the AMV audio layer (no fallback preset)', () => {
  const env = boot();
  const amv = env.AMVAssetModalAPI;
  const state = env.ActiveAMVState;

  amv.turnOnAudioVisualizer('audio_trap_nation_pro');
  assert.equal(state.audioVisualizerOff, false, 'ON must clear the off-flag');

  amv.turnOffAudioVisualizer();
  assert.equal(state.audioVisualizerOff, true, 'OFF must set the off-flag');
  assert.equal(state.activeAssets['Phản ứng âm thanh'], null, 'OFF must clear the active asset');
  assert.equal(env.AudioVisualizerAPI.isEnabled(), false, 'OFF must disable AudioVisualizerAPI');

  // the id the frame pipeline would resolve
  assert.equal(amv.getActiveAsset('Phản ứng âm thanh'), null,
    'no preset may be resolved while the visualizer is OFF');
  assert.equal(amv.hasActiveAudioVisualizer(), false);
});

test('Visualizer OFF: the frame pipeline has no audio id to fall back to', () => {
  const env = boot();
  const amv = env.AMVAssetModalAPI;
  const state = env.ActiveAMVState;

  amv.turnOffAudioVisualizer();

  // mirrors renderAMVFrame(): activeAssets[id] || resolveActiveAudioVisualizerId()
  const rawAudioId = state.activeAssets['Phản ứng âm thanh'] || amv.getActiveAsset('Phản ứng âm thanh');
  assert.ok(!rawAudioId, 'pipeline must not resolve any audio preset while OFF');
});

test('Visualizer OFF: turning it back on restores the preset', () => {
  const env = boot();
  const amv = env.AMVAssetModalAPI;
  const state = env.ActiveAMVState;

  amv.turnOnAudioVisualizer('audio_trap_nation_pro');
  amv.turnOffAudioVisualizer();
  amv.turnOnAudioVisualizer('audio_galaxy_orbit_3d');

  assert.equal(state.audioVisualizerOff, false);
  assert.equal(state.activeAssets['Phản ứng âm thanh'], 'audio_galaxy_orbit_3d');
  assert.equal(env.AudioVisualizerAPI.isEnabled(), true);
  assert.equal(amv.getActiveAsset('Phản ứng âm thanh'), 'audio_galaxy_orbit_3d');
});

test('Visualizer OFF: AudioVisualizerAPI.disable() also stops the AMV layer', () => {
  const env = boot();
  env.AMVAssetModalAPI.turnOnAudioVisualizer('audio_trap_nation_pro');
  env.AudioVisualizerAPI.disable();
  assert.equal(env.ActiveAMVState.audioVisualizerOff, true);
  assert.equal(env.AMVAssetModalAPI.getActiveAsset('Phản ứng âm thanh'), null);
});

test('Visualizer OFF: AudioVisualizerAPI.enable() re-enables the AMV layer without recursion', () => {
  const env = boot();
  env.AudioVisualizerAPI.enable('orbit_particles');
  assert.equal(env.ActiveAMVState.audioVisualizerOff, false);
  assert.equal(env.AudioVisualizerAPI.isEnabled(), true);
  // the AMV slot must hold a RESOLVED preset id, not the raw style alias
  const resolved = env.AMVAssetModalAPI.getActiveAsset('Phản ứng âm thanh');
  assert.ok(resolved, 'an AMV preset must be resolved');
  assert.ok(env.AMVAssets.get(resolved), 'the resolved id must exist in the library: ' + resolved);
});

test('Visualizer OFF: the flag survives a project save / restore round-trip', () => {
  const env = boot();
  env.AMVAssetModalAPI.turnOnAudioVisualizer('audio_trap_nation_pro');
  env.AMVAssetModalAPI.turnOffAudioVisualizer();

  const exported = env.__getAMVState();
  assert.equal(exported.audioVisualizerOff, true, 'exported state must carry the flag');

  const env2 = boot();
  env2.__applyAMVState(exported);
  assert.equal(env2.ActiveAMVState.audioVisualizerOff, true, 'restored state must keep the flag');
});

test('Visualizer OFF: SHA256 parity of the touched manager mirrors', () => {
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(rootDir, f))).digest('hex');
  assert.equal(hash('amv_asset_manager.js'), hash('src/amv_asset_manager.js'),
    'root and src must stay byte-for-byte identical');
  assert.equal(hash('amv_asset_manager.js'), hash(path.join('JIZURA CIN MIX', 'amv_asset_manager.js')),
    'root and the JIZURA CIN MIX mirror must stay byte-for-byte identical');
});
