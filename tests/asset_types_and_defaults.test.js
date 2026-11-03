import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createMockElement(tag = 'div') {
  const el = {
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
    querySelector: (sel) => createMockElement('div'),
    querySelectorAll: (sel) => []
  };
  return el;
}

function createMockEnvironment() {
  const head = createMockElement('head');
  const body = createMockElement('body');

  const env = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    document: {
      readyState: 'complete',
      head: head,
      body: body,
      addEventListener: () => {},
      getElementById: (id) => createMockElement('div'),
      querySelector: (sel) => createMockElement('div'),
      querySelectorAll: (sel) => [],
      createElement: (tag) => createMockElement(tag)
    },
    J: { Renderer: function() {} }
  };
  env.window = env;
  env.document.defaultView = env;
  return env;
}

test('AMV Asset Manager - Asset Categories & State Presets', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  const state = env.AMVAssetModalAPI.getState();
  assert.ok(state, 'State object must be returned by getState()');
  assert.equal(typeof state.activeAssets, 'object', 'state.activeAssets must be an object');
  assert.equal(typeof state.cameraConfig, 'object', 'state.cameraConfig must be an object');

  // Verify camera config defaults
  assert.equal(state.cameraConfig.anchor, 'auto', 'Default camera anchor should be auto');
  assert.equal(state.cameraConfig.target, 'all', 'Default camera target should be all');
  assert.equal(state.cameraConfig.parallax3D, true, 'Default camera parallax3D should be true');
});

test('AMV Asset Manager - Asset Category Selection', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  // Default category
  const state = env.AMVAssetModalAPI.getState();
  assert.equal(state.selectedCategory, 'Bộ lọc hậu kỳ');

  // Modal open sets category
  env.AMVAssetModalAPI.open('Chuyển cảnh');
  assert.equal(state.selectedCategory, 'Chuyển cảnh');

  env.AMVAssetModalAPI.close();
  assert.equal(state.isOpen, false);
});
