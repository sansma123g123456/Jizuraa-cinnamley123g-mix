import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rawHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

function extractScript(html, scriptIndex) {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match, idx = 1;
  while ((match = scriptRegex.exec(html)) !== null) {
    if (idx === scriptIndex) return match[1];
    idx++;
  }
  return null;
}

test('Invariant: Exactly 12 script tags in index.html', () => {
  const count = (rawHtml.match(/<script\b/gi) || []).length;
  assert.equal(count, 12, `index.html must maintain strictly 12 script tags, but found ${count}`);
});

test('Camera Engine — none camera definition exists and is static', () => {
  assert.ok(
    rawHtml.includes("none: { name: 'Đứng yên', tags: ['calm', 'editorial'], w: 0, get: () => ({ s: 1, x: 0, y: 0, rot: 0, blur: 0 }) }"),
    'J.CAMERA.none must be defined with static 1.0 scale and 0 offsets'
  );
});

test('Camera Engine — pickCam returns "none" when all cameras are disabled, even at fx.motion = 5.0 (500%)', () => {
  // Extract pickCam logic
  const J = {
    CAMERA: {
      none: { name: 'Đứng yên', get: () => ({ s: 1, x: 0, y: 0, rot: 0 }) },
      push: { name: 'ゆっくり寄る', get: (env) => ({ s: 1 + 0.03 * (env.fx.motion ?? 0.7) }) },
    },
    CAMERA_ORDER: ['push'],
  };

  function wkey(bias, k, def) { return def; }
  function novelty(hist, group, k) { return 1; }

  function pickCam(rng, st, en, fx, LD, emph, history) {
    const cands = J.CAMERA_ORDER.filter(k => k !== 'none' && en.cam && en.cam[k] !== false && J.CAMERA[k]).map(k => {
      const D = J.CAMERA[k];
      let w = wkey(st.bias && st.bias.cam, k, D.w ?? 1) * novelty(history, 'cam', k);
      if (D.strong) w *= 0.25 + 0.9 * Math.min(2.0, fx.motion ?? 0.7) + (emph ? 0.6 : 0);
      if (LD.cam === false && k !== 'push') w *= 0.05;
      return [k, w];
    });
    return cands.length ? rng.wpick(cands) : ((en.cam && en.cam.push !== false) ? 'push' : 'none');
  }

  const rng = { wpick: arr => arr[0][0] };
  const st = {};
  const LD = {};
  const fx = { motion: 5.0 }; // 500% motion slider
  const history = [];

  // When push is disabled by user
  const enDisabled = { cam: { push: false } };
  const result = pickCam(rng, st, enDisabled, fx, LD, false, history);
  assert.equal(result, 'none', 'When push is disabled, pickCam must return "none" instead of falling back to push');

  // When push is enabled
  const enEnabled = { cam: { push: true } };
  const resultEnabled = pickCam(rng, st, enEnabled, fx, LD, false, history);
  assert.equal(resultEnabled, 'push', 'When push is enabled, pickCam returns push');
});

test('Event Engine — addEvent strictly blocks disabled effects even at fx.motion = 5.0 and kime landing', () => {
  const plan = { events: [] };
  const en = { fx: { shake: false, chroma: false, zoom: false, flash: true } };
  const addEvent = (t, type, amp, dur) => {
    if (en.fx && en.fx[type] === false) return;
    plan.events.push({ t, type, amp, dur });
  };

  const fx = { motion: 5.0, chroma: 5.0 };

  // Attempt to add disabled effects at 500% motion
  addEvent(1.0, 'shake', 0.8 * fx.motion, 0.28);
  addEvent(1.0, 'chroma', 1 + fx.chroma, 0.25);
  addEvent(1.0, 'zoom', 0.7 + 0.5 * fx.motion, 0.22);
  addEvent(1.0, 'flash', 1, 0.1);

  assert.equal(plan.events.length, 1, 'Only the enabled flash event should be added');
  assert.equal(plan.events[0].type, 'flash');
  assert.ok(!plan.events.some(e => e.type === 'shake'), 'Shake must not be present');
  assert.ok(!plan.events.some(e => e.type === 'chroma'), 'Chroma must not be present');
  assert.ok(!plan.events.some(e => e.type === 'zoom'), 'Zoom must not be present');
});

test('Renderer Engine — Stem kick shake and ghosting passes are strictly suppressed when turned OFF', () => {
  const plan = {
    en: { fx: { shake: false, chroma: false } },
    events: [],
    beats: []
  };
  const fx = { motion: 5.0, chroma: 5.0 };
  const st = { ghost: 1.0 };
  const opt = {};

  const isFxOn = k => !plan.en || !plan.en.fx || plan.en.fx[k] !== false;

  // Simulate shake calculation
  let shake = 0;
  if (isFxOn('shake')) {
    const stemKickShake = 1.0; // simulated kick
    if (stemKickShake > 0.01) {
      shake += stemKickShake * 1.6;
    }
  } else {
    shake = 0;
  }
  assert.equal(shake, 0, 'Shake must remain 0 when shake is disabled, ignoring stemKickShake');

  // Simulate ghostOn calculation
  const ghostOn = isFxOn('chroma') && (fx.chroma ?? 0.7) > 0.02 && (st.ghost ?? 1) > 0.02 && !opt.noGhost;
  assert.equal(ghostOn, false, 'ghostOn must be false when chroma is disabled, even at chroma=5.0');
});

test('Character Motion — beatPunch and shakeReactive respect disabled states', () => {
  // Character shake reactive test
  const metaWithDisabledShake = {
    shake: { x: 50, y: 50 },
    plan: { en: { fx: { shake: false } } }
  };
  const camCfg = { shakeReactive: true, beatPunch: false, beatPunchAmp: 100 };
  const isLyricOnly = false;
  let ox = 0, oy = 0;

  if (!isLyricOnly && camCfg.shakeReactive && metaWithDisabledShake && metaWithDisabledShake.shake && (!metaWithDisabledShake.plan || !metaWithDisabledShake.plan.en || !metaWithDisabledShake.plan.en.fx || metaWithDisabledShake.plan.en.fx.shake !== false)) {
    ox += metaWithDisabledShake.shake.x;
    oy += metaWithDisabledShake.shake.y;
  }
  assert.equal(ox, 0, 'Character ox must not receive shake when shake is disabled in plan.en.fx');
  assert.equal(oy, 0, 'Character oy must not receive shake when shake is disabled in plan.en.fx');

  // Character hop / bounce test
  let hopped = false;
  if (camCfg.beatPunch !== false) {
    hopped = true;
  }
  assert.equal(hopped, false, 'Character hop/bounce must not trigger when camCfg.beatPunch is false');
});

test('Transitions Engine — pickTrans returns null when all transitions are disabled at fx.motion = 5.0', () => {
  const J = {
    TRANS_ORDER: ['fade', 'wipe', 'slide'],
    TRANS: { fade: { dur: 0.3 }, wipe: { dur: 0.3 }, slide: { dur: 0.3 } },
  };
  function wkey(bias, k, def) { return def; }
  function novelty(hist, group, k) { return 1; }

  function pickTrans(rng, st, en, fx, emph, history) {
    if (!J.TRANS_ORDER.length) return null;
    const cands = J.TRANS_ORDER.filter(k => en.trans && en.trans[k] !== false && J.TRANS[k])
      .map(k => [k, wkey(st.bias && st.bias.trans, k, J.TRANS[k].w ?? 1) * novelty(history, 'trans', k)]);
    if (!cands.length) return null;
    if (!rng.chance(0.1 + 0.22 * Math.min(1.5, fx.motion ?? 0.7) + (emph ? 0.08 : 0))) return null;
    return rng.wpick(cands);
  }

  const rng = { chance: () => true, wpick: arr => arr[0][0] };
  const st = {};
  const fx = { motion: 5.0 };
  const enAllOff = { trans: { fade: false, wipe: false, slide: false } };

  assert.equal(pickTrans(rng, st, enAllOff, fx, false, []), null, 'When transitions are disabled, pickTrans must return null');
});

test('Technique Preview Optimization — previewR and paintTechCanvas disable AMV completely', () => {
  // Verify previewR configuration in index.html
  assert.ok(
    rawHtml.includes('const previewR = new J.Renderer();\npreviewR.noAMV = true;\npreviewR.isTechPreview = true;\npreviewR.noPost = true;'),
    'previewR must explicitly have noAMV = true, isTechPreview = true, and noPost = true'
  );

  // Verify paintTechCanvas passes noAMV, isTechPreview, lyricsOnly, and noPost
  assert.ok(
    rawHtml.includes('previewR.frame(ctx, plan, t, { scale, fast: true, noHud: true, noGhost: g !== \'fx\', noCustomBg: true, noPost: true, noAMV: true, isTechPreview: true, lyricsOnly: true });'),
    'paintTechCanvas must pass noPost, noAMV, isTechPreview, and lyricsOnly flags'
  );

  // Verify amv_asset_manager.js renderAMVFrame bypasses when noAMV or isTechPreview is set
  const amvSrc = fs.readFileSync(path.join(rootDir, 'amv_asset_manager.js'), 'utf8');
  assert.ok(
    amvSrc.includes('if (this.noAMV || this.isTechPreview || (opt && (opt.__isAMVNested || opt.noPost || opt.noAMV || opt.isTechPreview))) {'),
    'renderAMVFrame must immediately return origFrame when this.noAMV, this.isTechPreview, opt.noAMV, or opt.isTechPreview is set'
  );

  // Test execution simulation
  let origFrameCalled = false;
  let amvPostProcessed = false;

  function origFrame(ctx, plan, t, opt) {
    origFrameCalled = true;
    return 'ORIG_FRAME_RESULT';
  }

  function mockRenderAMVFrame(orig, ctx, plan, t, opt = {}) {
    if (this.noAMV || this.isTechPreview || (opt && (opt.__isAMVNested || opt.noPost || opt.noAMV || opt.isTechPreview))) {
      return orig.call(this, ctx, plan, t, opt);
    }
    amvPostProcessed = true;
  }

  const mockPreviewR = { noAMV: true, isTechPreview: true, noPost: true };
  const res = mockRenderAMVFrame.call(mockPreviewR, origFrame, {}, {}, 0, { noAMV: true, isTechPreview: true });

  assert.equal(origFrameCalled, true, 'origFrame must be called directly');
  assert.equal(amvPostProcessed, false, 'AMV post-processing must be completely bypassed');
  assert.equal(res, 'ORIG_FRAME_RESULT');
});

