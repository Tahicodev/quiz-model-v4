/**
 * src/backend/routes/games.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { GameCreateSchema, GameUpdateSchema, GameFilterSchema, GameJoinSchema, GameAnswerSchema } from '../../shared/schemas/game.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

router.get('/', validateQuery(GameFilterSchema), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await gameSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const game = await gameSvc.getById(req.params.id);
    res.json(game);
  } catch (err) { next(err); }
});

router.post('/', requireRole(ROLES.ADMIN), validate(GameCreateSchema), async (req, res, next) => {
  try {
    const { gameSvc, auditSvc } = getContainer();
    const game = await gameSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'game', entityId: game.id, action: 'create', ip: req.ip });
    res.status(201).json(game);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(ROLES.ADMIN), validate(GameUpdateSchema), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const updated = await gameSvc.update(req.params.id, req.body, req.user);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { gameSvc, auditSvc } = getContainer();
    await gameSvc.getById(req.params.id); // validate exists
    await gameSvc.repo.delete('games', req.params.id);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'game', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/join', validate(GameJoinSchema), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const { gameId, join_code } = req.body;
    const session = await gameSvc.joinGame({ gameId, joinCode: join_code, userId: req.user.id });
    res.json(session);
  } catch (err) { next(err); }
});

router.post('/:id/start', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const game = await gameSvc.start(req.params.id, req.user);
    res.json(game);
  } catch (err) { next(err); }
});

router.post('/:id/answer', validate(GameAnswerSchema), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const { question_id, answer } = req.body;
    const result = await gameSvc.recordAnswer({ gameId: req.params.id, userId: req.user.id, questionId: question_id, answer });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id/scores', async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const scores = await gameSvc.getScores(req.params.id);
    res.json(scores);
  } catch (err) { next(err); }
});

router.post('/:id/finish', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const game = await gameSvc.finish(req.params.id, req.user);
    res.json(game);
  } catch (err) { next(err); }
});

export default router;
