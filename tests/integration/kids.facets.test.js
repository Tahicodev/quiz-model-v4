/**
 * tests/integration/kids.facets.test.js
 *
 * The unit tests for the teacher filter bar mock Prisma, which cannot catch a
 * query the query engine rejects. Two of the facets queries are exactly that
 * kind of risk: `groupBy` over a nullable column (sub_topic, creator_id) with a
 * `where` on a column that is not being grouped (school_id).
 *
 * So this runs the real engine against a real database and covers:
 *   - GET /kids/activities/facets returns the school's own values only
 *   - every filter bar control actually narrows the list
 *   - the age filter matches on overlap, not on containment
 *   - a teacher's own games are never readable by another school
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;

const SCHOOL = 'school-test';
const OTHER_SCHOOL = 'school-other';

// A spread of values, including the two shapes that break naive queries:
// a null sub_topic and a null creator.
const SEED = [
  { id: 'a1', subject: 'math',    sub_topic: 'Les animaux',  grade: 'CP',  age_min: 5, age_max: 8,  language: 'fr', theme: 'ocean',    difficulty: 'easy',   game_template: 'treasure_hunt', status: 'published', creator_id: 'teacher-a' },
  { id: 'a2', subject: 'math',    sub_topic: 'Les animaux',  grade: 'CE1', age_min: 7, age_max: 10, language: 'fr', theme: 'ocean',    difficulty: 'medium', game_template: 'memory',        status: 'published', creator_id: 'teacher-a' },
  { id: 'a3', subject: 'french',  sub_topic: 'L\'alphabet',  grade: 'CP',  age_min: 5, age_max: 8,  language: 'fr', theme: 'jungle',   difficulty: 'easy',   game_template: 'memory',        status: 'draft',     creator_id: 'teacher-b' },
  { id: 'a4', subject: 'science', sub_topic: null,            grade: 'CM1', age_min: 9, age_max: 12, language: 'en', theme: 'space',    difficulty: 'hard',   game_template: 'quiz',          status: 'published', creator_id: null },
  { id: 'a5', subject: 'science', sub_topic: 'Le corps',     grade: 'CM1', age_min: 9, age_max: 12, language: 'en', theme: 'space',    difficulty: 'hard',   game_template: 'quiz',          status: 'published', creator_id: 'teacher-b' },
  { id: 'a6', subject: 'math',    sub_topic: 'Addition',     grade: 'CM1', age_min: 9, age_max: 12, language: 'fr', theme: 'jungle',   difficulty: 'medium', game_template: 'quiz',          status: 'archived',  creator_id: 'teacher-a' },
];

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  // A second school proves the tenant boundary is enforced by the query, not by
  // the caller passing the right id.
  await prisma.school.create({ data: { id: OTHER_SCHOOL, name: 'Other School', slug: 'other-school' } });
  for (const id of ['teacher-a', 'teacher-b']) {
    await prisma.user.create({
      data: { id, name: id === 'teacher-a' ? 'Mme Ada' : 'M. Bo', username: id, password_hash: 'x', role: 'teacher', school_id: SCHOOL, status: 'active' },
    });
  }

  for (const a of SEED) {
    await prisma.kidsActivity.create({ data: { ...a, title: `Activity ${a.id}`, school_id: SCHOOL } });
  }
  // Same subject and sub-topic, different tenant. Must never appear in either
  // the facets or the filtered list for SCHOOL.
  await prisma.kidsActivity.create({
    data: {
      id: 'b1', school_id: OTHER_SCHOOL, title: 'Other tenant math', subject: 'math',
      sub_topic: 'Les animaux', grade: 'CP', age_min: 5, age_max: 8, language: 'fr',
      theme: 'ocean', difficulty: 'easy', game_template: 'memory', status: 'published',
    },
  });

  const login = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  await teardownTestDb();
});

const auth = (req) => req.set('Authorization', `Bearer ${adminToken}`);

describe('GET /kids/activities/facets', () => {
  it('lists the school own values, counted, sorted, and never another tenant', async () => {
    const res = await auth(request(app).get('/api/v1/kids/activities/facets'));
    expect(res.status).toBe(200);
    const fx = res.body.data ?? res.body;

    // Counts first: math 3, science 2, french 1.
    expect(fx.subjects).toEqual([
      { value: 'math', count: 3 },
      { value: 'science', count: 2 },
      { value: 'french', count: 1 },
    ]);
    // b1 also says "Les animaux", but it belongs to the other school.
    expect(fx.sub_topics.find(s => s.value === 'Les animaux').count).toBe(2);
    // The null sub_topic and the null creator must be skipped, not crash the
    // dropdown or appear as an empty entry.
    expect(fx.sub_topics.map(s => s.value)).not.toContain(null);
    expect(fx.creators.map(c => c.value)).not.toContain(null);
    expect(fx.sub_topics.map(s => s.value)).not.toContain('undefined');

    expect(fx.languages.map(s => s.value)).toEqual(['en', 'fr']);
    // Alphabetical, because all three have two games.
    expect(fx.difficulties.map(s => s.value)).toEqual(['easy', 'hard', 'medium']);
    expect(fx.themes.map(s => s.value)).toEqual(['jungle', 'ocean', 'space']);
    // By frequency: quiz 3, memory 2, treasure_hunt 1.
    expect(fx.game_templates.map(s => s.value)).toEqual(['quiz', 'memory', 'treasure_hunt']);
    // Drafts and archived games stay filterable, otherwise a teacher cannot
    // find something they hid by accident.
    expect(fx.statuses.map(s => s.value)).toEqual(['archived', 'draft', 'published']);

    expect(fx.creators).toEqual([
      { value: 'teacher-a', name: 'Mme Ada', count: 3 },
      { value: 'teacher-b', name: 'M. Bo', count: 2 },
    ]);
    expect(fx.age).toEqual({ min: 5, max: 12 });
  });
});

describe('filtering the activity list', () => {
  const list = async (qs) => {
    const res = await auth(request(app).get(`/api/v1/kids/activities${qs}`));
    expect(res.status).toBe(200);
    return (res.body.items ?? []).map(a => a.id).sort();
  };

  it('narrows by subject, sub-topic, grade, language, theme, difficulty and template', async () => {
    expect(await list('?subject=math')).toEqual(['a1', 'a2', 'a6']);
    // A fragment the teacher typed, not a stored value.
    expect(await list('?sub_topic=animaux')).toEqual(['a1', 'a2']);
    expect(await list('?grade=CP')).toEqual(['a1', 'a3']);
    expect(await list('?language=en')).toEqual(['a4', 'a5']);
    expect(await list('?theme=space')).toEqual(['a4', 'a5']);
    expect(await list('?difficulty=medium')).toEqual(['a2', 'a6']);
    expect(await list('?game_template=memory')).toEqual(['a2', 'a3']);
    expect(await list('?status=draft')).toEqual(['a3']);
  });
  it('matches age on overlap, not on containment', async () => {
    // Seeded ranges: a1 5-8, a2 7-10, a3 5-8, a4 9-12, a5 9-12, a6 9-12.
    // The decisive case is 8-8: containment would find only a2, because a1 and
    // a3 are 5-8 games and their minimum is below the searched age. A teacher
    // looking for "8 year olds" still needs those games, so overlap is correct.
    expect(await list('?age_min=8&age_max=8')).toEqual(['a1', 'a2', 'a3']);

    // Ranges that do discriminate, so a filter that did nothing would fail.
    expect(await list('?age_min=11&age_max=15')).toEqual(['a4', 'a5', 'a6']);
    expect(await list('?age_min=3&age_max=6')).toEqual(['a1', 'a3']);
    // A single bound is a half-open range, not "no limit".
    expect(await list('?age_min=11')).toEqual(['a4', 'a5', 'a6']);
    expect(await list('?age_max=6')).toEqual(['a1', 'a3']);
    // 7-10 shares at least one year with every seeded game, so all six match.
    expect(await list('?age_min=7&age_max=10')).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  });

  it('combines filters and keeps the tenant boundary', async () => {
    // math is a1, a2, a6; of those only a6 reaches 11.
    expect(await list('?subject=math&age_min=11&age_max=15')).toEqual(['a6']);
    expect(await list('?subject=math&creator_id=teacher-b')).toEqual([]);
    expect(await list('?subject=math&creator_id=teacher-a')).toEqual(['a1', 'a2', 'a6']);
    expect(await list('?subject=math&language=en')).toEqual([]);
    // Same subject and sub-topic as a1 and a2, but another tenant: never here.
    expect(await list('?subject=math&sub_topic=animaux')).not.toContain('b1');
  });

  it('treats is_favorite=false as a filter, not as true', async () => {
    await prisma.kidsActivity.update({ where: { id: 'a1' }, data: { is_favorite: true } });
    expect(await list('?is_favorite=true')).toEqual(['a1']);
    expect(await list('?is_favorite=false')).toEqual(['a2', 'a3', 'a4', 'a5', 'a6']);
  });

  it('reports the total alongside the page so the bar can say how many matched', async () => {
    const res = await auth(request(app).get('/api/v1/kids/activities?subject=math'));
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(3);
  });
});
