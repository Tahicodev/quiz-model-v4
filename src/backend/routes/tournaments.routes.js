/**
 * src/backend/routes/tournaments.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { TournamentCreateSchema, TournamentUpdateSchema, TournamentFilterSchema, TournamentAnswerSchema } from '../../shared/schemas/tournament.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Tournament authoring is shared between admins and teachers (teachers
// create and manage their own tournaments). The lifecycle transitions
// (open / close / finish) are admin-only because they affect the school.
const TOURNAMENT_AUTHORING_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];
const TOURNAMENT_ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];
const isInstructor = (req) =>
  req.user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER].includes(req.user.role);

// Tournaments are visible to anyone in the tenant; draft tournaments are
// hidden from students so teachers can stage them before publishing.
const STUDENT_VISIBLE_STATUSES = ['open', 'active', 'finished'];

router.get('/', validateQuery(TournamentFilterSchema), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    if (!isInstructor(req) && !filters.status) {
      filters.status = { in: STUDENT_VISIBLE_STATUSES };
    }
    const result = await tournamentSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.getById(req.params.id);
    if (t && !isInstructor(req) && !STUDENT_VISIBLE_STATUSES.includes(t.status)) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' });
    }
    res.json(t);
  } catch (err) { next(err); }
});

router.post('/', requireRole(TOURNAMENT_AUTHORING_ROLES), validate(TournamentCreateSchema), async (req, res, next) => {
  try {
    const { tournamentSvc, auditSvc } = getContainer();
    const t = await tournamentSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'tournament', entityId: t.id, action: 'create', ip: req.ip });
    res.status(201).json(t);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(TOURNAMENT_AUTHORING_ROLES), validate(TournamentUpdateSchema), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const updated = await tournamentSvc.update(req.params.id, req.body, req.user);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(TOURNAMENT_ADMIN_ROLES), async (req, res, next) => {
  try {
    const { tournamentSvc, auditSvc } = getContainer();
    await tournamentSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'tournament', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/open', requireRole(TOURNAMENT_ADMIN_ROLES), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.open(req.params.id, req.user);
    res.json(t);
  } catch (err) { next(err); }
});

router.post('/:id/close', requireRole(TOURNAMENT_ADMIN_ROLES), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.close(req.params.id, req.user);
    res.json(t);
  } catch (err) { next(err); }
});

router.post('/:id/register', async (req, res, next) => {
  try {
    // Registration is a student action; instructors don't register for
    // their own tournaments. We do not return a different status code
    // to avoid leaking whether the id exists.
    if (req.user.role !== ROLES.STUDENT) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Only students can register for tournaments' });
    }
    const { tournamentSvc } = getContainer();
    const entry = await tournamentSvc.register(req.params.id, req.user.id);
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

// REST fallback for clients that cannot maintain a realtime socket. The same
// service method is used by the Socket.IO handler, so scoring stays identical.
router.post('/:id/answer', validate(TournamentAnswerSchema), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.getById(req.params.id);
    if (!t) return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' });
    if (!['open', 'active'].includes(t.status)) {
      return res.status(409).json({ code: 'CONFLICT', message: 'Tournament is not accepting answers' });
    }
    // The service is responsible for checking the user is registered.
    const result = await tournamentSvc.recordAnswer({
      tournamentId: req.params.id,
      userId: req.user.id,
      questionId: req.body.question_id,
      answer: req.body.answer,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id/leaderboard', async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.getById(req.params.id);
    if (!t) return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' });
    if (!isInstructor(req) && !STUDENT_VISIBLE_STATUSES.includes(t.status)) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Tournament not found' });
    }
    const { limit = 50 } = req.query;
    const leaderboard = await tournamentSvc.getLeaderboard(req.params.id, limit);
    res.json(leaderboard);
  } catch (err) { next(err); }
});

router.post('/:id/finish', requireRole(TOURNAMENT_ADMIN_ROLES), async (req, res, next) => {
  try {
    const { tournamentSvc } = getContainer();
    const t = await tournamentSvc.finish(req.params.id, req.user);
    res.json(t);
  } catch (err) { next(err); }
});

export default router;
