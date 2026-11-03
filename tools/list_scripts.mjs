import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 1;
while ((m = scriptRegex.exec(html)) !== null) {
  const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
  const src = openTag.match(/src=["']([^"']+)["']/);
  console.log(`${i}: ${src ? src[1] : 'INLINE (' + m[1].length + ' chars)'}`);
  i++;
}
