import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
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
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelector: () => createMockElement('div'),
    querySelectorAll: () => []
  };
}

function createMockEnvironment(overrides = {}) {
  let clearedIntervals = [];

  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 99,
    clearInterval: (id) => { clearedIntervals.push(id); },
    requestAnimationFrame: () => 1,
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
      addEventListener: () => {},
      getElementById: () => createMockElement('div'),
      querySelector: () => createMockElement('div'),
      querySelectorAll: () => [],
      createElement: (tag) => createMockElement(tag)
    },
    J: { Renderer: function() {} },
    ...overrides
  };
  env.window = env;
  env.document.defaultView = env;
  env._clearedIntervals = clearedIntervals;
  return env;
}

test('AMV Asset Manager Extra - Destroy and Resource Release', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  assert.equal(typeof env.AMVAssetModalAPI.destroy, 'function');
  env.AMVAssetModalAPI.destroy();

  const state = env.AMVAssetModalAPI.getState();
  assert.equal(state.isOpen, false);
});

test('AMV Asset Manager Extra - Studio Visualizer Badge Sync', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  assert.equal(typeof env.AMVAssetModalAPI.updateVisualizerBadge, 'function');
  // Invoking shouldn't throw even with minimal DOM
  assert.doesNotThrow(() => {
    env.AMVAssetModalAPI.updateVisualizerBadge();
  });
});
