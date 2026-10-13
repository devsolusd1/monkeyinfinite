// Writes a cover drawing as a PNG, every art pixel a hard square. No dependencies.
// Usage: node scripts/cover.mjs [drawing module] [scale] [out.png]
//   defaults: site/cover/cover.js, 6, site/cover.png

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

const here = fileURLToPath(new URL("..", import.meta.url));
const source = resolve(process.argv[2] ?? resolve(here, "site/cover/cover.js"));
const scale = Math.max(1, Math.floor(Number(process.argv[3]) || 6));
const target = resolve(process.argv[4] ?? resolve(here, "site/cover.png"));

const { COVER } = await import(pathToFileURL(source).href);
const { w, h, palette, rows } = COVER;
if (rows.length !== h || rows.some((r) => r.length !== w)) throw new Error("the drawing's rows do not match its size");

const rgba = (hex) => {
  if (!hex) return [0, 0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const colours = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, rgba(v)]));

const W = w * scale, H = h * scale;
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  const line = y * (W * 4 + 1);
  raw[line] = 0; // no filter
  const row = rows[Math.floor(y / scale)];
  for (let x = 0; x < W; x++) {
    const c = colours[row[Math.floor(x / scale)]];
    if (!c) throw new Error(`"${row[Math.floor(x / scale)]}" is not in the palette`);
    raw.set(c, line + 1 + x * 4);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
};
const head = Buffer.alloc(13);
head.writeUInt32BE(W, 0);
head.writeUInt32BE(H, 4);
head.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA

writeFileSync(target, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", head), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]));
console.log(`${target}: ${W} by ${H} pixels from ${w} by ${h} at ${scale} times`);
