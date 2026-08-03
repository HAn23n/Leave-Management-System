// One-off generator for placeholder PWA icons (no external image deps needed).
// Draws a simple red/white "calendar" mark on a solid red background.
// Regenerate with: node scripts/generate-pwa-icons.js
// Replace public/icons/*.png with real branded artwork before shipping to production.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const RED = [0xc8, 0x1e, 0x1e, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

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

  // Background
  fillRect(0, 0, size, size, RED);

  // White "document/calendar" card, centered, ~56% of the icon
  const cardW = Math.round(size * 0.56);
  const cardH = Math.round(size * 0.6);
  const cardX = Math.round((size - cardW) / 2);
  const cardY = Math.round((size - cardH) / 2);
  fillRect(cardX, cardY, cardW, cardH, WHITE);

  // Red header strip on the card
  const headerH = Math.round(cardH * 0.22);
  fillRect(cardX, cardY, cardW, headerH, RED);

  // A couple of red "rows" inside the card body to suggest a list/calendar
  const rowH = Math.round(cardH * 0.08);
  const rowGap = Math.round(cardH * 0.06);
  const rowW = Math.round(cardW * 0.6);
  const rowX = cardX + Math.round(cardW * 0.2);
  let rowY = cardY + headerH + rowGap;
  for (let i = 0; i < 2; i++) {
    fillRect(rowX, rowY, rowW, rowH, RED);
    rowY += rowH + rowGap;
  }

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
