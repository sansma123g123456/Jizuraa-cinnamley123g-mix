import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// 1. Sync amv_asset_manager.js
const amv = fs.readFileSync('amv_asset_manager.js');
const amvMirrors = [
  'src/amv_asset_manager.js',
  'JIZURA CIN MIX/amv_asset_manager.js',
  'JIZURA CIN MIX/src/amv_asset_manager.js',
  'public/amv_asset_manager.js',
  'public/src/amv_asset_manager.js',
  'cloudflare_dist/amv_asset_manager.js',
  'cloudflare_dist/src/amv_asset_manager.js'
];
amvMirrors.forEach(m => {
  const dir = path.dirname(m);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(m, amv);
  console.log(`Synced ${m}`);
});

// 2. Sync index.html
const idx = fs.readFileSync('index.html');
const idxMirrors = [
  'JIZURA CIN MIX/index.html',
  'public/index.html',
  'cloudflare_dist/index.html'
];
idxMirrors.forEach(m => {
  const dir = path.dirname(m);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(m, idx);
  console.log(`Synced ${m}`);
});

// 2.5 Sync amv_asset_library.js
const lib = fs.readFileSync('amv_asset_library.js');
const libMirrors = [
  'JIZURA CIN MIX/amv_asset_library.js',
  'public/amv_asset_library.js',
  'cloudflare_dist/amv_asset_library.js'
];
libMirrors.forEach(m => {
  const dir = path.dirname(m);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(m, lib);
  console.log(`Synced ${m}`);
});

// 2.6 Sync PWA shell assets (service worker, manifest, icons)
// public/ and cloudflare_dist/ were serving a stale sw.js (cache v4.0) and an old
// manifest.json, which made deployed builds ship the wrong PWA identity + SW cache.
const shellAssets = [
  'sw.js',
  'manifest.json',
  'icon.png',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];
shellAssets.forEach(f => {
  if (!fs.existsSync(f)) {
    console.warn(`SKIP ${f} (not found at root)`);
    return;
  }
  const data = fs.readFileSync(f);
  ['public', 'cloudflare_dist', 'JIZURA CIN MIX'].forEach(root => {
    const target = path.join(root, f);
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, data);
    console.log(`Synced ${target}`);
  });
});

// 3. Verify SHA256 parity across all amv_asset_manager mirrors
const hashes = amvMirrors.map(m => crypto.createHash('sha256').update(fs.readFileSync(m)).digest('hex'));
const allMatch = hashes.every(h => h === hashes[0]);
console.log('All AMV mirrors SHA256 match:', allMatch, hashes[0]);
if (!allMatch) throw new Error('AMV mirrors SHA256 mismatch!');

// 4. Verify shell-asset parity (sw.js / manifest.json / icons) across every mirror
const shellMirrors = shellAssets.flatMap(f => ['public', 'cloudflare_dist', 'JIZURA CIN MIX'].map(root => path.join(root, f)));
const shellMismatch = shellMirrors.filter(m => {
  if (!fs.existsSync(m)) return true;
  return crypto.createHash('sha256').update(fs.readFileSync(m)).digest('hex')
      !== crypto.createHash('sha256').update(fs.readFileSync(path.basename(m))).digest('hex');
});
console.log('Shell asset parity (sw/manifest/icons):', shellMismatch.length === 0 ? 'MATCH' : shellMismatch);
if (shellMismatch.length) throw new Error('Shell asset parity mismatch: ' + shellMismatch.join(', '));
