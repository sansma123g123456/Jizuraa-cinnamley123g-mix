import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');

for (let i = 9260; i < 9300; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
