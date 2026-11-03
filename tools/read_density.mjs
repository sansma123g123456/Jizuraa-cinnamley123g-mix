import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');
console.log('=== L8695 - L8725 ===');
for (let i = 8694; i < 8725; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
