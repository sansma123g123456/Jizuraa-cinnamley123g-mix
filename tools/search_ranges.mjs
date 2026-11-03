import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('type="range"') || line.includes("type='range'")) {
    console.log('L' + (idx + 1) + ':', line.trim().substring(0, 120));
  }
});
