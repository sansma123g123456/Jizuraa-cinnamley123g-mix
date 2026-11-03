import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to construct a minimal multi-frame GIF binary buffer
function createTestGifBytes(numFrames = 3, delays = [10, 15, 20]) {
  // Use a clean 2x2 GIF with 4 pixels per frame
  const header = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x02, 0x00, 0x02, 0x00, // 2 x 2
    0x91, // GCT flag: 2 bits per pixel, 4 colors
    0x00, // Background color index: 0
    0x00, // Pixel aspect ratio: 0
    // GCT (4 x 3 bytes): Red, Green, Blue, Black
    0xFF, 0x00, 0x00,
    0x00, 0xFF, 0x00,
    0x00, 0x00, 0xFF,
    0x00, 0x00, 0x00
  ];

  const framesData = [];
  for (let f = 0; f < numFrames; f++) {
    const delay = delays[f] || 10;
    // Graphic Control Extension (disposal 2: restore to background)
    framesData.push(
      0x21, 0xF9, 0x04,
      0x08, // disposal = 2
      delay & 0xFF, (delay >> 8) & 0xFF,
      0x00, // transparent index (none)
      0x00  // block terminator
    );
    // Image Descriptor (2x2 at 0,0)
    framesData.push(
      0x2C,
      0x00, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x02, 0x00,
      0x00 // No local color table
    );
    // LZW stream for 4 pixels of color f % 3 with minCodeSize 2
    const lzwBytes = encodeSimpleLZW(4, f % 3, 2);
    framesData.push(...lzwBytes);
  }
  // Trailer
  framesData.push(0x3B);

  return new Uint8Array([...header, ...framesData]);
}

// Simple LZW encoder for uniform color image
function encodeSimpleLZW(count, colorIndex, minCodeSize) {
  const clearCode = 1 << minCodeSize; // 4
  const endCode = clearCode + 1;      // 5
  let codeSize = minCodeSize + 1;     // 3

  // Bit writer
  const bits = [];
  function writeBits(val, numBits) {
    for (let b = 0; b < numBits; b++) {
      bits.push((val >> b) & 1);
    }
  }

  writeBits(clearCode, codeSize);
  for (let i = 0; i < count; i++) {
    writeBits(colorIndex, codeSize);
  }
  writeBits(endCode, codeSize);

  // Convert bits to bytes
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      if (i + b < bits.length && bits[i + b]) {
        byte |= (1 << b);
      }
    }
    bytes.push(byte);
  }

  // Pack into sub-blocks (max 255 bytes each)
  const result = [minCodeSize];
  for (let i = 0; i < bytes.length; i += 254) {
    const chunk = bytes.slice(i, i + 254);
    result.push(chunk.length, ...chunk);
  }
  result.push(0); // Terminator
  return result;
}

test('GIF Animation — Invariant: Exactly 12 script tags in index.html', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const count = (html.match(/<script\b/gi) || []).length;
  assert.equal(count, 12, `index.html must maintain strictly 12 script tags, but found ${count}`);
});

test('GIF Animation — GifReader and GIF decoder runtime exist in index.html', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes('function GifReader('), 'GifReader function must be present');
  assert.ok(html.includes('function decodeGifFrames('), 'decodeGifFrames helper must be present');
  assert.ok(html.includes('function getGifFrameAtTime('), 'getGifFrameAtTime helper must be present');
  assert.ok(html.includes("curChar.type = 'gif'"), 'curChar.type = "gif" assignment must exist');
});

test('GIF Animation — decodeGifFrames correctly parses multi-frame GIF with durations', () => {
  // Extract decodeGifFrames and GifReader from index.html
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const startIdx = html.indexOf('function GifReader(');
  const endIdx = html.indexOf('window.base64ToUint8Array = base64ToUint8Array;');
  assert.ok(startIdx > 0 && endIdx > startIdx, 'Must locate GIF runtime code in index.html');

  const gifCode = html.slice(startIdx, endIdx + 'window.base64ToUint8Array = base64ToUint8Array;'.length);

  // Mock DOM canvas
  function createMockCanvas(w, h) {
    return {
      width: w,
      height: h,
      getContext: () => ({
        createImageData: (cw, ch) => ({ data: new Uint8ClampedArray(cw * ch * 4) }),
        putImageData: () => {},
        drawImage: () => {},
        clearRect: () => {},
        getImageData: (x, y, cw, ch) => ({ data: new Uint8ClampedArray(cw * ch * 4) }),
      })
    };
  }

  const mockWindow = {};
  const mockDoc = { createElement: (tag) => createMockCanvas(10, 10) };

  const fn = new Function('window', 'document', gifCode + '\nreturn window.decodeGifFrames;');
  const decodeGif = fn(mockWindow, mockDoc);

  const testGif = createTestGifBytes(3, [10, 15, 20]);
  const origLog = console.log;
  console.log = () => {};
  let decoded;
  try {
    decoded = decodeGif(testGif);
  } finally {
    console.log = origLog;
  }

  assert.ok(decoded, 'decodeGifFrames must return valid decoded object');
  assert.equal(decoded.numFrames, 3, 'Must have 3 frames');
  assert.equal(decoded.width, 2, 'Width must be 2');
  assert.equal(decoded.height, 2, 'Height must be 2');
  assert.ok(Math.abs(decoded.totalDuration - 0.45) < 1e-4, 'Total duration must be 0.45s (100ms + 150ms + 200ms)');

  assert.equal(decoded.frames.length, 3);
  assert.equal(decoded.frames[0].index, 0);
  assert.equal(decoded.frames[0].duration, 0.1);
  assert.equal(decoded.frames[1].index, 1);
  assert.equal(decoded.frames[1].duration, 0.15);
  assert.equal(decoded.frames[2].index, 2);
  assert.equal(decoded.frames[2].duration, 0.2);
});

test('GIF Animation — getGifFrameAtTime accurately maps timestamps and loops', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const startIdx = html.indexOf('function getGifFrameAtTime(');
  const endIdx = html.indexOf('function decodeGifFrames(');
  const code = html.slice(startIdx, endIdx);

  const fn = new Function(code + '\nreturn getGifFrameAtTime;');
  const getGifFrame = fn();

  const mockGif = {
    totalDuration: 0.45,
    frames: [
      { index: 0, start: 0, end: 0.1, duration: 0.1 },
      { index: 1, start: 0.1, end: 0.25, duration: 0.15 },
      { index: 2, start: 0.25, end: 0.45, duration: 0.2 }
    ]
  };

  // Direct hit inside frames
  assert.equal(getGifFrame(mockGif, 0.0).index, 0);
  assert.equal(getGifFrame(mockGif, 0.05).index, 0);
  assert.equal(getGifFrame(mockGif, 0.10).index, 1);
  assert.equal(getGifFrame(mockGif, 0.20).index, 1);
  assert.equal(getGifFrame(mockGif, 0.25).index, 2);
  assert.equal(getGifFrame(mockGif, 0.40).index, 2);

  // Looping behavior
  assert.equal(getGifFrame(mockGif, 0.45).index, 0, 'At exact duration, loops back to frame 0');
  assert.equal(getGifFrame(mockGif, 0.50).index, 0, '0.50 % 0.45 = 0.05 -> frame 0');
  assert.equal(getGifFrame(mockGif, 0.60).index, 1, '0.60 % 0.45 = 0.15 -> frame 1');
  assert.equal(getGifFrame(mockGif, 0.75).index, 2, '0.75 % 0.45 = 0.30 -> frame 2');
  assert.equal(getGifFrame(mockGif, 1.20).index, 2, '1.20 % 0.45 = 0.30 -> frame 2');
});

test('GIF Animation — tick(now) contains live preview ticker when paused', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes("m.character.type === 'gif'"), 'tick must check for character.type === "gif"');
  assert.ok(html.includes("m.character2.type === 'gif'"), 'tick must check for character2.type === "gif"');
  assert.ok(html.includes("m.background.type === 'gif'"), 'tick must check for background.type === "gif"');
});

test('GIF Animation — syncMediaUI displays frame count badge for GIF character', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(html.includes("'🎞️ GIF (' + curChar.gif.numFrames + ' frames)'"), 'Badge must display frame count for GIF');
});
