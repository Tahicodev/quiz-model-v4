/**
 * src/backend/infrastructure/PrismaRepository.js
 *
 * Backend storage implementation. Implements the SAME IStorageRepository
 * contract as the frontend LocalStorageRepository (and ApiRepository), so the
 * exact same service layer is portable across both. The `query()` names mirror
 * the CUSTOM_QUERIES in LocalStorageRepository one-for-one.
 *
 * Tenant isolation note: this repository is a thin data-access layer and does
 * NOT enforce school_id — that is the application layer's job (routes pass
 * school_id from the JWT, and services scope filters accordingly).
 */

import { IStorageRepository } from '../../frontend/infrastructure/IStorageRepository.js';
import { NotFoundError } from '../../shared/errors.js';

/**
 * Maps the generic table names used by the service layer to Prisma delegates.
 */
const MODEL_MAP = {
  users: 'user',
  classes: 'class',
  categories: 'category',
  questions: 'question',
  exams: 'exam',
  exam_questions: 'examQuestion',
  exam_classes: 'examClass',
  results: 'result',
  games: 'game',
  game_sessions: 'gameSession',
  tournaments: 'tournament',
  tournament_entries: 'tournamentEntry',
  exam_sessions: 'examSession',
  settings: 'setting',
  audit_logs: 'auditLog',
  refresh_tokens: 'refreshToken',
  schools: 'school',
};

/**
 * Searchable text columns per model. `getAll` only builds `contains` clauses
 * for columns that actually exist on the model, to avoid Prisma validation
 * errors. Keep this map in sync with schema.prisma.
 */
const SEARCH_FIELDS = {
  user: ['name', 'username', 'numero'],
  question: ['text', 'tags'],
  exam: ['name', 'description'],
  class: ['name', 'description'],
  category: ['name'],
  game: ['name'],
  tournament: ['name', 'description'],
  setting: ['key'],
};

export class PrismaRepository extends IStorageRepository {
  #prisma;

  /** @param {import('@prisma/client').PrismaClient} prismaClient */
  constructor(prismaClient) {
    super();
    this.#prisma = prismaClient;
  }

  /** Resolve a generic table name to a Prisma delegate. */
  #model(table) {
    const name = MODEL_MAP[table] ?? table;
    const delegate = this.#prisma[name];
    if (!delegate) throw new Error(`PrismaRepository: unknown model "${name}" (table: ${table})`);
    return delegate;
  }

  async getAll(table, {
    filters = {},
    limit = 50,
    offset = 0,
    orderBy = 'created_at',
    direction = 'desc',
    search = null,
  } = {}) {
    // Exact-match filters pass straight through.
    const where = { ...filters };

    if (search) {
      const fields = SEARCH_FIELDS[MODEL_MAP[table] ?? table] ?? [];
      if (fields.length) {
        where.OR = fields.map((field) => ({
          [field]: { contains: search },
        }));
      }
    }

    const order = { [orderBy]: direction };

    const [data, total] = await Promise.all([
      this.#model(table).findMany({ where, skip: offset, take: limit, orderBy: order }),
      this.#model(table).count({ where }),
    ]);

    return { data, total };
  }

  async getById(table, id) {
    const record = await this.#model(table).findUnique({ where: { id } });
    return record ?? null;
  }

  async create(table, data) {
    return this.#model(table).create({ data });
  }

  async update(table, id, data) {
    try {
      return await this.#model(table).update({ where: { id }, data });
    } catch (err) {
      // P2025: record not found for the given id.
      if (err.code === 'P2025') throw new NotFoundError(`${table}:${id}`);
      throw err;
    }
  }

  async delete(table, id) {
    try {
      await this.#model(table).delete({ where: { id } });
    } catch (err) {
      if (err.code === 'P2025') throw new NotFoundError(`${table}:${id}`);
      throw err;
    }
  }

  async createMany(table, dataArray) {
    if (dataArray.length === 0) return { count: 0 };

    const model = this.#model(table);

    // Idempotent bulk insert. Prisma's `skipDuplicates` is NOT supported on
    // SQLite (only PostgreSQL/MySQL) and silently errors there, so we cannot
    // rely on it across providers. Instead we pre-filter rows whose `id` is
    // already present and insert only the new ones — idempotent everywhere,
    // and the count returned reflects the rows actually inserted.
    const withId       = dataArray.filter((d) => d?.id != null);
    const withoutId    = dataArray.filter((d) => d?.id == null);
    let existingIds = new Set();
    if (withId.length > 0) {
      const ids = withId.map((d) => d.id);
      const rows = await model.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      existingIds = new Set(rows.map((r) => r.id));
    }
    const toInsert = [...withoutId, ...withId.filter((d) => !existingIds.has(d.id))];
    if (toInsert.length === 0) return { count: 0 };

    const result = await model.createMany({ data: toInsert });
    // Prisma createMany returns { count } on all providers; pass it through so
    // callers (notably the migration route) get the inserted-row count.
    return { count: result.count ?? toInsert.length };
  }

  /**
   * Named queries — mirror the LocalStorageRepository CUSTOM_QUERIES exactly,
   * so services call identical query names regardless of which repo is injected.
   */
  async query(queryName, params = {}) {
    switch (queryName) {
      case 'exam.withQuestions': {
        const exam = await this.#prisma.exam.findFirst({
          where: { id: params.examId, school_id: params.schoolId },
          include: {
            examQuestions: {
              include: { question: true },
              orderBy: { order_index: 'asc' },
            },
          },
        });
        if (!exam) return null;
        // Reshape to { ...exam, questions: Question[] } to match the frontend shape.
        return {
          ...exam,
          questions: exam.examQuestions.map((eq) => ({
            ...eq.question,
            order_index: eq.order_index,
            points_override: eq.points_override,
          })),
        };
      }

      case 'result.byUserAndExam':
        return this.#prisma.result.findMany({
          where: { user_id: params.userId, exam_id: params.examId },
          orderBy: { date_taken: 'desc' },
        });

      case 'game.activeSessions':
        return this.#prisma.gameSession.findMany({
          where: { game_id: params.gameId, completed: false },
          include: { user: { select: { id: true, username: true, name: true } } },
        });

      case 'tournament.leaderboard':
        return this.#prisma.tournamentEntry.findMany({
          where: { tournament_id: params.tournamentId },
          orderBy: { score: 'desc' },
          take: params.limit ?? 50,
          include: { user: { select: { id: true, username: true, name: true } } },
        });

      case 'session.expiredSessions':
        return this.#prisma.examSession.findMany({
          where: { status: 'active', expires_at: { lt: params.before ?? new Date() } },
        });

      case 'settings.byVisibility': {
        const visOrder = ['public', 'teacher', 'admin', 'system'];
        const maxIdx = visOrder.indexOf(params.visibility);
        const allowed = visOrder.slice(0, maxIdx + 1);
        return this.#prisma.setting.findMany({
          where: { school_id: params.schoolId, visibility: { in: allowed } },
        });
      }

      case 'user.byClassWithResults':
        return this.#prisma.user.findMany({
          where: { class_id: params.classId },
          include: { results: { orderBy: { date_taken: 'desc' }, take: 5 } },
        });

      case 'exam.availableForStudent': {
        const user = await this.#prisma.user.findUnique({ where: { id: params.userId } });
        if (!user) return [];
        return this.#prisma.exam.findMany({
          where: {
            school_id: user.school_id,
            status: 'active',
            examClasses: { some: { class_id: user.class_id } },
          },
        });
      }

      default:
        throw new Error(`PrismaRepository: unknown query "${queryName}"`);
    }
  }
}
