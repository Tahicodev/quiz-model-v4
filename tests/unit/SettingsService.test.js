/**
 * tests/unit/SettingsService.test.js
 *
 * Unit tests for SettingsService with a mocked repository, grounded in the real
 * signatures in src/frontend/services/SettingsService.js:
 *   - constructor(repo)
 *   - getPublicSettings / getTeacherSettings / getAdminSettings — call
 *     repo.query('settings.byVisibility', { schoolId, visibility: ... })
 *   - updateSetting — create-or-update, defaults visibility to ADMIN for new
 *   - No getSystemSettings method (intentionally missing)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../../src/frontend/services/SettingsService.js';
import { ValidationError } from '../../src/shared/errors.js';
import { SETTINGS_VISIBILITY } from '../../src/shared/constants.js';

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
  });

  describe('no system endpoint', () => {
    it('has no getSystemSettings method (intentionally)', () => {
      expect(service.getSystemSettings).toBeUndefined();
    });
  });
});
