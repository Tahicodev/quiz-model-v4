/**
 * src/backend/services/GamePresetService.js
 */

import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export class GamePresetService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async listForTenant(schoolId, { limit = 200, offset = 0 } = {}) {
    return this.#repo.getAll('game_presets', {
      filters: { school_id: schoolId },
      orderBy: 'created_at',
      direction: 'desc',
      limit,
      offset,
    });
  }

  async getDefaults(schoolId) {
    return this.#repo.getAll('game_presets', {
      filters: { school_id: schoolId, is_default: true },
      limit: 50,
    });
  }

  #requireAdmin(user) {
    if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) throw new ForbiddenError();
  }

  #sanitize(data) {
    const name = String(data.name ?? '').trim();
    const gameType = String(data.game_type ?? data.gameType ?? '').trim();
    const gameMode = String(data.game_mode ?? data.gameMode ?? '').trim();
    if (!name || !gameType || !gameMode) {
      throw new ValidationError({
        name: !name ? ['Required'] : undefined,
        game_type: !gameType ? ['Required'] : undefined,
        game_mode: !gameMode ? ['Required'] : undefined,
      });
    }
    const rules = data.rules_json ?? data.rules ?? {};
    return {
      name,
      game_type: gameType,
      game_mode: gameMode,
      rules_json: typeof rules === 'string' ? rules : JSON.stringify(rules),
      is_default: Boolean(data.is_default ?? data.isDefault ?? false),
    };
  }

  async create(user, data) {
    this.#requireAdmin(user);
    return this.#repo.create('game_presets', {
      ...this.#sanitize(data),
      school_id: user.school_id,
    });
  }

  async update(user, id, data) {
    this.#requireAdmin(user);
    const existing = await this.#repo.getById('game_presets', id);
    if (!existing || existing.school_id !== user.school_id) throw new NotFoundError('GamePreset');
    return this.#repo.update('game_presets', id, this.#sanitize({ ...existing, ...data }));
  }

  async delete(user, id) {
    this.#requireAdmin(user);
    const existing = await this.#repo.getById('game_presets', id);
    if (!existing || existing.school_id !== user.school_id) throw new NotFoundError('GamePreset');
    await this.#repo.delete('game_presets', id);
  }
}
