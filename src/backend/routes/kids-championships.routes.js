/**
 * src/backend/routes/kids-championships.routes.js
 * Kids Championship API — the kid-friendly tournament over Kids Games.
 * Mounted at /api/v1/kids/championships (registered in server.js).
 *
 * Deliberately separate from /api/v1/tournaments (collège/lycée): no rounds,
 * brackets or multipliers — name + emoji + a list of kids-game challenges.
 *
 * Layout mirrors kids.routes.js: public lobby endpoints (kid devices join
 * with a 4-char code, no login) are registered BEFORE the auth middleware;
 * everything else requires JWT + tenant + primaire.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { ROLES } from '../../shared/constants.js';
import {
  KidsChampionshipCreateSchema,
  KidsChampionshipUpdateSchema,
  KidsChampionshipFilterSchema,
} from '../../shared/schemas/kids-championship.schema.js';
import { getContainer } from '../container.js';
import { getStudentContentScope, isAuthorVisibleToStudent } from './users.routes.js';
import { logger } from '../logger.js';
import { ForbiddenError } from '../../shared/errors.js';

/** Kids Championships exist for primaire schools only (same gate as kids.routes.js). */
async function requirePrimaire(req, res, next) {
  try {
    const { repo } = getContainer();
    const school = await repo.getById('schools', req.schoolId);
    if (!school || String(school.school_type || '').toLowerCase() !== 'primaire') {
      throw new ForbiddenError('Kids Championships are available for primaire schools only.');
    }
    next();
  } catch (err) { next(err); }
}

const router = Router();
const publicRouter = Router();

// ─── Public kid-lobby endpoints (no auth) ────────────────────────────────────

// GET /api/v1/kids/championships/code/:code — full lobby payload by join code
publicRouter.get('/code/:code', async (req, res, next) => {
  try {
    const { kidsChampionshipSvc } = getContainer();
    res.json(await kidsChampionshipSvc.getPublicByCode(req.params.code, String(req.query.player || '').slice(0, 50)));
  } catch (err) { next(err); }
});

// GET /api/v1/kids/championships/view/:id — same payload by id; the play
// page's "Back to Championship" link uses it (uuid = capability).
publicRouter.get('/view/:id', async (req, res, next) => {
  try {
    const { kidsChampionshipSvc } = getContainer();
    res.json(await kidsChampionshipSvc.getPublicById(req.params.id, String(req.query.player || '').slice(0, 50)));
  } catch (err) { next(err); }
});

router.use(publicRouter);

// ─── Teacher/Admin endpoints (auth required) ────────────────────────────────

router.use(requireAuth, enforceTenant, requirePrimaire);

const CHAMPIONSHIP_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];
const CHAMPIONSHIP_PLAY_ROLES = [
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.TEACHER,
  ROLES.STUDENT,
];

// GET /api/v1/kids/championships/browse — joinable championships for
// players. Students in a primaire school see ONLY championships run by
// their own teachers — never admins', never another teacher's. Same
// lobby-only shape as the staff list (no answers or management fields).
router.get('/browse', requireRole(CHAMPIONSHIP_PLAY_ROLES), validateQuery(KidsChampionshipFilterSchema), async (req, res, next) => {
  try {
    const { kidsChampionshipSvc } = getContainer();
    const { limit, offset } = req.query;
    const isStudent = req.user.role === ROLES.STUDENT;
    const result = await kidsChampionshipSvc.list(
      req.schoolId,
      req.user,
      isStudent
        ? { status: req.query.status || 'active', limit: 100, offset: 0 }
        : { status: req.query.status || 'active', limit, offset },
    );
    if (!isStudent) {
      return res.json(result);
    }
    let scope = null;
    try {
      scope = await getStudentContentScope(req.schoolId, req.user.class_id);
    } catch (_) {
      scope = null;
    }
    const rows = (result.data || []).filter((row) =>
      isAuthorVisibleToStudent(row?.creator_id ?? row?.created_by, scope),
    );
    try {
      logger.info(
        {
          studentId: req.user?.id,
          classId: String(req.user?.class_id || '') || '(none)',
          teachersFound: scope ? scope.myTeacherIds.size : -1,
          schoolTotal: (result.data || []).length,
          delivered: rows.length,
        },
        'Kids championships browse: student content scope applied',
      );
    } catch (_) {
      /* diagnostics must never break delivery */
    }
    const start = Math.max(Number(offset) || 0, 0);
    const size = Math.max(Number(limit) || 20, 1);
    res.json({ data: rows.slice(start, start + size), total: rows.length });
  } catch (err) { next(err); }
});

// GET /api/v1/kids/championships — school list (admin: all, teacher: own)
router.get('/', requireRole(CHAMPIONSHIP_ROLES), validateQuery(KidsChampionshipFilterSchema), async (req, res, next) => {
  try {
    const { kidsChampionshipSvc } = getContainer();
    const { status, limit, offset } = req.query;
    res.json(await kidsChampionshipSvc.list(req.schoolId, req.user, { status, limit, offset }));
  } catch (err) { next(err); }
});

// POST /api/v1/kids/championships — create (immediately active, unique code)
router.post('/', requireRole(CHAMPIONSHIP_ROLES), validate(KidsChampionshipCreateSchema), async (req, res, next) => {
  try {
    const { kidsChampionshipSvc, auditSvc } = getContainer();
    const championship = await kidsChampionshipSvc.create(req.user, req.body);
    await auditSvc.log({
      schoolId: req.schoolId,
      actorId: req.user.id,
      entityType: 'kidsChampionship',
      entityId: championship.id,
      action: 'create',
      ip: req.ip,
    });
    res.status(201).json(championship);
  } catch (err) { next(err); }
});

// GET /api/v1/kids/championships/:id — managed detail + standings
router.get('/:id', requireRole(CHAMPIONSHIP_ROLES), async (req, res, next) => {
  try {
    const { kidsChampionshipSvc } = getContainer();
    res.json(await kidsChampionshipSvc.getManaged(req.params.id, req.user));
  } catch (err) { next(err); }
});

// PATCH /api/v1/kids/championships/:id — edit or reopen (status active|finished)
router.patch('/:id', requireRole(CHAMPIONSHIP_ROLES), validate(KidsChampionshipUpdateSchema), async (req, res, next) => {
  try {
    const { kidsChampionshipSvc, auditSvc } = getContainer();
    const updated = await kidsChampionshipSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({
      schoolId: req.schoolId,
      actorId: req.user.id,
      entityType: 'kidsChampionship',
      entityId: req.params.id,
      action: req.body?.status ? `status:${req.body.status}` : 'update',
      ip: req.ip,
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/kids/championships/:id
router.delete('/:id', requireRole(CHAMPIONSHIP_ROLES), async (req, res, next) => {
  try {
    const { kidsChampionshipSvc, auditSvc } = getContainer();
    await kidsChampionshipSvc.delete(req.params.id, req.user);
    await auditSvc.log({
      schoolId: req.schoolId,
      actorId: req.user.id,
      entityType: 'kidsChampionship',
      entityId: req.params.id,
      action: 'delete',
      ip: req.ip,
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
