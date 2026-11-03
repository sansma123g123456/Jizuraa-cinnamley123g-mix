import fs from 'fs';
const amv = fs.readFileSync('amv_asset_manager.js', 'utf8');
const lines = amv.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('500') || (line.includes('type="range"') || line.includes("type='range'"))) {
    console.log('amv L' + (idx + 1) + ':', line.trim().substring(0, 110));
  }
});
