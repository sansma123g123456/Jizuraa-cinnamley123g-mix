import fs from 'fs';
import path from 'path';
import os from 'os';

const desktop = path.join(os.homedir(), 'Desktop');
const gdrive = 'G:/My Drive';

// 1. cloudflare_dist.zip
fs.copyFileSync('cloudflare_dist.zip', path.join(desktop, 'cloudflare_dist.zip'));
console.log('Copied cloudflare_dist.zip -> Desktop');
if (fs.existsSync(gdrive)) {
  fs.copyFileSync('cloudflare_dist.zip', path.join(gdrive, 'cloudflare_dist.zip'));
  console.log('Copied cloudflare_dist.zip -> GDrive');
}

// 2. JIZURA-CIN-MIX.zip
if (fs.existsSync(gdrive)) {
  fs.copyFileSync('JIZURA-CIN-MIX.zip', path.join(gdrive, 'JIZURA-CIN-MIX.zip'));
  console.log('Copied JIZURA-CIN-MIX.zip -> GDrive');
}
fs.copyFileSync('JIZURA-CIN-MIX.zip', path.join(desktop, 'JIZURA CIN MIX.zip'));
console.log('Copied JIZURA CIN MIX.zip -> Desktop');

// 3. Sync JIZURA CIN MIX folder on Desktop and GDrive
function syncFolder(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of entries) {
    const sPath = path.join(src, ent.name);
    const dPath = path.join(dst, ent.name);
    if (ent.isDirectory()) {
      syncFolder(sPath, dPath);
    } else {
      fs.copyFileSync(sPath, dPath);
    }
  }
}

syncFolder('JIZURA CIN MIX', path.join(desktop, 'JIZURA CIN MIX'));
console.log('Synced JIZURA CIN MIX folder -> Desktop');
if (fs.existsSync(gdrive)) {
  syncFolder('JIZURA CIN MIX', path.join(gdrive, 'JIZURA CIN MIX'));
  console.log('Synced JIZURA CIN MIX folder -> GDrive');
}
