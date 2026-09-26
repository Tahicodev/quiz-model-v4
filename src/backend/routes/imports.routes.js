/**
 * src/backend/routes/imports.routes.js
 *
 * ZIP import for full backups (the counterpart of exports.routes.js).
 *
 *   POST   /api/v1/imports/bundle        raw ZIP body (application/zip)
 *          → 200 { data, uploadToken, files }
 *          Unzips the backup, returns the data payload for the client-side
 *          picker, and stages the uploads/ folder under .import-staging/.
 *   POST   /api/v1/imports/bundle/commit { uploadToken }
 *          → 200 { restored }
 *          Moves the staged uploads files into the app's uploads/ folder.
 *          Called when the user confirms the import in the picker.
 *   DELETE /api/v1/imports/bundle/:token discards the staged files (cancel).
 *
 * Only `data.json` and `uploads/` entries are used; anything else in the ZIP
 * is ignored. The ZIP is read with a small dependency-free parser (Node zlib
 * + central-directory walk), so no archive library is needed for the offline
 * package.
 */

import express, { Router } from 'express';
import { inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth, requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]));

const ZIP_PARSER = express.raw({
  type: ['application/zip', 'application/octet-stream'],
  limit: '2gb',
});

const STAGING_ROOT = '.import-staging';
const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

// ── CRC-32 (reuse the same table as the writer) ────────────────────────────
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

function handleError(message, status) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

/**
 * Read a ZIP buffer into [{ name, data }]. Works with the app's own exports
 * and with standard ZIPs from Explorer/7-zip/etc. (data descriptors handled by
 * trusting the central-directory sizes).
 */
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) handleError('Not a valid ZIP file.', 400);

  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdSize = buf.readUInt32LE(eocd + 12);
  if (cdOffset + cdSize > buf.length) handleError('ZIP central directory is corrupt.', 400);

  const entries = [];
  let pos = cdOffset;
  const end = cdOffset + cdSize;
  while (pos + 46 <= end) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break; // padding/extra data
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const uncompSize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    if (nameLen > 65535) handleError('ZIP entry name too long.', 400);

    const rawName = buf.subarray(pos + 46, pos + 46 + nameLen);
    let name;
    try {
      name = rawName.toString('utf8');
    } catch (_) {
      name = rawName.toString('latin1');
    }
    if (name.indexOf('\uFFFD') !== -1) name = rawName.toString('latin1');

    // Locate the file data via the local header (its size fields can be zero
    // when a data descriptor is used, so central-directory sizes are used).
    if (localOffset + 30 > buf.length) handleError('ZIP entry is corrupt.', 400);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > buf.length) handleError('ZIP entry data is truncated.', 400);
    const packed = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = packed;
    } else if (method === 8) {
      data = inflateRawSync(packed);
    } else {
      logger.warn({ method: method, name: name }, 'Unsupported ZIP compression method, skipping entry');
      pos += 46 + nameLen + extraLen + commentLen;
      continue;
    }
    if (data.length !== uncompSize) handleError('ZIP entry size mismatch.', 400);

    const crc = crc32(data);
    const expectedCrc = buf.readUInt32LE(pos + 16);
    if (crc !== expectedCrc) {
      logger.warn({ name: name }, 'ZIP entry CRC mismatch - skipping');
      pos += 46 + nameLen + extraLen + commentLen;
      continue;
    }

    entries.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Path guard: resolve `rel` under `base`, refusing escapes. */
function safeJoin(base, rel) {
  const target = normalize(join(base, rel));
  if (!target.startsWith(normalize(base) + sep)) handleError('Unsafe entry path in ZIP.', 400);
  return target;
}

function stagingDir(token) {
  return join(STAGING_ROOT, token);
}

function sweepStaleStaging() {
  try {
    if (!existsSync(STAGING_ROOT)) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const name of readdirSync(STAGING_ROOT)) {
      const full = join(STAGING_ROOT, name);
      try {
        if (statSync(full).mtimeMs < cutoff) rmSync(full, { recursive: true, force: true });
      } catch (_) { /* ignore */ }
    }
  } catch (_) { /* ignore */ }
}

function writeStagedFile(token, relPath, data) {
  const target = safeJoin(stagingDir(token), relPath);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, data);
}

// POST /api/v1/imports/bundle
router.post('/bundle', ZIP_PARSER, async (req, res, next) => {
  try {
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length) {
      const err = new Error('Empty upload — send the backup ZIP as the body.');
      err.status = 400;
      throw err;
    }

    // Sweep stale staging folders left behind by cancelled imports.
    sweepStaleStaging();

    const entries = readZip(body);
    if (!entries.length) handleError('The ZIP contains no readable entries.', 400);

    const dataEntry = entries.find((e) => e.name === 'data.json');
    if (!dataEntry) handleError('No data.json found in the ZIP.', 400);

    let parsed;
    try {
      parsed = JSON.parse(dataEntry.data.toString('utf8'));
    } catch (_) {
      handleError('data.json inside the ZIP is not valid JSON.', 400);
    }
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      handleError('The backup data in the ZIP is invalid.', 400);
    }

    const token = randomBytes(16).toString('hex');
    const stage = stagingDir(token);
    mkdirSync(join(stage, 'uploads'), { recursive: true });

    const files = [];
    for (const entry of entries) {
      if (!entry.name.startsWith('uploads/') || entry.name === 'uploads/') continue;
      const rel = entry.name.slice('uploads/'.length).replace(/^\\+/, '');
      if (!rel || rel === '..' || rel.split(/[/\\]/).indexOf('..') !== -1) continue;
      if (rel.endsWith('/')) {
        mkdirSync(safeJoin(join(stage, 'uploads'), rel), { recursive: true });
        continue;
      }
      const target = safeJoin(join(stage, 'uploads'), rel);
      mkdirSync(join(target, '..'), { recursive: true });
      writeFileSync(target, entry.data);
      files.push(`uploads/${rel.split(/[/\\]/).join('/')}`);
    }

    logger.info({ files: files.length }, 'Backup ZIP unpacked (staged for import)');
    res.json({ data, uploadToken: token, files });
  } catch (err) { next(err); }
});

// POST /api/v1/imports/bundle/commit
router.post('/bundle/commit', async (req, res, next) => {
  try {
    const token = String((req.body && req.body.uploadToken) || '');
    if (!TOKEN_PATTERN.test(token)) handleError('Missing or invalid uploadToken.', 400);

    const stage = stagingDir(token);
    if (!existsSync(stage)) handleError('Staged upload no longer exists (expired).', 404);

    const stagedUploads = join(stage, 'uploads');
    let restored = 0;
    if (existsSync(stagedUploads)) {
      const stack = [{ dir: stagedUploads, prefix: '' }];
      while (stack.length) {
        const { dir, prefix } = stack.pop();
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const abs = join(dir, entry.name);
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            stack.push({ dir: abs, prefix: rel });
            continue;
          }
          const target = safeJoin(config.uploadsDir, rel);
          mkdirSync(join(target, '..'), { recursive: true });
          if (existsSync(target)) rmSync(target, { force: true });
          try {
            renameSync(abs, target);
          } catch (_) {
            // Cross-volume fallback (should not happen — same tree, but cheap).
            const buf = readFileSync(abs);
            writeFileSync(target, buf);
            rmSync(abs, { force: true });
          }
          restored++;
        }
      }
    }
    rmSync(stage, { recursive: true, force: true });

    logger.info({ restored }, 'Uploads committed from backup ZIP');
    res.json({ restored });
  } catch (err) { next(err); }
});

// DELETE /api/v1/imports/bundle/:token
router.delete('/bundle/:token', (req, res, next) => {
  try {
    const token = String(req.params.token || '');
    if (!TOKEN_PATTERN.test(token)) {
      const err = new Error('Invalid token.');
      err.status = 400;
      throw err;
    }
    const stage = join(stagingDir(token));
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;