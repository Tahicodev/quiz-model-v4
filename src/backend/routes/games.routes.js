/**
 * src/backend/routes/games.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { GameCreateSchema, GameUpdateSchema, GameFilterSchema, GameJoinSchema, GameAnswerSchema } from '../../shared/schemas/game.schema.js';
import { ROLES, SOCKET_EVENTS } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { getIO } from '../realtime/socket.server.js';
import { ROOM } from '../realtime/socket.rooms.js';

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
    const game = await gameSvc.getById(req.params.id, req.schoolId);
    res.json(game);
  } catch (err) { next(err); }
});

// Games CRUD is shared between admins and teachers. The legacy admin panel
// has been used by both roles since v3, and the realtime settings panel
// already gates by `data-roles="admin,teacher"`, so we keep the same
// posture here to avoid spurious 403s when a teacher deletes a game.
const GAME_CRUD_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

router.post('/', requireRole(GAME_CRUD_ROLES), validate(GameCreateSchema), async (req, res, next) => {
  try {
    const { gameSvc, auditSvc } = getContainer();
    const game = await gameSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'game', entityId: game.id, action: 'create', ip: req.ip });
    res.status(201).json(game);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(GAME_CRUD_ROLES), validate(GameUpdateSchema), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const updated = await gameSvc.update(req.params.id, req.body, req.user);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(GAME_CRUD_ROLES), async (req, res, next) => {
  try {
    const { gameSvc, auditSvc } = getContainer();
    await gameSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'game', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/join', validate(GameJoinSchema), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const { game_id, gameId, join_code, joinCode } = req.body;
    // Resolve the game first so we can apply a status + class-scope check
    // before any write. The service does its own checks but a 404 here is
    // cleaner than a 500 from a downstream invariant.
    const targetId = game_id || gameId;
    if (targetId) {
      const target = await gameSvc.getById(targetId, req.schoolId);
      if (!target) return res.status(404).json({ code: 'NOT_FOUND', message: 'Game not found' });
      if (!['waiting', 'active'].includes(target.status)) {
        return res.status(409).json({ code: 'CONFLICT', message: 'Game is not open for joining' });
      }
    }
    const session = await gameSvc.joinGame({
      gameId: targetId,
      joinCode: join_code || joinCode,
      userId: req.user.id,
    });
    res.json(session);
  } catch (err) { next(err); }
});

router.post('/:id/start', requireRole(GAME_CRUD_ROLES), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const game = await gameSvc.start(req.params.id, req.user);
    try {
      const io = getIO();
      const state = await gameSvc.getClientState(req.params.id, { schoolId: req.schoolId });
      const room = ROOM.game(req.params.id);
      io.to(room).emit(SOCKET_EVENTS.GAME_STATE_UPDATE, state);
      if (state.currentQuestion) io.to(room).emit(SOCKET_EVENTS.GAME_QUESTION, state.currentQuestion);
      io.to(room).emit(SOCKET_EVENTS.GAME_SCORES, await gameSvc.getScores(req.params.id, req.schoolId));
    } catch {
      // REST game management also works when Socket.io is not initialized in a
      // test or a maintenance process; connected clients simply reconnect.
    }
    res.json(game);
  } catch (err) { next(err); }
});

router.post('/:id/answer', validate(GameAnswerSchema), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const { question_id, answer } = req.body;
    const result = await gameSvc.recordAnswer({ gameId: req.params.id, schoolId: req.schoolId, userId: req.user.id, questionId: question_id, answer });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id/scores', async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const scores = await gameSvc.getScores(req.params.id, req.schoolId);
    res.json(scores);
  } catch (err) { next(err); }
});

router.post('/:id/finish', requireRole(GAME_CRUD_ROLES), async (req, res, next) => {
  try {
    const { gameSvc } = getContainer();
    const game = await gameSvc.finish(req.params.id, req.user);
    try {
      const io = getIO();
      const scores = await gameSvc.getScores(req.params.id, req.schoolId);
      io.to(ROOM.game(req.params.id)).emit(SOCKET_EVENTS.GAME_FINISHED, {
        game,
        scores,
        results: scores,
      });
      io.to(ROOM.game(req.params.id)).emit(SOCKET_EVENTS.GAME_SCORES, scores);
    } catch {
      // Keep the REST finish operation independent from the realtime adapter.
    }
    res.json(game);
  } catch (err) { next(err); }
});

export default router;
