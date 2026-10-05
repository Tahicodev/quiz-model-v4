/**
 * src/backend/routes/categories.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { CategoryCreateSchema, CategoryUpdateSchema, CategoryFilterSchema } from '../../shared/schemas/category.schema.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

/**
 * Teachers are confined to their own rows. Legacy unattributed rows
 * (created_by NULL = historically shared content) stay visible to them;
 * anything authored by another teacher is forbidden.
 */
function assertOwnership(row, user) {
  if (!row) return;
  if (user.role !== ROLES.TEACHER) return;
  if (row.created_by && row.created_by !== user.id) {
    throw new ForbiddenError('Not your category');
  }
}

router.get('/', validateQuery(CategoryFilterSchema), async (req, res, next) => {
  try {
    const { categorySvc } = getContainer();
    const { limit, offset, orderBy, direction, search, created_by, ...filters } = req.query;
    const or = req.user.role === ROLES.TEACHER
      ? [{ created_by: req.user.id }, { created_by: null }]
      : null;
    const result = await categorySvc.list(
      { ...filters, school_id: req.schoolId, ...(created_by && req.user.role !== ROLES.TEACHER ? { created_by } : {}), ...(or ? { or } : {}) },
      { limit, offset, orderBy, direction, search },
    );
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/tree', async (req, res, next) => {
  try {
    const { categorySvc } = getContainer();
    const tree = await categorySvc.getTree(req.schoolId);
    res.json(tree);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { categorySvc } = getContainer();
    const cat = await categorySvc.getById(req.params.id);
    assertOwnership(cat, req.user);
    res.json(cat);
  } catch (err) { next(err); }
});

router.post('/', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), validate(CategoryCreateSchema), async (req, res, next) => {
  try {
    const { categorySvc, auditSvc } = getContainer();
    const cat = await categorySvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'category', entityId: cat.id, action: 'create', ip: req.ip });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), validate(CategoryUpdateSchema), async (req, res, next) => {
  try {
    const { categorySvc, auditSvc } = getContainer();
    assertOwnership(await categorySvc.getById(req.params.id), req.user);
    const updated = await categorySvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'category', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const { categorySvc, auditSvc } = getContainer();
    assertOwnership(await categorySvc.getById(req.params.id), req.user);
    await categorySvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'category', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
