/**
 * src/backend/routes/users.routes.js
 *
 * User CRUD. Admins have full permission over every account. Teachers may
 * manage ONLY students in their assigned classes (list / read / create /
 * edit / delete, all class-scoped); everything else is admin-only.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { UserCreateSchema, UserUpdateSchema, UserFilterSchema } from '../../shared/schemas/user.schema.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

const USER_MANAGER_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

/**
 * Classes assigned to a teacher (admin-configured, persisted in the
 * `teacherClassAssignments` setting: { userId: [classId, ...] }).
 * Empty = the teacher manages nobody.
 */
export async function getTeacherClassIds(schoolId, teacherId) {
  const { repo } = getContainer();
  const { data } = await repo.getAll('settings', {
    filters: { school_id: schoolId, key: 'teacherClassAssignments' },
    limit: 1,
  });
  try {
    const map = JSON.parse(data[0]?.value || '{}');
    const ids = map?.[teacherId];
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(String))].filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The target must be a student in one of the teacher's assigned classes.
 * Anything else (other roles, other classes, other schools) is refused —
 * 404 across tenants so existence never leaks, 403 within the tenant.
 */
export async function assertTeacherStudent(target, req) {
  if (!target || target.school_id !== req.schoolId) {
    throw new NotFoundError('User');
  }
  if (target.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Teachers manage students only');
  }
  const classIds = await getTeacherClassIds(req.schoolId, req.user.id);
  if (!target.class_id || !classIds.includes(String(target.class_id))) {
    throw new ForbiddenError('Not your student');
  }
  return classIds;
}

// GET /api/v1/users
router.get('/', requireRole(USER_MANAGER_ROLES), validateQuery(UserFilterSchema), async (req, res, next) => {
  try {
    const { userSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, role, class_id, ...filters } = req.query;
    // Teachers see only students in their assigned classes; client-supplied
    // role/class filters are ignored for them. Admins keep full listing.
    const scoped = req.user.role === ROLES.TEACHER
      ? {
        role: ROLES.STUDENT,
        class_id: { in: await getTeacherClassIds(req.schoolId, req.user.id) },
      }
      : { ...(role ? { role } : {}), ...(class_id ? { class_id } : {}) };
    const result = await userSvc.list({ ...filters, school_id: req.schoolId, ...scoped }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /api/v1/users/me — self-service profile (any signed-in user).
// Editable: own name, title (Mr/Mme), and for staff their email/phone.
// Role, status, class, numero and password never flow through here.
// NOTE: registered before /:id so "me" is never treated as a user id.
router.patch('/me', async (req, res, next) => {
  try {
    const { userSvc } = getContainer();
    const updated = await userSvc.updateOwnProfile(req.user.id, req.body || {}, req.user);
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/v1/users/:id
router.get('/:id', requireRole(USER_MANAGER_ROLES), async (req, res, next) => {
  try {
    const { userSvc } = getContainer();
    const user = await userSvc.getById(req.params.id);
    if (req.user.role === ROLES.TEACHER) {
      await assertTeacherStudent(user, req);
    }
    res.json(user);
  } catch (err) { next(err); }
});

// POST /api/v1/users
router.post('/', requireRole(USER_MANAGER_ROLES), validate(UserCreateSchema), async (req, res, next) => {
  try {
    const { userSvc, auditSvc } = getContainer();
    if (req.user.role === ROLES.TEACHER) {
      // Teachers create students only, inside their assigned classes.
      const classIds = await getTeacherClassIds(req.schoolId, req.user.id);
      if (!req.body.class_id || !classIds.includes(String(req.body.class_id))) {
        throw new ForbiddenError('Students must belong to one of your classes');
      }
      req.body = { ...req.body, role: ROLES.STUDENT, status: 'active' };
    }
    const user = await userSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'user', entityId: user.id, action: 'create', ip: req.ip });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// PATCH /api/v1/users/:id
router.patch('/:id', requireRole(USER_MANAGER_ROLES), validate(UserUpdateSchema), async (req, res, next) => {
  try {
    const { userSvc, auditSvc } = getContainer();
    if (req.user.role === ROLES.TEACHER) {
      const classIds = await assertTeacherStudent(await userSvc.getById(req.params.id), req);
      if (req.body.role && req.body.role !== ROLES.STUDENT) {
        throw new ForbiddenError('Teachers manage students only');
      }
      if (req.body.class_id && !classIds.includes(String(req.body.class_id))) {
        throw new ForbiddenError('Students must belong to one of your classes');
      }
    }
    const updated = await userSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'user', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/users/:id
router.delete('/:id', requireRole(USER_MANAGER_ROLES), async (req, res, next) => {
  try {
    const { userSvc, auditSvc } = getContainer();
    if (req.user.role === ROLES.TEACHER) {
      await assertTeacherStudent(await userSvc.getById(req.params.id), req);
    }
    await userSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'user', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/v1/users/:id/reset-password
router.post('/:id/reset-password', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]), async (req, res, next) => {
  try {
    const { userSvc } = getContainer();
    const { newPassword } = req.body;
    await userSvc.resetPassword(req.params.id, newPassword, req.user);
    res.json({ message: 'Password reset' });
  } catch (err) { next(err); }
});

export default router;
