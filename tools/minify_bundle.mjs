/**
 * Minify the deployable bundle.
 *
 * WHY THIS EXISTS
 * ---------------
 * `index.html` is the canonical source: ~60k lines, and the line numbers are a
 * documented API reference (see `docs/TECHNIQUE_API.md` §13, which maps the
 * important ones). It must NOT be minified in place.
 *
 * Instead this tool produces a separate, minified copy for deployment:
 *   - `dist/index.html`            (GitHub Pages)
 *   - `cloudflare_dist/index.html` (Cloudflare Pages)
 *
 * INVARIANTS THAT MUST SURVIVE MINIFICATION
 * -----------------------------------------
 *   - exactly 12 <script> tags
 *   - the `?v=` asset query strings are untouched (the service worker keys
 *     its cache on them)
 *   - the engine still boots and renders (checked by the test suite, which
 *     runs against the source, plus `tools/verify_minified.mjs`)
 *
 * DELIBERATELY NOT MINIFIED
 * -------------------------
 * The HTML markup between the tags. It is 168 KB of static UI text; minifying
 * it risks breaking the inline `onclick` handlers and the `data-*` wiring and
 * buys little once the JS is compressed.
 *
 * Usage: node tools/minify_bundle.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { minify } from 'terser';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Terser options:
//   - compress: 2 passes, no `unsafe_*` transforms (the engine does maths on
//     canvas coordinates where a reassociation can shift a pixel).
//   - mangle: enabled, but `toplevel` is OFF because the engine deliberately
//     leaks globals (J, S, AudioVisualizerAPI, StemVisualizerAPI, ...) that the
//     other inline blocks and the test harness read by name.
//   - properties: OFF. The registry keys (layout/enter/...), the DOM ids and
//     the asset ids are all string-keyed public API.
//   - keep_fargs: ON. A couple of engine paths inspect `arguments.length`.
const TERSER_OPTS = {
  ecma: 2020,
  compress: {
    passes: 2,
    unsafe: false,
    keep_fargs: true,
  },
  mangle: {
    toplevel: false,
    properties: false,
  },
  format: {
    comments: /^!|sourceMappingURL|sourceURL/,
    semicolons: true,
  },
};

const SCRIPT_RE = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
const STYLE_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;

const isExternal = open => /\bsrc\s*=/.test(open);

/**
 * Conservative CSS minifier.
 *
 * Deliberately NOT a full CSS parser: the stylesheet uses `content: "..."`
 * strings and CSS custom properties, and a naive regex can corrupt them.
 * Only comments and redundant whitespace are removed.
 */
function minifyCss(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/;\}/g, '}')
    .trim();
}

// --- pass 1: collect the inline blocks ---------------------------------
const inlineScripts = [];
html.replace(SCRIPT_RE, (m, open, code) => {
  if (!code.trim() || isExternal(open)) return m;
  inlineScripts.push(code);
  return m;
});

// --- pass 2: minify them -----------------------------------------------
const minifiedScripts = [];
let jsIn = 0;
let jsOut = 0;
let failures = 0;

for (let i = 0; i < inlineScripts.length; i++) {
  const code = inlineScripts[i];
  jsIn += code.length;
  let min = code;
  try {
    const res = await minify(code, TERSER_OPTS);
    if (res.error) throw res.error;
    min = res.code;
  } catch (err) {
    failures++;
    console.warn(`  ! inline script #${i + 1} could not be minified (${err.message}) - kept verbatim`);
    min = code;
  }
  jsOut += min.length;
  minifiedScripts.push(min);
}

// --- pass 3: splice them back in order ---------------------------------
let scriptCursor = 0;
let result = html.replace(SCRIPT_RE, (m, open, code, close) => {
  if (!code.trim() || isExternal(open)) return m;
  return open + minifiedScripts[scriptCursor++] + close;
});

let cssIn = 0;
let cssOut = 0;
result = result.replace(STYLE_RE, (m, open, code, close) => {
  if (!code.trim()) return m;
  cssIn += code.length;
  const c = minifyCss(code);
  cssOut += c.length;
  return open + c + close;
});

// --- guards -------------------------------------------------------------
const finalScriptCount = (result.match(/<script\b/g) || []).length;
if (finalScriptCount !== 12) {
  throw new Error(`minified bundle must keep exactly 12 <script> tags, found ${finalScriptCount}`);
}

// The asset URLs must survive untouched: the service worker keys its cache on
// the `?v=` query. Only the URL attributes are checked - the string `?v=` also
// occurs inside the engine as a ternary operator (`cond ?v=x : y`), so a
// document-wide scan would produce false positives.
const assetUrls = src => [...src.matchAll(/(?:src|href)\s*=\s*["']([^"']*\?v=[^"']*)["']/g)].map(m => m[1]);
const origUrls = assetUrls(html);
const newUrls = assetUrls(result);
if (JSON.stringify(origUrls) !== JSON.stringify(newUrls)) {
  throw new Error('asset version query strings were modified - the service worker cache would break');
}
if (!origUrls.length) {
  throw new Error('no asset URLs with a ?v= query were found - the guard is not looking at the right thing');
}

// The inline blocks must stay in the same order and the same count.
if (scriptCursor !== inlineScripts.length) {
  throw new Error(`spliced ${scriptCursor} script blocks but collected ${inlineScripts.length}`);
}

const outPath = path.join(root, 'dist', 'index.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, result);

const rawIn = Buffer.byteLength(html);
const rawOut = Buffer.byteLength(result);
const gz = zlib.gzipSync(Buffer.from(result), { level: 9 }).length;

console.log(`inline scripts : ${inlineScripts.length} blocks, ${(jsIn / 1024).toFixed(1)} KB -> ${(jsOut / 1024).toFixed(1)} KB`);
console.log(`inline styles  : ${(cssIn / 1024).toFixed(1)} KB -> ${(cssOut / 1024).toFixed(1)} KB`);
console.log(`index.html     : ${(rawIn / 1024).toFixed(1)} KB -> ${(rawOut / 1024).toFixed(1)} KB (gzip ${(gz / 1024).toFixed(1)} KB)`);
if (failures) console.warn(`${failures} script block(s) kept verbatim`);
console.log(`wrote ${outPath}`);
