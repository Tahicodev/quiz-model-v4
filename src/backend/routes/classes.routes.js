/**
 * src/backend/routes/classes.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { ClassCreateSchema, ClassUpdateSchema, ClassFilterSchema } from '../../shared/schemas/class.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Teachers manage classes alongside admins (ClassService.#requireAdmin
// allows ADMIN + TEACHER) — the route must match, otherwise teachers get
// 403 on every class write while the UI invites them to save.
const CLASS_WRITE_ROLES = [ROLES.ADMIN, ROLES.TEACHER];

const TEACHER_ASSIGNMENTS_KEY = 'teacherClassAssignments';

/**
 * Grant a class to a teacher's assignment list (the `teacherClassAssignments`
 * school setting: { userId: [classId, ...] }). Teachers may only place
 * students in assigned classes, so a class a teacher just created must be
 * assigned to them immediately — otherwise creating the student right after
 * fails with "Students must belong to one of your classes". Merges with the
 * existing map; other teachers' entries are untouched.
 */
export async function grantClassToTeacher(repo, schoolId, teacherId, classId) {
  const { data } = await repo.getAll('settings', {
    filters: { school_id: schoolId, key: TEACHER_ASSIGNMENTS_KEY },
    limit: 1,
  });
  let map = {};
  try { map = JSON.parse(data[0]?.value || '{}') || {}; } catch { map = {}; }
  const ids = new Set(
    (Array.isArray(map[teacherId]) ? map[teacherId] : []).map(String),
  );
  ids.add(String(classId));
  map[teacherId] = [...ids].filter(Boolean);
  const value = JSON.stringify(map);
  if (data[0]?.id) {
    await repo.update('settings', data[0].id, { value });
  } else {
    await repo.create('settings', {
      school_id: schoolId,
      key: TEACHER_ASSIGNMENTS_KEY,
      value,
      visibility: 'admin',
    });
  }
}

router.get('/', validateQuery(ClassFilterSchema), async (req, res, next) => {
  try {
    const { classSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await classSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { classSvc } = getContainer();
    const cls = await classSvc.getById(req.params.id);
    res.json(cls);
  } catch (err) { next(err); }
});

router.get('/:id/students', async (req, res, next) => {
  try {
    const { classSvc } = getContainer();
    const students = await classSvc.getStudents(req.params.id);
    res.json(students);
  } catch (err) { next(err); }
});

router.post('/', requireRole(CLASS_WRITE_ROLES), validate(ClassCreateSchema), async (req, res, next) => {
  try {
    const { classSvc, auditSvc, repo } = getContainer();
    const cls = await classSvc.create(req.body, req.user);
    if (req.user.role === ROLES.TEACHER) {
      // Best-effort: the class must never fail to create because of this.
      try { await grantClassToTeacher(repo, req.schoolId, req.user.id, cls.id); } catch { /* assignment stays admin-curated */ }
    }
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'class', entityId: cls.id, action: 'create', ip: req.ip });
    res.status(201).json(cls);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(CLASS_WRITE_ROLES), validate(ClassUpdateSchema), async (req, res, next) => {
  try {
    const { classSvc, auditSvc } = getContainer();
    const updated = await classSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'class', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(CLASS_WRITE_ROLES), async (req, res, next) => {
  try {
    const { classSvc, auditSvc } = getContainer();
    await classSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'class', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
