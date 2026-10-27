/**
 * tests/unit/helpers/examDocZip.js
 *
 * A .docx is a ZIP package. Vitest runs in plain node, so reading one back is
 * ~30 lines of zlib + central-directory parsing — far cheaper for the test
 * suite than adding an unzip dependency.
 *
 * The central directory is authoritative (local headers may carry zero sizes
 * when a writer streams), which is what `Packer.toBuffer` produces.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function findEocd(buffer) {
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 66_000; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

/** @returns {Array<{ name: string, method: number, compressedSize: number, localOffset: number }>} */
export function zipEntries(buffer) {
  const eocd = findEocd(buffer);
  if (eocd < 0) throw new Error('Not a ZIP buffer');
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw new Error('Broken ZIP central directory');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    entries.push({
      name: buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength),
      method,
      compressedSize,
      localOffset,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function zipNames(buffer) {
  return zipEntries(buffer).map((entry) => entry.name);
}

export function zipData(buffer, name) {
  const entry = zipEntries(buffer).find((e) => e.name === name);
  if (!entry) return null;
  // Local header: signature(4) version(2) flags(2) method(2) time(2) date(2)
  // crc(4) compressedSize(4) uncompressedSize(4) nameLength(2) extraLength(2)
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_SIGNATURE) throw new Error('Broken ZIP local header');
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);
  return entry.method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
}

export function zipText(buffer, name) {
  const data = zipData(buffer, name);
  return data ? data.toString('utf8') : '';
}
