// Generator for the PWA/app icons, matching public/logo.svg (the same red/pink
// "calendar with a checkmark" mark, minus the SVG's rounded corners/gradient
// curve which aren't worth hand-rolling in raw pixel-pushing PNG code).
// Regenerate with: node scripts/generate-pwa-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const RED = [0xe2, 0x17, 0x2b, 0xff];
const RED_PINK = [0xf5, 0x3d, 0x7a, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function bgColor(x, y, size) {
  const t = (x + y) / (2 * size); // top-left -> bottom-right diagonal, like the SVG gradient
  return [lerp(RED[0], RED_PINK[0], t), lerp(RED[1], RED_PINK[1], t), lerp(RED[2], RED_PINK[2], t), 0xff];
}

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
    pixels[i + 3] = color[3];
  };
  const fillRect = (x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, color);
  };
  // fraction-of-size coordinates, matching public/logo.svg's 64-unit grid
  const f = (n) => Math.round(n * size);
  const fillRectF = (x0, y0, w, h, color) => fillRect(f(x0), f(y0), f(w), f(h), color);

  // Diagonal red -> pink gradient background, same direction as the SVG
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, bgColor(x, y, size));

  // Two "ring binder" tabs poking above the card
  fillRectF(22 / 64, 11 / 64, 4 / 64, 10 / 64, WHITE);
  fillRectF(38 / 64, 11 / 64, 4 / 64, 10 / 64, WHITE);

  // White calendar card + its red header band
  fillRectF(14 / 64, 17 / 64, 36 / 64, 33 / 64, WHITE);
  fillRectF(14 / 64, 17 / 64, 36 / 64, 11 / 64, RED);

  // Checkmark, stamped as thick dots along the two segments
  const thickness = Math.max(2, Math.round(size * 0.05));
  const stampLine = (x0, y0, x1, y1) => {
    const steps = Math.max(Math.abs(f(x1) - f(x0)), Math.abs(f(y1) - f(y0)));
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const cx = f(x0) + (f(x1) - f(x0)) * t;
      const cy = f(y0) + (f(y1) - f(y0)) * t;
      fillRect(Math.round(cx - thickness / 2), Math.round(cy - thickness / 2), thickness, thickness, RED);
    }
  };
  stampLine(22.5 / 64, 34.5 / 64, 29 / 64, 41 / 64);
  stampLine(29 / 64, 41 / 64, 42 / 64, 28 / 64);

  return pixels;
}

function encodePng(size) {
  const pixels = drawIcon(size);
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = rowStart + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

for (const { name, size } of [
  { name: "icon-192.png", size: 192 },
  { name: "icon-192-maskable.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-512-maskable.png", size: 512 },
]) {
  fs.writeFileSync(path.join(outDir, name), encodePng(size));
  console.log(`Wrote public/icons/${name}`);
}
