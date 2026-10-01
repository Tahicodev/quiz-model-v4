/**
 * tests/integration/kids.import.test.js
 *
 * The import button in the wizard's "AI content" step posts a teacher's
 * hand-written file to POST /kids/levels/validate. This checks the route against
 * a real database, because the thing it must get right is the response the
 * browser turns into wizard state.
 *
 * Covered:
 *   - a clean file comes back normalized and playable, not just accepted
 *   - a narrative shell survives with its mechanic and world text intact
 *   - every problem is reported at once, with the level it belongs to
 *   - the check is a dry run: nothing is written
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
  const login = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  await teardownTestDb();
});

const post = (body) =>
  request(app)
    .post('/api/v1/kids/levels/validate')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);

const CLEAN = {
  levels: [
    {
      level_type: 'multiple_choice',
      content_json: {
        instruction: 'Choisis la bonne réponse !',
        question: 'Combien font 4 + 3 ?',
        options: [{ id: 'opt1', value: '6' }, { id: 'opt2', value: '7' }],
        correctId: 'opt2',
      },
    },
    {
      level_type: 'treasure_hunt',
      content_json: {
        mechanic: 'word_order',
        worldText: 'Le coffre s’ouvre !',
        instruction: 'Remets les lettres dans l’ordre.',
        answer: 'CHAT',
        items: [{ id: '1', value: 'A' }, { id: '2', value: 'C' }, { id: '3', value: 'T' }, { id: '4', value: 'H' }],
      },
    },
  ],
};

describe('POST /kids/levels/validate', () => {
  it('returns a clean file as ready-to-use levels, not just an ok', async () => {
    const res = await post({ levels: CLEAN });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const [first, second] = res.body.levels;

    // The wizard saves whatever comes back, so it has to be in level shape:
    // content as an object, a position, and a score.
    expect(first.level_type).toBe('multiple_choice');
    expect(typeof first.content_json).toBe('object');
    expect(first.content_json.correctId).toBe('opt2');
    expect(first.order_index).toBe(0);
    expect(first.points).toBe(10);
    expect(second.order_index).toBe(1);
  });

  it('keeps an adventure shell intact, mechanic and world text included', async () => {
    const res = await post({ levels: { levels: [CLEAN.levels[1]] } });
    expect(res.status).toBe(200);
    const level = res.body.levels[0];
    expect(level.level_type).toBe('treasure_hunt');
    expect(level.content_json.mechanic).toBe('word_order');
    expect(level.content_json.worldText).toBe('Le coffre s’ouvre !');
    // The mechanic's own content has to survive alongside the shell, or the
    // wrapper renders an empty question.
    expect(level.content_json.answer).toBe('CHAT');
  });

  it('accepts a bare array as well as the levels wrapper', async () => {
    const res = await post({ levels: CLEAN.levels });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('reads a content_json sent as a string, the way a saved level looks', async () => {
    const res = await post({
      levels: [{ level_type: 'multiple_choice', content_json: JSON.stringify(CLEAN.levels[0].content_json) }],
    });
    expect(res.status).toBe(200);
    expect(res.body.levels[0].content_json.correctId).toBe('opt2');
  });

  it('checks a file in the language it declares, not a default', async () => {
    // The validator matches instructions against the language it is told, so a
    // French level set sent without its language would be read as English and
    // the correct wording rejected.
    const res = await post({
      language: 'fr',
      levels: [{ level_type: 'multiple_choice', language: 'fr', content_json: { instruction: 'Choisis la bonne reponse', question: 'Quelle couleur est le ciel ?', options: [{ id: 'a', value: 'Bleu' }, { id: 'b', value: 'Rouge' }], correctId: 'a' } }],
    });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('reports every problem at once, each against the level it belongs to', async () => {
    const res = await post({
      levels: [
        { level_type: 'multiple_choice', points: 900, content_json: { instruction: 'a', question: 'b', options: [{ id: 'x', value: '1' }], correctId: 'nope' } },
        { level_type: 'sequence', content_json: { instruction: 'a', items: [{ id: 'n1', value: '1' }, { id: 'n2', value: '2' }], correctOrder: ['n1'] } },
        { level_type: 'treasure_hunt', content_json: { instruction: 'a', question: 'b', options: [{ id: 'o', value: '1' }], correctId: 'o' } },
      ],
    });
    expect(res.status).toBe(422);
    // Newline separated: the shared api client flattens field lists with commas,
    // so a joined sentence would arrive as one unreadable line in the browser.
    const messages = res.body.error.fields.levels.split('\n');
    expect(Array.isArray(messages)).toBe(true);
    const text = messages.join('\n');
    // A teacher should see the score, the dangling id, the incomplete order and
    // the shell-without-mechanic in one pass, each attributed to its level.
    expect(text).toMatch(/level #1:.*points/);
    expect(text).toMatch(/level #1:.*correctId "nope"/);
    expect(text).toMatch(/level #2:.*missing item "n2"/);
    expect(text).toMatch(/level #3:.*mechanic/);
  });

  it('refuses a file that is too short for the chosen game', async () => {
    const res = await post({ levels: { levels: [CLEAN.levels[0]] }, game_template: 'treasure_hunt' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.levels).toMatch(/at least 5 levels/);
  });

  it('says so when the file is not a levels file at all', async () => {
    const res = await post({ levels: { questions: [] } });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.levels).toMatch(/levels/);
  });

  it('is a dry run: checking a file must not create anything', async () => {
    const before = await prisma.kidsActivityLevel.count();
    await post({ levels: CLEAN, game_template: 'treasure_hunt' });
    await post({ levels: { levels: [{ level_type: 'nonsense', content_json: {} }] } });
    expect(await prisma.kidsActivityLevel.count()).toBe(before);
  });

  it('needs a signed-in teacher', async () => {
    const res = await request(app).post('/api/v1/kids/levels/validate').send({ levels: CLEAN.levels });
    expect(res.status).toBe(401);
  });
});
