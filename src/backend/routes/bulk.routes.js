/**
 * src/backend/routes/bulk.routes.js
 *
 * Generic bulk-create endpoint for all entities.
 * The frontend ApiRepository calls POST /api/v1/bulk/:table
 * when the service layer calls repo.createMany().
 *
 * Accepts:   { items: object[] }
 * Returns:   { count: number }
 * Requires:  JWT auth + admin role + tenant scoping.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { enforceTenant } from '../middleware/tenant.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();

router.use(requireAuth, requireRole(ROLES.ADMIN), enforceTenant);

/**
 * POST /api/v1/bulk/:table
 * Body: { items: object[] }
 * Inserts all items using repo.createMany(). Each row gets
 * school_id from the JWT if the table supports tenant scoping.
 */
router.post('/:table', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const { table } = req.params;
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'items must be a non-empty array' });
    }

    // Tag every item with the tenant id so cross-tenant leakage is impossible.
    const scoped = items.map((item) => ({ ...item, school_id: req.schoolId }));
    const result = await repo.createMany(table, scoped);

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
