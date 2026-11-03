import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');
console.log('=== L9750 - L9810 ===');
for (let i = 9749; i < 9810; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
