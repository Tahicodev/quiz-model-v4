/**
 * tests/integration/exam-documents.routes.test.js
 *
 * End-to-end contract of the exam document routes on a real database:
 *
 *  - who may reach them (authoring roles, tenant, ownership);
 *  - what they must never leak over HTTP (the answer key stays server-side and
 *    student-facing responses carry no answer);
 *  - that saving a header only touches its own slice of options_json and never
 *    another exam, another tenant row or the School;
 *  - the /20 gate: refused without a confirmed normalization, produced with it;
 *  - the exported bytes: correct MIME, download filename, real PDF/DOCX content.
 *
 * Rows are seeded through prisma so the fixtures are exact (points adding to 20
 * or deliberately not) and the test focuses on these routes only.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { pdfText } from '../unit/helpers/examDocPdf.js';
import { zipText } from '../unit/helpers/examDocZip.js';

const BASE = '/api/v1/exam-documents';
const SECRET_ANSWER = 'RÉPONSE-CONFIDENTIELLE-91';
const SECRET_FEEDBACK = 'EXPLICATION-CONFIDENTIELLE-92';

let app;
let prisma;
let adminToken;
let ownerToken; // teacher1 owns the documented exams
let otherToken; // teacher2, same tenant, other author
let studentToken;
let examId; // 20 points, complete answers
let shortExamId; // 3 points: the /20 gate
let emptyExamId; // legacy exam: no saved questions
let otherExamId; // belongs to teacher2
const legacyBlob = JSON.stringify({
  presetSnapshot: { questions: [0, 1, 2], name: 'legacy-preset' },
  // Two real classes (seeded below) and one name that matches no Class row: the
  // resolver prints what genuinely exists and stays silent about the rest.
  classes: ['3ème A', '3ème B', 'Classe supprimée 9Z'],
});

async function login(username, password) {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** Binary responses have to be read as bytes, not as text. */
function exportBinary(token, id, body) {
  return request(app)
    .post(`${BASE}/${id}/export`)
    .set(auth(token))
    .send(body)
    .buffer()
    .parse((res, cb) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
}

async function createExam(creatorId, name, options) {
  return prisma.exam.create({
    data: {
      school_id: 'school-test',
      creator_id: creatorId,
      name,
      duration: 60,
      status: 'active',
      options_json: options || null,
    },
  });
}

async function attach(examIdValue, questionId, order, pointsOverride = null) {
  return prisma.examQuestion.create({
    data: { exam_id: examIdValue, question_id: questionId, order_index: order, points_override: pointsOverride },
  });
}

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const hash = await bcrypt.hash('pass123', 4);
  const teacher1 = await prisma.user.create({
    data: { school_id: 'school-test', username: 'docowner', name: 'Mme Aïchouche', password_hash: hash, role: 'teacher', status: 'active' },
  });
  const teacher2 = await prisma.user.create({
    data: { school_id: 'school-test', username: 'docother', name: 'Teacher Two', password_hash: hash, role: 'teacher', status: 'active' },
  });
  await prisma.user.create({
    data: { school_id: 'school-test', username: 'docstudent', name: 'Pupil', password_hash: hash, role: 'student', status: 'active' },
  });

  adminToken = await login('admin', 'admin123');
  ownerToken = await login('docowner', 'pass123');
  otherToken = await login('docother', 'pass123');
  studentToken = await login('docstudent', 'pass123');

  await prisma.class.createMany({
    data: [
      { school_id: 'school-test', name: '3ème A' },
      { school_id: 'school-test', name: '3ème B' },
    ],
  });

  const grammar = await prisma.category.create({
    data: { school_id: 'school-test', name: 'Grammaire' },
  });
  const science = await prisma.category.create({
    data: { school_id: 'school-test', name: 'Sciences' },
  });

  const q1 = await prisma.question.create({
    data: {
      school_id: 'school-test',
      created_by: teacher1.id,
      category_id: grammar.id,
      type: 'mcq',
      text: 'Quelle est la capitale de la France ?',
      options_json: JSON.stringify(['Paris', 'Lyon', 'Marseille']),
      answer: 'Paris',
      explanation: `Il faut répondre ${SECRET_ANSWER} et lire ${SECRET_FEEDBACK}.`,
      points: 8,
    },
  });
  const q2 = await prisma.question.create({
    data: {
      school_id: 'school-test',
      created_by: teacher1.id,
      category_id: grammar.id,
      type: 'fill-blank',
      text: 'Complète : le soleil ____ le ciel.',
      answer: SECRET_ANSWER,
      explanation: null,
      points: 7,
    },
  });
  const q3 = await prisma.question.create({
    data: {
      school_id: 'school-test',
      created_by: teacher1.id,
      category_id: science.id,
      type: 'true-false',
      text: 'Un chat est un mammifère.',
      answer: 'true',
      explanation: SECRET_FEEDBACK,
      points: 5,
    },
  });
  const qSmall = await prisma.question.create({
    data: {
      school_id: 'school-test',
      created_by: teacher1.id,
      type: 'mcq',
      text: 'Combien font deux pommes ?',
      options_json: JSON.stringify(['2', '3']),
      answer: '2',
      points: 3,
    },
  });

  // 8 + 7 + 5 = 20 exactly.
  const main = await createExam(teacher1.id, 'Devoir surveillé n°1', legacyBlob);
  await attach(main.id, q1.id, 0);
  await attach(main.id, q2.id, 1);
  await attach(main.id, q3.id, 2);
  examId = main.id;

  const short = await createExam(teacher1.id, 'Interrogation courte');
  await attach(short.id, qSmall.id, 0);
  shortExamId = short.id;

  emptyExamId = (await createExam(teacher1.id, 'Examen sans questions', legacyBlob)).id;

  // Authored by the *other* teacher: `ownerToken` must be refused on it while
  // an admin is allowed to document any exam of the tenant.
  const other = await createExam(teacher2.id, 'Examen d’un autre professeur');
  await attach(other.id, qSmall.id, 0);
  otherExamId = other.id;
});

afterAll(async () => {
  await teardownTestDb();
});

describe('access control', () => {
  const endpoints = (id) => [
    { name: 'GET header', call: (token) => request(app).get(`${BASE}/${id}/header`).set(auth(token)) },
    { name: 'PUT header', call: (token) => request(app).put(`${BASE}/${id}/header`).set(auth(token)).send({ title: 'X' }) },
    { name: 'POST preview', call: (token) => request(app).post(`${BASE}/${id}/preview`).set(auth(token)).send({ document: 'student' }) },
    {
      name: 'POST export',
      call: (token) => request(app).post(`${BASE}/${id}/export`).set(auth(token)).send({ document: 'student', format: 'pdf' }),
    },
  ];

  it('refuses anonymous callers on every route', async () => {
    for (const endpoint of endpoints(examId)) {
      const res = await endpoint.call(null);
      expect(res.status, endpoint.name).toBe(401);
    }
  });

  it('refuses students on every route — an answer key is never reachable', async () => {
    for (const endpoint of endpoints(examId)) {
      const res = await endpoint.call(studentToken);
      expect(res.status, endpoint.name).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(SECRET_ANSWER);
    }
  });

  it('lets a teacher document their own exam but not a colleague’s', async () => {
    const own = await request(app).get(`${BASE}/${examId}/header`).set(auth(ownerToken));
    expect(own.status).toBe(200);

    // teacher1 is not the author of that one: refused on every route.
    for (const endpoint of endpoints(otherExamId)) {
      const res = await endpoint.call(ownerToken);
      expect(res.status, endpoint.name).toBe(403);
    }

    // its own author is not.
    const theirs = await request(app).get(`${BASE}/${otherExamId}/header`).set(auth(otherToken));
    expect(theirs.status).toBe(200);
  });

  it('lets an admin document any exam of the tenant', async () => {
    const res = await request(app).post(`${BASE}/${otherExamId}/preview`).set(auth(adminToken)).send({ document: 'student' });
    expect(res.status).toBe(200);
    expect(res.body.header.teacherName).toBe('Teacher Two');
    // Its barème is 3 points, which the payload reports instead of hiding.
    expect(res.body.scoring.error.code).toBe('TOTAL_NOT_20');
  });

  it('returns 404 for an unknown exam instead of leaking existence', async () => {
    const res = await request(app).get(`${BASE}/00000000-0000-4000-8000-000000000000/header`).set(auth(adminToken));
    expect(res.status).toBe(404);
  });
});

describe('header round trip', () => {
  it('fills only real data and never invents ministry, academy, term or date', async () => {
    const res = await request(app).get(`${BASE}/${examId}/header`).set(auth(ownerToken));
    expect(res.status).toBe(200);
    const header = res.body.header;
    expect(header.schoolName).toBe('Test School');
    expect(header.teacherName).toBe('Mme Aïchouche');
    expect(header.title).toBe('Devoir surveillé n°1');
    expect(header.durationMinutes).toBe(60);
    // No class junction rows yet: the names come from the legacy blob, but only
    // the ones matching a real Class row — nothing is invented.
    expect(header.level).toContain('3ème A');
    expect(header.level).toContain('3ème B');
    expect(header.level).not.toContain('Classe supprimée');
    for (const invented of ['ministry', 'academy', 'term', 'date', 'group', 'sessionType']) {
      expect(header[invented], invented).toBeNull();
    }
  });

  it('saves the header slice and leaves the rest of options_json intact', async () => {
    const before = await prisma.exam.findUnique({ where: { id: examId } });
    const res = await request(app)
      .put(`${BASE}/${examId}/header`)
      .set(auth(ownerToken))
      .send({ ministry: 'Ministère de l’Éducation', title: 'Devoir surveillé n°1 — remplacement', grouping: 'by-category' });
    expect(res.status).toBe(200);

    const after = await prisma.exam.findUnique({ where: { id: examId } });
    const blob = JSON.parse(after.options_json);
    expect(blob.examDocHeader).toMatchObject({
      ministry: 'Ministère de l’Éducation',
      title: 'Devoir surveillé n°1 — remplacement',
      grouping: 'by-category',
    });
    expect(res.body.header.ministry).toBe('Ministère de l’Éducation');
    // The legacy UI data survives untouched.
    expect(blob.presetSnapshot).toEqual(JSON.parse(before.options_json).presetSnapshot);
    expect(blob.classes).toEqual(JSON.parse(before.options_json).classes);

    // Other exams and the school row are not part of this write.
    const other = await prisma.exam.findUnique({ where: { id: otherExamId } });
    expect(other.options_json).toBeNull();
    const school = await prisma.school.findUnique({ where: { id: 'school-test' } });
    expect(school.name).toBe('Test School');

    const audit = await prisma.auditLog.findFirst({
      where: { entity_id: examId, action: 'update-document-header' },
    });
    expect(audit).not.toBeNull();
  });

  it('re-reads what was saved, merged with the defaults', async () => {
    const res = await request(app).get(`${BASE}/${examId}/header`).set(auth(ownerToken));
    expect(res.body.header.title).toBe('Devoir surveillé n°1 — remplacement');
    expect(res.body.header.ministry).toBe('Ministère de l’Éducation');
    // The resolved defaults are returned apart, so the modal can show where a
    // value came from.
    expect(res.body.defaults.schoolName).toBe('Test School');
  });

  it('rejects a header field that is too long', async () => {
    const res = await request(app)
      .put(`${BASE}/${examId}/header`)
      .set(auth(ownerToken))
      .send({ schoolName: 'x'.repeat(400) });
    expect(res.status).toBe(422);
  });
});

describe('preview', () => {
  it('returns paper markup for the subject without any answer', async () => {
    const res = await request(app).post(`${BASE}/${examId}/preview`).set(auth(ownerToken)).send({ document: 'student' });
    expect(res.status).toBe(200);
    expect(res.body.scoring.label).toBe('20 / 20');
    expect(res.body.scoring.valid20).toBe(true);
    expect(res.body.confidentiality.includesAnswers).toBe(false);
    expect(res.body.html).toContain('Quelle est la capitale de la France ?');
    expect(res.body.html).toContain('ed-paper--student');
    expect(res.body.html).not.toContain(SECRET_ANSWER);
    expect(res.body.html).not.toContain(SECRET_FEEDBACK);
    expect(res.body.printHtml).toContain('<style');
    expect(res.body.printHtml).toContain('ed-print-body');
  });

  it('shows the answers only in the answer key preview', async () => {
    const res = await request(app).post(`${BASE}/${examId}/preview`).set(auth(ownerToken)).send({ document: 'answer_key' });
    expect(res.status).toBe(200);
    expect(res.body.confidentiality.includesAnswers).toBe(true);
    expect(res.body.html).toContain(SECRET_ANSWER);
    expect(res.body.html).toContain(SECRET_FEEDBACK);
    expect(res.body.sections.map((section) => section.title)).toHaveLength(res.body.sections.length);
  });

  it('applies unsaved header edits to the preview so preview and file match', async () => {
    const res = await request(app)
      .post(`${BASE}/${examId}/preview`)
      .set(auth(ownerToken))
      .send({ document: 'student', header: { ministry: 'Ministère test aperçu', grouping: 'by-category' } });
    expect(res.body.html).toContain('Ministère test aperçu');
    const saved = await prisma.exam.findUnique({ where: { id: examId } });
    expect(saved.options_json).not.toContain('Ministère test aperçu');
  });

  it('reports a legacy exam with no saved questions instead of guessing', async () => {
    const res = await request(app).post(`${BASE}/${emptyExamId}/preview`).set(auth(ownerToken)).send({ document: 'student' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.questions[0]).toContain('Assign Questions');
  });

  it('validates the document name', async () => {
    const res = await request(app).post(`${BASE}/${examId}/preview`).set(auth(ownerToken)).send({ document: 'grades' });
    expect(res.status).toBe(422);
  });
});

describe('export', () => {
  it('refuses a barème that is not /20 until the normalization is confirmed', async () => {
    const refused = await request(app)
      .post(`${BASE}/${shortExamId}/export`)
      .set(auth(ownerToken))
      .send({ document: 'student', format: 'pdf' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('TOTAL_NOT_20');
    expect(refused.body.scoring.naturalTotal).toBe(3);

    const stillRefused = await request(app)
      .post(`${BASE}/${shortExamId}/export`)
      .set(auth(ownerToken))
      .send({ document: 'student', format: 'pdf', normalization: { mode: 'scale-to-20', confirmed: false } });
    expect(stillRefused.status).toBe(400);
    expect(stillRefused.body.error.code).toBe('NORMALIZATION_NOT_CONFIRMED');

    const accepted = await exportBinary(ownerToken, shortExamId, {
      document: 'student',
      format: 'pdf',
      normalization: { mode: 'scale-to-20', confirmed: true },
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('streams a real PDF subject with a download name', async () => {
    const res = await exportBinary(ownerToken, examId, { document: 'student', format: 'pdf' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="exam-[^"]*-student\.pdf"/);
    expect(Number(res.headers['content-length'])).toBe(res.body.length);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(res.body.toString('latin1')).toContain('/Type /Page');
    expect(res.body.toString('latin1')).not.toContain(SECRET_ANSWER);
  });

  it('streams a real Word answer key marked as confidential', async () => {
    const res = await exportBinary(ownerToken, examId, { document: 'answer_key', format: 'docx' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('wordprocessingml.document');
    expect(res.headers['content-disposition']).toContain('-answer-key.docx"');
    expect(res.body.subarray(0, 2).toString()).toBe('PK');

    const audit = await prisma.auditLog.findFirst({
      where: { entity_id: examId, action: 'export-answer-key' },
    });
    expect(audit).not.toBeNull();
  });

  it('produces the same exam content in both formats', async () => {
    const pdf = await exportBinary(ownerToken, examId, { document: 'student', format: 'pdf' });
    const docx = await exportBinary(ownerToken, examId, { document: 'student', format: 'docx' });
    expect(pdf.body.length).toBeGreaterThan(1000);
    expect(docx.body.length).toBeGreaterThan(1000);
    // The two renderers consume one model, so the printed content has to match
    // even though the containers differ (compressed streams vs ZIP parts).
    const flat = (value) => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const pdfContent = flat(pdfText(pdf.body));
    const docxContent = flat(zipText(docx.body, 'word/document.xml'));

    for (const stem of ['Quelle est la capitale de la France ?', 'Un chat est un mammifère.']) {
      expect(pdfContent, 'pdf missing: ' + stem).toContain(stem);
      expect(docxContent, 'docx missing: ' + stem).toContain(stem);
    }
    // The subject states the barème and keeps the grade box empty, in both
    // formats: "Note : 20 / 20" on a student sheet gives the correction away.
    expect(pdfContent).toContain('Barème : 20 points');
    expect(docxContent).toContain('Barème : 20 points');
    expect(pdfContent).not.toContain('Note : 20 / 20');
    expect(docxContent).not.toContain('Note : 20 / 20');
    for (const secret of [SECRET_ANSWER, SECRET_FEEDBACK]) {
      expect(pdfContent, 'the subject must not carry ' + secret).not.toContain(secret);
      expect(docxContent, 'the subject must not carry ' + secret).not.toContain(secret);
    }
  });

  it('rejects an unknown format', async () => {
    const res = await request(app)
      .post(`${BASE}/${examId}/export`)
      .set(auth(ownerToken))
      .send({ document: 'student', format: 'exe' });
    expect(res.status).toBe(422);
  });

  it('never writes the generated file to disk', async () => {
    const res = await exportBinary(ownerToken, examId, { document: 'student', format: 'pdf' });
    expect(res.headers['x-exam-doc-url']).toBeUndefined();
    expect(res.body.length).toBeGreaterThan(0);
  });
});
