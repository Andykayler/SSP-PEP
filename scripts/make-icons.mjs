// scripts/make-icons.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Draws the app icons (a mortarboard on the brand blue) into public/icons/.
//
// Written without an image library on purpose: the repo has no image tooling,
// and a PNG is a small enough format (a signature, three chunk types, zlib) that
// a dependency would be heavier than the code. Edges are anti-aliased by
// supersampling. Re-run it if the design changes:
//
//     node scripts/make-icons.mjs
//
// Sizes: 192 and 512 (installability), 512 "maskable" (Android crops these to a
// shape, so the artwork sits inside the central safe zone), 180 (iOS home
// screen).
// ─────────────────────────────────────────────────────────────────────────────
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/icons/", import.meta.url);
mkdirSync(OUT, { recursive: true });

// ── PNG encoding ─────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;                                   // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;                                        // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── The artwork, in unit coordinates (0..1) ──────────────────────────────────
const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const BOARD = [[0.5, 0.27], [0.88, 0.45], [0.5, 0.63], [0.12, 0.45]];
const CAP = [[0.29, 0.55], [0.5, 0.65], [0.71, 0.55], [0.71, 0.70], [0.5, 0.80], [0.29, 0.70]];
const TASSEL = [[0.855, 0.46], [0.885, 0.46], [0.885, 0.68], [0.855, 0.68]];

/** Colour of the icon at (x, y): transparent, background blue, or white. */
function sample(x, y, { rounded, scale }) {
  // Pull the artwork toward the centre for the maskable icon's safe zone.
  const ax = (x - 0.5) / scale + 0.5;
  const ay = (y - 0.5) / scale + 0.5;

  if (rounded) {                                                    // rounded-square background
    const r = 0.22;
    const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
    const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
    if (dx * dx + dy * dy > r * r) return [0, 0, 0, 0];
  }

  if (inPoly(ax, ay, BOARD) || inPoly(ax, ay, CAP) || inPoly(ax, ay, TASSEL)) return [255, 255, 255, 255];

  // Brand blue with a soft diagonal gradient (#4f6ef7 → #3b56d9).
  const t = (x + y) / 2;
  return [Math.round(79 - 20 * t), Math.round(110 - 24 * t), Math.round(247 - 30 * t), 255];
}

function render(size, opts) {
  const SS = 4;                                                     // 4×4 supersampling
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, opts);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const o = (py * size + px) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = a / (SS * SS);
    }
  }
  return png(size, out);
}

const targets = [
  ["icon-192.png", 192, { rounded: true, scale: 1 }],
  ["icon-512.png", 512, { rounded: true, scale: 1 }],
  ["maskable-512.png", 512, { rounded: false, scale: 0.72 }],       // full-bleed; art inside the safe zone
  ["apple-touch-icon.png", 180, { rounded: false, scale: 0.9 }],    // iOS rounds the corners itself
];
targets.forEach(([name, size, opts]) => {
  writeFileSync(new URL(name, OUT), render(size, opts));
  console.log("wrote", name);
});
