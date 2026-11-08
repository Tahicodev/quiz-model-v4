/**
 * src/backend/routes/teacher-overview.routes.js
 *
 * Teacher-only read model for the Teacher Overview tab.
 *
 * The teacher id always comes from the verified JWT — it is never accepted
 * from the query string. Admins keep their separate /admin/overview endpoint,
 * so a teacher session can never reach school-wide analytics here.
 *
 * GET /api/v1/teacher-overview/overview
 *   classIds   optional comma-separated class ids (intersected with the
 *              teacher's assigned classes)
 *   subjectIds optional comma-separated subject ids
 *   period     week | month | term | custom (default: month)
 *   from, to   ISO dates for period=custom
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireAuth, enforceTenant, requireRole([ROLES.TEACHER]));

function parseIdList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

router.get('/overview', async (req, res, next) => {
  try {
    const { teacherOverviewSvc } = getContainer();
    const q = req.query || {};
    const data = await teacherOverviewSvc.getOverview({
      schoolId: req.schoolId,
      teacherId: req.user.id,
      filters: {
        classIds: parseIdList(q.classIds),
        subjectIds: parseIdList(q.subjectIds),
        period: q.period,
        from: q.from,
        to: q.to,
      },
    });
    res.json({ data });
  } catch (err) {
    logger.warn(
      { err: err?.message, teacherId: req.user?.id },
      'teacher-overview: analytics bundle failed',
    );
    next(err);
  }
});

export default router;
