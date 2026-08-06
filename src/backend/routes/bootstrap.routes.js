/**
 * src/backend/routes/bootstrap.routes.js
 *
 * /api/v1/bootstrap — bulk read-only preload of everything the current school
 * is allowed to see. Used once at page load by the legacy-bridge shim so the
 * legacy MPA scripts have the data they expect synchronously cacheable.
 *
 * Auth: admin or student (tenant-scoped via requireAuth + enforceTenant).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';

const router = Router();

// Tables exposed to the legacy preload. Order irrelevant — we read them all
// in one pass. Excludes server-owned tables (audit_logs, refresh_tokens) and
// any join table that is already embedded inside its parent's payload shape.
const PRELOAD_TABLES = [
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

// Tables with a direct school_id column. Join tables are scoped through their
// parent records instead, while schools are scoped by their primary key.
const DIRECT_SCHOOL_TABLES = new Set([
  'classes',
  'categories',
  'users',
  'questions',
  'exams',
  'results',
  'games',
  'game_sessions',
  'tournaments',
  'tournament_entries',
  'exam_sessions',
  'settings',
]);

const STATUS_QUERY = {
  schools:            (schoolId) => ({ filters: { id: schoolId }, orderBy: 'created_at' }),
  results:            (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'date_taken' }),
  exam_questions:     (schoolId) => ({ filters: { exam: { school_id: schoolId } }, orderBy: 'order_index' }),
  exam_classes:       (schoolId) => ({ filters: { exam: { school_id: schoolId } }, orderBy: 'assigned_at' }),
  game_sessions:      (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'joined_at' }),
  tournament_entries: (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'registered_at' }),
  exam_sessions:      (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'started_at' }),
  settings:           (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'updated_at' }),
};

function queryForTable(table, schoolId) {
  return STATUS_QUERY[table]?.(schoolId) || {
    filters: DIRECT_SCHOOL_TABLES.has(table) ? { school_id: schoolId } : {},
    orderBy: 'created_at',
  };
}

router.use(requireAuth, enforceTenant);

// ── GET /api/v1/bootstrap ────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const data = {};
    for (const table of PRELOAD_TABLES) {
      try {
        const query = queryForTable(table, req.schoolId);
        const { data: rows } = await repo.getAll(table, { ...query, limit: 100000 });
        data[table] = rows;
      } catch (err) {
        logger.warn({ err, table }, 'Bootstrap: per-table read failed');
        data[table] = [];
      }
    }
    res.json({ school_id: req.schoolId, data });
  } catch (err) {
    next(err);
  }
});

export default router;
