import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockEnvironment(overrides = {}) {
  let intervals = [];
  let clearedIntervals = [];
  let animationFrames = [];
  let cancelledFrames = [];
  let timeouts = [];

  const env = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {},
      info: () => {}
    },
    setTimeout: (fn, ms) => {
      const id = timeouts.length + 1;
      timeouts.push({ id, fn, ms });
      return id;
    },
    clearTimeout: () => {},
    setInterval: (fn, ms) => {
      const id = intervals.length + 1;
      intervals.push({ id, fn, ms });
      return id;
    },
    clearInterval: (id) => {
      clearedIntervals.push(id);
    },
    requestAnimationFrame: (fn) => {
      const id = animationFrames.length + 1;
      animationFrames.push({ id, fn });
      return id;
    },
    cancelAnimationFrame: (id) => {
      cancelledFrames.push(id);
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
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        appendChild: () => {},
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => []
      })
    },
    J: {
      Renderer: function() {}
    },
    S: {
      renderer: {
        frame: () => {}
      }
    },
    ...overrides
  };
  env.window = env;
  env.document.defaultView = env;
  env._metrics = { intervals, clearedIntervals, animationFrames, cancelledFrames, timeouts };
  return env;
}

test('AMV Asset Manager - File Synchronization & Syntax', () => {
  const rootCode = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const srcCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'amv_asset_manager.js'), 'utf8');

  assert.equal(rootCode, srcCode, 'amv_asset_manager.js and src/amv_asset_manager.js must be identical');
  assert.ok(rootCode.length > 50000, 'Asset manager script must have substantial content');
});

test('AMV Asset Manager - Lifecycle & Hook Interval Cleanup', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  assert.ok(env.AMVAssetModalAPI, 'AMVAssetModalAPI must be exported on window');
  assert.equal(typeof env.AMVAssetModalAPI.open, 'function');
  assert.equal(typeof env.AMVAssetModalAPI.close, 'function');
  assert.equal(typeof env.AMVAssetModalAPI.toggle, 'function');
  assert.equal(typeof env.AMVAssetModalAPI.getState, 'function');
  assert.equal(typeof env.AMVAssetModalAPI.destroy, 'function');

  // When hook succeeds, hookInterval should be cleared
  assert.ok(env._metrics.clearedIntervals.length >= 1, 'hookInterval must be cleared once renderer is hooked');

  // Destroy clears any active resources
  env.AMVAssetModalAPI.destroy();
  const state = env.AMVAssetModalAPI.getState();
  assert.equal(state.isOpen, false, 'Modal state isOpen must be false');
});

test('AMV Asset Manager - Active Asset Assignment and State Persistence', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  env.AMVAssetModalAPI.setActiveAsset('Bộ lọc hậu kỳ', 'test_filter_bloom');
  assert.equal(env.AMVAssetModalAPI.getActiveAsset('Bộ lọc hậu kỳ'), 'test_filter_bloom');

  env.AMVAssetModalAPI.clearAll();
  assert.equal(env.AMVAssetModalAPI.getActiveAsset('Bộ lọc hậu kỳ'), null);
});
