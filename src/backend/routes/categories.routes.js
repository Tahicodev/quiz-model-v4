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
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

router.get('/', validateQuery(CategoryFilterSchema), async (req, res, next) => {
  try {
    const { categorySvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await categorySvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
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
    res.json(cat);
  } catch (err) { next(err); }
});

router.post('/', requireRole(ROLES.ADMIN), validate(CategoryCreateSchema), async (req, res, next) => {
  try {
    const { categorySvc, auditSvc } = getContainer();
    const cat = await categorySvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'category', entityId: cat.id, action: 'create', ip: req.ip });
    res.status(201).json(cat);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(ROLES.ADMIN), validate(CategoryUpdateSchema), async (req, res, next) => {
  try {
    const { categorySvc, auditSvc } = getContainer();
    const updated = await categorySvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'category', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { categorySvc, auditSvc } = getContainer();
    await categorySvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'category', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
