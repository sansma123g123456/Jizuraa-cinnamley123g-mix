import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');
console.log('=== L47610 - L47650 ===');
for (let i = 47609; i < 47650; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
