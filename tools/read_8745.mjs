import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');

for (let i = 8740; i < 8805; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
