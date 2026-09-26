/**
 * src/backend/routes/exports.routes.js
 *
 * Full-backup packaging: data + image files in one self-contained ZIP.
 *
 *   POST /api/v1/exports/bundle   body: { data: { <store>: <value>, ... } }
 *   → 200 application/zip  containing:
 *        data.json   — the same "quiz-app-backup" envelope the JSON export
 *                      produces (version 2.0), so the existing Import flow
 *                      understands it.
 *        uploads/**  — every file the app has persisted in the uploads
 *                      folder, so image questions keep their pictures after
 *                      restoring the backup on another machine.
 *
 * The ZIP is built in-memory with a small ZIP writer (node:zlib deflate +
 * CRC-32) — no extra dependency, important for the offline package.
 */

import { Router } from 'express';
import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB safety cap
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ── CRC-32 (ZIP uses this for its per-entry checksums) ──────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// MS-DOS date/time fields used by ZIP headers.
function dosDateTime(d) {
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

/**
 * Minimal ZIP writer. entries: [{ name, data }]. Each entry is deflated when
 * it actually shrinks, otherwise stored — both are readable by every modern
 * unzip tool (Windows Explorer, 7-zip, macOS, Linux).
 */
function buildZip(entries, now) {
  const { date, time } = dosDateTime(now);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const raw = entry.data;
    const deflated = deflateRawSync(raw, { level: 6 });
    const method = deflated.length < raw.length ? 8 : 0;
    const payload = method === 8 ? deflated : raw;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local file header signature
    local.writeUInt16LE(20, 4);           // version needed to extract
    local.writeUInt16LE(0, 6);            // general purpose flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra field length
    chunks.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);      // central directory signature
    cd.writeUInt16LE(20, 4);              // version made by
    cd.writeUInt16LE(20, 6);              // version needed to extract
    cd.writeUInt16LE(0, 8);               // flags
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);              // extra length
    cd.writeUInt16LE(0, 32);              // comment length
    cd.writeUInt16LE(0, 34);              // disk number start
    cd.writeUInt16LE(0, 36);              // internal attrs
    cd.writeUInt32LE(0, 38);              // external attrs
    cd.writeUInt32LE(offset, 42);         // local header offset
    central.push({ buf: cd, name: nameBuf });

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralStart = offset;
  const centralChunks = [];
  let centralSize = 0;
  for (const item of central) {
    centralChunks.push(item.buf, item.name);
    centralSize += item.buf.length + item.name.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);      // end of central directory signature
  eocd.writeUInt16LE(0, 4);               // disk number
  eocd.writeUInt16LE(0, 6);               // disk with CD
  eocd.writeUInt16LE(entries.length, 8);  // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);              // comment length

  return Buffer.concat([...chunks, ...centralChunks, eocd]);
}

/** Recursively list files under `dir` as [{ rel, abs }] (rel uses / separators). */
function collectFiles(dir) {
  const out = [];
  const stack = [{ dir, prefix: '' }];
  while (stack.length) {
    const { dir: current, prefix } = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) stack.push({ dir: abs, prefix: rel });
      else if (entry.isFile()) out.push({ rel, abs });
    }
  }
  return out;
}

// POST /api/v1/exports/bundle
router.post('/bundle', requireAuth, requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]), async (req, res, next) => {
  try {
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      const err = new Error('Missing backup payload — send { data: { ...stores } }.');
      err.status = 400;
      throw err;
    }

    const now = new Date();
    const entries = [];
    entries.push({
      name: 'data.json',
      data: Buffer.from(
        JSON.stringify(
          {
            version: '2.0',
            timestamp: now.toISOString(),
            type: 'quiz-app-backup',
            data,
          },
          null,
          2,
        ),
        'utf8',
      ),
    });

    const uploadsDir = normalize(config.uploadsDir);
    if (existsSync(uploadsDir)) {
      let total = 0;
      for (const file of collectFiles(uploadsDir)) {
        const size = statSync(file.abs).size;
        total += size;
        if (total > MAX_TOTAL_BYTES) {
          const err = new Error(
            'The uploads folder is too large to package in one ZIP (>2 GB).',
          );
          err.status = 413;
          throw err;
        }
        entries.push({
          name: `uploads/${file.rel}`,
          data: readFileSync(file.abs),
        });
      }
    }

    const zip = buildZip(entries, now);
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="quiz-app-backup-${datePart}.zip"`,
    );
    res.setHeader('Content-Length', zip.length);
    logger.info(
      { entries: entries.length, bytes: zip.length },
      'Full backup ZIP exported',
    );
    res.end(zip);
  } catch (err) { next(err); }
});

export default router;