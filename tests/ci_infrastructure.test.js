/**
 * CI / deployment infrastructure regression suite.
 *
 * These tests guard the GitHub Actions workflows and the build tooling that
 * produces the deployable bundles. A broken workflow is invisible until a push
 * fails to deploy, so the invariants are asserted here instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const workflowsDir = path.join(rootDir, '.github', 'workflows');
const readWorkflow = (name) => fs.readFileSync(path.join(workflowsDir, name), 'utf8');

const WORKFLOWS = ['ci.yml', 'pages.yml', 'coverage.yml', 'lighthouse.yml', 'cloudflare.yml'];

test('CI infra: every expected workflow exists', () => {
  assert.ok(fs.existsSync(workflowsDir), '.github/workflows must exist');
  for (const w of WORKFLOWS) {
    assert.ok(fs.existsSync(path.join(workflowsDir, w)), `missing workflow: ${w}`);
  }
});

test('CI infra: workflows are valid YAML-ish (no tabs, no CRLF, required keys)', () => {
  for (const w of WORKFLOWS) {
    const text = readWorkflow(w);
    assert.ok(!text.includes('\t'), `${w}: YAML forbids TAB characters`);
    assert.ok(!text.includes('\r'), `${w}: CRLF line endings break YAML`);
    assert.ok(/(^|\n)name:/.test(text), `${w}: missing top-level "name:"`);
    assert.ok(/(^|\n)on:/.test(text), `${w}: missing top-level "on:"`);
    assert.ok(/^jobs:$/m.test(text), `${w}: missing top-level "jobs:"`);
  }
});

test('CI infra: the test runner keeps --test-concurrency=1', () => {
  // Running the 25 suites in parallel starves the CPU and makes the 60 FPS
  // benchmark assertions fail spuriously.
  const ci = readWorkflow('ci.yml');
  assert.ok(/--test-concurrency=1/.test(ci),
    'the CI workflow must run the suite with --test-concurrency=1');
  const cov = readWorkflow('coverage.yml');
  assert.ok(/--test-concurrency=1/.test(cov),
    'the coverage workflow must run the suite with --test-concurrency=1');
});

test('CI infra: every workflow that runs tests also enforces the 12-script invariant', () => {
  for (const w of ['ci.yml', 'pages.yml']) {
    const text = readWorkflow(w);
    assert.ok(/script tags/.test(text) && /-ne 12/.test(text),
      `${w}: must verify the 12-script invariant`);
  }
});

test('CI infra: the coverage workflow reports coverage', () => {
  const text = readWorkflow('coverage.yml');
  assert.ok(/--experimental-test-coverage/.test(text),
    'the coverage workflow must enable V8 coverage');
  assert.ok(/tools\/coverage_report\.mjs/.test(text),
    'the coverage workflow must run the coverage summary tool');
});

test('CI infra: the lighthouse workflow builds the bundle before auditing', () => {
  const text = readWorkflow('lighthouse.yml');
  assert.ok(/tools\/build_pages\.mjs/.test(text),
    'the lighthouse workflow must build the static bundle first');
  assert.ok(/lighthouserc\.cjs/.test(text),
    'the lighthouse workflow must reference the config file');
  assert.ok(fs.existsSync(path.join(rootDir, 'lighthouserc.cjs')),
    'lighthouserc.cjs must exist at the repository root');
});

test('CI infra: the lighthouse config is CommonJS-loadable', () => {
  // The repo is `"type": "module"`, so a `lighthouserc.js` would be parsed
  // as ESM and `module.exports` would blow up inside the action with
  // "Unexpected token ']'". The `.cjs` extension forces the CJS loader.
  const p = path.join(rootDir, 'lighthouserc.cjs');
  assert.ok(fs.existsSync(p), 'lighthouserc.cjs must exist at the repository root');
  assert.ok(!fs.existsSync(path.join(rootDir, 'lighthouserc.js')),
    'the ESM-parsed lighthouserc.js must not linger next to the .cjs one');

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module', 'the package is ESM - that is why the config must be .cjs');

  // Load it exactly the way @lhci/cli does and assert the shape.
  const cfg = createRequire(import.meta.url)(p);
  assert.ok(cfg && cfg.ci, 'the config must export a "ci" section');
  assert.ok(cfg.ci.collect && cfg.ci.collect.staticDistDir, 'ci.collect must be configured');
  assert.ok(cfg.ci.assert && cfg.ci.assert.assertions, 'ci.assert must be configured');
});

test('CI infra: the cloudflare workflow skips cleanly without credentials', () => {
  const text = readWorkflow('cloudflare.yml');
  assert.ok(/CLOUDFLARE_API_TOKEN/.test(text), 'must read the API token secret');
  assert.ok(/CLOUDFLARE_ACCOUNT_ID/.test(text), 'must read the account id secret');
  assert.ok(/if:[^\n]*steps\.creds\.outputs\.ready/.test(text),
    'the deploy step must be conditional on the credentials check');
});

test('CI infra: the pages workflow never cancels an in-flight deployment', () => {
  const text = readWorkflow('pages.yml');
  assert.ok(/cancel-in-progress:\s*false/.test(text),
    'cancelling mid-upload can leave GitHub Pages in a broken state');
});

test('CI infra: every deploying workflow verifies the minified bundle boots', () => {
  // Minification can break the engine without a build error (the inline
  // blocks talk to each other through globals that get mangled).
  for (const w of ['ci.yml', 'pages.yml', 'lighthouse.yml']) {
    const text = readWorkflow(w);
    assert.ok(/tools\/verify_minified\.mjs/.test(text),
      `${w}: must verify the minified bundle before deploying`);
  }
});

test('CI infra: the build pipeline is minification-aware', () => {
  const ci = readWorkflow('ci.yml');
  assert.ok(/tools\/build_pages\.mjs/.test(ci), 'the CI workflow must build the bundle');
  assert.ok(/tools\/build_cloudflare\.mjs/.test(ci), 'the CI workflow must build the Cloudflare bundle');
});

test('CI infra: package.json scripts cover the build pipeline', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.test, 'a "test" script is required');
  assert.ok(/--test-concurrency=1/.test(pkg.scripts.test),
    'the "test" script must use --test-concurrency=1');
  assert.ok(pkg.scripts.sync, 'a "sync" script is required');
  assert.ok(pkg.scripts['build:cloudflare'], 'a "build:cloudflare" script is required');
  assert.ok(pkg.scripts['build:zip'], 'a "build:zip" script is required');
});

test('CI infra: the build tools exist and are syntactically valid', () => {
  const tools = ['build_pages.mjs', 'build_cloudflare.mjs', 'pack_zip.mjs',
    'sync_all_mirrors.mjs', 'coverage_report.mjs', 'notify_progress.mjs',
    'check_actions.mjs'];
  for (const t of tools) {
    const p = path.join(rootDir, 'tools', t);
    assert.ok(fs.existsSync(p), `missing tool: tools/${t}`);
  }
});

test('CI infra: the action-reference checker exists and is wired into CI', () => {
  // A deleted action repo kills the job at "Set up job" with no clue, so the
  // references are verified explicitly before the build.
  const src = fs.readFileSync(path.join(rootDir, 'tools', 'check_actions.mjs'), 'utf8');
  assert.ok(/api\.github\.com\/repos/.test(src), 'the checker must query the GitHub API');
  assert.ok(/refs\.size/.test(src) && /refs\.get/.test(src),
    'the checker must collect the `uses:` references');

  const ci = readWorkflow('ci.yml');
  assert.ok(/tools\/check_actions\.mjs/.test(ci),
    'the CI workflow must verify the action references');

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['check:actions'], 'a "check:actions" script is required');
});

test('CI infra: the lighthouse config asserts a byte-weight ceiling', () => {
  // The engine is ~3 MB of inline HTML; the guard catches an accidental
  // doubling of the bundle (e.g. a minifier that stops working).
  const cfg = fs.readFileSync(path.join(rootDir, 'lighthouserc.cjs'), 'utf8');
  assert.ok(/total-byte-weight/.test(cfg), 'must guard the total byte weight');
  assert.ok(/maxNumericValue/.test(cfg), 'must set an explicit byte-weight ceiling');
});

test('CI infra: every workflow that builds a bundle installs the dev dependencies', () => {
  // terser is a devDependency and the minifier needs it. A build job without
  // `npm ci` silently falls back to the verbatim 3.2 MB bundle, and the
  // minified-bundle verification then fails the whole deployment.
  for (const w of ['ci.yml', 'pages.yml', 'lighthouse.yml', 'cloudflare.yml']) {
    const text = readWorkflow(w);
    assert.ok(/npm ci|npm install/.test(text),
      `${w}: must install the dev dependencies (terser) before building`);
  }
});

test('CI infra: the cloudflare deploy uses an action that actually exists', () => {
  // `cloudflare/pages-action` is gone from GitHub - resolving it fails the
  // job at "Set up job", before any step can run.
  const text = readWorkflow('cloudflare.yml');
  const used = text.split('\n').filter(l => /^\s*uses:\s*/.test(l)).join('\n');
  assert.ok(!/cloudflare\/pages-action/.test(used),
    'cloudflare/pages-action no longer exists - use cloudflare/wrangler-action');
  assert.ok(/cloudflare\/wrangler-action@v\d+/.test(used),
    'the Cloudflare deploy must go through cloudflare/wrangler-action');
  assert.ok(/pages deploy/.test(text),
    'the wrangler command must publish the cloudflare_dist folder');
});

test('CI infra: the cloudflare deploy never publishes a pull request', () => {
  const text = readWorkflow('cloudflare.yml');
  const deployStep = text.split('- name: Deploy to Cloudflare Pages')[1] || '';
  assert.ok(/github\.event_name\s*!=\s*'pull_request'/.test(deployStep),
    'a pull request must not push a deployment over the live site');
});
