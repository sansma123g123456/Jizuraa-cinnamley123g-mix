/**
 * Progress reporter for long multi-phase builds.
 *
 * Sends a status update to the Muse device over Tailscale after every phase so
 * the user can follow along from their phone. Wraps `C:\cursor-notify\notify.ps1`
 * and never throws - a failed notification must never break the actual work.
 *
 * Usage:
 *   node tools/notify_progress.mjs running "Starting the thing"
 *   node tools/notify_progress.mjs progress "Phase 1 done"
 *   node tools/notify_progress.mjs done    "Everything finished"
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const NOTIFY_DIR = 'C:\\cursor-notify';
const state = process.argv[2] || 'progress';
const message = process.argv.slice(3).join(' ') || 'Cursor task';

if (!fs.existsSync(NOTIFY_DIR)) {
  console.log(`[notify] skipped (${NOTIFY_DIR} not found)`);
  process.exit(0);
}

const ps = spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', `${NOTIFY_DIR}\\notify.ps1`,
    state,
    message,
  ],
  { encoding: 'utf8', timeout: 20000 }
);

if (ps.status === 0) {
  console.log(`[notify:${state}] ${message}`);
} else {
  console.log(`[notify:${state}] FAILED (${ps.stderr || ps.stdout || 'unknown'}) - continuing anyway`);
}
process.exit(0);
