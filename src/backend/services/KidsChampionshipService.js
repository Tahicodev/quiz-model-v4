/**
 * src/backend/services/KidsChampionshipService.js
 *
 * Kids Championship — a kid-friendly tournament built on Kids Games.
 * Completely separate from the collège/lycée Tournament stack: no rounds,
 * brackets or multipliers. A championship is a fixed list of published kids
 * games ("challenges"); kids join with a 4-char code + their first name
 * (no login), and every challenge is worth up to 100 championship points
 * (score percent), best run per challenge counts.
 *
 * Leaderboard: points desc → stars desc → challenges completed desc.
 */

import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

// No 0, O, 1, I — same alphabet as kids game PINs.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export class KidsChampionshipService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  // ─── Permissions ───────────────────────────────────────────────────────
  // Admins manage every championship in the school; teachers only theirs
  // (same ownership rule as tournaments.routes.js).

  #canManage(championship, user) {
    if (!user) return false;
    if ([ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) return true;
    return user.role === ROLES.TEACHER && championship.creator_id === user.id;
  }

  #assertManage(championship, user) {
    if (!this.#canManage(championship, user)) throw new ForbiddenError();
  }

  // ─── Challenge validation ──────────────────────────────────────────────

  /** Resolve game_ids against published games of this school (order kept). */
  async #validateGameIds(schoolId, gameIds) {
    const wanted = [...new Set((gameIds || []).map(String))];
    if (!wanted.length) throw new ValidationError({ game_ids: ['Pick at least one game'] });
    const { data } = await this.#repo.getAll('kidsGames', {
      filters: { school_id: schoolId, status: 'published' },
      limit: 100,
    });
    const byId = new Map((data || []).map((g) => [g.id, g]));
    const missing = wanted.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new ValidationError({
        game_ids: ['Some games are missing or not published'],
      });
    }
    return wanted;
  }

  // ─── Code generation ───────────────────────────────────────────────────

  async #generateCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      const { data } = await this.#repo.getAll('kidsChampionships', {
        filters: { code },
        limit: 1,
      });
      if (!data?.length) return code;
    }
    throw new Error('Could not generate a unique championship code');
  }

  // ─── Admin/teacher CRUD ────────────────────────────────────────────────

  async list(schoolId, user, { status, limit = 20, offset = 0 } = {}) {
    const filters = { school_id: schoolId };
    if (status) filters.status = status;
    if (user.role === ROLES.TEACHER) filters.creator_id = user.id;
    const { data, total } = await this.#repo.getAll('kidsChampionships', {
      filters,
      orderBy: 'created_at',
      direction: 'desc',
      limit,
      offset,
    });
    const withStats = await Promise.all(
      (data || []).map((c) => this.#withStats(c)),
    );
    return { data: withStats, total };
  }

  async #withStats(championship) {
    const gameIds = parseJson(championship.game_ids, []);
    let players = 0;
    let scores = 0;
    try {
      const { data: rows } = await this.#repo.getAll('kidsChampionshipScores', {
        filters: { championship_id: championship.id },
        limit: 1000,
      });
      const names = new Set();
      for (const r of rows || []) {
        if (gameIds.includes(r.game_id)) {
          names.add(r.player_name);
          scores += 1;
        }
      }
      players = names.size;
    } catch { /* stats are best-effort */ }
    return { ...championship, game_ids: gameIds, players, scores };
  }

  async create(user, data) {
    const gameIds = await this.#validateGameIds(user.school_id, data.game_ids);
    const code = await this.#generateCode();
    return this.#repo.create('kidsChampionships', {
      school_id: user.school_id,
      creator_id: user.id || null,
      name: String(data.name).trim(),
      emoji: data.emoji || '🏆',
      description: data.description || null,
      code,
      status: 'active',
      game_ids: JSON.stringify(gameIds),
    });
  }

  async getById(id) {
    const championship = await this.#repo.getById('kidsChampionships', id);
    if (!championship) throw new NotFoundError('Championship');
    return championship;
  }

  async getManaged(id, user) {
    const championship = await this.getById(id);
    this.#assertManage(championship, user);
    return this.#withStats({ ...championship, game_ids: parseJson(championship.game_ids, []) });
  }

  async update(id, data, user) {
    const championship = await this.getById(id);
    this.#assertManage(championship, user);
    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.emoji !== undefined) patch.emoji = data.emoji;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.status !== undefined) patch.status = data.status; // active | finished (reopen allowed)
    if (data.game_ids !== undefined) {
      patch.game_ids = JSON.stringify(await this.#validateGameIds(championship.school_id, data.game_ids));
    }
    if (!Object.keys(patch).length) return championship;
    return this.#repo.update('kidsChampionships', id, patch);
  }

  async setStatus(id, status, user) {
    return this.update(id, { status }, user);
  }

  async delete(id, user) {
    const championship = await this.getById(id);
    this.#assertManage(championship, user);
    // Score rows cascade with the championship (onDelete: Cascade).
    return this.#repo.delete('kidsChampionships', id);
  }

  // ─── Public (kid lobby) views ──────────────────────────────────────────

  /** Full lobby payload for a 4-char join code (no auth — kid devices). */
  async getPublicByCode(code, playerName) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{4}$/.test(normalized)) {
      throw new NotFoundError('Championship');
    }
    const { data } = await this.#repo.getAll('kidsChampionships', {
      filters: { code: normalized },
      limit: 1,
    });
    const championship = data?.[0];
    if (!championship) throw new NotFoundError('Championship');
    return this.#publicView(championship, playerName);
  }

  /** Same payload keyed by id — the play-page "back to lobby" link uses it. */
  async getPublicById(id, playerName) {
    const championship = await this.getById(id);
    return this.#publicView(championship, playerName);
  }

  async #publicView(championship, playerName) {
    const gameIds = parseJson(championship.game_ids, []);
    const { data: games } = await this.#repo.getAll('kidsGames', {
      filters: { school_id: championship.school_id },
      limit: 100,
    });
    const byId = new Map((games || []).map((g) => [g.id, g]));
    const challenges = gameIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((g) => ({
        id: g.id,
        name: g.name,
        game_type: g.game_type,
        theme: g.theme,
        grade: g.grade,
        subject: g.subject,
        pin: g.pin,
        status: g.status,
        question_count: parseJson(g.questions_json, []).length,
      }));
    const payload = {
      championship: {
        id: championship.id,
        name: championship.name,
        emoji: championship.emoji,
        description: championship.description,
        code: championship.code,
        status: championship.status,
        created_at: championship.created_at,
      },
      challenges,
      leaderboard: await this.getLeaderboard(championship.id, { limit: 50 }),
    };
    if (playerName) {
      payload.player = await this.#playerDetail(championship, playerName);
    }
    return payload;
  }

  /** Per-challenge bests + totals for one player (lobby progress cards). */
  async #playerDetail(championship, playerName) {
    const gameIds = parseJson(championship.game_ids, []);
    const { data: rows } = await this.#repo.getAll('kidsChampionshipScores', {
      filters: { championship_id: championship.id },
      limit: 1000,
    });
    const scoresByGame = {};
    for (const row of rows || []) {
      if (row.player_name === playerName && gameIds.includes(row.game_id)) {
        scoresByGame[row.game_id] = {
          points: Number(row.points) || 0,
          score: Number(row.score) || 0,
          stars: Number(row.stars) || 0,
        };
      }
    }
    const board = await this.getLeaderboard(championship.id, { limit: 999 });
    const me = board.find((r) => r.player_name === playerName) || null;
    return {
      player_name: playerName,
      scores_by_game: scoresByGame,
      rank: me ? me.rank : null,
      points: me ? me.points : 0,
      stars: me ? me.stars : 0,
      games_played: me ? me.games_played : 0,
      players: board.length,
    };
  }

  // ─── Scoring ───────────────────────────────────────────────────────────

  /**
   * Record a server-graded kids-game completion against a championship.
   * Best run per challenge counts (replay friendly). Never throws for
   * expected reasons — returns { recorded:false, reason } so the play flow
   * keeps working even when the link is stale.
   *
   * points = score percent (0-100): every challenge is worth the same, so
   * games with different question counts stay fair.
   */
  async recordScore({ championshipId, session, score, stars, totalPoints }) {
    if (!championshipId || !session) return { recorded: false, reason: 'missing' };
    let championship;
    try {
      championship = await this.getById(championshipId);
    } catch {
      return { recorded: false, reason: 'not_found' };
    }
    if (championship.status !== 'active') return { recorded: false, reason: 'not_active' };
    if (session.school_id && championship.school_id !== session.school_id) {
      return { recorded: false, reason: 'school_mismatch' };
    }
    const gameIds = parseJson(championship.game_ids, []);
    if (!gameIds.includes(session.game_id)) return { recorded: false, reason: 'not_a_challenge' };

    const total = Number(totalPoints) || 0;
    const points = total > 0
      ? Math.min(100, Math.round((Number(score) || 0) / total * 100))
      : 0;

    let improved = false;
    try {
      const { data: existing } = await this.#repo.getAll('kidsChampionshipScores', {
        filters: {
          championship_id: championship.id,
          player_name: session.player_name,
          game_id: session.game_id,
        },
        limit: 1,
      });
      const row = existing?.[0];
      const payload = {
        avatar: session.avatar || null,
        points,
        score: Number(score) || 0,
        stars: Number(stars) || 0,
        session_id: session.id || null,
        played_at: new Date().toISOString(),
      };
      if (!row) {
        try {
          await this.#repo.create('kidsChampionshipScores', {
            championship_id: championship.id,
            school_id: championship.school_id,
            player_name: session.player_name,
            game_id: session.game_id,
            ...payload,
          });
          improved = true;
        } catch (err) {
          if (err?.code !== 'CONFLICT') throw err;
          // Concurrent first run — fall through to the best-of update below.
          const { data: raced } = await this.#repo.getAll('kidsChampionshipScores', {
            filters: {
              championship_id: championship.id,
              player_name: session.player_name,
              game_id: session.game_id,
            },
            limit: 1,
          });
          if (raced?.[0] && points > Number(raced[0].points || 0)) {
            await this.#repo.update('kidsChampionshipScores', raced[0].id, payload);
            improved = true;
          }
        }
      } else if (points > Number(row.points || 0)) {
        await this.#repo.update('kidsChampionshipScores', row.id, payload);
        improved = true;
      }
    } catch {
      // Scoring must never break the play flow — the game result stands
      // even if the championship row could not be written.
      return { recorded: false, reason: 'error' };
    }

    const leaderboard = await this.getLeaderboard(championship.id, { limit: 999 });
    const me = leaderboard.find((r) => r.player_name === session.player_name) || null;
    return {
      recorded: true,
      improved,
      points,
      leaderboard,
      my: me,
      finished: championship.status === 'finished',
    };
  }

  // ─── Leaderboard ───────────────────────────────────────────────────────

  /**
   * Aggregate score rows into player standings:
   * points desc → stars desc → challenges completed desc → name asc.
   */
  async getLeaderboard(championshipId, { limit = 50 } = {}) {
    const championship = await this.getById(championshipId);
    const gameIds = parseJson(championship.game_ids, []);
    const { data: rows } = await this.#repo.getAll('kidsChampionshipScores', {
      filters: { championship_id: championshipId },
      limit: 1000,
    });

    const byPlayer = new Map();
    for (const row of rows || []) {
      if (!gameIds.includes(row.game_id)) continue; // removed challenge
      let entry = byPlayer.get(row.player_name);
      if (!entry) {
        entry = {
          player_name: row.player_name,
          avatar: row.avatar || null,
          points: 0,
          stars: 0,
          games_played: 0,
          _games: new Set(),
          last_at: null,
        };
        byPlayer.set(row.player_name, entry);
      }
      // Rows are unique per (player, game) so a plain sum is exact.
      entry.points += Number(row.points) || 0;
      entry.stars += Number(row.stars) || 0;
      entry._games.add(row.game_id);
      const at = row.played_at ? new Date(row.played_at).getTime() : 0;
      if (!entry.last_at || at > entry.last_at) {
        entry.last_at = at;
        entry.avatar = row.avatar || entry.avatar;
      }
    }

    const board = [...byPlayer.values()]
      .map((e) => ({
        player_name: e.player_name,
        avatar: e.avatar,
        points: e.points,
        stars: e.stars,
        games_played: e._games.size,
        last_at: e.last_at ? new Date(e.last_at).toISOString() : null,
      }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.stars - a.stars ||
          b.games_played - a.games_played ||
          String(a.player_name).localeCompare(String(b.player_name)),
      )
      .map((e, i) => ({ ...e, rank: i + 1 }));

    return board.slice(0, Math.max(1, Number(limit) || 50));
  }
}
