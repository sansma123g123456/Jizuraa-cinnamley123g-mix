/**
 * Coverage summary for the JIZURA test suite.
 *
 * Node's built-in coverage reporter is experimental and its output format
 * changes between releases, so we run it in a child process and parse the
 * human-readable table instead of depending on the JSON schema.
 *
 * Usage:
 *   node tools/coverage_report.mjs            # print the summary
 *   node tools/coverage_report.mjs --json     # print machine-readable JSON
 *   node tools/coverage_report.mjs --threshold 50
 *
 * Exit code is non-zero when the total line coverage is below the threshold
 * (default: no threshold, the workflow decides).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const thresholdIdx = args.indexOf('--threshold');
const threshold = thresholdIdx !== -1 ? Number(args[thresholdIdx + 1]) : null;

const rootDir = process.cwd();
const testsDir = path.join(rootDir, 'tests');
if (!fs.existsSync(testsDir)) {
  console.error('tests/ directory not found - run from the repository root.');
  process.exit(2);
}

const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .map(f => path.join('tests', f));

if (!testFiles.length) {
  console.error('No test files found in tests/.');
  process.exit(2);
}

const nodeBin = process.execPath;
const res = spawnSync(
  nodeBin,
  [
    '--test',
    '--experimental-test-coverage',
    '--test-reporter=spec',
    ...testFiles,
  ],
  { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);

const output = `${res.stdout || ''}\n${res.stderr || ''}`;

// The coverage table looks like:
//   file      | line % | branch % | funcs % | uncovered lines
//   all files | 100.00 |   100.00 |  100.00 |
// The last column holds a list of ranges (e.g. "12-15, 20") or is empty, so
// the line is split on '|' and only the numeric columns are read.
// Node prefixes each row with the reporter glyph ("ℹ "), which must be
// stripped before the file name is compared.
const lines = output.split(/\r?\n/);

const files = [];
let total = null;

const NUM = /^\s*([\d.]+)\s*$/;
const GLYPH = /^[\u2139\u2714\u2716\u26a0\u2500-\u27bf\u00b7\s]+/;

for (const line of lines) {
  if (!line.includes('|')) continue;
  const cols = line.split('|');
  if (cols.length < 4) continue;

  const name = cols[0].replace(GLYPH, '').trim();
  if (!name) continue;

  const linePct = NUM.exec(cols[1]);
  const branchPct = NUM.exec(cols[2]);
  const funcPct = NUM.exec(cols[3]);
  if (!linePct || !branchPct || !funcPct) continue;

  const entry = {
    file: name,
    lines: Number(linePct[1]),
    branches: Number(branchPct[1]),
    functions: Number(funcPct[1]),
  };
  if (/^all files/i.test(entry.file)) {
    total = entry;
  } else {
    files.push(entry);
  }
}

if (!total) {
  console.error('Could not parse the coverage table from the test output.');
  console.error('--- raw tail ---');
  console.error(lines.slice(-40).join('\n'));
  process.exit(2);
}

// Keep only the project sources, not the node internals or the test files.
const projectFiles = files.filter(f =>
  !/^node:/.test(f.file) &&
  !/tests[\\/]/.test(f.file) &&
  !/node_modules/.test(f.file)
);

const payload = {
  total: total.lines,
  totalBranches: total.branches,
  totalFunctions: total.functions,
  threshold,
  files: projectFiles.sort((a, b) => a.lines - b.lines),
};

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log('');
  console.log('  Coverage summary (project sources only)');
  console.log('  ' + '-'.repeat(58));
  for (const f of projectFiles) {
    const bar = '█'.repeat(Math.round(f.lines / 5)).padEnd(20, '░');
    console.log(`  ${bar} ${String(f.lines).padStart(6)}%  ${f.file}`);
  }
  console.log('  ' + '-'.repeat(58));
  console.log(`  total lines     ${total.lines}%`);
  console.log(`  total branches  ${total.branches}%`);
  console.log(`  total functions ${total.functions}%`);
  console.log('');
}

if (threshold !== null && !Number.isNaN(threshold)) {
  if (total.lines < threshold) {
    console.error(`FAIL: line coverage ${total.lines}% is below the required ${threshold}%.`);
    process.exit(1);
  }
  console.log(`OK: line coverage ${total.lines}% meets the required ${threshold}%.`);
}
