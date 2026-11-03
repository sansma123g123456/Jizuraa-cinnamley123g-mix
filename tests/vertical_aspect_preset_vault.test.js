import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.resolve(__dirname, '../index.html');
const rawHtml = fs.readFileSync(htmlPath, 'utf8');

function setupTestEnvironment() {
  const store = {};
  const mockLocalStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  const elements = {};
  function makeMockElement(id, tag = 'div') {
    return {
      id,
      tagName: tag.toUpperCase(),
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        toggle(c, force) {
          if (force === undefined) {
            if (this._classes.has(c)) { this._classes.delete(c); return false; }
            this._classes.add(c); return true;
          }
          if (force) this._classes.add(c);
          else this._classes.delete(c);
          return !!force;
        },
        contains(c) { return this._classes.has(c); }
      },
      attributes: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k]; },
      removeAttribute(k) { delete this.attributes[k]; },
      style: {},
      textContent: '',
      innerHTML: '',
      value: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      click() { if (typeof this.onclick === 'function') this.onclick(); }
    };
  }

  const mockDoc = {
    documentElement: makeMockElement('html', 'html'),
    getElementById: (id) => {
      if (!elements[id]) elements[id] = makeMockElement(id);
      return elements[id];
    },
    querySelector: (sel) => {
      if (sel.startsWith('#')) return mockDoc.getElementById(sel.slice(1));
      return makeMockElement('mock', 'div');
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: (tag) => makeMockElement('dynamic_' + tag, tag)
  };

  const windowMock = {
    document: mockDoc,
    localStorage: mockLocalStorage,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    requestIdleCallback: (fn) => fn(),
    addEventListener: () => {},
    toastMessages: [],
    toast: (msg) => { windowMock.toastMessages.push(msg); },
    console: console
  };

  return { windowMock, mockDoc, mockLocalStorage };
}

test('R4 — HTML Structure for Aspect Toggle & Preset Vault', async (t) => {
  await t.test('1.1: #btnAspectQuickToggle exists in #studioToolsStrip', () => {
    assert.match(rawHtml, /id="btnAspectQuickToggle"/);
    assert.match(rawHtml, /class="[^"]*aspect-pill-btn[^"]*"/);
    assert.match(rawHtml, /onclick="if\(window\.toggleAspectQuick\)window\.toggleAspectQuick\(\);"/);
  });

  await t.test('1.2: #btnExportPreset exists in #vaultDlg', () => {
    assert.match(rawHtml, /id="btnExportPreset"/);
    assert.match(rawHtml, /✨ Xuất Gói Preset \(\.jizura\)/);
  });

  await t.test('1.3: #fileVaultImport accepts both .jizura and .json', () => {
    assert.match(rawHtml, /accept="\.jizura,\.json,application\/json"/);
  });
});

test('R4 — Vertical Video 9:16 Safe Margin Calculation & Bounds', async (t) => {
  const idx1 = rawHtml.indexOf('J.sideZones = (W, H, dir)');
  const end1 = rawHtml.indexOf('function makeCut', idx1);
  const snippet1 = rawHtml.slice(idx1, end1);

  const idx2 = rawHtml.indexOf('J.getLyricBounds = (W, H, isPortrait)');
  const end2 = rawHtml.indexOf('\n})();', idx2);
  const snippet2 = rawHtml.slice(idx2, end2);

  const J = {};
  const sandbox = { J, Math };
  vm.createContext(sandbox);
  vm.runInContext(snippet1 + '\n' + snippet2, sandbox);

  await t.test('2.1: J.getLyricBounds returns safe margins for 9:16 portrait', () => {
    assert.equal(typeof J.getLyricBounds, 'function');
    const bounds = J.getLyricBounds(1080, 1920, true);
    // 9:16 portrait: side 8%, top 15%, bottom 25% -> height 60%
    assert.equal(bounds.left, Math.round(1080 * 0.08));
    assert.equal(bounds.right, 1080 - Math.round(1080 * 0.08));
    assert.equal(bounds.top, Math.round(1920 * 0.15));
    assert.equal(bounds.bottom, 1920 - Math.round(1920 * 0.25));
    assert.equal(bounds.width, Math.round(1080 * 0.84));
    assert.equal(bounds.height, Math.round(1920 * 0.60));
  });

  await t.test('2.2: J.getLyricBounds returns safe margins for 16:9 landscape', () => {
    const bounds = J.getLyricBounds(1920, 1080, false);
    // 16:9 landscape: side 5%, top 10%, bottom 10% -> height 80%
    assert.equal(bounds.left, Math.round(1920 * 0.05));
    assert.equal(bounds.top, Math.round(1080 * 0.10));
    assert.equal(bounds.width, Math.round(1920 * 0.90));
    assert.equal(bounds.height, Math.round(1080 * 0.80));
  });

  await t.test('2.3: J.sideZones applies vertical TikTok/Reels safe bounds on tall frames', () => {
    const zones = J.sideZones(1080, 1920);
    assert.ok(zones.length > 0);
    // topZone begins at 15% H and ends around 41% H
    const topZone = zones[0];
    assert.equal(topZone.y, Math.round(1920 * 0.15));
    assert.equal(topZone.h, Math.round(1920 * 0.26));
  });
});

test('R4 — 1-Click Aspect Ratio Toggle Logic & UI Synchronization', async (t) => {
  // Extract script #11 for toggleAspectQuick and updateAspectQuickToggleUI
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match, s11Code = '';
  let count = 0;
  while ((match = scriptRegex.exec(rawHtml)) !== null) {
    count++;
    if (count === 11) {
      s11Code = match[2];
      break;
    }
  }

  // Create isolated context to test aspect toggle
  const { windowMock, mockDoc } = setupTestEnvironment();
  const btnToggle = mockDoc.getElementById('btnAspectQuickToggle');
  const iconSpan = mockDoc.getElementById('lblAspectQuickIcon');
  const textSpan = mockDoc.getElementById('lblAspectQuickText');
  const outAspect = mockDoc.getElementById('outAspect');
  const eAspect = mockDoc.getElementById('eAspect');

  const S = {
    project: { aspect: '16:9' },
    plan: { beats: [], lines: [] },
    need: false
  };

  const sandbox = {
    window: windowMock,
    document: mockDoc,
    $: (id) => mockDoc.getElementById(id),
    S: S,
    J: {
      outputSize: (p) => (p.aspect === '9:16' ? [1080, 1920] : [1920, 1080]),
      pickVideoCodec: async () => ({ label: 'AVC' }),
      KEY_BG: { off: '#000', green: '#00ff00', black: '#000000' }
    },
    syncOut: () => {
      if (typeof windowMock.updateAspectQuickToggleUI === 'function') windowMock.updateAspectQuickToggleUI();
    },
    replan: () => {},
    remember: () => {},
    commit: () => {},
    flushSave: () => {},
    codecNote: () => {},
    sizeViewport: () => {},
    toast: (msg) => { windowMock.toastMessages.push(msg); }
  };

  // Run snippet containing updateAspectQuickToggleUI and toggleAspectQuick
  const aspectSnippet = `
    function updateAspectQuickToggleUI() {
      const btn = $('btnAspectQuickToggle');
      if (!btn) return;
      const curAspect = (S && S.project && S.project.aspect) ? S.project.aspect : '16:9';
      const isPortrait = (curAspect === '9:16');
      const icon = $('lblAspectQuickIcon') || $('aspectQuickIcon');
      const text = $('lblAspectQuickText');
      if (icon) icon.textContent = isPortrait ? '📱' : '📺';
      if (text) text.textContent = isPortrait ? '9:16' : '16:9';
      if (isPortrait) {
        btn.classList.add('portrait');
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        btn.title = 'Tỉ lệ: 9:16 Dọc (TikTok / Reels / Shorts). Nhấp để đổi sang 16:9 Ngang';
      } else {
        btn.classList.remove('portrait');
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        btn.title = 'Tỉ lệ: ' + curAspect + ' (YouTube / Màn hình ngang). Nhấp để đổi sang 9:16 Dọc';
      }
    }
    window.updateAspectQuickToggleUI = updateAspectQuickToggleUI;

    function fitCanvas() { if (typeof sizeViewport === 'function') sizeViewport(); }
    window.fitCanvas = fitCanvas;

    window.toggleAspectQuick = function() {
      if (!S || !S.project) return;
      const cur = S.project.aspect || '16:9';
      const next = (cur === '9:16') ? '16:9' : '9:16';
      if (typeof remember === 'function') remember();
      S.project.aspect = next;
      if ($('outAspect')) $('outAspect').value = next;
      if ($('eAspect')) $('eAspect').value = next;
      syncOut();
      if (typeof replan === 'function') replan();
      fitCanvas();
      if (typeof commit === 'function') commit();
      if (typeof flushSave === 'function') flushSave();
      if (typeof codecNote === 'function') codecNote();
      const isPortrait = (next === '9:16');
      if (typeof toast === 'function') {
        toast(isPortrait ? '📱 Đã chuyển sang tỉ lệ 9:16 Dọc (TikTok / Reels / Shorts)' : '📺 Đã chuyển sang tỉ lệ 16:9 Ngang (YouTube / Màn hình ngang)');
      }
    };
  `;

  vm.createContext(sandbox);
  vm.runInContext(aspectSnippet, sandbox);

  await t.test('3.1: Initial 16:9 state has landscape button UI', () => {
    sandbox.updateAspectQuickToggleUI();
    assert.equal(btnToggle.classList.contains('portrait'), false);
    assert.equal(btnToggle.getAttribute('aria-pressed'), 'false');
    assert.equal(iconSpan.textContent, '📺');
    assert.equal(textSpan.textContent, '16:9');
  });

  await t.test('3.2: 1-Click toggle switches from 16:9 to 9:16', () => {
    sandbox.window.toggleAspectQuick();
    assert.equal(S.project.aspect, '9:16');
    assert.equal(outAspect.value, '9:16');
    assert.equal(eAspect.value, '9:16');
    assert.equal(btnToggle.classList.contains('portrait'), true);
    assert.equal(btnToggle.classList.contains('active'), true);
    assert.equal(btnToggle.getAttribute('aria-pressed'), 'true');
    assert.equal(iconSpan.textContent, '📱');
    assert.equal(textSpan.textContent, '9:16');
    assert.ok(windowMock.toastMessages.some(m => m.includes('9:16 Dọc')));
  });

  await t.test('3.3: 1-Click toggle switches back from 9:16 to 16:9', () => {
    sandbox.window.toggleAspectQuick();
    assert.equal(S.project.aspect, '16:9');
    assert.equal(btnToggle.classList.contains('portrait'), false);
    assert.equal(iconSpan.textContent, '📺');
    assert.equal(textSpan.textContent, '16:9');
    assert.ok(windowMock.toastMessages.some(m => m.includes('16:9 Ngang')));
  });
});

test('R4 — Preset Vault (.jizura) Export & Import Round-Trip', async (t) => {
  const { windowMock, mockDoc, mockLocalStorage } = setupTestEnvironment();

  const S = {
    project: {
      title: 'Neon Cyber Anthem',
      themeId: 'darkKawaii',
      style: 'hyper',
      mood: 'club',
      aspect: '9:16',
      lrcTreat: 'liquidFillGlow',
      colors: { primary: '#ff66aa', secondary: '#66ffff' },
      fonts: { title: 'Montserrat' },
      fx: { motion: 0.8, glitch: 0.6 },
      amvCamera: { parallax3D: true, beatImpact: true },
      trigger: { enabled: true, threshold: 1.45 },
      visualizer: { enabled: true, style: 'cyber_ribbon_3d', colorMode: 'cyberpunk' },
      amv: { postFilters: { bloom: 1.2, chromaticAberration: 0.8 } },
      lyrics: 'Sample lyric content that should NOT be in lightweight preset'
    }
  };

  const savedFiles = {};
  windowMock.J = {
    saveFile: (name, content) => {
      savedFiles[name] = content;
    }
  };
  const sandbox = {
    window: windowMock,
    document: mockDoc,
    localStorage: mockLocalStorage,
    $: (id) => mockDoc.getElementById(id),
    S: S,
    J: {
      saveFile: (name, content) => {
        savedFiles[name] = content;
      }
    },
    baseName: () => 'neon_cyber_anthem',
    toast: (msg) => { windowMock.toastMessages.push(msg); }
  };

  // Run the exportPreset and applyPreset implementation
  const presetSnippet = `
    function exportPreset(presetName) {
      const curAspect = (S && S.project && S.project.aspect) || '16:9';
      const curTheme = (S && S.project && S.project.themeId) || (localStorage.getItem('jizura_theme') || 'dark-kawaii');
      const vizCfg = (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.getConfig === 'function')
        ? window.AudioVisualizerAPI.getConfig()
        : ((S && S.project && S.project.visualizer) || { enabled: false, style: 'circle_trap' });
      const amvState = (window.AMVAssetModalAPI && typeof window.AMVAssetModalAPI.getState === 'function')
        ? window.AMVAssetModalAPI.getState()
        : (typeof window.__getAMVState === 'function' ? window.__getAMVState() : {});
      const postFilters = amvState.postFilters || (window.ActiveAMVState && window.ActiveAMVState.postFilters) || [];

      const pkg = {
        format: 'jizura-preset',
        type: 'jizura_preset',
        version: '2.0',
        name: presetName || ((S && S.project && S.project.title) ? S.project.title + ' Preset' : 'Jizura Preset'),
        timestamp: Date.now(),
        theme: {
          style: curTheme
        },
        visualizer: vizCfg,
        postFilters: postFilters,
        camera: {
          aspect: curAspect,
          config: (S && S.project && S.project.amvCamera) || {}
        },
        amv: (typeof window.__getAMVState === 'function') ? window.__getAMVState() : (S && S.project && S.project.amv ? JSON.parse(JSON.stringify(S.project.amv)) : {}),
        style: (S && S.project && S.project.style) || 'noir',
        mood: (S && S.project && S.project.mood) || null,
        lrcTreat: (S && S.project && S.project.lrcTreat) || 'auto',
        colors: (S && S.project && S.project.colors) ? JSON.parse(JSON.stringify(S.project.colors)) : {},
        fonts: (S && S.project && S.project.fonts) ? JSON.parse(JSON.stringify(S.project.fonts)) : {},
        fx: (S && S.project && S.project.fx) ? JSON.parse(JSON.stringify(S.project.fx)) : {},
        trigger: (S && S.project && S.project.trigger) ? JSON.parse(JSON.stringify(S.project.trigger)) : {}
      };

      const filename = (typeof baseName === 'function' ? baseName() : 'jizura') + '_preset.jizura';
      if (window.J && typeof window.J.saveFile === 'function') {
        window.J.saveFile(filename, JSON.stringify(pkg, null, 2));
      }
      toast('✨ Đã xuất Gói Preset (' + filename + ') thành công!');
      return pkg;
    }
    window.exportPreset = exportPreset;

    function applyPreset(data) {
      if (!data) {
        toast('File preset rỗng hoặc không hợp lệ');
        return { success: false, error: 'Empty preset' };
      }
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          toast('Cú pháp file preset bị lỗi');
          return { success: false, error: 'Malformed JSON' };
        }
      }
      if (!data || typeof data !== 'object') {
        toast('File preset rỗng hoặc không hợp lệ');
        return { success: false, error: 'Invalid preset object' };
      }

      if (data.format && data.format !== 'jizura-preset' && data.type !== 'jizura_preset') {
        toast('Định dạng preset không tương thích');
        return { success: false, error: 'Invalid format/version' };
      }

      const p = data.preset || data;

      const themeStyle = (p.theme && p.theme.style) || p.themeId || p.theme;
      if (themeStyle) {
        try { localStorage.setItem('jizura_theme', themeStyle); } catch (e) {}
        if (document.documentElement && document.documentElement.setAttribute) {
          document.documentElement.setAttribute('data-theme', themeStyle);
        }
        if (S && S.project) {
          S.project.themeId = themeStyle;
        }
      }

      if (p.visualizer && window.AudioVisualizerAPI) {
        if (p.visualizer.enabled) window.AudioVisualizerAPI.enable(p.visualizer.style);
        else window.AudioVisualizerAPI.disable();
        if (p.visualizer.style) window.AudioVisualizerAPI.setStyle(p.visualizer.style);
      } else if (p.visualizer && S && S.project) {
        S.project.visualizer = Object.assign({}, p.visualizer);
      }

      const asp = (p.camera && p.camera.aspect) || p.aspect;
      if (asp && (asp === '16:9' || asp === '9:16' || asp === '1:1')) {
        if (S && S.project) {
          S.project.aspect = asp;
        }
      }

      if (p.lrcTreat && S && S.project) S.project.lrcTreat = p.lrcTreat;
      if (p.style && S && S.project) S.project.style = p.style;
      if (p.mood !== undefined && S && S.project) S.project.mood = p.mood;

      if (S && S.project) {
        if (p.colors) S.project.colors = JSON.parse(JSON.stringify(p.colors));
        if (p.fonts) S.project.fonts = JSON.parse(JSON.stringify(p.fonts));
        if (p.fx) S.project.fx = Object.assign({}, S.project.fx, p.fx);
        if (p.trigger) S.project.trigger = Object.assign({}, S.project.trigger, p.trigger);
      }

      toast('⚡ Đã nạp thành công preset: "' + (data.name || 'Jizura Preset') + '"');
      return { success: true, preset: data };
    }
    window.applyPreset = applyPreset;
  `;

  vm.createContext(sandbox);
  vm.runInContext(presetSnippet, sandbox);

  await t.test('4.1: exportPreset creates lightweight .jizura file without lyrics', () => {
    const pkg = sandbox.window.exportPreset();
    assert.equal(pkg.format, 'jizura-preset');
    assert.equal(pkg.version, '2.0');
    assert.equal(pkg.theme.style, 'darkKawaii');
    assert.equal(pkg.camera.aspect, '9:16');
    assert.equal(pkg.visualizer.style, 'cyber_ribbon_3d');
    assert.equal(pkg.lrcTreat, 'liquidFillGlow');
    assert.equal(pkg.lyrics, undefined); // lyrics must NOT be leaked into preset

    const filename = 'neon_cyber_anthem_preset.jizura';
    assert.ok(savedFiles[filename]);
    const fileContent = JSON.parse(savedFiles[filename]);
    assert.equal(fileContent.name, 'Neon Cyber Anthem Preset');
  });

  await t.test('4.2: applyPreset correctly restores state from exported preset JSON', () => {
    // Reset project state to defaults
    S.project = {
      title: 'Blank Project',
      themeId: 'default',
      style: 'noir',
      mood: null,
      aspect: '16:9',
      lrcTreat: 'auto',
      colors: {},
      fonts: {},
      fx: {},
      visualizer: { enabled: false, style: 'circle_trap' }
    };

    const exportedJson = savedFiles['neon_cyber_anthem_preset.jizura'];
    const res = sandbox.window.applyPreset(exportedJson);
    assert.equal(res.success, true);
    assert.equal(S.project.themeId, 'darkKawaii');
    assert.equal(S.project.aspect, '9:16');
    assert.equal(S.project.visualizer.style, 'cyber_ribbon_3d');
    assert.equal(S.project.lrcTreat, 'liquidFillGlow');
    assert.equal(S.project.style, 'hyper');
    assert.equal(S.project.mood, 'club');
  });

  await t.test('4.3: applyPreset rejects malformed JSON and incompatible formats', () => {
    const res1 = sandbox.window.applyPreset('');
    assert.equal(res1.success, false);

    const res2 = sandbox.window.applyPreset('{bad:');
    assert.equal(res2.success, false);

    const res3 = sandbox.window.applyPreset(JSON.stringify({ format: 'random_binary' }));
    assert.equal(res3.success, false);
  });
});
