/**
 * tests/integration/learning.routes.test.js
 *
 * The Phase 1 learning endpoints, exercised over real HTTP against a real
 * database. The rules under test are the ones the frozen spec names as
 * acceptance criteria:
 *
 *   1. D2 governance — teacher + setting OFF proposes, setting ON publishes,
 *      admin publishes; only an admin approves/rejects/archives.
 *   2. Ownership — a teacher classifies only their own questions; an admin may
 *      classify any question of the school.
 *   3. Tenant isolation — a foreign objective/question/competency is a 404,
 *      never a cross-tenant read or write.
 *   4. Admin-only taxonomy — competencies, links and prerequisites refuse a
 *      teacher even though the teacher holds a learning permission.
 *   5. Criteria CRUD — weights must sum to 1, the cache is re-derived on every
 *      write, and clearing returns the question to `unclassified`.
 *   6. Flags — both Phase 1 settings default OFF and are readable, and with the
 *      adaptive flag OFF every learning route except /flags is refused
 *      server-side with FEATURE_DISABLED.
 *   7. A question without criteria keeps working everywhere (the filters, the
 *      list, the detail read).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let learningSvc;

const PASSWORD = 'learn1234';

const SCHOOL_A = 'school-learn-a';
const SCHOOL_B = 'school-learn-b';

const ADMIN_A = 'lrn-admin-a';
const TEACHER_A = 'lrn-teacher-a';
const TEACHER_A2 = 'lrn-teacher-a2';
const TEACHER_B = 'lrn-teacher-b';
const STUDENT_A = 'lrn-student-a';

const SUB_A = 'lrn-sub-a';
const SUB_B = 'lrn-sub-b';

const OBJ_A = 'lrn-obj-a';   // active, school A
const OBJ_A2 = 'lrn-obj-a2'; // active, school A (prerequisite target)
const OBJ_B = 'lrn-obj-b';   // active, school B

const Q_OWN = 'lrn-q-own';             // authored by TEACHER_A
const Q_COLLEAGUE = 'lrn-q-colleague'; // authored by TEACHER_A2
const Q_PLAIN = 'lrn-q-plain';         // authored by TEACHER_A, never classified
const Q_B = 'lrn-q-b';                 // school B

const token = {};
const as = (who) => ({ Authorization: `Bearer ${token[who]}` });

async function login(username) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    // `force` ends a previous session of this account; the single-active-session
    // rule otherwise refuses a repeated sign-in.
    .send({ username, password: PASSWORD, force: true });
  if (res.status !== 200) {
    throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken;
}

beforeAll(async () => {
  ({ prisma } = await setupTestDb());
  app = (await import('./helpers/app.js')).default;

  // The Bloom catalog is seeded at boot in production; the test app has no
  // boot hook, so seed it explicitly (the service is idempotent).
  const { getContainer } = await import('../../src/backend/container.js');
  learningSvc = getContainer().learningTaxonomySvc;
  await learningSvc.ensureSeeded();

  await prisma.school.create({ data: { id: SCHOOL_A, name: 'Learning A', slug: 'learning-a' } });
  await prisma.school.create({ data: { id: SCHOOL_B, name: 'Learning B', slug: 'learning-b' } });

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const users = [
    { id: ADMIN_A, username: 'lrn-admin-a', role: 'admin', school_id: SCHOOL_A },
    { id: TEACHER_A, username: 'lrn-teacher-a', role: 'teacher', school_id: SCHOOL_A },
    { id: TEACHER_A2, username: 'lrn-teacher-a2', role: 'teacher', school_id: SCHOOL_A },
    { id: TEACHER_B, username: 'lrn-teacher-b', role: 'teacher', school_id: SCHOOL_B },
    { id: STUDENT_A, username: 'lrn-student-a', role: 'student', school_id: SCHOOL_A },
  ];
  for (const user of users) {
    await prisma.user.create({
      data: { ...user, name: user.id, password_hash: passwordHash, status: 'active' },
    });
  }

  await prisma.subject.create({ data: { id: SUB_A, school_id: SCHOOL_A, created_by: ADMIN_A, name: 'Math A' } });
  await prisma.subject.create({ data: { id: SUB_B, school_id: SCHOOL_B, created_by: TEACHER_B, name: 'Math B' } });

  const objective = (id, schoolId, subjectId, code) =>
    prisma.learningObjective.create({
      data: {
        id,
        school_id: schoolId,
        subject_id: subjectId,
        code,
        statement: `Statement ${id}`,
        status: 'active',
        created_by: ADMIN_A,
      },
    });
  await objective(OBJ_A, SCHOOL_A, SUB_A, 'OA-1');
  await objective(OBJ_A2, SCHOOL_A, SUB_A, 'OA-2');
  await objective(OBJ_B, SCHOOL_B, SUB_B, 'OB-1');

  const question = (id, schoolId, createdBy) =>
    prisma.question.create({
      data: {
        id,
        school_id: schoolId,
        type: 'mcq',
        text: `Question ${id}`,
        options_json: '["a","b"]',
        answer: 'a',
        created_by: createdBy,
      },
    });
  await question(Q_OWN, SCHOOL_A, TEACHER_A);
  await question(Q_COLLEAGUE, SCHOOL_A, TEACHER_A2);
  await question(Q_PLAIN, SCHOOL_A, TEACHER_A);
  await question(Q_B, SCHOOL_B, TEACHER_B);

  token.adminA = await login('lrn-admin-a');
  token.teacherA = await login('lrn-teacher-a');
  token.teacherA2 = await login('lrn-teacher-a2');
  token.teacherB = await login('lrn-teacher-b');
  token.studentA = await login('lrn-student-a');

  // The adaptive flag is OFF by default and every non-flags route is gated on
  // it, so the suite opens with the feature enabled. The gate tests below turn
  // it off explicitly and restore it.
  await setAdaptive(true);
});

afterAll(async () => {
  await teardownTestDb();
});

async function setTeacherCreation(enabled) {
  await prisma.setting.deleteMany({
    where: { school_id: SCHOOL_A, key: 'learning.teacher_objective_creation' },
  });
  if (enabled) {
    await prisma.setting.create({
      data: { school_id: SCHOOL_A, key: 'learning.teacher_objective_creation', value: 'true' },
    });
  }
}

async function setAdaptive(enabled, schoolId = SCHOOL_A) {
  await prisma.setting.deleteMany({
    where: { school_id: schoolId, key: 'learning.adaptive.enabled' },
  });
  if (enabled) {
    await prisma.setting.create({
      data: { school_id: schoolId, key: 'learning.adaptive.enabled', value: 'true' },
    });
  }
}

// Enumerate the mounted learning router rather than hard-coding the paths, so
// the flag-gate test necessarily covers any route added later.
const ROUTE_PARAM_FIXTURES = {
  ':id': OBJ_A,
  ':questionId': Q_OWN,
  ':competencyId': 'cmp-missing',
  ':prerequisiteObjectiveId': OBJ_A2,
  ':criterionId': 'crit-missing',
};

function collectLearningRoutes(router) {
  const routes = [];
  const walk = (stack) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method, path: layer.route.path });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk(router.stack);
  return routes;
}

function learningPath(path) {
  let out = path;
  for (const [param, value] of Object.entries(ROUTE_PARAM_FIXTURES)) {
    out = out.split(param).join(value);
  }
  return `/api/v1/learning${out}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flags
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 1 flags', () => {
  it('refuses an unauthenticated read', async () => {
    const res = await request(app).get('/api/v1/learning/flags');
    expect(res.status).toBe(401);
  });

  it('refuses a student', async () => {
    const res = await request(app).get('/api/v1/learning/flags').set(as('studentA'));
    expect(res.status).toBe(403);
  });

  it('defaults both settings to OFF, and /flags stays readable while OFF', async () => {
    await setAdaptive(false);
    try {
      const res = await request(app).get('/api/v1/learning/flags').set(as('teacherA'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ adaptive_enabled: false, teacher_objective_creation: false });
    } finally {
      await setAdaptive(true);
    }
  });

  it('reports the adaptive switch when the admin enables it', async () => {
    const res = await request(app).get('/api/v1/learning/flags').set(as('teacherA'));
    expect(res.status).toBe(200);
    expect(res.body.adaptive_enabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server-side adaptive gate
// ─────────────────────────────────────────────────────────────────────────────

describe('adaptive feature gate', () => {
  it('refuses every learning route except /flags while the flag is OFF', async () => {
    const { default: learningRoutes } = await import('../../src/backend/routes/learning.routes.js');
    const routes = collectLearningRoutes(learningRoutes).filter((route) => route.path !== '/flags');
    // Guard against the enumeration silently shrinking to nothing.
    expect(routes.length).toBeGreaterThanOrEqual(20);

    await setAdaptive(false);
    try {
      for (const { method, path } of routes) {
        const call = request(app)[method](learningPath(path)).set(as('adminA'));
        // The gate runs before any body validation, so the body is irrelevant;
        // send an empty object for the verbs that expect one.
        if (!['get', 'delete'].includes(method)) call.send({});
        const res = await call;
        expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
        expect(res.body.error?.code, `${method.toUpperCase()} ${path}`).toBe('FEATURE_DISABLED');
      }

      // The flag read surface stays reachable so the console can render the
      // disabled state and tell the admin which setting to flip.
      const flags = await request(app).get('/api/v1/learning/flags').set(as('adminA'));
      expect(flags.status).toBe(200);
      expect(flags.body).toEqual({ adaptive_enabled: false, teacher_objective_creation: false });
    } finally {
      await setAdaptive(true);
    }
  });

  it('applies per school: school B stays refused while school A is enabled', async () => {
    const res = await request(app).get('/api/v1/learning/bloom').set(as('teacherB'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_DISABLED');

    const ownSchool = await request(app).get('/api/v1/learning/bloom').set(as('teacherA'));
    expect(ownSchool.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bloom catalog
// ─────────────────────────────────────────────────────────────────────────────

describe('Bloom catalog', () => {
  it('exposes exactly six dimensions in taxonomy order', async () => {
    const res = await request(app).get('/api/v1/learning/bloom').set(as('teacherA'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((row) => row.id)).toEqual([
      'remember', 'understand', 'apply', 'analyze', 'evaluate', 'create',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D2 governance: proposal → approval / rejection
// ─────────────────────────────────────────────────────────────────────────────

describe('D2 governance', () => {
  it('a teacher with the setting OFF creates a PROPOSED objective', async () => {
    await setTeacherCreation(false);
    const res = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('teacherA'))
      .send({ subject_id: SUB_A, code: 'T-OFF', statement: 'A teacher proposal' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('proposed');
    expect(res.body.proposed_by).toBe(TEACHER_A);
  });

  it('a teacher with the setting ON creates an ACTIVE objective', async () => {
    await setTeacherCreation(true);
    try {
      const res = await request(app)
        .post('/api/v1/learning/objectives')
        .set(as('teacherA'))
        .send({ subject_id: SUB_A, code: 'T-ON', statement: 'Direct creation' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('active');
      expect(res.body.proposed_by).toBeNull();
    } finally {
      await setTeacherCreation(false);
    }
  });

  it('an admin creates an ACTIVE objective', async () => {
    const res = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('adminA'))
      .send({ subject_id: SUB_A, code: 'A-DIRECT', statement: 'Admin objective' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
  });

  it('refuses a duplicate (subject, code)', async () => {
    const res = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('adminA'))
      .send({ subject_id: SUB_A, code: 'A-DIRECT', statement: 'Duplicate' });

    expect(res.status).toBe(409);
  });

  it('shows the proposal in the admin queue', async () => {
    const res = await request(app)
      .get('/api/v1/learning/objectives?status=proposed')
      .set(as('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((row) => row.code)).toContain('T-OFF');
  });

  it('a teacher cannot approve or reject', async () => {
    const created = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('teacherA'))
      .send({ subject_id: SUB_A, code: 'T-APPROVE', statement: 'Needs review' });
    expect(created.status).toBe(201);

    const approve = await request(app)
      .post(`/api/v1/learning/objectives/${created.body.id}/approve`)
      .set(as('teacherA'))
      .send({});
    expect(approve.status).toBe(403);

    const reject = await request(app)
      .post(`/api/v1/learning/objectives/${created.body.id}/reject`)
      .set(as('teacherA'))
      .send({ note: 'no' });
    expect(reject.status).toBe(403);
  });

  it('an admin approves a proposal', async () => {
    const created = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('teacherA'))
      .send({ subject_id: SUB_A, code: 'T-ACCEPT', statement: 'Accept me' });

    const res = await request(app)
      .post(`/api/v1/learning/objectives/${created.body.id}/approve`)
      .set(as('adminA'))
      .send({ note: 'Looks good' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.reviewed_by).toBe(ADMIN_A);
  });

  it('refuses a rejection without a note', async () => {
    const created = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('teacherA'))
      .send({ subject_id: SUB_A, code: 'T-REJECT-EMPTY', statement: 'No note' });

    const res = await request(app)
      .post(`/api/v1/learning/objectives/${created.body.id}/reject`)
      .set(as('adminA'))
      .send({});

    expect(res.status).toBe(422);
  });

  it('an admin rejects a proposal with a note', async () => {
    const created = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('teacherA'))
      .send({ subject_id: SUB_A, code: 'T-REJECT', statement: 'Reject me' });

    const res = await request(app)
      .post(`/api/v1/learning/objectives/${created.body.id}/reject`)
      .set(as('adminA'))
      .send({ note: 'Overlaps an existing objective' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.review_note).toBe('Overlaps an existing objective');
  });

  it('a teacher can edit their own proposal but not a colleague\'s', async () => {
    const created = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('teacherA'))
      .send({ subject_id: SUB_A, code: 'T-EDIT', statement: 'Original' });

    const own = await request(app)
      .patch(`/api/v1/learning/objectives/${created.body.id}`)
      .set(as('teacherA'))
      .send({ statement: 'Updated by author' });
    expect(own.status).toBe(200);
    expect(own.body.statement).toBe('Updated by author');

    const other = await request(app)
      .patch(`/api/v1/learning/objectives/${created.body.id}`)
      .set(as('teacherA2'))
      .send({ statement: 'Hijacked' });
    expect(other.status).toBe(403);
  });

  it('refuses a status change through PATCH except archive', async () => {
    const res = await request(app)
      .patch(`/api/v1/learning/objectives/${OBJ_A}`)
      .set(as('adminA'))
      .send({ status: 'active' });
    expect(res.status).toBe(422);
  });

  it('archives through PATCH status=archived, admin only', async () => {
    const created = await request(app)
      .post('/api/v1/learning/objectives')
      .set(as('teacherA'))
      .send({ subject_id: SUB_A, code: 'T-ARCHIVE', statement: 'Archive me' });

    const byTeacher = await request(app)
      .patch(`/api/v1/learning/objectives/${created.body.id}`)
      .set(as('teacherA'))
      .send({ status: 'archived' });
    expect(byTeacher.status).toBe(403);

    const byAdmin = await request(app)
      .patch(`/api/v1/learning/objectives/${created.body.id}`)
      .set(as('adminA'))
      .send({ status: 'archived' });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.status).toBe('archived');
  });

  it('never exposes another school\'s objective', async () => {
    const res = await request(app).get(`/api/v1/learning/objectives/${OBJ_B}`).set(as('adminA'));
    expect(res.status).toBe(404);

    const teacherRes = await request(app).get(`/api/v1/learning/objectives/${OBJ_B}`).set(as('teacherA'));
    expect(teacherRes.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Question pedagogy: ownership + criteria CRUD
// ─────────────────────────────────────────────────────────────────────────────

const criteriaBody = (criteria, extra = {}) => ({ criteria, source: 'manual', mark_reviewed: true, ...extra });

describe('question pedagogy', () => {
  it('starts a question unclassified', async () => {
    const res = await request(app)
      .get(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.pedagogy_status).toBe('unclassified');
    expect(res.body.criteria).toEqual([]);
  });

  it('lets a teacher classify their own question', async () => {
    const res = await request(app)
      .put(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('teacherA'))
      .send(criteriaBody([
        { objective_id: OBJ_A, bloom_dimension_id: 'apply', weight: 1, criterion_key: 'main' },
      ]));

    expect(res.status).toBe(200);
    expect(res.body.question.pedagogy_status).toBe('classified');
    expect(res.body.question.primary_bloom_dimension_id).toBe('apply');
    expect(res.body.question.pedagogy_reviewed_by).toBe(TEACHER_A);
  });

  it('enriches the criteria with objective and Bloom labels', async () => {
    const res = await request(app)
      .get(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('teacherA'));
    expect(res.status).toBe(200);
    expect(res.body.criteria).toHaveLength(1);
    expect(res.body.criteria[0]).toMatchObject({
      objective_code: 'OA-1',
      bloom_name: 'Apply',
      competency_code: null,
    });
    expect(res.body.criteria[0].bloom_labels).toMatchObject({ en: 'Apply', fr: 'Appliquer' });
  });

  it("refuses a teacher classifying a colleague's question", async () => {
    const res = await request(app)
      .put(`/api/v1/learning/questions/${Q_COLLEAGUE}/pedagogy`)
      .set(as('teacherA'))
      .send(criteriaBody([
        { objective_id: OBJ_A, bloom_dimension_id: 'remember', weight: 1 },
      ]));
    expect(res.status).toBe(403);
  });

  it('lets the author classify it, and an admin classify any question', async () => {
    const byAuthor = await request(app)
      .put(`/api/v1/learning/questions/${Q_COLLEAGUE}/pedagogy`)
      .set(as('teacherA2'))
      .send(criteriaBody([
        { objective_id: OBJ_A, bloom_dimension_id: 'understand', weight: 1 },
      ]));
    expect(byAuthor.status).toBe(200);

    const byAdmin = await request(app)
      .put(`/api/v1/learning/questions/${Q_COLLEAGUE}/pedagogy`)
      .set(as('adminA'))
      .send(criteriaBody([
        { objective_id: OBJ_A2, bloom_dimension_id: 'analyze', weight: 1 },
      ]));
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.question.primary_bloom_dimension_id).toBe('analyze');
  });

  it('rejects weights that do not sum to 1 with flat field messages', async () => {
    const res = await request(app)
      .put(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('teacherA'))
      .send(criteriaBody([
        { objective_id: OBJ_A, bloom_dimension_id: 'apply', weight: 0.5 },
      ]));

    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.error.fields.weights)).toBe(true);
    expect(typeof res.body.error.fields.weights[0]).toBe('string');
    expect(res.body.error.fields.weights[0]).toMatch(/must sum to 1/);
  });

  it('rejects an unknown Bloom dimension', async () => {
    const res = await request(app)
      .put(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('teacherA'))
      .send(criteriaBody([
        { objective_id: OBJ_A, bloom_dimension_id: 'synthesize', weight: 1 },
      ]));
    expect(res.status).toBe(422);
    expect(res.body.error.fields['criteria[0]']).toBeDefined();
  });

  it('rejects a foreign objective in a criterion', async () => {
    const res = await request(app)
      .put(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('teacherA'))
      .send(criteriaBody([
        { objective_id: OBJ_B, bloom_dimension_id: 'apply', weight: 1 },
      ]));
    expect(res.status).toBe(404);
  });

  it('rejects a foreign question outright', async () => {
    const read = await request(app)
      .get(`/api/v1/learning/questions/${Q_B}/pedagogy`)
      .set(as('adminA'));
    expect(read.status).toBe(404);

    const write = await request(app)
      .put(`/api/v1/learning/questions/${Q_B}/pedagogy`)
      .set(as('adminA'))
      .send(criteriaBody([{ objective_id: OBJ_A, bloom_dimension_id: 'apply', weight: 1 }]));
    expect(write.status).toBe(404);
  });

  it('supports adding and removing a criterion that leaves a valid set', async () => {
    const put = await request(app)
      .put(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('teacherA'))
      .send(criteriaBody([
        { objective_id: OBJ_A, bloom_dimension_id: 'apply', weight: 1, criterion_key: 'main' },
        { objective_id: OBJ_A, bloom_dimension_id: 'create', weight: 0, criterion_key: 'support' },
      ]));
    expect(put.status).toBe(200);
    expect(put.body.criteria).toHaveLength(2);
    expect(put.body.question.pedagogy_status).toBe('classified');

    const support = put.body.criteria.find((row) => row.criterion_key === 'support');
    const removed = await request(app)
      .delete(`/api/v1/learning/questions/${Q_OWN}/pedagogy/criteria/${support.id}`)
      .set(as('teacherA'));
    expect(removed.status).toBe(200);
    expect(removed.body.criteria).toHaveLength(1);
    expect(removed.body.question.pedagogy_status).toBe('classified');

    const again = await request(app)
      .delete(`/api/v1/learning/questions/${Q_OWN}/pedagogy/criteria/${support.id}`)
      .set(as('teacherA'));
    expect(again.status).toBe(404);
  });

  it('clears a classification and returns the question to unclassified', async () => {
    const res = await request(app)
      .delete(`/api/v1/learning/questions/${Q_OWN}/pedagogy`)
      .set(as('teacherA'));
    expect(res.status).toBe(200);
    expect(res.body.question.pedagogy_status).toBe('unclassified');
    expect(res.body.criteria).toEqual([]);
    expect(res.body.question.primary_bloom_dimension_id).toBeNull();
  });

  it('re-derives the cache from imported rows via recompute (admin only)', async () => {
    // Clear the API-written set, then simulate an import that wrote criteria
    // rows directly (bypassing the service and its validation).
    await request(app)
      .delete(`/api/v1/learning/questions/${Q_COLLEAGUE}/pedagogy`)
      .set(as('adminA'));
    await prisma.questionAssessmentCriterion.create({
      data: {
        school_id: SCHOOL_A,
        question_id: Q_COLLEAGUE,
        objective_id: OBJ_A2,
        bloom_dimension_id: 'evaluate',
        criterion_key: 'imported',
        weight: 0.5,
        source: 'imported',
      },
    });

    const forbidden = await request(app)
      .post(`/api/v1/learning/questions/${Q_COLLEAGUE}/pedagogy/recompute`)
      .set(as('teacherA'));
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .post(`/api/v1/learning/questions/${Q_COLLEAGUE}/pedagogy/recompute`)
      .set(as('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.pedagogy_status).toBe('partial');
    expect(res.body.primary_bloom_dimension_id).toBe('evaluate');
  });

  it('lists the questions classified against an objective', async () => {
    // Q_COLLEAGUE now has one imported criterion against OBJ_A2.
    const res = await request(app)
      .get(`/api/v1/learning/objectives/${OBJ_A2}/questions`)
      .set(as('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((row) => row.question_id)).toContain(Q_COLLEAGUE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin-only taxonomy
// ─────────────────────────────────────────────────────────────────────────────

describe('admin-only taxonomy', () => {
  it('refuses a teacher managing competencies, links and prerequisites', async () => {
    const competency = await request(app)
      .post('/api/v1/learning/competencies')
      .set(as('teacherA'))
      .send({ code: 'C-NOPE', name: 'Nope', subject_id: SUB_A });
    expect(competency.status).toBe(403);

    const link = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/competencies`)
      .set(as('teacherA'))
      .send({ competency_id: 'anything' });
    expect(link.status).toBe(403);

    const prereq = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/prerequisites`)
      .set(as('teacherA'))
      .send({ prerequisite_objective_id: OBJ_A2 });
    expect(prereq.status).toBe(403);
  });

  it('lets an admin create, link, relink and unlink competencies', async () => {
    const created = await request(app)
      .post('/api/v1/learning/competencies')
      .set(as('adminA'))
      .send({ code: 'C-1', name: 'Reasoning', subject_id: SUB_A });
    expect(created.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/learning/competencies')
      .set(as('adminA'))
      .send({ code: 'C-2', name: 'Modelling', subject_id: SUB_A });
    expect(second.status).toBe(201);

    const firstLink = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/competencies`)
      .set(as('adminA'))
      .send({ competency_id: created.body.id, is_primary: true });
    expect(firstLink.status).toBe(201);

    // A second PRIMARY competency on the same objective is refused ...
    const conflict = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/competencies`)
      .set(as('adminA'))
      .send({ competency_id: second.body.id, is_primary: true });
    expect(conflict.status).toBe(422);
    expect(conflict.body.error.fields.is_primary).toBeDefined();

    // ... but a non-primary one is fine.
    const secondary = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/competencies`)
      .set(as('adminA'))
      .send({ competency_id: second.body.id });
    expect(secondary.status).toBe(201);

    const unlinked = await request(app)
      .delete(`/api/v1/learning/objectives/${OBJ_A}/competencies/${second.body.id}`)
      .set(as('adminA'));
    expect(unlinked.status).toBe(200);
    expect(unlinked.body).toEqual({ deleted: true });
  });

  it('rejects a prerequisite cycle and a self-edge, then removes a valid edge', async () => {
    const added = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/prerequisites`)
      .set(as('adminA'))
      .send({ prerequisite_objective_id: OBJ_A2 });
    expect(added.status).toBe(201);

    const cycle = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A2}/prerequisites`)
      .set(as('adminA'))
      .send({ prerequisite_objective_id: OBJ_A });
    expect(cycle.status).toBe(422);

    const self = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/prerequisites`)
      .set(as('adminA'))
      .send({ prerequisite_objective_id: OBJ_A });
    expect(self.status).toBe(422);

    const removed = await request(app)
      .delete(`/api/v1/learning/objectives/${OBJ_A}/prerequisites/${OBJ_A2}`)
      .set(as('adminA'));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ deleted: true });
  });

  it('refuses a foreign competency on a link', async () => {
    const res = await request(app)
      .post(`/api/v1/learning/objectives/${OBJ_A}/competencies`)
      .set(as('adminA'))
      .send({ competency_id: 'does-not-exist' });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A question without criteria keeps working, and the Phase 1 filters work
// ─────────────────────────────────────────────────────────────────────────────

describe('questions without criteria and the Phase 1 filters', () => {
  it('reads an unclassified question like any other question', async () => {
    const res = await request(app).get(`/api/v1/questions/${Q_PLAIN}`).set(as('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(Q_PLAIN);
    expect(res.body.pedagogy_status).toBe('unclassified');
    expect(res.body.primary_bloom_dimension_id).toBeNull();
  });

  it('keeps an unclassified question in the question list', async () => {
    const res = await request(app).get('/api/v1/questions?limit=100').set(as('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((row) => row.id)).toContain(Q_PLAIN);
  });

  it('filters by pedagogy status', async () => {
    // Classify Q_PLAIN here so the assertion has a known classified row; the
    // tests above already asserted its unclassified state.
    const classify = await request(app)
      .put(`/api/v1/learning/questions/${Q_PLAIN}/pedagogy`)
      .set(as('adminA'))
      .send(criteriaBody([
        { objective_id: OBJ_A, bloom_dimension_id: 'apply', weight: 1 },
      ]));
    expect(classify.status).toBe(200);

    const classified = await request(app)
      .get('/api/v1/questions?pedagogy_status=classified&limit=100')
      .set(as('adminA'));
    expect(classified.status).toBe(200);
    expect(classified.body.data.map((row) => row.id)).toContain(Q_PLAIN);

    const unclassified = await request(app)
      .get('/api/v1/questions?pedagogy_status=unclassified&limit=100')
      .set(as('adminA'));
    expect(unclassified.status).toBe(200);
    expect(unclassified.body.data.map((row) => row.id)).toContain(Q_OWN);
    expect(unclassified.body.data.map((row) => row.id)).not.toContain(Q_PLAIN);
  });

  it('filters by an explicit id set (the objective-filter path)', async () => {
    const res = await request(app)
      .get(`/api/v1/questions?ids=${Q_PLAIN},${Q_COLLEAGUE}&limit=100`)
      .set(as('adminA'));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((row) => row.id).sort();
    expect(ids).toEqual([Q_COLLEAGUE, Q_PLAIN].sort());
  });

  it('keeps the id set inside the caller\'s school', async () => {
    const res = await request(app)
      .get(`/api/v1/questions?ids=${Q_PLAIN},${Q_B}&limit=100`)
      .set(as('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.data.map((row) => row.id)).toEqual([Q_PLAIN]);
  });

  it('keeps the existing teacher author scope unchanged', async () => {
    const res = await request(app).get('/api/v1/questions?limit=100').set(as('teacherA'));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((row) => row.id);
    expect(ids).toContain(Q_PLAIN);
    expect(ids).not.toContain(Q_COLLEAGUE);
  });

  it('refuses a student reaching the learning read surface', async () => {
    const res = await request(app).get('/api/v1/learning/objectives').set(as('studentA'));
    expect(res.status).toBe(403);
  });
});