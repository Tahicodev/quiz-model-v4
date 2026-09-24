/**
 * src/backend/routes/school.routes.js
 *
 * School profile endpoints — the per-tenant identity (name, type, address,
 * contacts, logo) used by the Quick Start "School & Security" step and by
 * login-page branding.
 *
 *   GET  /profile      public branding subset (no auth — login pages need it)
 *   GET  /profile/full  the whole profile (any authenticated user)
 *   PUT  /profile       admin-only update, zod-validated, audit-logged,
 *                       broadcasts school:profile-updated to the tenant room
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { SchoolProfileSchema } from '../../shared/schemas/school.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';
import { getIO } from '../realtime/socket.server.js';

const router = Router();

// Only these fields ever leave the server without authentication. Contacts
// (phone/email/address) stay behind requireAuth.
const PUBLIC_FIELDS = ['name', 'school_type', 'city', 'logo_url'];

function resolveSchoolId(req, value) {
  return value || req.schoolId || process.env.DEFAULT_SCHOOL_ID || 'saas-default';
}

// ── Public branding subset (no auth) ─────────────────────────────────────────
router.get('/profile', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const schoolId = resolveSchoolId(req, req.query.school_id);
    const school = await repo.getById('schools', schoolId);
    if (!school) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'School not found' });
    }
    const payload = {};
    for (const field of PUBLIC_FIELDS) payload[field] = school[field] ?? null;
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// ── Authenticated endpoints ──────────────────────────────────────────────────
router.get('/profile/full', requireAuth, enforceTenant, async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const school = await repo.getById('schools', req.schoolId);
    if (!school) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'School not found' });
    }
    res.json(school);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/school/profile — admin only
router.put(
  '/profile',
  requireAuth,
  enforceTenant,
  requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(SchoolProfileSchema),
  async (req, res, next) => {
    try {
      const { repo, auditSvc } = getContainer();
      const { name, school_type, school_year, address, city, phone, email, logo_url } = req.body;
      const updated = await repo.update('schools', req.schoolId, {
        name,
        school_type,
        school_year,
        address,
        city,
        phone,
        email,
        logo_url,
      });

      await auditSvc.log({
        schoolId: req.schoolId,
        actorId: req.user.id,
        entityType: 'school',
        entityId: req.schoolId,
        action: 'update_profile',
        ip: req.ip,
      });

      // Live-refresh header/login branding in every open tab of this school.
      try {
        const io = getIO();
        io.to(`school:${req.schoolId}`).emit('school:profile-updated', {
          schoolId: req.schoolId,
          profile: {
            name: updated.name,
            school_type: updated.school_type,
            address: updated.address,
            city: updated.city,
            phone: updated.phone,
            email: updated.email,
            logo_url: updated.logo_url,
          },
          by: req.user.username,
        });
      } catch (e) {
        logger.warn('school.routes: profile-updated broadcast failed (continuing)', {
          error: e?.message,
        });
      }

      logger.info('school.routes: profile updated', {
        schoolId: req.schoolId,
        by: req.user.username,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
