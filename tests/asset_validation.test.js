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
  return env;
}

test('AMV Asset Validation - Asset Selection & State Modification', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  const env = createMockEnvironment();
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  // Set asset
  env.AMVAssetModalAPI.setActiveAsset('Chuyển cảnh', 'transition_wipe_radial');
  assert.equal(env.AMVAssetModalAPI.getActiveAsset('Chuyển cảnh'), 'transition_wipe_radial');

  // Overwrite asset
  env.AMVAssetModalAPI.setActiveAsset('Chuyển cảnh', 'transition_glitch_flash');
  assert.equal(env.AMVAssetModalAPI.getActiveAsset('Chuyển cảnh'), 'transition_glitch_flash');

  // Clear asset
  env.AMVAssetModalAPI.setActiveAsset('Chuyển cảnh', null);
  assert.equal(env.AMVAssetModalAPI.getActiveAsset('Chuyển cảnh'), null);
});

test('AMV Asset Validation - Audio Visualizer Integration', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'amv_asset_manager.js'), 'utf8');
  let vizEnabled = null;
  let vizDisabled = false;

  const env = createMockEnvironment({
    AudioVisualizerAPI: {
      enable: (id) => { vizEnabled = id; },
      disable: () => { vizDisabled = true; vizEnabled = null; }
    }
  });
  const context = vm.createContext(env);
  vm.runInContext(code, context);

  // Enable visualizer
  env.AMVAssetModalAPI.turnOnAudioVisualizer('audio_trap_nation_pro');
  assert.equal(vizEnabled, 'audio_trap_nation_pro');

  // Disable visualizer
  env.AMVAssetModalAPI.turnOffAudioVisualizer();
  assert.equal(vizDisabled, true);
  assert.equal(vizEnabled, null);
});
