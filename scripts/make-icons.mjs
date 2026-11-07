// Draws the app icons (a white bowl on a terracotta background) with no image dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BG = [180, 70, 31];
const FG = [255, 255, 255];
const SAMPLES = 4;

function inBowl(x, y, scale) {
  // x and y run from 0 to 1 across the whole icon; scale shrinks the bowl around the centre.
  const u = (x - 0.5) / scale;
  const v = (y - 0.5) / scale;
  const rim = v >= -0.13 && v <= -0.06 && Math.abs(u) <= 0.34;
  const body = v >= -0.06 && u * u + (v + 0.06) * (v + 0.06) <= 0.3 * 0.3;
  const base = v >= 0.22 && v <= 0.28 && Math.abs(u) <= 0.12;
  return rim || body || base;
}

function inRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, x - (1 - radius), 0);
  const dy = Math.max(radius - y, y - (1 - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
}

function pixels(size, { radius, scale }) {
  const out = Buffer.alloc((size * 4 + 1) * size);
  let i = 0;
  for (let py = 0; py < size; py++) {
    out[i++] = 0; // PNG filter byte: none
    for (let px = 0; px < size; px++) {
      let covered = 0;
      let bowl = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (radius === 0 || inRoundedSquare(x, y, radius)) {
            covered++;
            if (inBowl(x, y, scale)) bowl++;
          }
        }
      }
      const mix = covered ? bowl / covered : 0;
      for (let c = 0; c < 3; c++) out[i++] = Math.round(BG[c] + (FG[c] - BG[c]) * mix);
      out[i++] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return out;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, options) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels(size, options))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
const write = (name, size, options) => writeFileSync(new URL(name, dir), png(size, options));

write('icon-192.png', 192, { radius: 0.18, scale: 1 });
write('icon-512.png', 512, { radius: 0.18, scale: 1 });
write('maskable-512.png', 512, { radius: 0, scale: 0.75 }); // stays inside the maskable safe zone
write('apple-touch-icon.png', 180, { radius: 0, scale: 0.9 }); // iOS rounds the corners itself
