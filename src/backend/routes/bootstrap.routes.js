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
import { ROLES } from '../../shared/constants.js';

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
  'profile_requests',
  'account_requests',
  'game_presets',
  'notifications',
  'teacher_messages',
  'teacher_assignments',
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
  'profile_requests',
  'account_requests',
  'game_presets',
  'notifications',
  'teacher_messages',
  'teacher_assignments',
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
  profile_requests:   (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  account_requests:   (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  game_presets:       (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  notifications:      (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  teacher_messages:   (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'date' }),
  teacher_assignments:(schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
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
    const isAdmin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user?.role);
    const isStudent = req.user?.role === ROLES.STUDENT;
    // Students must never receive the admin-only queues.
    const SKIP_FOR_STUDENT = new Set(['account_requests', 'notifications']);
    const data = {};
    for (const table of PRELOAD_TABLES) {
      if (isStudent && SKIP_FOR_STUDENT.has(table)) { data[table] = []; continue; }
      try {
        const query = queryForTable(table, req.schoolId);
        // Role-scoped narrowing on top of the school filter.
        if (isStudent) {
          if (table === 'profile_requests') query.filters.user_id = req.user.id;
          if (table === 'teacher_messages' || table === 'teacher_assignments') {
            query.filters.class_id = req.user.class_id ?? '__none__';
          }
        }
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
