import fs from 'node:fs';
import { NEW_CODE, TITLES, MARKER } from './cin_batch2_code.mjs';

const targets = ['index.html', 'JIZURA CIN MIX/index.html'];

function patchFile(p) {
  let html = fs.readFileSync(p, 'utf8');
  const before = html.length;

  // 1) check key collisions
  const keys = ['cinNeonSign', 'cinSubtitleSafe', 'cinStackKanji', 'cinWhipIn', 'cinTypeOn', 'cinBeatZoom',
    'cinBeatPulse', 'cinWaveShift', 'cinGlitchPulse', 'cinScatterOut', 'cinReverseExit', 'cinVerticalBlur',
    'cinGradientSweep', 'cinRetroPrint', 'cinStencilBreak', 'cinLetterboxBars', 'cinFilmDust', 'cinLensFlare',
    'cinAuroraRift', 'cinHalftoneSun', 'cinDustMotes', 'cinHandheldShake', 'cinDutchAngle', 'cinZoomBreath',
    'cinScanlineRoll', 'cinRGBStutter', 'cinEchoTrail', 'cinFilmBurn', 'cinIrisCircle', 'cinShutterBars'];
  for (const k of keys) {
    const re = new RegExp("'(?:layout|enter|hold|exit|decor|treat|bg|cam|fx|trans)',\\s*'" + k + "'");
    if (re.test(html)) throw new Error(`key collision ${k} in ${p}`);
  }

  // 2) insert technique code at the end of the cin_mix_fx IIFE
  const markIdx = html.indexOf(MARKER);
  if (markIdx < 0) throw new Error('marker not found in ' + p);
  const closeIdx = html.lastIndexOf('})();', markIdx);
  if (closeIdx < 0) throw new Error('IIFE close not found in ' + p);
  const code = '\n' + NEW_CODE.trim() + '\n\n';
  html = html.slice(0, closeIdx) + code + html.slice(closeIdx);

  // 3) titles
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
