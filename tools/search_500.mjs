import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('500') || line.includes('500%') || line.includes('max="500"') || line.includes("max='500'")) {
    console.log('L' + (idx + 1) + ':', line.trim().substring(0, 120));
  }
});
