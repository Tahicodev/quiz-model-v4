/**
 * tests/unit/SettingsService.test.js
 *
 * Unit tests for SettingsService with a mocked repository, grounded in the real
 * signatures in src/frontend/services/SettingsService.js:
 *   - constructor(repo)
 *   - getPublicSettings / getTeacherSettings / getAdminSettings — call
 *     repo.query('settings.byVisibility', { schoolId, visibility: ... })
 *   - updateSetting — create-or-update, defaults visibility to ADMIN for new
 *   - updateSetting(..., actor) — with an actor the effective visibility tier
 *     (higher of stored and requested) is enforced against the actor's role
 *   - No getSystemSettings method (intentionally missing)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../../src/frontend/services/SettingsService.js';
import { ValidationError, ForbiddenError } from '../../src/shared/errors.js';
import { ROLES, SETTINGS_VISIBILITY } from '../../src/shared/constants.js';

function makeRepo(overrides = {}) {
  return {
    getAll:     vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById:    vi.fn().mockResolvedValue(null),
    create:     vi.fn(),
    update:     vi.fn(),
    delete:     vi.fn(),
    query:      vi.fn().mockResolvedValue([]),
    createMany: vi.fn(),
    ...overrides,
  };
}

describe('SettingsService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new SettingsService(repo);
  });

  describe('visibility tiers', () => {
    it('getPublicSettings calls query with visibility=public', async () => {
      repo.query.mockResolvedValue([{ key: 'app.name', value: 'Quiz', visibility: 'public' }]);
      const result = await service.getPublicSettings('s-1');
      expect(repo.query).toHaveBeenCalledWith('settings.byVisibility', {
        schoolId: 's-1',
        visibility: SETTINGS_VISIBILITY.PUBLIC,
      });
      expect(result).toHaveLength(1);
    });

    it('getAdminSettings calls query with visibility=admin (which includes public+teacher+admin per the query impl)', async () => {
      await service.getAdminSettings('s-1');
      expect(repo.query).toHaveBeenCalledWith('settings.byVisibility', {
        schoolId: 's-1',
        visibility: SETTINGS_VISIBILITY.ADMIN,
      });
    });
  });

  describe('updateSetting()', () => {
    it('creates a new setting with default ADMIN visibility when it does not exist', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 }); // not found → create
      repo.create.mockImplementation(async (_, data) => ({ id: 's1', ...data }));

      const result = await service.updateSetting('s-1', 'app.name', 'My Quiz');
      expect(repo.create).toHaveBeenCalledWith('settings', {
        school_id: 's-1',
        key: 'app.name',
        value: 'My Quiz',
        visibility: SETTINGS_VISIBILITY.ADMIN,
      });
      expect(result.key).toBe('app.name');
    });

    it('updates an existing setting when it already exists', async () => {
      repo.getAll.mockResolvedValue({ data: [{ id: 's1', key: 'app.name', value: 'Old' }], total: 1 });
      repo.update.mockResolvedValue({ id: 's1', key: 'app.name', value: 'Updated' });

      const result = await service.updateSetting('s-1', 'app.name', 'Updated');
      expect(repo.update).toHaveBeenCalledWith('settings', 's1', {
        value: 'Updated',
      });
      expect(result.value).toBe('Updated');
    });

    it('throws ValidationError when data fails schema validation', async () => {
      await expect(service.updateSetting('s-1', '', '')).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('updateSetting() visibility enforcement', () => {
    const teacher = { id: 'u-t', role: ROLES.TEACHER, school_id: 's-1' };
    const admin = { id: 'u-a', role: ROLES.ADMIN, school_id: 's-1' };

    const existingWith = (visibility) => ({
      data: [{ id: 's1', key: 'exam.default_duration', value: '30', visibility }],
      total: 1,
    });

    it('lets a teacher update a teacher-tier key when visibility is omitted', async () => {
      repo.getAll.mockResolvedValue(existingWith(SETTINGS_VISIBILITY.TEACHER));
      repo.update.mockResolvedValue({ id: 's1', value: '45' });

      await service.updateSetting('s-1', 'exam.default_duration', '45', undefined, teacher);

      expect(repo.update).toHaveBeenCalledWith('settings', 's1', { value: '45' });
    });

    it('rejects a teacher writing an admin-tier key', async () => {
      repo.getAll.mockResolvedValue(existingWith(SETTINGS_VISIBILITY.ADMIN));

      await expect(
        service.updateSetting('s-1', 'exam.default_duration', '99', undefined, teacher),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('does not let a teacher downgrade an admin key by asking for teacher visibility', async () => {
      repo.getAll.mockResolvedValue(existingWith(SETTINGS_VISIBILITY.ADMIN));

      await expect(
        service.updateSetting('s-1', 'exam.default_duration', '99', SETTINGS_VISIBILITY.TEACHER, teacher),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects system-tier settings even for an admin', async () => {
      repo.getAll.mockResolvedValue(existingWith(SETTINGS_VISIBILITY.SYSTEM));

      await expect(
        service.updateSetting('s-1', 'exam.default_duration', '99', undefined, admin),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects a teacher creating a key without claiming a teacher-tier visibility', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });

      await expect(
        service.updateSetting('s-1', 'exam.default_duration', '30', undefined, teacher),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lets a teacher create a teacher-tier key', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      repo.create.mockImplementation(async (_, data) => ({ id: 's2', ...data }));

      await service.updateSetting(
        's-1', 'exam.default_duration', '30', SETTINGS_VISIBILITY.TEACHER, teacher,
      );

      expect(repo.create).toHaveBeenCalledWith('settings', expect.objectContaining({
        key: 'exam.default_duration',
        visibility: SETTINGS_VISIBILITY.TEACHER,
      }));
    });
  });

  describe('bulkUpdate()', () => {
    it('calls updateSetting for each item and returns the results', async () => {
      const items = [
        { key: 'app.name', value: 'A' },
        { key: 'game.max_players', value: '10' },
      ];
      // Each updateSetting internally calls getAll → empty + create
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      repo.create.mockImplementation(async (_, d) => ({ id: `s-${d.key}`, ...d }));

      const results = await service.bulkUpdate('s-1', items);
      expect(results).toHaveLength(2);
      expect(repo.create).toHaveBeenCalledTimes(2);
    });

    it('skips the rows a teacher may not touch instead of failing the batch', async () => {
      const teacher = { id: 'u-t', role: ROLES.TEACHER, school_id: 's-1' };
      repo.getAll.mockImplementation(async (_model, opts) => ({
        data: [{
          id: 's1',
          key: opts.filters.key,
          visibility: opts.filters.key === 'app.adminOnly'
            ? SETTINGS_VISIBILITY.ADMIN
            : SETTINGS_VISIBILITY.TEACHER,
        }],
        total: 1,
      }));
      repo.update.mockImplementation(async (_model, id, data) => ({ id, ...data }));

      const results = await service.bulkUpdate('s-1', [
        { key: 'exam.default_duration', value: '45' },
        { key: 'app.adminOnly', value: 'nope' },
      ], teacher);

      expect(results).toHaveLength(1);
      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.update.mock.calls[0][2]).toEqual({ value: '45' });
    });
  });

  describe('no system endpoint', () => {
    it('has no getSystemSettings method (intentionally)', () => {
      expect(service.getSystemSettings).toBeUndefined();
    });
  });
});
