/**
 * src/backend/routes/game-presets.routes.js
 * Reads: all roles (students need presets for the game UI). Writes: admin.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

const adminOnly = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);

router.get('/', async (req, res, next) => {
  try {
    const { gamePresetSvc } = getContainer();
    const result = await gamePresetSvc.listForTenant(req.schoolId);
    res.json(result.data);
  } catch (err) { next(err); }
});

router.get('/defaults', async (req, res, next) => {
  try {
    const { gamePresetSvc } = getContainer();
    const result = await gamePresetSvc.getDefaults(req.schoolId);
    res.json(result.data);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { gamePresetSvc } = getContainer();
    res.status(201).json(await gamePresetSvc.create(req.user, req.body));
  } catch (err) { next(err); }
});

router.patch('/:id', adminOnly, async (req, res, next) => {
  try {
    const { gamePresetSvc } = getContainer();
    res.json(await gamePresetSvc.update(req.user, req.params.id, req.body));
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { gamePresetSvc } = getContainer();
    await gamePresetSvc.delete(req.user, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
