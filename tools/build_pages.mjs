/**
 * Build the static bundle for GitHub Pages.
 *
 * The app is 100% client-side, so there is no bundler step - we only need to
 * copy the runtime assets into `dist/` with the exact layout the browser
 * expects (relative paths, so the site also works under a repo sub-path).
 *
 * The inline engine is minified on the way in: `index.html` at the repo root
 * stays readable (its line numbers are a documented API reference), while the
 * deployed copy is ~40% smaller. See `tools/minify_bundle.mjs`.
 *
 * Usage: node tools/build_pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIST = 'dist';

// Files the browser actually requests at runtime.
const FILES = [
  'index.html',
  'webm-muxer.min.js',
  'amv_asset_library.js',
  'amv_asset_manager.js',
  'sw.js',
  'manifest.json',
  'icon.png',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

// Mirrors that must keep their relative folder layout.
const NESTED = [
  'src/amv_asset_manager.js',
  'src/timeline/beatDetector.js',
  'src/pipeline/exporter.js'
];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let copied = 0;
let missing = [];

for (const f of FILES) {
  if (!fs.existsSync(f)) {
    missing.push(f);
    continue;
  }
  fs.copyFileSync(f, path.join(DIST, f));
  copied++;
}

for (const f of NESTED) {
  if (!fs.existsSync(f)) {
    missing.push(f);
    continue;
  }
  const target = path.join(DIST, f);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(f, target);
  copied++;
}

// `.nojekyll` stops GitHub Pages from running Jekyll, which would otherwise
// skip files/folders starting with `_` and rewrite some URLs.
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

// --- minify the inline engine -----------------------------------------
// The minifier writes `dist/index.html` itself, so it runs AFTER the copy
// step and overwrites the verbatim copy.
let minified = false;
try {
  execFileSync(process.execPath, ['tools/minify_bundle.mjs'], { stdio: 'inherit' });
  minified = true;
} catch (err) {
  console.warn('WARNING: minification failed - deploying the verbatim bundle.');
  console.warn(String(err.stderr || err.message));
}

// Guard: the app must keep exactly 12 <script> tags (project invariant).
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const scriptCount = (html.match(/<script\b/g) || []).length;
if (scriptCount !== 12) {
  throw new Error(`index.html must have exactly 12 <script> tags, found ${scriptCount}`);
}

console.log(`Copied ${copied} files -> ${DIST}/`);
console.log(`index.html script tags: ${scriptCount} (invariant OK)`);
console.log(`minified: ${minified ? 'yes' : 'no (verbatim fallback)'}`);

if (missing.length) {
  console.warn('WARNING - missing files: ' + missing.join(', '));
  process.exitCode = 1;
}
