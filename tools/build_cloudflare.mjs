import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const distDir = path.resolve('cloudflare_dist');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'src'), { recursive: true });

// Pure static assets for Cloudflare Direct Uploader (No build step, no wrangler config)
const files = [
  'index.html',
  'webm-muxer.min.js',
  'amv_asset_library.js',
  'amv_asset_manager.js',
  'sw.js',
  'manifest.json',
  'icon.png',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    fs.copyFileSync(f, path.join(distDir, f));
    console.log(`Copied ${f} -> cloudflare_dist/${f}`);
  }
});

// Mirror src/amv_asset_manager.js
if (fs.existsSync('src/amv_asset_manager.js')) {
  fs.copyFileSync('src/amv_asset_manager.js', path.join(distDir, 'src', 'amv_asset_manager.js'));
  console.log('Copied src/amv_asset_manager.js -> cloudflare_dist/src/amv_asset_manager.js');
}

// Add Cloudflare _headers file for peak WebCodecs / AudioContext performance
const headersContent = `/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
`;
fs.writeFileSync(path.join(distDir, '_headers'), headersContent, 'utf8');
console.log('Created cloudflare_dist/_headers');

console.log('Cloudflare distribution folder ready!');

// -------------------------------------------------------------
// Pack cloudflare_dist.zip with strictly POSIX forward slashes '/'
// -------------------------------------------------------------
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) {
    c ^= u8[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function packZip(srcDir, outZip) {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  // Guarantee POSIX forward slashes regardless of OS
  const allFiles = walk(srcDir).map(p => path.relative(srcDir, p).split(path.sep).join('/')).sort();

  const chunks = [];
  const central = [];
  let offset = 0;
  const dosTime = 0, dosDate = 0x5921;

  for (const name of allFiles) {
    if (name.includes('\\')) {
      throw new Error(`CRITICAL: Zip entry path must not contain backslashes: "${name}"`);
    }
    const fullPath = path.join(srcDir, ...name.split('/'));
    const data = fs.readFileSync(fullPath);
    const comp = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = comp.length < data.length;
    const body = useDeflate ? comp : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0o644 << 16, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(allFiles.length, 8);
  eocd.writeUInt16LE(allFiles.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(outZip, Buffer.concat([...chunks, cd, eocd]));
  console.log('Successfully wrote ' + outZip + ' with ' + allFiles.length + ' files, ' + fs.statSync(outZip).size + ' bytes');
}

packZip('cloudflare_dist', 'cloudflare_dist.zip');
