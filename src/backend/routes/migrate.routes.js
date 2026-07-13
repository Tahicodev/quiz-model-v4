/**
 * src/backend/routes/migrate.routes.js
 * /api/v1/migrate — one-time LocalStorage → backend import tool.
 *
 * Admin-only, tenant-scoped POST { data: { [table]: rows[] } }
 *   - Iterates in FK-safe order (spec §25 Data Integrity): parents before children.
 *   - Forces every row's school_id to the caller's tenant (never trusts body).
 *   - Idempotent: PrismaRepository.createMany uses `skipDuplicates: true`, so a
 *     second run for the same payload inserts zero rows.
 *   - Audit-logs the run (spec §16 policy: migration runs always logged).
 *
 * GET /api/v1/migrate/status — per-table row counts for the caller's school,
 * used by Phase 8 step 5 verification.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';

const router = Router();

// Parent tables first; children with FKs follow. Tables not present in the
// payload are skipped, so a partial migration (e.g. only questions) still works.
const MIGRATE_ORDER = [
  'schools',
  'classes',
  'categories',
  'users',
  'questions',
  'exams',
  'exam_questions',
  'exam_classes',
  'results',
  'games',
  'game_sessions',
  'tournaments',
  'tournament_entries',
  'exam_sessions',
  'settings',
];

// Remove read-only / server-owned tables the client should never import.
const BLACKLIST = new Set(['audit_logs', 'refresh_tokens']);

/** Force tenant scoping on every row and drop non-importable fields. */
function sanitizeRows(rows, schoolId) {
  return rows.map((row) => {
    const { id, created_at, updated_at, ...rest } = row;
    return {
      ...(id !== undefined && { id }),
      ...(created_at !== undefined && { created_at }),
      ...(updated_at !== undefined && { updated_at }),
      ...rest,
      school_id: schoolId, // never trust the payload's school_id
    };
  });
}

router.use(requireAuth, enforceTenant, requireRole(ROLES.ADMIN));

// ── POST /api/v1/migrate ─────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { repo, auditSvc } = getContainer();
    const payload = req.body?.data;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Body must be { data: { [table]: rows[] } }' });
    }

    const results = [];
    let totalInserted = 0;

    for (const table of MIGRATE_ORDER) {
      const rows = payload[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const sanitized = sanitizeRows(rows, req.schoolId);
      try {
        const result = await repo.createMany(table, sanitized);
        // PrismaRepository returns { count }; LocalStorage returns records[].
        const inserted = typeof result?.count === 'number'
          ? result.count
          : (Array.isArray(result) ? result.length : 0);
        const skipped = sanitized.length - inserted;
        totalInserted += inserted;
        results.push({ table, total: sanitized.length, inserted, skipped });
      } catch (err) {
        // One table failing must not abort the whole migration — record and continue.
        results.push({ table, total: sanitized.length, inserted: 0, skipped: sanitized.length, error: err.message });
        logger.error({ err, table }, 'Migrate: table failed');
      }
    }

    // Audit-log the migration run (spec §16: always log).
    await auditSvc.log({
      schoolId:   req.schoolId,
      actorId:    req.user.id,
      entityType: 'migration',
      entityId:   'bulk',
      action:     'migrate',
      ip:         req.ip,
    });

    res.status(200).json({ results, totalInserted });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/v1/migrate/status ───────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const counts = {};
    for (const table of MIGRATE_ORDER) {
      if (BLACKLIST.has(table)) continue;
      try {
        const { total } = await repo.getAll(table, { filters: { school_id: req.schoolId }, limit: 1 });
        counts[table] = total;
      } catch (err) {
        // Some tables may not exist on every install — record null rather than crash.
        counts[table] = null;
      }
    }
    res.json({ school_id: req.schoolId, counts });
  } catch (err) {
    next(err);
  }
});

export default router;
