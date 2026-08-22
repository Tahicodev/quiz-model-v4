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
import { getContainer } from '../container.js';

const router = Router();

router.use(requireAuth, enforceTenant);

/**
 * POST /api/v1/query/:name
 * Body: arbitrary JSON params passed to the named query.
 * schoolId from JWT is merged into params automatically.
 */
router.post('/:name', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const { name } = req.params;
    const params = { ...req.body, schoolId: req.schoolId };
    const result = await repo.query(name, params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
