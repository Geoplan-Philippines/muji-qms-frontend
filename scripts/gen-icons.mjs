// Generates the PWA home-screen icons as PNGs — no external dependencies.
// MUJI-red field with a white "MUJI" wordmark, drawn from a 5x7 block font so
// the output is crisp at any size and recognizable on the tablet launcher.
//
//   node scripts/gen-icons.mjs
//
// Re-run after changing the brand red below; outputs land in public/icons/.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(OUT, { recursive: true });

// Brand red — keep in sync with --muji-red in src/index.css.
const RED = [0x79, 0x16, 0x1c];
const WHITE = [0xff, 0xff, 0xff];

// 5x7 block glyphs for the only letters we need.
const FONT = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
};
const WORD = "MUJI";
const GLYPH_W = 5;
const GLYPH_H = 7;
const GAP = 1; // columns between glyphs
const WORD_COLS = WORD.length * GLYPH_W + (WORD.length - 1) * GAP; // 23

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw scanlines, each prefixed with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// Minimal CRC32 for PNG chunks.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// Draw one icon. `safe` is the fraction of the icon the wordmark may occupy —
// smaller for maskable icons so the mark survives the launcher's circular crop.
function makeIcon(size, safe) {
  const rgba = Buffer.alloc(size * size * 4);
  // fill brand red, fully opaque
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = RED[0];
    rgba[i * 4 + 1] = RED[1];
    rgba[i * 4 + 2] = RED[2];
    rgba[i * 4 + 3] = 255;
  }
  // size each cell so the wordmark spans `safe` of the width
  const cell = Math.max(1, Math.floor((size * safe) / WORD_COLS));
  const wordW = WORD_COLS * cell;
  const wordH = GLYPH_H * cell;
  const x0 = Math.floor((size - wordW) / 2);
  const y0 = Math.floor((size - wordH) / 2);
  let penX = x0;
  for (const ch of WORD) {
    const glyph = FONT[ch];
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        if (glyph[gy][gx] !== "1") continue;
        const px0 = penX + gx * cell;
        const py0 = y0 + gy * cell;
        for (let dy = 0; dy < cell; dy++) {
          for (let dx = 0; dx < cell; dx++) {
            const idx = ((py0 + dy) * size + (px0 + dx)) * 4;
            rgba[idx] = WHITE[0];
            rgba[idx + 1] = WHITE[1];
            rgba[idx + 2] = WHITE[2];
            rgba[idx + 3] = 255;
          }
        }
      }
    }
    penX += GLYPH_W * cell + GAP * cell;
  }
  return encodePng(size, size, rgba);
}

const targets = [
  ["icon-192.png", 192, 0.66],
  ["icon-512.png", 512, 0.66],
  ["icon-maskable-512.png", 512, 0.5], // extra padding for the safe zone
  ["apple-touch-icon.png", 180, 0.66],
];
for (const [name, size, safe] of targets) {
  writeFileSync(join(OUT, name), makeIcon(size, safe));
  console.log("wrote", name, `(${size}x${size})`);
}
