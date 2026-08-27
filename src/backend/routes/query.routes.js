/**
 * src/backend/routes/query.routes.js
 *
 * Generic query dispatcher. The frontend ApiRepository calls
 * POST /api/v1/query/:name for operations that don't fit generic
 * CRUD (e.g. exam.withQuestions, game.sessions).
 *
 * This router delegates to PrismaRepository.query().
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();

router.use(requireAuth, enforceTenant);

// Allowlist of named queries. Anything not in this set is rejected with a
// 403. The default policy is "instructor-only"; specific queries that
// students can run (e.g. "game.sessions" for their own participation) are
// listed in STUDENT_QUERY_ALLOWLIST.
const INSTRUCTOR_QUERY_ALLOWLIST = new Set([
  'exam.withQuestions',
  'exam.listForTeacher',
  'class.listWithCounts',
  'user.lookup',
  'tournament.withEntries',
  'analytics.summary',
]);
const STUDENT_QUERY_ALLOWLIST = new Set([
  'game.sessions',
  'class.myClassmates',
  'result.mine',
]);

/**
 * POST /api/v1/query/:name
 * Body: arbitrary JSON params passed to the named query.
 * schoolId from JWT is merged into params automatically.
 */
router.post('/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    const isInstructor = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER].includes(req.user.role);
    if (isInstructor) {
      if (!INSTRUCTOR_QUERY_ALLOWLIST.has(name)) {
        return next(new ForbiddenError(`Unknown or forbidden query: ${name}`));
      }
    } else {
      if (!STUDENT_QUERY_ALLOWLIST.has(name)) {
        return next(new ForbiddenError(`Unknown or forbidden query: ${name}`));
      }
    }
    const { repo } = getContainer();
    const params = { ...req.body, schoolId: req.schoolId };
    const result = await repo.query(name, params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
