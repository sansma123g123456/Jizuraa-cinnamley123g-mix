import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

test('Decor Limit 20 — pickDecor and UI Bounds', () => {
  // 1. Script tag invariant
  const scriptTags = (html.match(/<script\b/gi) || []).length;
  assert.equal(scriptTags, 12, 'Exactly 12 script tags in index.html');

  // 2. pickDecor bounds up to 20
  assert.ok(html.includes('const minD = Math.max(0, Math.min(20, fx.decorMin != null ? Math.round(+fx.decorMin) : 0));'), 'pickDecor min bound up to 20');
  assert.ok(html.includes('const maxD = Math.max(minD, Math.min(20, fx.decorMax != null ? Math.round(+fx.decorMax) : 20));'), 'pickDecor max bound up to 20');

  // 3. UI inputs max attribute is 20
  assert.ok(html.includes('<input id="fx_decor_min" type="number" min="0" max="20"'), 'fx_decor_min input max 20');
  assert.ok(html.includes('<input id="fx_decor_max" type="number" min="0" max="20"'), 'fx_decor_max input max 20');

  // 4. Update limits parses up to 20
  assert.ok(html.includes('let mn = Math.max(0, Math.min(20, parseInt(minInp.value, 10) || 0));'), 'updateLimits mn clamped to 20');
  assert.ok(html.includes('let mx = Math.max(mn, Math.min(20, parseInt(maxInp.value, 10) || 0));'), 'updateLimits mx clamped to 20');
});

test('JSON File Save Upgrade — Full State Persistence and Roundtrip', () => {
  // 1. collectProjectState captures all aspects
  assert.ok(html.includes('function collectProjectState()'), 'collectProjectState function exists');
  assert.ok(html.includes('S.project.aspect = asp;'), 'collectProjectState captures aspect');
  assert.ok(html.includes('S.project.theme = curTheme;'), 'collectProjectState captures theme');
  assert.ok(html.includes('window.AudioVisualizerAPI.getConfig()'), 'collectProjectState captures visualizer config');
  assert.ok(html.includes('window.__getAMVState()'), 'collectProjectState captures full AMV state');
  assert.ok(html.includes('window.AutoDirectorAPI.getConfig()'), 'collectProjectState captures AutoDirector config');
  assert.ok(html.includes('window.SmartSectionAPI.getConfig()'), 'collectProjectState captures SmartSection config');

  // 2. applyFullProject restores all aspects
  assert.ok(html.includes('function applyFullProject(projData, customBeats)'), 'applyFullProject function exists');
  assert.ok(html.includes('window.applyTheme(th);'), 'applyFullProject restores theme');
  assert.ok(html.includes('window.__applyAMVState(np.amv);'), 'applyFullProject restores AMV state');
  assert.ok(html.includes('window.AudioVisualizerAPI.enable(np.visualizer.style);'), 'applyFullProject restores visualizer');
  assert.ok(html.includes('window.AutoDirectorAPI.applyConfig(np.autoDirector);'), 'applyFullProject restores AutoDirector config');
  assert.ok(html.includes('window.SmartSectionAPI.applyConfig(np.autoDrop);'), 'applyFullProject restores AutoDrop config');
  assert.ok(html.includes('document.getElementById(\'fx_decor_min\')'), 'applyFullProject restores decor inputs');

  // 3. AutoDirector and SmartSection APIs expose applyConfig
  assert.ok(html.includes('applyConfig: function(newCfg) {'), 'applyConfig exists in APIs');
});
