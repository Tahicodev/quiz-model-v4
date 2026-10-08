/**
 * src/frontend/services/SettingsService.js
 * Manages configuration settings split by visibility tiers.
 * (public, teacher, admin, system).
 */

import { ValidationError, ForbiddenError } from '../../shared/errors.js';
import { SettingUpdateSchema, SettingsBulkUpdateSchema } from '../../shared/schemas/settings.schema.js';
import { ROLES, SETTINGS_VISIBILITY }                     from '../../shared/constants.js';

/** Permission order of a setting's visibility tier (lowest → highest). */
const VISIBILITY_RANK = Object.freeze({
  [SETTINGS_VISIBILITY.PUBLIC]:  0,
  [SETTINGS_VISIBILITY.TEACHER]: 1,
  [SETTINGS_VISIBILITY.ADMIN]:   2,
  [SETTINGS_VISIBILITY.SYSTEM]:  3,
});

const rankOf = (visibility) =>
  VISIBILITY_RANK[visibility] ?? VISIBILITY_RANK[SETTINGS_VISIBILITY.ADMIN];

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
   * @param {object|null} actor  the authenticated user; when present the
   *   visibility tier of the target setting is enforced against the role.
   */
  async updateSetting(schoolId, key, value, visibility, actor = null) {
    const parsed = SettingUpdateSchema.safeParse({ key, value, visibility });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    if (typeof this.#repo.updateSetting === 'function') {
      // Browser: the backend re-checks visibility against the JWT on PATCH.
      return this.#repo.updateSetting(parsed.data.key, parsed.data);
    }

    const { data: existing } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key: parsed.data.key },
      limit: 1,
    });

    if (actor) {
      // Visibility is a permission, not a cosmetic label. The effective tier
      // is the HIGHER of the stored tier and the requested one, so a teacher
      // can neither rewrite an admin key nor downgrade it to 'teacher' to get
      // around the check. An omitted `visibility` (the common PATCH) requests
      // nothing, so it must not out-rank what is already stored.
      const stored = existing[0]?.visibility ?? null;
      const requested = parsed.data.visibility ?? null;
      const effectiveVisibility = (stored && requested)
        ? (rankOf(requested) > rankOf(stored) ? requested : stored)
        : (requested ?? stored ?? SETTINGS_VISIBILITY.ADMIN);

      if (effectiveVisibility === SETTINGS_VISIBILITY.SYSTEM) {
        throw new ForbiddenError('System settings are managed server-side');
      }
      if (
        actor.role === ROLES.TEACHER &&
        rankOf(effectiveVisibility) > rankOf(SETTINGS_VISIBILITY.TEACHER)
      ) {
        throw new ForbiddenError('Only admins can modify this setting');
      }
    }

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
   * @param {object|null} actor  authenticated user; visibility tier is
   *   enforced per row (see updateSetting).
   */
  async bulkUpdate(schoolId, settingsArray, actor = null) {
    const parsed = SettingsBulkUpdateSchema.safeParse({ settings: settingsArray });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const results = [];
    for (const item of parsed.data.settings) {
      try {
        results.push(await this.updateSetting(schoolId, item.key, item.value, item.visibility, actor));
      } catch (err) {
        // A teacher saving a form that also carries admin/system keys must
        // still be able to save the keys they own: skip the rows they are not
        // allowed to touch instead of failing the whole batch. Admin errors
        // still propagate.
        if (actor?.role === ROLES.TEACHER && err?.code === 'FORBIDDEN') continue;
        throw err;
      }
    }
    return results;
  }
}
