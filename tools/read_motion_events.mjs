import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');
console.log('=== L8920 - L8960 ===');
for (let i = 8919; i < 8960; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
