import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');

for (let i = 7120; i < 7180; i++) {
  console.log((i+1) + ': ' + lines[i]);
}
