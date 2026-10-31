/**
 * tests/unit/kids-game-bank-sync.test.js
 *
 * The built-in Step 1 games (French / Arabic / Math) must also land in the
 * teacher's question bank, filed under `subject › axis` so the Category and
 * Question tabs show them and the teacher can edit or extend them.
 *
 * Rules this pins down:
 *  - only catalog games sync (config_json.default_game); custom games never
 *    touch the bank,
 *  - categories are ordinary teacher-owned nodes with the clean names — never
 *    the hidden `Kids · …` buckets — and questions live on the axis LEAF
 *    (a category with subcategories cannot hold questions),
 *  - syncing is create-if-absent: a teacher's edited or renamed copy is never
 *    rewritten nor duplicated, no matter how often the game is re-published,
 *  - deleting a game removes its copies but keeps the categories (they hold
 *    the teacher's own work).
 */
import { describe, it, expect } from 'vitest';
import { KidsGameService } from '../../src/frontend/services/KidsGameService.js';
import { QUESTION_TYPES } from '../../src/shared/constants.js';

const BANK_TYPES = Object.values(QUESTION_TYPES);

const TEACHER = { id: 't-1', role: 'teacher', school_id: 's-1' };

/** Tiny in-memory stand-in for PrismaRepository (exact-match filters only). */
function memoryRepo() {
  const tables = { categories: [], questions: [], kidsGames: [], kidsGameSessions: [] };
  let seq = 0;
  const matches = (row, filters) => Object.entries(filters || {}).every(
    ([key, value]) => String(row[key] ?? '') === String(value ?? '') && (value != null || row[key] == null),
  );
  return {
    tables,
    async getAll(table, { filters = {}, limit = 50 } = {}) {
      const rows = (tables[table] || []).filter((row) => matches(row, filters));
      return { data: rows.slice(0, limit), total: rows.length };
    },
    async getById(table, id) {
      return (tables[table] || []).find((row) => row.id === id) || null;
    },
    async create(table, data) {
      const row = { id: data.id || `${table}-${++seq}`, created_at: new Date().toISOString(), ...data };
      (tables[table] || (tables[table] = [])).push(row);
      return row;
    },
    async update(table, id, data) {
      const row = (tables[table] || []).find((r) => r.id === id);
      if (!row) throw new Error(`missing ${table}:${id}`);
      Object.assign(row, data);
      return row;
    },
    async delete(table, id) {
      tables[table] = (tables[table] || []).filter((r) => r.id !== id);
    },
  };
}

const MARKER = { id: 'math-number-battle', name: 'Number Battle', subject: 'Math', axis: 'Comparing Numbers' };

function catalogGame(overrides = {}) {
  return Object.assign({
    name: 'Number Battle',
    game_type: 'bubble-pop',
    subject: 'Math',
    grade: 'cp',
    theme: 'jungle',
    questions_json: JSON.stringify([
      { type: 'multiple-choice', text: 'Compare les deux nombres : 7 … 4', options_json: ['<', '=', '>'], answer: '>', explanation: '7 est plus grand que 4, donc 7 > 4.' },
      { type: 'multiple-choice', text: 'Compare les deux nombres : 5 … 9', options_json: ['<', '=', '>'], answer: '<', explanation: '5 est plus petit que 9, donc 5 < 9.' },
    ]),
    config_json: JSON.stringify({ default_game: MARKER }),
  }, overrides);
}

async function publishCatalogGame(repo, overrides) {
  const service = new KidsGameService(repo);
  const created = await service.create(catalogGame(overrides), TEACHER);
  const published = await service.publish(created.id, TEACHER);
  return { service, created, published };
}

describe('Kids bank sync for built-in games', () => {
  it('files the questions under a teacher-owned subject › axis path', async () => {
    const repo = memoryRepo();
    const { published } = await publishCatalogGame(repo);

    const parent = repo.tables.categories.find((c) => c.name === 'Math');
    const leaf = repo.tables.categories.find((c) => c.name === 'Comparing Numbers');
    expect(parent).toBeTruthy();
    expect(leaf).toBeTruthy();
    expect(parent.parent_id).toBeUndefined();       // top level
    expect(leaf.parent_id).toBe(parent.id);         // subject › axis
    expect(parent.created_by).toBe(TEACHER.id);
    expect(leaf.created_by).toBe(TEACHER.id);
    expect(parent.color).toBeTruthy();
    // The hidden game buckets must never come back.
    expect(repo.tables.categories.every((c) => !String(c.name).startsWith('Kids · '))).toBe(true);

    expect(published.category_id).toBe(leaf.id);
    expect(repo.tables.questions).toHaveLength(2);
    repo.tables.questions.forEach((row) => {
      expect(row.category_id).toBe(leaf.id);
      expect(row.created_by).toBe(TEACHER.id);
      expect(row.school_id).toBe(TEACHER.school_id);
      expect(BANK_TYPES).toContain(row.type);
      expect(row.explanation).toBeTruthy();
      expect(row.tags).toContain(`kids:${published.id}`);
    });
  });

  it('leaves the bank untouched for custom games', async () => {
    const repo = memoryRepo();
    const { published } = await publishCatalogGame(repo, {
      config_json: JSON.stringify({ time_per_q: 20 }),
    });
    expect(repo.tables.categories).toHaveLength(0);
    expect(repo.tables.questions).toHaveLength(0);
    expect(published.category_id).toBeFalsy();
  });

  it('is idempotent and keeps the teacher’s edits (answers, renames, additions)', async () => {
    const repo = memoryRepo();
    const { service, published } = await publishCatalogGame(repo);
    const leaf = repo.tables.categories.find((c) => c.name === 'Comparing Numbers');

    // The teacher fixes an answer and renames another question in the bank.
    const [first, second] = repo.tables.questions;
    first.answer = 'meta::e30=::=';
    second.text = '7 comparé à 4 ?';

    await service.update(published.id, { name: 'Number Battle v2' }, TEACHER);
    await service.publish(published.id, TEACHER);

    expect(repo.tables.questions).toHaveLength(2);            // nothing added
    expect(repo.tables.questions.find((q) => q.id === first.id).answer).toBe('meta::e30=::=');
    expect(repo.tables.questions.find((q) => q.id === second.id).text).toBe('7 comparé à 4 ?');
    // Questions the teacher added by hand in the axis are left alone too.
    await repo.create('questions', { category_id: leaf.id, created_by: TEACHER.id, text: 'Ma question', type: 'mcq', answer: 'a', options_json: '["a"]', tags: '' });
    await service.publish(published.id, TEACHER);
    expect(repo.tables.questions).toHaveLength(3);
  });

  it('re-files the copies when the game is re-picked onto another axis', async () => {
    const repo = memoryRepo();
    const { service, published } = await publishCatalogGame(repo);
    const oldLeaf = repo.tables.categories.find((c) => c.name === 'Comparing Numbers');

    await service.update(published.id, {
      config_json: JSON.stringify({ default_game: { ...MARKER, axis: 'Ordering Numbers' } }),
    }, TEACHER);

    const newLeaf = repo.tables.categories.find((c) => c.name === 'Ordering Numbers');
    expect(newLeaf).toBeTruthy();
    expect(newLeaf.parent_id).toBe(oldLeaf.parent_id);
    expect(repo.tables.questions.every((q) => q.category_id === newLeaf.id)).toBe(true);
    // The emptied old axis is NOT deleted: the teacher may have added their own
    // questions there, and a sync never destroys content.
    expect(repo.tables.categories.filter((c) => c.name === 'Math')).toHaveLength(1);
    expect(repo.tables.categories.find((c) => c.id === oldLeaf.id)).toBeTruthy();
  });

  it('bulk-syncs the whole catalog once and never duplicates on a second pass', async () => {
    const repo = memoryRepo();
    const service = new KidsGameService(repo);
    const payload = {
      games: [
        { id: 'math-number-battle', subject: 'Math', axis: 'Comparing Numbers', questions: [{ type: 'multiple-choice', text: '7 … 4', options_json: ['<', '=', '>'], answer: '>', explanation: 'x' }] },
        { id: 'french-word-builder', subject: 'French', axis: 'Syllables', questions: [{ type: 'draggable', text: 'to-ma-to', options_json: ['to', 'ma', 'to'], answer: 'to,ma,to', explanation: 'y' }] },
      ],
    };
    const first = await service.syncCatalog(payload, TEACHER);
    expect(first.added).toBe(2);
    expect(first.categories_created).toBe(4);   // Math, Comparing Numbers, French, Syllables
    const second = await service.syncCatalog(payload, TEACHER);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.categories_created).toBe(0);
    expect(repo.tables.questions).toHaveLength(2);
    expect(repo.tables.categories).toHaveLength(4);
    // Catalog copies are tagged by their catalog id, so deleting a published
    // game instance can never wipe them.
    expect(repo.tables.questions.some((q) => q.tags.includes('kids:math-number-battle'))).toBe(true);
  });

  it('deleting a game removes its copies but keeps the categories', async () => {
    const repo = memoryRepo();
    const { service, published } = await publishCatalogGame(repo);
    const leafId = published.category_id;
    await repo.create('questions', { category_id: leafId, created_by: TEACHER.id, text: 'Teacher own', type: 'mcq', answer: 'a', options_json: '["a"]', tags: 'manual' });

    await service.delete(published.id, TEACHER);

    expect(repo.tables.kidsGames).toHaveLength(0);
    const left = repo.tables.questions;
    expect(left).toHaveLength(1);
    expect(left[0].text).toBe('Teacher own');
    expect(repo.tables.categories.find((c) => c.id === leafId)).toBeTruthy();
  });
});
