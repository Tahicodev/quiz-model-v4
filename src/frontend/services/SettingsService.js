/**
 * src/frontend/services/SettingsService.js
 * Manages configuration settings split by visibility tiers.
 * (public, teacher, admin, system).
 */

import { ValidationError } from '../../shared/errors.js';
import { SettingUpdateSchema, SettingsBulkUpdateSchema } from '../../shared/schemas/settings.schema.js';
import { SETTINGS_VISIBILITY }                           from '../../shared/constants.js';

export class SettingsService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  /**
   * Safe to call from anywhere (even unauthenticated).
   * Returns only PUBLIC settings (e.g., app name, language, public logo).
   */
  async getPublicSettings(schoolId = null) {
    return this.#repo.query('settings.byVisibility', { schoolId, visibility: SETTINGS_VISIBILITY.PUBLIC });
  }

  /**
   * Requires Teacher/Admin role on the backend (in SaaS mode).
   * In local mode, returns public + teacher settings.
   */
  async getTeacherSettings(schoolId = null) {
    return this.#repo.query('settings.byVisibility', { schoolId, visibility: SETTINGS_VISIBILITY.TEACHER });
  }

  /**
   * Requires Admin role on the backend (in SaaS mode).
   * Returns public + teacher + admin settings.
   */
  async getAdminSettings(schoolId = null) {
    return this.#repo.query('settings.byVisibility', { schoolId, visibility: SETTINGS_VISIBILITY.ADMIN });
  }

  // NOTE: There is intentionally NO getSystemSettings() method.
  // System settings (e.g. API keys, DB config) are never sent to the client.

  /**
   * Update a single setting.
   */
  async updateSetting(schoolId, key, value, visibility) {
    const parsed = SettingUpdateSchema.safeParse({ key, value, visibility });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    if (typeof this.#repo.updateSetting === 'function') {
      return this.#repo.updateSetting(parsed.data.key, parsed.data);
    }

    const { data: existing } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key: parsed.data.key },
    });

    if (existing.length > 0) {
      return this.#repo.update('settings', existing[0].id, {
        value: parsed.data.value,
        ...(parsed.data.visibility && { visibility: parsed.data.visibility }),
      });
    }

    return this.#repo.create('settings', {
      school_id: schoolId,
      key:       parsed.data.key,
      value:     parsed.data.value,
      visibility: parsed.data.visibility ?? SETTINGS_VISIBILITY.ADMIN,
    });
  }

  async deleteSetting(schoolId, key) {
    let setting;
    if (typeof this.#repo.deleteSetting === 'function') {
      return this.#repo.deleteSetting(key);
    }
    const { data } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key },
      limit: 1,
    });
    setting = data[0];
    if (!setting) return;
    return this.#repo.delete('settings', setting.id);
  }

  /**
   * Bulk update multiple settings at once.
   * Expected format: [{ key: 'app.name', value: 'New Name' }, ...]
   */
  async bulkUpdate(schoolId, settingsArray) {
    const parsed = SettingsBulkUpdateSchema.safeParse({ settings: settingsArray });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const results = [];
    for (const item of parsed.data.settings) {
      const res = await this.updateSetting(schoolId, item.key, item.value, item.visibility);
      results.push(res);
    }
    return results;
  }
}
