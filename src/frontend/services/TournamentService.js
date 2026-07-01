/**
 * src/frontend/services/TournamentService.js
 * Manages Tournaments and leaderboards.
 */

import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../shared/errors.js';
import { TournamentCreateSchema, TournamentUpdateSchema, TournamentFilterSchema } from '../../shared/schemas/tournament.schema.js';
import { ROLES, TOURNAMENT_STATUS }                                      from '../../shared/constants.js';

export class TournamentService {
  #repo;
  #gameService;

  constructor(repo, gameService) {
    this.#repo        = repo;
    this.#gameService = gameService;
  }

  async list(filters = {}, pagination = {}) {
    const parsed = TournamentFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('tournaments', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');
    return t;
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = TournamentCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    return this.#repo.create('tournaments', {
      ...parsed.data,
      school_id:  currentUser?.school_id ?? 'local',
      creator_id: currentUser?.id        ?? 'system',
      status:     TOURNAMENT_STATUS.DRAFT,
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('tournaments', id);
    if (!existing) throw new NotFoundError('Tournament');
    if (existing.status === TOURNAMENT_STATUS.FINISHED) {
      throw new ValidationError({ status: ['Cannot modify a finished tournament'] });
    }

    const parsed = TournamentUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    return this.#repo.update('tournaments', id, parsed.data);
  }

  async open(id, currentUser) {
    this.#requireAdmin(currentUser);
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== TOURNAMENT_STATUS.DRAFT) {
      throw new ValidationError({ status: ['Only draft tournaments can be opened'] });
    }
    return this.#repo.update('tournaments', id, { status: TOURNAMENT_STATUS.OPEN });
  }

  async close(id, currentUser) {
    this.#requireAdmin(currentUser);
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== TOURNAMENT_STATUS.OPEN) {
      throw new ValidationError({ status: ['Only open tournaments can be closed (made active)'] });
    }
    return this.#repo.update('tournaments', id, { status: TOURNAMENT_STATUS.ACTIVE });
  }

  async register(tournamentId, userId) {
    const t = await this.#repo.getById('tournaments', tournamentId);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== TOURNAMENT_STATUS.OPEN && t.status !== TOURNAMENT_STATUS.ACTIVE) {
      throw new ValidationError({ status: ['Registration is closed'] });
    }

    const { data: existing } = await this.#repo.getAll('tournament_entries', {
      filters: { tournament_id: tournamentId, user_id: userId },
    });
    if (existing.length > 0) throw new ConflictError('Already registered');

    return this.#repo.create('tournament_entries', {
      tournament_id: tournamentId,
      user_id:       userId,
      school_id:     t.school_id,
      score:         0,
      completed:     false,
      registered_at: new Date().toISOString(),
    });
  }

  async getLeaderboard(tournamentId, limit = 50) {
    return this.#repo.query('tournament.leaderboard', { tournamentId, limit });
  }

  async finish(id, currentUser) {
    this.#requireAdmin(currentUser);
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');

    const entries = await this.#repo.query('tournament.leaderboard', { tournamentId: id, limit: 9999 });
    for (let i = 0; i < entries.length; i++) {
      await this.#repo.update('tournament_entries', entries[i].id, {
        rank:         i + 1,
        completed:    true,
        completed_at: new Date().toISOString(),
      });
    }

    return this.#repo.update('tournaments', id, { status: TOURNAMENT_STATUS.FINISHED });
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}
