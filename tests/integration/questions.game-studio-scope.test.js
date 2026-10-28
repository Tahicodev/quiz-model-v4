/**
 * tests/integration/questions.game-studio-scope.test.js
 *
 * The Questions tab shows a different library to different teachers:
 *   - a primaire teacher sees only the Game Studio questions their own
 *     activities use;
 *   - a teacher in any other school sees only the ordinary questions, never the
 *     Game Studio ones;
 *   - an admin sees everything, because they administer content for both.
 *
 * What decides "Game Studio" is the KidsActivityLevel link, not the question's
 * type or category. A question can be any type the Kids bridge supports, and the
 * "Game Studio - <activity>" category only exists on rows the bank service
 * mirrored, so a hand-written question attached to a level would look ordinary.
 *
 * This runs against a real database because the whole rule is a query, and a
 * mocked Prisma cannot catch a query the engine rejects.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;

const PRIMAIRE = 'school-primaire';
const COLLEGE = 'school-college';

const TEACHER_PRIMAIRE = 'teacher-primaire';
const TEACHER_OTHER = 'teacher-college';
const TEACHER_COLLEAGUE = 'teacher-colleague';

// A question id per role expectation, so each assertion reads as the rule.
const Q_OWN_GS = 'q-own-game-studio';    // primaire teacher, own activity
const Q_COLLEAGUE_GS = 'q-colleague-gs'; // primaire school, another teacher's activity
const Q_PRIMAIRE_NORMAL = 'q-primaire-normal'; // primaire school, never used in Kids
const Q_COLLEGE_NORMAL = 'q-college-normal';
const Q_COLLEGE_GS = 'q-college-gs';

const ALL_QUESTIONS = [Q_OWN_GS, Q_COLLEAGUE_GS, Q_PRIMAIRE_NORMAL, Q_COLLEGE_NORMAL, Q_COLLEGE_GS];

const questionIdsFor = (res) =>
  (res.body.data.questions || []).map((q) => q.id).sort();

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  await prisma.school.create({ data: { id: PRIMAIRE, name: 'Ecole Primaire', slug: 'ecole-primaire', school_type: 'primaire' } });
  await prisma.school.create({ data: { id: COLLEGE, name: 'College', slug: 'college', school_type: 'college' } });

  // Real logins, because the rule is read off req.user: a fabricated token would
// test the token check instead of the scoping.
  const PASSWORD = 'teacher123';
  const teachers = [
    { id: TEACHER_PRIMAIRE, username: 'tp', school_id: PRIMAIRE },
    { id: TEACHER_OTHER, username: 'tc', school_id: COLLEGE },
    { id: TEACHER_COLLEAGUE, username: 'tcol', school_id: PRIMAIRE },
  ];
  for (const teacher of teachers) {
    await prisma.user.create({
      data: {
        ...teacher,
        name: teacher.id,
        password_hash: await bcrypt.hash(PASSWORD, 4),
        role: 'teacher',
        status: 'active',
      },
    });
  }

  // An admin per school, so the admin case runs against real content instead of
  // the seeded school-test tenant, which holds no questions of its own.
  for (const schoolId of [PRIMAIRE, COLLEGE]) {
    await prisma.user.create({
      data: {
        id: `admin-${schoolId}`,
        name: `Admin ${schoolId}`,
        username: `admin-${schoolId}`,
        password_hash: await bcrypt.hash(PASSWORD, 4),
        role: 'admin',
        school_id: schoolId,
        status: 'active',
      },
    });
  }

  const question = (id, schoolId) =>
    prisma.question.create({
      data: { id, school_id: schoolId, type: 'mcq', text: `Question ${id}`, answer: 'a', options_json: '["a","b"]' },
    });

  for (const id of [Q_OWN_GS, Q_COLLEAGUE_GS, Q_PRIMAIRE_NORMAL]) await question(id, PRIMAIRE);
  for (const id of [Q_COLLEGE_NORMAL, Q_COLLEGE_GS]) await question(id, COLLEGE);

  const activity = (id, schoolId, creatorId) =>
    prisma.kidsActivity.create({
      data: {
        id, school_id: schoolId, creator_id: creatorId, title: `Activity ${id}`,
        subject: 'french', grade: 'CP', game_template: 'treasure_hunt', theme: 'jungle',
      },
    });

  await activity('act-own', PRIMAIRE, TEACHER_PRIMAIRE);
  await activity('act-colleague', PRIMAIRE, TEACHER_COLLEAGUE);
  await activity('act-college', COLLEGE, TEACHER_OTHER);

  const level = (activityId, questionId) =>
    prisma.kidsActivityLevel.create({
      data: { activity_id: activityId, level_type: 'multiple_choice', content_json: '{}', question_id: questionId },
    });

  await level('act-own', Q_OWN_GS);
  await level('act-colleague', Q_COLLEAGUE_GS);
  await level('act-college', Q_COLLEGE_GS);

  adminToken = (await login(app, `admin-${PRIMAIRE}`)).body.accessToken;
});

afterAll(async () => {
  await teardownTestDb();
});

async function login(app, username) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: PASSWORD });
  if (!res.body?.accessToken) throw new Error(`login failed for ${username}: ${JSON.stringify(res.body)}`);
  return res;
}

/** A real access token for a seeded user, so scoping reads req.user correctly. */
async function tokenFor(app, username) {
  return (await login(app, username)).body.accessToken;
}

describe('the Questions tab shows each teacher the right library', () => {
  it('gives a primaire teacher the Game Studio questions their own activities use', async () => {
    // Everything else in their school is hidden, including a colleague's Game
    // Studio work and the ordinary questions, so the list only ever shows what
    // is actually playable in their own games.
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
    expect(res.status).toBe(200);
    expect(questionIdsFor(res)).toEqual([Q_OWN_GS]);
  });

  it('hides a primaire school question that no Kids activity uses', async () => {
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
    expect(questionIdsFor(res)).not.toContain(Q_PRIMAIRE_NORMAL);
  });

  it('hides a colleague\'s Game Studio question from a primaire teacher', async () => {
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
    expect(questionIdsFor(res)).not.toContain(Q_COLLEAGUE_GS);
  });

  it('gives a teacher in another school the ordinary questions and no Game Studio ones', async () => {
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tc')}`);
    expect(questionIdsFor(res)).toEqual([Q_COLLEGE_NORMAL]);
  });

  it('never leaks another school\'s questions across the tenant boundary', async () => {
    const primaire = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
    const college = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tc')}`);
    for (const id of questionIdsFor(primaire)) expect(questionIdsFor(college)).not.toContain(id);
  });

  it('gives an admin every question, so they can administer both libraries', async () => {
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const id of ALL_QUESTIONS) expect(questionIdsFor(res)).toContain(id);
  });
});

describe('the Game Studio marker the filter and the badge rely on', () => {
  it('flags a question used by a Kids level, and only those', async () => {
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${adminToken}`);
    const byId = Object.fromEntries(res.body.data.questions.map((q) => [q.id, q.is_game_studio]));
    expect(byId[Q_OWN_GS]).toBe(true);
    expect(byId[Q_COLLEGE_GS]).toBe(true);
    expect(byId[Q_COLLEGE_NORMAL]).toBe(false);
  });

  it('marks every question visible to a primaire teacher as Game Studio', async () => {
    // The tab hides the ordinary rows for that role, so the flag has to be true
    // for the survivors. A false flag on a visible row would render an ordinary
    // question with a Game Studio badge and break the filter's own premise.
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
    for (const question of res.body.data.questions) {
      expect(question.is_game_studio, `${question.id} must be flagged`).toBe(true);
    }
  });

  it('marks every question visible to a non-primaire teacher as ordinary', async () => {
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${await tokenFor(app, 'tc')}`);
    for (const question of res.body.data.questions) {
      expect(question.is_game_studio, `${question.id} must not be flagged`).toBe(false);
    }
  });

  it('counts the school\'s Game Studio questions for an admin', async () => {
    const res = await request(app).get('/api/v1/bootstrap').set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.questions_game_studio_total).toBe(3);
  });
});