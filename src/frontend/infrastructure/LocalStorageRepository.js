/**
 * src/frontend/infrastructure/LocalStorageRepository.js
 *
 * Repository implementation using browser localStorage.
 * All localStorage reads/writes are ONLY here — nowhere else in the codebase.
 * TABLE_KEYS maps entity names to the exact keys used by the existing app,
 * so all current data is preserved without any migration.
 */

import { IStorageRepository } from './IStorageRepository.js';
import { IdGenerator }        from './IdGenerator.js';
import { NotFoundError }      from '../../shared/errors.js';

/**
 * Maps table/entity names → existing localStorage keys.
 * Never change these values — they preserve all current user data.
 */
const TABLE_KEYS = {
  users:         'quizUsers',
  classes:       'quizClasses',
  categories:    'quizCategories',
  questions:     'quizQuestions',
  exams:         'quizExams',
  results:       'quizResults',
  games:         'quizGames',
  tournaments:   'quizTournaments',
  exam_sessions: 'quizExamSessions',
  settings:      'quizSettings',
  audit_logs:    'quizAuditLogs',
  // join tables stored as arrays within their parent objects in legacy code;
  // here we give them their own namespaced keys to support the new pattern
  exam_questions: 'quizExamQuestions',
  exam_classes:   'quizExamClasses',
  game_sessions:  'quizGameSessions',
  tournament_entries: 'quizTournamentEntries',
  refresh_tokens: 'quizRefreshTokens',
};

// ─── Custom queries ────────────────────────────────────────────────────────────
// Operations that don't fit the generic CRUD pattern.
// Each function receives (store, params) where store = the repo instance.
const CUSTOM_QUERIES = {
  'exam.withQuestions': (store, { examId }) => {
    const exam = store.getById_sync('exams', examId);
    if (!exam) return null;
    const examQuestions = store.getAll_sync('exam_questions')
      .filter(eq => eq.exam_id === examId)
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const questionIds = examQuestions.map(eq => eq.question_id);
    const questions   = store.getAll_sync('questions')
      .filter(q => questionIds.includes(q.id))
      .sort((a, b) => questionIds.indexOf(a.id) - questionIds.indexOf(b.id));
    return { ...exam, questions };
  },

  'result.byUserAndExam': (store, { userId, examId }) =>
    store.getAll_sync('results')
      .filter(r => r.user_id === userId && r.exam_id === examId)
      .sort((a, b) => new Date(b.date_taken) - new Date(a.date_taken)),

  'game.activeSessions': (store, { gameId }) => {
    const sessions = store.getAll_sync('game_sessions')
      .filter(s => s.game_id === gameId && !s.completed);
    return sessions.map(s => ({
      ...s,
      user: store.getById_sync('users', s.user_id) ?? null,
    }));
  },

  'tournament.leaderboard': (store, { tournamentId, limit = 50 }) => {
    const entries = store.getAll_sync('tournament_entries')
      .filter(e => e.tournament_id === tournamentId)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return entries.map(e => ({
      ...e,
      user: store.getById_sync('users', e.user_id) ?? null,
    }));
  },

  'session.expiredSessions': (store, { before }) =>
    store.getAll_sync('exam_sessions').filter(s =>
      s.status === 'active' && new Date(s.expires_at) < new Date(before)
    ),

  'settings.byVisibility': (store, { visibility }) => {
    const visOrder = ['public', 'teacher', 'admin', 'system'];
    const maxLevel = visOrder.indexOf(visibility);
    return store.getAll_sync('settings')
      .filter(s => visOrder.indexOf(s.visibility ?? 'admin') <= maxLevel);
  },

  'user.byClassWithResults': (store, { classId }) => {
    const users = store.getAll_sync('users').filter(u => u.class_id === classId);
    return users.map(u => ({
      ...u,
      results: store.getAll_sync('results')
        .filter(r => r.user_id === u.id)
        .sort((a, b) => new Date(b.date_taken) - new Date(a.date_taken))
        .slice(0, 5),
    }));
  },

  'exam.availableForStudent': (store, { userId }) => {
    const user = store.getById_sync('users', userId);
    if (!user) return [];
    const examClasses = store.getAll_sync('exam_classes')
      .filter(ec => ec.class_id === user.class_id)
      .map(ec => ec.exam_id);
    return store.getAll_sync('exams')
      .filter(e => e.status === 'active' && examClasses.includes(e.id));
  },
};

export class LocalStorageRepository extends IStorageRepository {
  // ── Private helpers ─────────────────────────────────────────────────────────

  #key(table) {
    return TABLE_KEYS[table] ?? table;
  }

  #readTable(table) {
    try {
      const raw = localStorage.getItem(this.#key(table));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  #writeTable(table, data) {
    localStorage.setItem(this.#key(table), JSON.stringify(data));
  }

  // ── Synchronous helpers (for custom queries only) ────────────────────────────

  getById_sync(table, id) {
    return this.#readTable(table).find(i => i.id === id) ?? null;
  }

  getAll_sync(table) {
    return this.#readTable(table);
  }

  setAll_sync(table, data) {
    this.#writeTable(table, data);
  }

  // ── IStorageRepository implementation ────────────────────────────────────────

  async getAll(table, {
    filters   = {},
    limit     = 50,
    offset    = 0,
    orderBy   = 'created_at',
    direction = 'desc',
    search    = null,
  } = {}) {
    let data = this.#readTable(table);

    // Apply exact-match filters
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null) {
        data = data.filter(item => item[k] === v);
      }
    }

    // Apply full-text search over all string fields
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(item =>
        Object.values(item).some(
          v => typeof v === 'string' && v.toLowerCase().includes(q)
        )
      );
    }

    const total = data.length;

    // Sort
    data = [...data].sort((a, b) => {
      const va = a[orderBy] ?? '';
      const vb = b[orderBy] ?? '';
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return direction === 'desc' ? -cmp : cmp;
    });

    return { data: data.slice(offset, offset + limit), total };
  }

  async getById(table, id) {
    return this.getById_sync(table, id);
  }

  async create(table, data) {
    const items  = this.#readTable(table);
    const now    = new Date().toISOString();
    const record = {
      ...data,
      id:         data.id         ?? IdGenerator.generate(),
      created_at: data.created_at ?? now,
      updated_at: data.updated_at ?? now,
    };
    items.push(record);
    this.#writeTable(table, items);
    return record;
  }

  async update(table, id, data) {
    const items = this.#readTable(table);
    const idx   = items.findIndex(i => i.id === id);
    if (idx === -1) throw new NotFoundError(`${table}:${id}`);
    items[idx] = {
      ...items[idx],
      ...data,
      id,
      updated_at: new Date().toISOString(),
    };
    this.#writeTable(table, items);
    return items[idx];
  }

  async delete(table, id) {
    const items    = this.#readTable(table);
    const filtered = items.filter(i => i.id !== id);
    if (filtered.length === items.length) throw new NotFoundError(`${table}:${id}`);
    this.#writeTable(table, filtered);
  }

  async createMany(table, dataArray) {
    const items  = this.#readTable(table);
    const now    = new Date().toISOString();
    const records = dataArray.map(data => ({
      ...data,
      id:         data.id         ?? IdGenerator.generate(),
      created_at: data.created_at ?? now,
      updated_at: data.updated_at ?? now,
    }));
    items.push(...records);
    this.#writeTable(table, items);
    return records;
  }

  async query(queryName, params = {}) {
    const fn = CUSTOM_QUERIES[queryName];
    if (!fn) throw new Error(`LocalStorageRepository: unknown query "${queryName}"`);
    return fn(this, params);
  }
}
