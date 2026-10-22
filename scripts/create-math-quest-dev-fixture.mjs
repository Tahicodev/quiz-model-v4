/**
 * create-math-quest-dev-fixture.mjs — DEV-ONLY fixture (stage 2 testing).
 *
 * Creates a clearly-labelled Math Quest kids game (3 explicit MCQ questions
 * with stable ids, a 2-level plan in `config_json.levels` so the unlock
 * chain, per-level grading and KidQuestProgress ratchet can be verified)
 * plus one dev teacher + one dev student account, and publishes it with a
 * fixed PIN so anonymous-PIN and logged-in play can be checked end to end.
 *
 * Idempotent: re-running refreshes the plan in place (config/questions are
 * replaced; progress rows for the stable level ids are kept).
 *
 * ⚠ Writes to the DEV database only (prisma/dev.db). Never resets, deletes
 * or migrates anything. Production content stays teacher-curated.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const MARK = '[MQ-DEV-FIXTURE]';
const PIN = 'MQXT';

const QUESTIONS = [
	{
		id: 'mq-dev-q1', type: 'mcq', text: 'DEV Q1 — What is 7 + 5?',
		options_json: JSON.stringify(['11', '12', '13', '14']), answer: '12',
		explanation: 'Add: 7 + 5 = 12', points: 1, difficulty: 'easy',
	},
	{
		id: 'mq-dev-q2', type: 'mcq', text: 'DEV Q2 — What is 12 − 4?',
		options_json: JSON.stringify(['6', '7', '8', '9']), answer: '8',
		explanation: 'Subtract: 12 − 4 = 8', points: 1, difficulty: 'easy',
	},
	{
		id: 'mq-dev-q3', type: 'mcq', text: 'DEV Q3 — Double the number 6 is…',
		options_json: JSON.stringify(['10', '12', '14', '16']), answer: '12',
		explanation: '2 × 6 = 12', points: 1, difficulty: 'easy',
	},
];

const QUEST_CONFIG = {
	time_per_q: 20,
	max_hints: 1,
	allow_replay: true,
	show_explanations: false,
	// Stage-2 plan: two levels with a real unlock threshold. Level 2 opens
	// only after level 1 earns its pass stars (1⭐); passing level 2 needs 2⭐.
	// Level ids are stable dev ids — KidQuestProgress rows key on them, so
	// re-running this fixture keeps any already-earned progress.
	levels: [
		{ id: 'l1', name: 'Jungle Trail', questions: ['mq-dev-q1'], pass_stars: 1, art: 'home' },
		{ id: 'l2', name: 'Temple Steps', questions: ['mq-dev-q2', 'mq-dev-q3'], pass_stars: 2, art: 'temple' },
	],
};

async function main() {
	// primaire school (kids space requirement) + dev accounts
	const school = await prisma.school.upsert({
		where: { slug: 'math-quest-dev' },
		update: { school_type: 'primaire' },
		create: { name: 'Math Quest Dev School', slug: 'math-quest-dev', school_type: 'primaire' },
	});
	const passwordHash = await bcrypt.hash('mathquest-dev', 10);
	const teacher = await prisma.user.upsert({
		where: { school_id_username: { school_id: school.id, username: 'mq-dev-teacher' } },
		update: { role: 'teacher' },
		create: { school_id: school.id, username: 'mq-dev-teacher', password_hash: passwordHash, name: 'MQ Dev Teacher', role: 'teacher' },
	});
	await prisma.user.upsert({
		where: { school_id_username: { school_id: school.id, username: 'mq-dev-student' } },
		update: { role: 'student' },
		create: { school_id: school.id, username: 'mq-dev-student', password_hash: passwordHash, name: 'MQ Dev Student', role: 'student' },
	});

	const existing = await prisma.kidsGame.findFirst({
		where: { name: MARK + ' Math Quest — Jungle Trail' },
	});
	if (existing) {
		// Refresh the dev plan in place (still idempotent-ish: same stable id,
		// same questions; keeps any KidQuestProgress rows already earned).
		await prisma.kidsGame.update({
			where: { id: existing.id },
			data: {
				questions_json: JSON.stringify(QUESTIONS),
				config_json: JSON.stringify(QUEST_CONFIG),
				status: 'published',
			},
		});
		console.log('Existing fixture game (plan refreshed): id=' + existing.id + ' pin=' + existing.pin + ' status=updated');
		console.log('Play URL: /kids/play/' + existing.pin);
		console.log('Dev teacher login: mq-dev-teacher / mathquest-dev');
		console.log('Dev student login: mq-dev-student / mathquest-dev');
		await prisma.$disconnect();
		return;
	}

	const game = await prisma.kidsGame.create({
		data: {
			school_id: school.id,
			teacher_id: teacher.id,
			name: MARK + ' Math Quest — Jungle Trail',
			description: 'DEV fixture for stage-1 verification (safe to delete).',
			game_type: 'math-quest',
			theme: 'jungle',
			grade: 'cp',
			subject: 'Maths',
			questions_json: JSON.stringify(QUESTIONS),
			config_json: JSON.stringify(QUEST_CONFIG),
			status: 'published',
			pin: PIN, // fixed dev PIN so manual tests are reproducible
		},
	});

	console.log('Created fixture game: id=' + game.id + ' pin=' + game.pin);
	console.log('Play URL: /kids/play/' + game.pin);
	console.log('Dev teacher login: mq-dev-teacher / mathquest-dev');
	console.log('Dev student login: mq-dev-student / mathquest-dev');
	await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
