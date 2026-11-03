import fs from 'node:fs';
import { NEW_CODE, TITLES, MARKER } from './cin_batch3_code.mjs';

const targets = ['index.html', 'JIZURA CIN MIX/index.html'];

const NEW_KEYS = {
  layout: ['cinKickerTitle', 'cinNewsTicker', 'cinPosterBig', 'cinCornerStack', 'cinDualColumn', 'cinMarqueeBox'],
  decor: ['cinSprocketHoles', 'cinDiagonalRule', 'cinNeonFrame', 'cinFilmLeader', 'cinSubtitleBar', 'cinDarkFrame'],
  bg: ['cinStarfield', 'cinInkWash', 'cinTunnelLights', 'cinCityBokeh', 'cinLaserGrid', 'cinCloudscape'],
  cam: ['cinRollingShutter', 'cinVertigoPush', 'cinCraneUp', 'cinSpinDolly', 'cinImpactShake', 'cinLensBreath'],
  fx: ['cinVHSChroma', 'cinGlitchBlocks', 'cinChromaticWave', 'cinMirrorSplit', 'cinFlashFrames', 'cinDipToBlack'],
  trans: ['cinInkSpread', 'cinVerticalSlide', 'cinSlicePush', 'cinDipToColor', 'cinZoomBlurTrans', 'cinRibbonWipe'],
};

function patchFile(p) {
  let html = fs.readFileSync(p, 'utf8');
  const before = html.length;

  for (const [g, keys] of Object.entries(NEW_KEYS)) {
    for (const k of keys) {
      const re = new RegExp("'(?:layout|enter|hold|exit|decor|treat|bg|cam|fx|trans)',\\s*'" + k + "'");
      if (re.test(html)) throw new Error(`key collision ${k} in ${p}`);
    }
  }

  const markIdx = html.indexOf(MARKER);
  if (markIdx < 0) throw new Error('marker not found in ' + p);
  const closeIdx = html.lastIndexOf('})();', markIdx);
  if (closeIdx < 0) throw new Error('IIFE close not found in ' + p);
  html = html.slice(0, closeIdx) + '\n' + NEW_CODE.trim() + '\n\n' + html.slice(closeIdx);

  for (const [g, t] of Object.entries(TITLES)) {
    const aIdx = html.indexOf(t.anchor);
    if (aIdx < 0) throw new Error(`title anchor not found for ${g} in ${p}`);
    const insertAt = aIdx + t.anchor.length;
    html = html.slice(0, insertAt) + t.add + html.slice(insertAt);
  }

  fs.writeFileSync(p, html);
  console.log(p, 'patched', before, '->', html.length, 'scripts=', (html.match(/<script\b/g) || []).length);
}

for (const p of targets) patchFile(p);
