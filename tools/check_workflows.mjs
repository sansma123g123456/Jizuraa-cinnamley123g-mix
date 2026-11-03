// Minimal YAML sanity check for the GitHub Actions workflows (no deps).
import fs from 'node:fs';

const files = process.argv.slice(2);
let bad = 0;

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  const issues = [];

  if (text.includes('\t')) issues.push('contains a TAB character (YAML forbids tabs)');
  if (text.includes('\r')) issues.push('contains CRLF line endings');
  if (!/(^|\n)name:/.test(text)) issues.push('missing top-level "name:"');
  if (!/(^|\n)on:/.test(text)) issues.push('missing top-level "on:"');
  if (!/^jobs:$/m.test(text)) issues.push('missing top-level "jobs:"');

  // Every "run:" block must be a valid shell-ish string; check indentation is even.
  lines.forEach((l, i) => {
    const m = l.match(/^(\s*)run:/);
    if (m && m[1].length % 2 !== 0) issues.push(`line ${i + 1}: odd indentation on "run:"`);
  });

  // Block scalars must be indented more than their key.
  lines.forEach((l, i) => {
    const m = l.match(/^(\s*)(run|name):\s*\|\s*$/);
    if (m) {
      const keyIndent = m[1].length;
      let j = i + 1;
      let bodyIndent = null;
      while (j < lines.length) {
        const bl = lines[j];
        if (bl.trim() === '') { j++; continue; }
        const ind = bl.match(/^\s*/)[0].length;
        if (ind <= keyIndent) break;
        if (bodyIndent === null) bodyIndent = ind;
        j++;
      }
      if (bodyIndent === null) issues.push(`line ${i + 1}: empty block scalar`);
      else if (bodyIndent <= keyIndent) issues.push(`line ${i + 1}: block scalar not indented`);
    }
  });

  if (issues.length) {
    bad++;
    console.log(`${f}: ${issues.length} issue(s)`);
    issues.forEach(i => console.log(`  - ${i}`));
  } else {
    console.log(`${f}: OK (${lines.length} lines)`);
  }
}

process.exit(bad ? 1 : 0);
