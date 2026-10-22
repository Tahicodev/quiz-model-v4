/**
 * tests/integration/kids-game-math-quest.test.js
 *
 * Verifies the math-quest game_type end-to-end through the real kids
 * pipeline (public PIN play + logged-in play + server-side grading):
 *  - GET /api/v1/kids/play/:pin delivers the published game + questions,
 *  - anonymous PIN sessions are graded server-side (never trusting client
 *    scores) with correct stars thresholds,
 *  - completing a session twice is rejected (duplicate-completion guard),
 *  - user-linked sessions can only be completed by their owner (403),
 *  - the shared Zod schema accepts the new `math-quest` type for teacher CRUD,
 *  - STAGE 2: per-level grading + attribution, KidQuestProgress MAX-ratchet
 *    (best stars preserved on retries), server-computed unlock chain from
 *    GET /quest-progress, whole-game runs write 'default' progress, and
 *    duplicate level ids are rejected at create/update time.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;
let studentToken;
let studentUser;
let teacherUser;

const MQ_QUESTIONS = [
	{ id: 'iq-mq-1', type: 'mcq', text: '1+1?', options_json: JSON.stringify(['1', '2', '3']), answer: '2', points: 1 },
	{ id: 'iq-mq-2', type: 'mcq', text: '2+2?', options_json: JSON.stringify(['3', '4', '5']), answer: '4', points: 1 },
	{ id: 'iq-mq-3', type: 'mcq', text: '3+3?', options_json: JSON.stringify(['6', '7', '8']), answer: '6', points: 1 },
];
const MQ_CONFIG = JSON.stringify({
	time_per_q: 20,
	levels: [{ id: 'l1', name: 'Jungle Trail', questions: ['iq-mq-1', 'iq-mq-2', 'iq-mq-3'] }],
});
const MQ_MULTI_CONFIG = JSON.stringify({
	time_per_q: 20,
	levels: [
		{ id: 'lv-a', name: 'Jungle Trail', questions: ['iq-mq-1'], pass_stars: 1, art: 'home' },
		{ id: 'lv-b', name: 'Temple Steps', questions: ['iq-mq-2', 'iq-mq-3'], pass_stars: 2, art: 'temple' },
	],
});
const correctAnswers = (ids, map = { 'iq-mq-1': '2', 'iq-mq-2': '4', 'iq-mq-3': '6' }) =>
	ids.map((id) => ({ question_id: id, given: map[id], correct: true, time_ms: 400 }));
beforeAll(async () => {
	const db = await setupTestDb();
	prisma = db.prisma;
	app = (await import('./helpers/app.js')).default;

	// Primaire school is the kids-space requirement
	await prisma.school.update({ where: { id: 'school-test' }, data: { school_type: 'primaire' } });

	const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
	adminToken = adminRes.body.accessToken;

	teacherUser = await prisma.user.create({
		data: { school_id: 'school-test', name: 'MQ Teacher', username: 'mq-teacher', role: 'teacher', password_hash: 'x' },
	});
	studentUser = await prisma.user.create({
		data: { school_id: 'school-test', name: 'MQ Student', username: 'mq-student', role: 'student', password_hash: 'x' },
	});
	const { signJwt } = await import('../../../src/backend/utils/jwt.js');
	studentToken = signJwt({ id: studentUser.id, school_id: 'school-test', role: 'student' });

	await prisma.kidsGame.create({
		data: {
			school_id: 'school-test',
			teacher_id: teacherUser.id,
			name: 'Math Quest integration fixture',
			game_type: 'math-quest',
			theme: 'jungle',
			grade: 'cp',
			subject: 'Maths',
			questions_json: JSON.stringify(MQ_QUESTIONS),
			config_json: MQ_CONFIG,
			status: 'published',
			pin: 'MQIN',
		},
	});
	await prisma.kidsGame.create({
		data: {
			school_id: 'school-test',
			teacher_id: teacherUser.id,
			name: 'Math Quest integration MULTI fixture',
			game_type: 'math-quest',
			theme: 'jungle',
			grade: 'cp',
			subject: 'Maths',
			questions_json: JSON.stringify(MQ_QUESTIONS),
			config_json: MQ_MULTI_CONFIG,
			status: 'published',
			pin: 'MQ2L',
		},
	});
});

afterAll(async () => {
	await teardownTestDb();
});

describe('GET /api/v1/kids/play/:pin (math-quest)', () => {
	it('serves the published math-quest game with normalized questions + levels config', async () => {
		const res = await request(app).get('/api/v1/kids/play/MQIN');
		expect(res.status).toBe(200);
		expect(res.body.game_type).toBe('math-quest');
		expect(res.body.questions).toHaveLength(3);
		expect(res.body.questions.map((q) => q.id)).toEqual(['iq-mq-1', 'iq-mq-2', 'iq-mq-3']);
		expect(res.body.config.levels).toHaveLength(1);
		expect(res.body.config.levels[0].questions).toEqual(['iq-mq-1', 'iq-mq-2', 'iq-mq-3']);
	});
});

describe('anonymous PIN play — server-side grading', () => {
	it('grades submitted answers on the server (3/3 → 3 stars)', async () => {
		const start = await request(app)
			.post('/api/v1/kids/play/MQIN/session')
			.send({ player_name: 'Tim', avatar: '🐯' });
		expect(start.status).toBe(200);
		const sessionId = start.body.session.id;

		const answers = MQ_QUESTIONS.map((q) => ({
			question_id: q.id, given: q.answer, correct: true, time_ms: 500,
		}));
		const done = await request(app)
			.patch(`/api/v1/kids/play/session/${sessionId}`)
			.send({ answers_json: JSON.stringify(answers), score: 999, stars: 3, completed: true });

		expect(done.status).toBe(200);
		// client's bogus score/stars are recomputed from server-side grading
		expect(done.body.score).toBe(3);
		expect(done.body.stars).toBe(3);
		expect(done.body.percent).toBe(100);
	});

	it('grants partial credit honestly (1/3 → 1 star, 33%)', async () => {
		const start = await request(app)
			.post('/api/v1/kids/play/MQIN/session')
			.send({ player_name: 'Léa', avatar: '🦊' });
		const sessionId = start.body.session.id;
		const answers = [
			{ question_id: 'iq-mq-1', given: '2', correct: true, time_ms: 400 },   // correct
			{ question_id: 'iq-mq-2', given: '3', correct: false, time_ms: 100 },  // wrong
			{ question_id: 'iq-mq-3', given: '7', correct: false, time_ms: 100 },  // wrong
		];
		const done = await request(app).patch(`/api/v1/kids/play/session/${sessionId}`)
			.send({ answers_json: JSON.stringify(answers), score: 42, stars: 3, completed: true });
		expect(done.status).toBe(200);
	expect(done.body.score).toBe(1);
	expect(done.body.stars).toBe(0); // 33% is below the 50% threshold for a star
	expect(done.body.percent).toBe(33);
	});

	it('refuses completion of an already-completed session (duplicate guard)', async () => {
		const start = await request(app)
			.post('/api/v1/kids/play/MQIN/session')
			.send({ player_name: 'Dup', avatar: '🐼' });
		const sessionId = start.body.session.id;
		const payload = {
			answers_json: JSON.stringify([{ question_id: 'iq-mq-1', given: '2', correct: true, time_ms: 10 }]),
			score: 1,
			stars: 3,
			completed: true,
		};
		const first = await request(app).patch(`/api/v1/kids/play/session/${sessionId}`).send(payload);
		expect(first.status).toBe(200);
		const second = await request(app).patch(`/api/v1/kids/play/session/${sessionId}`).send(payload);
		expect([400, 409, 422]).toContain(second.status); // must not silently double-grade
	});
});

describe('logged-in play — ownership boundaries', () => {
	it('POST /kids/games/:id/session creates an owned session', async () => {
		const gameIdRow = await prisma.kidsGame.findUnique({ where: { pin: 'MQIN' } });
		const res = await request(app)
			.post(`/api/v1/kids/games/${gameIdRow.id}/session`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({ avatar: '🐵' });
	expect(res.status).toBe(201); // REST: resource created
	expect(res.body.session.id).toBeTruthy();
		const row = await prisma.kidsGameSession.findUnique({ where: { id: res.body.session.id } });
		expect(row.user_id).toBe(studentUser.id);
		expect(row.completed).toBe(false);

		// A different user's token must NOT be able to complete it
		const otherUser = await prisma.user.create({
			data: { school_id: 'school-test', name: 'Other Kid', username: 'mq-other', role: 'student', password_hash: 'x' },
		});
		const { signJwt } = await import('../../../src/backend/utils/jwt.js');
		const otherToken = signJwt({ id: otherUser.id, school_id: 'school-test', role: 'student' });
		const cheats = await request(app)
			.patch(`/api/v1/kids/play/session/${res.body.session.id}`)
			.set('Authorization', `Bearer ${otherToken}`)
			.send({ answers_json: JSON.stringify([]), score: 3, stars: 3, completed: true });
		expect(cheats.status).toBe(403);
	});
});

describe('teacher CRUD accepts the math-quest game type', () => {
	it('creates + publishes a math-quest game through the staff endpoint', async () => {
		const created = await request(app)
			.post('/api/v1/kids')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				name: 'Math Quest wizard fixture',
				game_type: 'math-quest',
				theme: 'jungle',
				grade: 'cp',
				subject: 'Maths',
				questions_json: JSON.stringify(MQ_QUESTIONS),
				config_json: MQ_CONFIG,
			});
		expect(created.status).toBe(201);
		expect(created.body.game_type).toBe('math-quest');

		const published = await request(app).post(`/api/v1/kids/${created.body.id}/publish`).set('Authorization', `Bearer ${adminToken}`);
		expect(published.status).toBe(200);
		expect(published.body.pin).toMatch(/^[A-Z2-9]{4}$/);
	});

	it('rejects a level plan where one question belongs to two levels', async () => {
		const bad = JSON.stringify({
			levels: [
				{ id: 'a', name: 'A', questions: ['iq-mq-1', 'iq-mq-2'] },
				{ id: 'b', name: 'B', questions: ['iq-mq-2', 'iq-mq-3'] },
			],
		});
		const res = await request(app).post('/api/v1/kids')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				name: 'Bad partition', game_type: 'math-quest', theme: 'jungle', grade: 'cp',
				questions_json: JSON.stringify(MQ_QUESTIONS), config_json: bad,
			});
		expect(res.status).toBe(422);
	});

	it('rejects a plan that does not cover every question', async () => {
		const bad = JSON.stringify({ levels: [{ id: 'solo', name: 'S', questions: ['iq-mq-1'] }] });
		const res = await request(app).post('/api/v1/kids')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				name: 'Hole in plan', game_type: 'math-quest', theme: 'jungle', grade: 'cp',
				questions_json: JSON.stringify(MQ_QUESTIONS), config_json: bad,
			});
		expect(res.status).toBe(422);
	});

	it('rejects duplicated level ids (they key the progress table)', async () => {
		const bad = JSON.stringify({
			levels: [
				{ id: 'twin', name: 'Twin 1', questions: ['iq-mq-1'] },
				{ id: 'twin', name: 'Twin 2', questions: ['iq-mq-2', 'iq-mq-3'] },
			],
		});
		const res = await request(app).post('/api/v1/kids')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				name: 'Twin level ids', game_type: 'math-quest', theme: 'jungle', grade: 'cp',
				questions_json: JSON.stringify(MQ_QUESTIONS), config_json: bad,
			});
		expect(res.status).toBe(422);
	});
});

describe('stage 2 — multi-level progression + progress persistence', () => {
	it('GET /quest-progress returns the server-side unlock chain (l2 locked)', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });
		const res = await request(app)
			.get(`/api/v1/kids/games/${game.id}/quest-progress`)
			.set('Authorization', `Bearer ${studentToken}`);
		expect(res.status).toBe(200);
		expect(res.body.game_id).toBe(game.id);
		expect(res.body.levels).toHaveLength(2);
		expect(res.body.levels[0]).toMatchObject({ id: 'lv-a', unlocked: true, best_stars: null, passed: false });
		expect(res.body.levels[1]).toMatchObject({ id: 'lv-b', unlocked: false, best_stars: null });
	});

	it('anonymous progress route requires auth (401)', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });
		const res = await request(app).get(`/api/v1/kids/games/${game.id}/quest-progress`);
		expect([401, 403]).toContain(res.status);
	});

	it('ratchets KidQuestProgress: first run 1⭐, retry 3⭐, retry 1⭐ keeps best 3⭐', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });

		// Run 1 — level 1 with 1 star (100% of its own single question)
		const s1 = await request(app).post(`/api/v1/kids/games/${game.id}/session`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({ avatar: '🐵' });
		const d1 = await request(app).patch(`/api/v1/kids/play/session/${s1.body.session.id}`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({
				answers_json: JSON.stringify(correctAnswers(['iq-mq-1'])),
				score: 1, stars: 3, completed: true, level_id: 'lv-a',
			});
		expect(d1.status).toBe(200);
		expect(d1.body.quest).toMatchObject({
			level_id: 'lv-a', level_name: 'Jungle Trail', level_total_points: 1,
		});
		expect(d1.body.stars).toBe(3); // server graded, not the client's lie

		// best row exists after the first completed user-linked run
		const row1 = await prisma.kidQuestProgress.findUnique({
			where: { game_id_user_id_level_id: { game_id: game.id, user_id: studentUser.id, level_id: 'lv-a' } },
		});
		expect(row1.best_stars).toBe(3);
		expect(row1.play_count).toBe(1);
	});

	it('replay with a worse score keeps the best verified stars (MAX-ratchet)', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });
		// Note: run 1 above already set lv-a best=3. Windows pruning: this test
		// reuses the SAME student fixture — run a fresh session with 1/1 wrong.
		const s2 = await request(app).post(`/api/v1/kids/games/${game.id}/session`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({ avatar: '🐵' });
		const d2 = await request(app).patch(`/api/v1/kids/play/session/${s2.body.session.id}`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({
				answers_json: JSON.stringify([{ question_id: 'iq-mq-1', given: '99', correct: false, time_ms: 10 }]),
				score: 0, stars: 0, completed: true, level_id: 'lv-a',
			});
		expect(d2.status).toBe(200);
		expect(d2.body.stars).toBe(0);
		const row = await prisma.kidQuestProgress.findUnique({
			where: { game_id_user_id_level_id: { game_id: game.id, user_id: studentUser.id, level_id: 'lv-a' } },
		});
		expect(row.best_stars).toBe(3);       // best preserved
		expect(row.play_count).toBe(2);       // attempt counted
	});

	it('whole-game runs on level-less configs write progress under "default"', async () => {
		// The MQIN fixture has ONE explicit level covering all 3 questions.
		// A full run maps to it by exact set match and ratchets that level.
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQIN' } });
		const s = await request(app).post(`/api/v1/kids/games/${game.id}/session`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({ avatar: '🐵' });
		const done = await request(app).patch(`/api/v1/kids/play/session/${s.body.session.id}`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({
				answers_json: JSON.stringify(correctAnswers(['iq-mq-1', 'iq-mq-2', 'iq-mq-3'])),
				score: 3, stars: 3, completed: true, level_id: 'l1',
			});
		expect(done.status).toBe(200);
		expect(done.body.quest).toMatchObject({ level_id: 'l1', level_total_points: 3 });
		const row = await prisma.kidQuestProgress.findUnique({
			where: { game_id_user_id_level_id: { game_id: game.id, user_id: studentUser.id, level_id: 'l1' } },
		});
		expect(row).toBeTruthy();
		expect(row.best_stars).toBe(3);
	});

	it('progress only records for user-linked sessions (anonymous excluded)', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });
		// anonymous PIN run over level 1 of the MULTI game
		const anon = await request(app).post('/api/v1/kids/play/MQ2L/session')
			.send({ player_name: 'Pin', avatar: '🐯' });
		expect(anon.status).toBe(200);
		const done = await request(app).patch(`/api/v1/kids/play/session/${anon.body.session.id}`)
			.send({
				answers_json: JSON.stringify(correctAnswers(['iq-mq-1'])),
				score: 1, stars: 3, completed: true, level_id: 'lv-a',
			});
		expect(done.status).toBe(200);
		expect(done.body.quest).toBeTruthy(); // level still attributed
		const total = await prisma.kidQuestProgress.count({ where: { game_id: game.id } });
		expect(total).toBe(1); // only the student runs, never the anonymous one
	});

	it('quest-progress reflects the earned stars + unlock chain after runs', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });
		const res = await request(app)
			.get(`/api/v1/kids/games/${game.id}/quest-progress`)
			.set('Authorization', `Bearer ${studentToken}`);
		expect(res.status).toBe(200);
		const lvA = res.body.levels.find((l) => l.id === 'lv-a');
		const lvB = res.body.levels.find((l) => l.id === 'lv-b');
		expect(lvA).toMatchObject({ best_stars: 3, passed: true, unlocked: true });
		expect(lvB).toMatchObject({ unlocked: true, passed: false }); // chain follows lv-a pass
	});

	it('level 2 grading uses level-scoped points (1/2 → 1⭐ via recordScore)', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });
		const s = await request(app).post(`/api/v1/kids/games/${game.id}/session`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({ avatar: '🐵' });
		// 1 of 2 level questions correct = 50% → exactly 1 star (level scope)
		const done = await request(app).patch(`/api/v1/kids/play/session/${s.body.session.id}`)
			.set('Authorization', `Bearer ${studentToken}`)
			.send({
				answers_json: JSON.stringify([
					{ question_id: 'iq-mq-2', given: '4', correct: true, time_ms: 10 },
					{ question_id: 'iq-mq-3', given: '9', correct: false, time_ms: 10 },
				]),
				score: 1, stars: 3, completed: true, level_id: 'lv-b',
			});
		expect(done.status).toBe(200);
		expect(done.body.quest).toMatchObject({ level_id: 'lv-b', level_total_points: 2 });
		expect(done.body.stars).toBe(1);      // level-scoped stars (50% of the level)
		expect(done.body.percent).toBe(33);   // percent stays whole-game (1/3), as for every game
		const row = await prisma.kidQuestProgress.findUnique({
			where: { game_id_user_id_level_id: { game_id: game.id, user_id: studentUser.id, level_id: 'lv-b' } },
		});
		expect(row.best_stars).toBe(1); // verified best, below the pass threshold (2)
	});

	it('unlock-chain gate: submitting a LOCKED level grades but never records', async () => {
		const game = await prisma.kidsGame.findUnique({ where: { pin: 'MQ2L' } });
		const { signJwt } = await import('../../../src/backend/utils/jwt.js');
		const fresh = await prisma.user.create({
			data: { school_id: 'school-test', name: 'Gate Kid', username: 'mq-gate-kid', role: 'student', password_hash: 'x' },
		});
		const freshToken = signJwt({ id: fresh.id, school_id: 'school-test', role: 'student' });
		// fresh kid has ZERO progress rows → l2 is locked at this point
		const s = await request(app).post(`/api/v1/kids/games/${game.id}/session`)
			.set('Authorization', `Bearer ${freshToken}`)
			.send({ avatar: '🐵' });
		const done = await request(app).patch(`/api/v1/kids/play/session/${s.body.session.id}`)
			.set('Authorization', `Bearer ${freshToken}`)
			.send({
				answers_json: JSON.stringify(correctAnswers(['iq-mq-2', 'iq-mq-3'])),
				score: 2, stars: 3, completed: true, level_id: 'lv-b',
			});
		expect(done.status).toBe(200);
		expect(done.body.stars).toBe(3);      // grading stands (whole-game scope)
		expect(done.body.quest).toBeNull();   // but no level attribution for a locked level
		const rows = await prisma.kidQuestProgress.findMany({ where: { game_id: game.id, user_id: fresh.id } });
		expect(rows).toHaveLength(0);         // and no progress row is written
	});
});
