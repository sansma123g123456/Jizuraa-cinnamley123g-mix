import fs from 'fs';
const index = fs.readFileSync('index.html', 'utf8');
const lines = index.split('\n');

const fxKeys = ['motion', 'glitch', 'chroma', 'decor', 'density', 'texture', 'bgSwitch'];
fxKeys.forEach(k => {
  console.log(`=== fx.${k} ===`);
  lines.forEach((line, idx) => {
    if (line.includes(`fx.${k}`) || line.includes(`fx[${k}]`) || line.includes(`fx['${k}']`)) {
      console.log('L' + (idx + 1) + ':', line.trim().substring(0, 110));
    }
  });
});
