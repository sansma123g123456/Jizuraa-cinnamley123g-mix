/**
 * Bundle-optimisation regression suite.
 *
 * The deployable bundle is minified (the repo-root `index.html` stays
 * readable). These tests guard the two things that could silently break:
 *
 *   1. the minifier itself (does it still produce a working bundle?)
 *   2. the build pipeline (does it still ship a minified bundle?)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const readIndex = () => fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const scriptCount = html => (html.match(/<script\b/g) || []).length;

test('bundle: the source index.html keeps exactly 12 script tags', () => {
  assert.equal(scriptCount(readIndex()), 12);
});

test('bundle: the minifier tool exists and documents its guarantees', () => {
  const p = path.join(rootDir, 'tools', 'minify_bundle.mjs');
  assert.ok(fs.existsSync(p), 'tools/minify_bundle.mjs must exist');
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(/12 <script> tags/.test(src), 'the minifier must assert the 12-script invariant');
  assert.ok(/service worker/.test(src), 'the minifier must protect the service worker cache keys');
});

test('bundle: the verifier tool exists and boots the minified bundle', () => {
  const p = path.join(rootDir, 'tools', 'verify_minified.mjs');
  assert.ok(fs.existsSync(p), 'tools/verify_minified.mjs must exist');
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(/vm\.runInContext/.test(src), 'the verifier must execute the bundle in a sandbox');
  assert.ok(/CORE_ORDER/.test(src), 'the verifier must check the frozen CORE_ORDER');
});

test('bundle: the build pipeline minifies before deploying', () => {
  for (const tool of ['build_pages.mjs', 'build_cloudflare.mjs']) {
    const src = fs.readFileSync(path.join(rootDir, 'tools', tool), 'utf8');
    assert.ok(/minify_bundle\.mjs/.test(src),
      `tools/${tool} must run the minifier`);
    assert.ok(/12 <script> tags/.test(src) || /scriptCount !== 12/.test(src),
      `tools/${tool} must assert the 12-script invariant on its output`);
  }
});

test('bundle: the build pipeline falls back to the verbatim bundle if minification fails', () => {
  for (const tool of ['build_pages.mjs', 'build_cloudflare.mjs']) {
    const src = fs.readFileSync(path.join(rootDir, 'tools', tool), 'utf8');
    assert.ok(/catch/.test(src) && /verbatim/.test(src),
      `tools/${tool} must degrade gracefully when the minifier throws`);
  }
});

test('bundle: the source index.html is never modified by the build', () => {
  // The build must not write back into the repo root - the source is the
  // reference for the documented line numbers.
  for (const tool of ['build_pages.mjs', 'build_cloudflare.mjs']) {
    const src = fs.readFileSync(path.join(rootDir, 'tools', tool), 'utf8');
    assert.ok(!/writeFileSync\(\s*['"]index\.html/.test(src),
      `tools/${tool} must not write to the root index.html`);
  }
});

test('bundle: terser is pinned as a dev dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies && pkg.devDependencies.terser,
    'terser must be a devDependency (it must never ship to the browser)');
  assert.ok(!pkg.dependencies || !pkg.dependencies.terser,
    'terser must not be a runtime dependency');
});

test('bundle: the minifier must not mangle top-level names or properties', () => {
  // The engine leaks globals on purpose (J, S, AudioVisualizerAPI,
  // StemVisualizerAPI, ...) and every registry key is a string-keyed public
  // API. Mangling either would break the app at runtime with no build error.
  const src = fs.readFileSync(path.join(rootDir, 'tools', 'minify_bundle.mjs'), 'utf8');
  assert.ok(/toplevel:\s*false/.test(src), 'top-level mangling must stay off');
  assert.ok(/properties:\s*false/.test(src), 'property mangling must stay off');
});
