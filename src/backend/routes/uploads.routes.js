/**
 * src/backend/routes/uploads.routes.js
 *
 * Image upload for MCQ/media content. The admin UI reads image options as
 * base64 data URLs; this endpoint persists them as real files under the
 * app's `uploads/` folder and returns a stable URL the question's
 * `options_json` can reference (/uploads/<file>). Students then render the
 * image straight from the URL — no data blobs in localStorage or DB.
 *
 * Wire format (JSON, same pattern as every other endpoint here):
 *   POST  /api/v1/uploads            { dataUrl: "data:image/png;base64,..." }
 *   POST  /api/v1/uploads            { data: "<base64>", mime: "image/png" }
 *   → 201 { url: "/uploads/ab12cd34...png" }
 *
 *   DELETE /api/v1/uploads/:file     remove an uploaded image (admin/teacher)
 */

import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth, requireRole([ROLES.ADMIN, ROLES.TEACHER]));

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB decoded image
const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  // Intentionally no SVG: serving untrusted SVG can execute scripts when
  // opened directly, and there is no sanitizer in the pipeline yet.
};

function makeUploadsDir() {
  mkdirSync(config.uploadsDir, { recursive: true });
  return config.uploadsDir;
}

function writeImage(dataBuffer, mime) {
  const ext = MIME_EXT[mime];
  if (!ext) {
    const err = new Error('Unsupported image type — use PNG, JPEG, GIF or WebP.');
    err.status = 400;
    throw err;
  }
  const dir = makeUploadsDir();
  const name = `${randomBytes(16).toString('hex')}.${ext}`;
  writeFileSync(join(dir, name), dataBuffer);
  return `/uploads/${name}`;
}

function decodeFromBody(body = {}) {
  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';
  if (dataUrl) {
    const match = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,(.+)$/i.exec(dataUrl);
    if (!match) {
      const err = new Error('Expected a base64 image data URL (data:image/...)');
      err.status = 400;
      throw err;
    }
    const encoded = match[2].replace(/\s+/g, '');
    const buf = Buffer.from(encoded, 'base64');
    if (!buf.length || buf.length > MAX_BYTES) {
      const err = new Error(`Image must be between 1 and ${MAX_BYTES / 1048576} MB.`);
      err.status = 400;
      throw err;
    }
    return writeImage(buf, match[1].toLowerCase());
  }
  if (typeof body.data === 'string' && typeof body.mime === 'string') {
    const encoded = body.data.replace(/\s+/g, '');
    const buf = Buffer.from(encoded, 'base64');
    if (!buf.length || buf.length > MAX_BYTES) {
      const err = new Error(`Image must be between 1 and ${MAX_BYTES / 1048576} MB.`);
      err.status = 400;
      throw err;
    }
    return writeImage(buf, String(body.mime).toLowerCase());
  }
  const err = new Error('Missing image payload — send { dataUrl } or { data, mime }.');
  err.status = 400;
  throw err;
}

// POST /api/v1/uploads
router.post('/', async (req, res, next) => {
  try {
    const url = decodeFromBody(req.body);
    logger.info({ url, actorId: req.user?.id }, 'Image uploaded');
    res.status(201).json({ url });
  } catch (err) { next(err); }
});

// DELETE /api/v1/uploads/:file
router.delete('/:file', (req, res, next) => {
  try {
    const name = String(req.params.file || '').replace(/[/\\]/g, '');
    if (!name || !/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/i.test(name)) {
      const err = new Error('Invalid file name.');
      err.status = 400;
      throw err;
    }
    // Belt-and-braces traversal guard: resolved path must stay in uploadsDir.
    const target = normalize(join(config.uploadsDir, name));
    if (!target.startsWith(join(normalize(config.uploadsDir)) + sep)) {
      const err = new Error('Invalid file name.');
      err.status = 400;
      throw err;
    }
    if (!existsSync(target)) {
      const err = new Error('File not found.');
      err.status = 404;
      throw err;
    }
    rmSync(target);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;