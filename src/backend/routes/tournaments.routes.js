/**
 * src/backend/routes/tournaments.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { TournamentCreateSchema, TournamentUpdateSchema, TournamentFilterSchema } from '../../shared/schemas/tournament.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

router.get('/', validateQuery(TournamentFilterSchema), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await tournamentSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.getById(req.params.id);
    res.json(t);
  } catch (err) { next(err); }
});

router.post('/', requireRole(ROLES.ADMIN), validate(TournamentCreateSchema), async (req, res, next) => {
  try {
    const { tournamentSvc, auditSvc } = getContainer();
    const t = await tournamentSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'tournament', entityId: t.id, action: 'create', ip: req.ip });
    res.status(201).json(t);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(ROLES.ADMIN), validate(TournamentUpdateSchema), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const updated = await tournamentSvc.update(req.params.id, req.body, req.user);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { tournamentSvc, auditSvc } = getContainer();
    await tournamentSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'tournament', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/open', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.open(req.params.id, req.user);
    res.json(t);
  } catch (err) { next(err); }
});

router.post('/:id/close', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.close(req.params.id, req.user);
    res.json(t);
  } catch (err) { next(err); }
});

router.post('/:id/register', async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const entry = await tournamentSvc.register(req.params.id, req.user.id);
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

router.get('/:id/leaderboard', async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const { limit = 50 } = req.query;
    const leaderboard = await tournamentSvc.getLeaderboard(req.params.id, limit);
    res.json(leaderboard);
  } catch (err) { next(err); }
});

router.post('/:id/finish', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.finish(req.params.id, req.user);
    res.json(t);
  } catch (err) { next(err); }
});

export default router;
