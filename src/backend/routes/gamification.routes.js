/**
 * src/backend/routes/gamification.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

router.get('/', async (req, res, next) => {
  try {
    const { gamificationSvc } = getContainer();
    res.json(await gamificationSvc.get(req.schoolId));
  } catch (err) { next(err); }
});

router.patch('/', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]), async (req, res, next) => {
  try {
    const { gamificationSvc } = getContainer();
    res.json(await gamificationSvc.update(req.schoolId, req.body));
  } catch (err) { next(err); }
});

export default router;
