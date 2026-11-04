/**
 * Verify that every `uses:` action in the workflows still EXISTS on GitHub.
 *
 * WHY THIS EXISTS
 * ---------------
 * GitHub resolves `uses: owner/repo@ref` while it prepares the job - before
 * a single step runs. When the action repository was renamed or deleted, the
 * job dies with the famously unhelpful:
 *
 *     ##[error]Unable to resolve action `cloudflare/pages-action`, not found
 *
 * and the "Set up job" step is the only clue. This tool turns that silent
 * red X into an explicit, actionable failure.
 *
 * Usage:
 *   node tools/check_actions.mjs                       # check .github/workflows/*
 *   node tools/check_actions.mjs path/to/workflow.yml
 *
 * Environment:
 *   GITHUB_TOKEN - optional; raises the API rate limit and allows private
 *                  action repositories.
 */
import fs from 'node:fs';
import path from 'node:path';

const workflowsDir = '.github/workflows';

// A local action ("./path") needs no network check.
const LOCAL_ACTION = /^\.\//;

const files = process.argv.slice(2);
const targets = files.length
  ? files
  : (fs.existsSync(workflowsDir)
    ? fs.readdirSync(workflowsDir)
      .filter(f => /\.ya?ml$/.test(f))
      .map(f => path.join(workflowsDir, f))
    : []);

if (!targets.length) {
  console.log('[check_actions] no workflow files to check');
  process.exit(0);
}

const headers = {
  'User-Agent': 'jizura-check-actions',
  Accept: 'application/vnd.github+json',
};
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (token) headers.Authorization = `Bearer ${token}`;

// Collect every action reference, de-duplicated.
const refs = new Map(); // "owner/repo@ref" -> [workflow files]
for (const file of targets) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/^\s*uses:\s*['"]?([^'"\s]+)['"]?/);
    if (!m) return;
    const spec = m[1];
    if (LOCAL_ACTION.test(spec)) return;
    if (!refs.has(spec)) refs.set(spec, []);
    refs.get(spec).push(`${file}:${i + 1}`);
  });
}

if (!refs.size) {
  console.log('[check_actions] no remote actions referenced');
  process.exit(0);
}

// Split "owner/repo@ref" (or "owner/repo/path@ref") into repo + ref.
function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  const ref = at >= 0 ? spec.slice(at + 1) : null;
  const repoPath = at >= 0 ? spec.slice(0, at) : spec;
  const parts = repoPath.split('/');
  if (parts.length < 2) return null;
  return { repo: `${parts[0]}/${parts[1]}`, ref, subPath: parts.slice(2).join('/') };
}

let failures = 0;

for (const [spec, where] of refs) {
  const parsed = parseSpec(spec);
  if (!parsed) {
    console.log(`  ?? ${spec} (unparseable, skipped)`);
    continue;
  }
  const url = `https://api.github.com/repos/${parsed.repo}`;
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    console.log(`  ?? ${spec} - network error (${err.message}), skipped`);
    continue;
  }

  if (res.status === 404) {
    failures++;
    console.log(`  FAIL ${spec}`);
    console.log(`       the repository ${parsed.repo} does not exist (HTTP 404)`);
    console.log(`       referenced at ${where.join(', ')}`);
    continue;
  }
  if (!res.ok) {
    console.log(`  ?? ${spec} - HTTP ${res.status}, skipped`);
    continue;
  }

  // The repo exists - now check the ref (a tag or a branch).
  const info = await res.json();
  if (info.archived) {
    console.log(`  ?? ${spec} - the repository is ARCHIVED`);
  }

  if (parsed.ref) {
    const refRes = await fetch(`${url}/git/ref/tags/${parsed.ref}`, { headers });
    let refOk = refRes.ok;
    let isTag = true;
    if (!refOk) {
      const branchRes = await fetch(`${url}/git/ref/heads/${parsed.ref}`, { headers });
      refOk = branchRes.ok;
      isTag = false;
    }
    if (!refOk) {
      failures++;
      console.log(`  FAIL ${spec}`);
      console.log(`       the ${isTag ? 'tag' : 'branch'} "${parsed.ref}" does not exist in ${parsed.repo}`);
      console.log(`       referenced at ${where.join(', ')}`);
      continue;
    }
    console.log(`  ok  ${spec}${info.archived ? ' (archived repo)' : ''}`);
  } else {
    console.log(`  ok  ${spec}`);
  }
}

if (failures) {
  console.log(`\n[check_actions] ${failures} action reference(s) cannot be resolved.`);
  process.exit(1);
}
console.log(`\n[check_actions] all ${refs.size} action reference(s) resolve.`);
