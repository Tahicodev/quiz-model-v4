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

router.get('/teacher', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { settingsSvc } = getContainer();
    const settings = await settingsSvc.getTeacherSettings(req.schoolId);
    res.json(settings);
  } catch (err) { next(err); }
});

router.get('/admin', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { settingsSvc } = getContainer();
    const settings = await settingsSvc.getAdminSettings(req.schoolId);
    res.json(settings);
  } catch (err) { next(err); }
});

router.patch('/:key', requireRole(ROLES.ADMIN), validate(SettingUpdateSchema), async (req, res, next) => {
  try {
    const { settingsSvc, auditSvc } = getContainer();
    const { key } = req.params;
    const { value, visibility } = req.body;
    const setting = await settingsSvc.updateSetting(req.schoolId, key, value, visibility);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'setting', entityId: setting.id, action: 'update', ip: req.ip });
    res.json(setting);
  } catch (err) { next(err); }
});

router.delete('/:key', requireRole(ROLES.ADMIN), async (req, res, next) => {
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

router.post('/bulk', requireRole(ROLES.ADMIN), validate(SettingsBulkUpdateSchema), async (req, res, next) => {
  try {
    const { settingsSvc } = getContainer();
    const results = await settingsSvc.bulkUpdate(req.schoolId, req.body.settings);
    res.json(results);
  } catch (err) { next(err); }
});

// NOTE: No /system endpoint — system settings are never exposed via API.

export default router;
