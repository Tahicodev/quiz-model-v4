/**
 * src/backend/routes/archives.routes.js
 *
 * School Year Archives — end-of-year snapshot folders.
 *
 *   GET    /archives       list year folders (metadata + per-store stats,
 *                          NO data payload — the heavy part)
 *   GET    /archives/:year one folder with its full snapshot payload
 *   POST   /archives       create or overwrite the snapshot for a year
 *                          (one folder per school+year; re-archiving a year
 *                          replaces the previous snapshot, never clears live data)
 *   DELETE /archives/:year remove a year folder
 *
 * Admin/teacher-gated: teachers can READ (view past years) but only admins
 * can create/overwrite/delete folders.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { ROLES } from '../../shared/constants.js';
import { NotFoundError } from '../../shared/errors.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';

const router = Router();

// Teachers may browse archives (read-only view of past years).
const READ_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];
const WRITE_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

const YEAR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\s\-/]{0,29}$/;

const ArchivePayloadSchema = z.object({
  year: z.string().transform((v) => v.trim()).refine((v) => YEAR_PATTERN.test(v), {
    message: 'Year must be text like "2025-2026" (max 30 chars)',
  }),
  label: z.string().trim().max(120).optional().nullable(),
  // data/stats arrive as objects; the route serializes them to JSON strings.
  data: z.record(z.unknown()),
  stats: z.record(z.unknown()).optional().nullable(),
});

async function findArchive(repo, schoolId, year) {
  const { data } = await repo.getAll('school_archives', {
    filters: { school_id: schoolId, year },
    limit: 1,
    orderBy: 'updated_at',
  });
  return data[0] ?? null;
}

// ── List (metadata only, no payload) ─────────────────────────────────────────
router.get('/', requireAuth, enforceTenant, requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const { data } = await repo.getAll('school_archives', {
      filters: { school_id: req.schoolId },
      orderBy: 'created_at',
      direction: 'desc',
      limit: 500,
    });
    const items = data.map((a) => {
      let stats = null;
      if (a.stats_json) {
        try { stats = JSON.parse(a.stats_json); } catch { stats = null; }
      }
      return {
        id: a.id,
        year: a.year,
        label: a.label,
        size_bytes: a.size_bytes,
        stats,
        created_at: a.created_at,
        updated_at: a.updated_at,
      };
    });
    res.json({ items });
  } catch (err) { next(err); }
});

// ── Get one (with payload) ───────────────────────────────────────────────────
router.get('/:year', requireAuth, enforceTenant, requireRole(READ_ROLES), async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const archive = await findArchive(repo, req.schoolId, req.params.year);
    if (!archive) return res.status(404).json({ code: 'NOT_FOUND', message: 'No archive for this school year' });
    let data = null;
    let stats = null;
    try { data = JSON.parse(archive.data_json); } catch { data = null; }
    if (archive.stats_json) {
      try { stats = JSON.parse(archive.stats_json); } catch { stats = null; }
    }
    res.json({
      id: archive.id,
      year: archive.year,
      label: archive.label,
      size_bytes: archive.size_bytes,
      stats,
      data,
      created_at: archive.created_at,
      updated_at: archive.updated_at,
    });
  } catch (err) { next(err); }
});

// ── Create / overwrite a year folder ─────────────────────────────────────────
router.post('/', requireAuth, enforceTenant, requireRole(WRITE_ROLES), validate(ArchivePayloadSchema), async (req, res, next) => {
  try {
    const { repo, auditSvc } = getContainer();
    const { year, label = null, data, stats = null } = req.body;

    const dataJson = JSON.stringify(data || {});
    const statsJson = stats && Object.keys(stats).length ? JSON.stringify(stats) : null;
    const sizeBytes = Buffer.byteLength(dataJson, 'utf8');

    const existing = await findArchive(repo, req.schoolId, year);
    let archive;
    if (existing) {
      archive = await repo.update('school_archives', existing.id, {
        label: label ?? existing.label,
        data_json: dataJson,
        stats_json: statsJson,
        size_bytes: sizeBytes,
      });
    } else {
      archive = await repo.create('school_archives', {
        school_id: req.schoolId,
        year,
        label,
        data_json: dataJson,
        stats_json: statsJson,
        size_bytes: sizeBytes,
      });
    }

    await auditSvc.log({
      schoolId: req.schoolId,
      actorId: req.user.id,
      entityType: 'school',
      entityId: req.schoolId,
      action: existing ? 'archive.update' : 'archive.create',
      ip: req.ip,
    });

    logger.info('archives.routes: snapshot saved', { schoolId: req.schoolId, year, sizeBytes, by: req.user.username });
    res.status(existing ? 200 : 201).json({
      id: archive.id,
      year: archive.year,
      label: archive.label,
      size_bytes: archive.size_bytes,
      updated_at: archive.updated_at,
    });
  } catch (err) { next(err); }
});

// ── Delete a year folder ─────────────────────────────────────────────────────
router.delete('/:year', requireAuth, enforceTenant, requireRole(WRITE_ROLES), async (req, res, next) => {
  try {
    const { repo, auditSvc } = getContainer();
    const archive = await findArchive(repo, req.schoolId, req.params.year);
    if (!archive) throw new NotFoundError(`school_archives:${req.params.year}`);
    await repo.delete('school_archives', archive.id);
    await auditSvc.log({
      schoolId: req.schoolId,
      actorId: req.user.id,
      entityType: 'school',
      entityId: req.schoolId,
      action: 'archive.delete',
      ip: req.ip,
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;