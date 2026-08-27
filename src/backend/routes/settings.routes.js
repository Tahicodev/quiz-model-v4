/**
 * src/backend/routes/settings.routes.js
 *
 * Settings endpoints with visibility tier enforcement.
 * Public settings: no auth required.
 * Teacher/Admin/System: require authentication + role.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { SettingUpdateSchema, SettingsBulkUpdateSchema } from '../../shared/schemas/settings.schema.js';
import { ROLES, SETTINGS_VISIBILITY } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();

// ── Public endpoint (no auth) ────────────────────────────────────────────────
// Resolves the school's public-facing settings. If `?school_id=` is omitted,
// falls back to the bootstrap tenant (created by `prisma/seed.js`).
router.get('/public', async (req, res, next) => {
  try {
    const { settingsSvc } = getContainer();
    const schoolId = req.query.school_id || process.env.DEFAULT_SCHOOL_ID || 'saas-default';
    const settings = await settingsSvc.getPublicSettings(schoolId);
    res.json(settings);
  } catch (err) { next(err); }
});

// ── Authenticated endpoints ──────────────────────────────────────────────────
router.use(requireAuth, enforceTenant);

// Admins and teachers share the settings panel. Admin-only keys (adminSecret,
// recoveryCode, system settings) are still enforced inside the per-key
// sanitizer in bulk.routes.js and inside the SettingsService.
const SETTINGS_SHARED_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];
const SETTINGS_ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN];

router.get('/teacher', requireRole(SETTINGS_SHARED_ROLES), async (req, res, next) => {
  try {
    const { settingsSvc } = getContainer();
    const settings = await settingsSvc.getTeacherSettings(req.schoolId);
    res.json(settings);
  } catch (err) { next(err); }
});

router.get('/admin', requireRole(SETTINGS_ADMIN_ROLES), async (req, res, next) => {
  try {
    const { settingsSvc } = getContainer();
    const settings = await settingsSvc.getAdminSettings(req.schoolId);
    res.json(settings);
  } catch (err) { next(err); }
});

router.patch('/:key', requireRole(SETTINGS_SHARED_ROLES), validate(SettingUpdateSchema), async (req, res, next) => {
  try {
    const { settingsSvc, auditSvc } = getContainer();
    const { key } = req.params;
    const { value, visibility } = req.body;
    // The SettingsService should refuse to update admin-only keys for a
    // teacher; the per-route role gate is a fast guard, the per-key check
    // is the real authority.
    if (
      req.user.role === ROLES.TEACHER &&
      ['adminSecret', 'recoveryCode'].includes(key)
    ) {
      return next(new ForbiddenError('Only admins can modify this setting'));
    }
    const setting = await settingsSvc.updateSetting(req.schoolId, key, value, visibility);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'setting', entityId: setting.id, action: 'update', ip: req.ip });
    res.json(setting);
  } catch (err) { next(err); }
});

router.delete('/:key', requireRole(SETTINGS_ADMIN_ROLES), async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const { data } = await repo.getAll('settings', {
      filters: { school_id: req.schoolId, key: req.params.key },
      limit: 1,
    });
    if (data.length === 0) return res.status(404).json({ code: 'NOT_FOUND', message: 'Setting not found' });
    await repo.delete('settings', data[0].id);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/bulk', requireRole(SETTINGS_SHARED_ROLES), validate(SettingsBulkUpdateSchema), async (req, res, next) => {
  try {
    const { settingsSvc } = getContainer();
    // Defense-in-depth: drop admin-only keys from a teacher-initiated bulk
    // write. The same filter is applied in bulk.routes.js; doing it here
    // too means even non-bulk callers (a future POST /settings endpoint)
    // stay safe.
    if (req.user.role === ROLES.TEACHER && Array.isArray(req.body?.settings)) {
      req.body.settings = req.body.settings.filter(
        (s) => s && !['adminSecret', 'recoveryCode'].includes(s.key),
      );
    }
    const results = await settingsSvc.bulkUpdate(req.schoolId, req.body.settings);
    res.json(results);
  } catch (err) { next(err); }
});

// NOTE: No /system endpoint — system settings are never exposed via API.

export default router;
