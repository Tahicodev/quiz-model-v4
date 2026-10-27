/**
 * tests/unit/helpers/examDocPng.js
 *
 * The renderers embed PNG/JPEG, so the tests need real image bytes. Encoding a
 * tiny PNG by hand (8 lines of spec + a CRC table) is cheaper and more honest
 * than committing a binary fixture, and it also lets a test produce a *broken*
 * image on purpose — which is how the "a corrupt upload must not hang the
 * export" rule gets verified.
 */

import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

/** A valid truecolour PNG filled with one colour. */
export function makePng({ width = 4, height = 4, rgb = [10, 120, 200] } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = rgb[0];
      row[2 + x * 3] = rgb[1];
      row[3 + x * 3] = rgb[2];
    }
    rows.push(row);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Structurally a PNG, but its pixel data cannot be decoded (bad upload). */
export function makeBrokenPng(options = {}) {
  const png = makePng(options);
  const idat = png.indexOf(Buffer.from('IDAT', 'ascii'));
  // Overwrite the compressed payload; the header and chunk layout stay valid.
  const start = idat + 4;
  for (let i = start + 2; i < start + 12 && i < png.length; i += 1) png[i] = 0xff;
  return png;
}

export function pngDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}
