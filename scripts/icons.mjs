import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
const crc = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const t = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([size, t, data, checksum]);
}
const distance = (x, y, a, b, c, d) => {
  const t = Math.max(
    0,
    Math.min(1, ((x - a) * (c - a) + (y - b) * (d - b)) / ((c - a) ** 2 + (d - b) ** 2)),
  );
  return Math.hypot(x - a - t * (c - a), y - b - t * (d - b));
};
await mkdir(new URL('../icons', import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = (x / size) * 512,
        py = (y / size) * 512;
      let color = [23, 26, 38, 255];
      if (
        px > 96 &&
        px < 416 &&
        py > 128 &&
        py < 384 &&
        Math.hypot(Math.max(136 - px, 0, px - 376), Math.max(168 - py, 0, py - 344)) < 40
      )
        color = [169, 154, 255, 255];
      if (
        Math.hypot(px - 326, py - 204) < 24 ||
        [
          [145, 329, 215, 242],
          [215, 242, 267, 303],
          [267, 303, 306, 261],
          [306, 261, 367, 329],
        ].some((line) => distance(px, py, ...line) < 12)
      )
        color = [41, 33, 69, 255];
      const at = y * (size * 4 + 1) + 1 + x * 4;
      rows.set(color, at);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  await writeFile(
    new URL(`../icons/icon-${size}.png`, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
