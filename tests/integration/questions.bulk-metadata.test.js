/**
 * tests/integration/questions.bulk-metadata.test.js
 *
 * Verifies that AI-generated question metadata which the Prisma schema
 * cannot store as columns (allowMultipleAnswers, isDraggable, odd-one-out,
 * code metadata) survives the full round trip:
 *
 *   bulk write (sanitizer encodes `multi::`/`meta::` prefix in `answer`)
 *     → SQLite row
 *     → bootstrap read (decoder restores the flags + strips the prefix)
 *
 * Also covers the multi-answer heuristic: an unprefixed comma-joined answer
 * whose tokens all match stored options is upgraded to allowMultipleAnswers
 * on read, so legacy rows written before the prefix existed still render
 * with the "Multiple answers" badge in training/exams/games/tournaments.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = adminRes.body.accessToken;
});

afterAll(async () => {
  await teardownTestDb();
});

async function bootstrapQuestions() {
  const res = await request(app)
    .get('/api/v1/bootstrap')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  return res.body.data.questions;
}

describe('bulk questions → bootstrap round trip', () => {
  it('round-trips allowMultipleAnswers through the multi:: answer prefix', async () => {
    const res = await request(app)
      .post('/api/v1/bulk/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            question: 'Which are input devices?',
            type: 'multiple-choice',
            options: ['Keyboard', 'Mouse', 'Printer', 'Screen'],
            optionData: [
              { text: 'Keyboard' },
              { text: 'Mouse' },
              { text: 'Printer' },
              { text: 'Screen' },
            ],
            answer: 'Keyboard,Mouse',
            allowMultipleAnswers: true,
            difficulty: 'easy',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);

    // Raw row: encoded prefix, pipe-joined tokens.
    const [row] = await prisma.question.findMany({
      where: { text: 'Which are input devices?' },
    });
    expect(row.type).toBe('mcq');
    expect(row.answer).toBe('multi::Keyboard|Mouse');

    // Bootstrap read: flag restored, answer back to comma-joined text.
    const questions = await bootstrapQuestions();
    const q = questions.find((item) => item.text === 'Which are input devices?');
    expect(q).toBeTruthy();
    expect(q.allowMultipleAnswers).toBe(true);
    expect(q.answer).toBe('Keyboard,Mouse');
  });

  it('round-trips code-question metadata through the meta:: answer prefix', async () => {
    const res = await request(app)
      .post('/api/v1/bulk/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            question: 'What does this print?',
            type: 'code',
            codeSnippet: 'console.log(2 + 2);',
            codeLanguage: 'javascript',
            codeAnswerMode: 'multiple-choice',
            options: ['4', '5', '6'],
            answer: '4',
            difficulty: 'medium',
          },
        ],
      });
    expect(res.status).toBe(201);

    const questions = await bootstrapQuestions();
    const q = questions.find((item) => item.text === 'What does this print?');
    expect(q).toBeTruthy();
    expect(q.type).toBe('code');
    expect(q.codeSnippet).toBe('console.log(2 + 2);');
    expect(q.codeLanguage).toBe('javascript');
    expect(q.codeAnswerMode).toBe('multiple-choice');
    expect(q.answer).toBe('4');
  });

  it('round-trips draggable questions with isDraggable and order answers', async () => {
    const res = await request(app)
      .post('/api/v1/bulk/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            question: 'Order the steps:',
            type: 'draggable',
            isDraggable: true,
            options: ['Step 1', 'Step 2', 'Step 3'],
            answer: 'Step 1,Step 2,Step 3',
            difficulty: 'medium',
          },
        ],
      });
    expect(res.status).toBe(201);

    const questions = await bootstrapQuestions();
    const q = questions.find((item) => item.text === 'Order the steps:');
    expect(q).toBeTruthy();
    expect(q.isDraggable).toBe(true);
    expect(q.answer).toBe('Step 1,Step 2,Step 3');
  });

  it('keeps plain single-answer MCQs unprefixed and single', async () => {
    const res = await request(app)
      .post('/api/v1/bulk/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            question: 'Pick the number two:',
            type: 'multiple-choice',
            options: ['0', '1', '2', 'A'],
            answer: '2',
            difficulty: 'easy',
          },
        ],
      });
    expect(res.status).toBe(201);

    const [row] = await prisma.question.findMany({
      where: { text: 'Pick the number two:' },
    });
    expect(row.answer).toBe('2'); // numeric option text, no re-interpretation

    const questions = await bootstrapQuestions();
    const q = questions.find((item) => item.text === 'Pick the number two:');
    expect(q.allowMultipleAnswers).toBeUndefined();
    expect(q.answer).toBe('2');
  });

  it('upgrades legacy unprefixed multi-token answers via the options heuristic', async () => {
    // Simulate a row written by an older path: multi answer, no flag stored.
    await prisma.question.create({
      data: {
        school_id: 'school-test',
        type: 'mcq',
        text: 'Which are primary colors?',
        options_json: JSON.stringify(['Red', 'Blue', 'Green', 'Chair']),
        answer: 'Red,Blue',
      },
    });

    const questions = await bootstrapQuestions();
    const q = questions.find((item) => item.text === 'Which are primary colors?');
    expect(q).toBeTruthy();
    expect(q.allowMultipleAnswers).toBe(true);
    expect(q.answer).toBe('Red,Blue');
  });

  it('does not flag fill-blank / matching / true-false answers as multi', async () => {
    await prisma.question.createMany({
      data: [
        {
          school_id: 'school-test',
          type: 'fill-blank',
          text: 'The ___ stores data in ___.',
          options_json: JSON.stringify(['variable', 'memory', 'function']),
          answer: '1:variable|2:memory',
        },
        {
          school_id: 'school-test',
          type: 'matching',
          text: 'Match the pairs.',
          options_json: JSON.stringify(['A', '1', 'B', '2']),
          answer: 'A-->1|B-->2',
        },
        {
          school_id: 'school-test',
          type: 'true-false',
          text: 'A byte has 8 bits.',
          options_json: JSON.stringify(['Vrai', 'Faux']),
          answer: 'Vrai',
        },
      ],
    });

    const questions = await bootstrapQuestions();
    const fill = questions.find((item) => item.text === 'The ___ stores data in ___.');
    expect(fill.allowMultipleAnswers).toBeUndefined();
    expect(fill.answer).toBe('1:variable|2:memory');

    const matching = questions.find((item) => item.text === 'Match the pairs.');
    expect(matching.allowMultipleAnswers).toBeUndefined();
    expect(matching.answer).toBe('A-->1|B-->2');

    const tf = questions.find((item) => item.text === 'A byte has 8 bits.');
    expect(tf.allowMultipleAnswers).toBeUndefined();
  });
});
