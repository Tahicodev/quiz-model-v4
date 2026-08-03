/**
 * tests/integration/PrismaRepository.contract.test.js
 *
 * Runs the repository contract suite against the PrismaRepository on an
 * isolated throwaway SQLite test DB (prisma/test.db, gitignored).
 *
 * Why `settings`, not `questions`: the contract needs a table where we can
 * freely bulk-insert without FK seeding beyond the single `schools` root
 * parent, and where there's a unique natural key to exercise filtering.
 * `Setting` has `@@unique([school_id, key])` and only a `school` FK — so we
 * seed ONE school row before the suite and use unique `key`s per variant.
 *
 * Per-case isolation: `beforeEachCleanup` deletes all `settings` rows for the
 * test school between assertions, so cases sharing the same DB don't leak.
 *
 * Idempotency IS enabled here — PrismaRepository.createMany uses
 * `skipDuplicates: true`, so re-inserting the same PKs inserts zero rows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaRepository } from '../../src/backend/infrastructure/PrismaRepository.js';
import { runRepositoryContractTests } from './repository.contract.js';

const ROOT = process.cwd(); // vitest runs with cwd at the project root
const TEST_DB_PATH = path.join(ROOT, 'prisma', 'test.db');
const TEST_DB_URL = `file:${TEST_DB_PATH.replace(/\\/g, '/')}`;

let prisma;

beforeAll(async () => {
	// Point this process at the throwaway test DB. A dedicated PrismaClient is
	// constructed below with the test URL as its datasource, so we never touch
	// the dev DB regardless of what .env currently says.
	process.env.DATABASE_URL = TEST_DB_URL;

	// Prisma's SQLite migrate engine does not create a missing absolute-path
	// database file on this platform. Create the empty file first so the
	// migration runner can initialize it normally.
	writeFileSync(TEST_DB_PATH, '');

	// Apply existing migrations to the fresh test DB. migrate deploy is the
	// non-dev command (spec §25 Operations line 3069 mandates deploy not dev).
	// We invoke the LOCAL prisma directly via `node node_modules/prisma/build/
	// index.js` to avoid `npx` pulling a different prisma version from npm
	// (which would not see this project's schema). `--schema` is passed
	// explicitly so cwd ambiguity can't bite us.
	const schemaPath = path.join(ROOT, 'prisma', 'schema.prisma');
	const prismaBin = path.join(
		ROOT,
		'node_modules',
		'prisma',
		'build',
		'index.js',
	);
	execFileSync(
		process.execPath,
		[prismaBin, 'migrate', 'deploy', '--schema', schemaPath],
		{
			cwd: ROOT,
			env: { ...process.env, DATABASE_URL: TEST_DB_URL },
			stdio: 'pipe',
		},
	);

	prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

	// Seed the single root school the Setting FK requires.
	await prisma.school.upsert({
		where: { id: 'school-test' },
		update: { name: 'Test School', slug: 'test-school' },
		create: { id: 'school-test', name: 'Test School', slug: 'test-school' },
	});
});

afterAll(async () => {
	if (prisma) await prisma.$disconnect();
	// Remove the throwaway test DB and its journal so the next run starts clean.
	for (const p of [TEST_DB_PATH, `${TEST_DB_PATH}-journal`]) {
		try {
			rmSync(p);
		} catch {
			/* already gone */
		}
	}
});

describe('PrismaRepository game_sessions default ordering', () => {
	it('does not use an invalid created_at sort field for game sessions', async () => {
		const repo = new PrismaRepository(prisma);

		await prisma.user.upsert({
			where: { id: 'user-test' },
			update: {},
			create: {
				id: 'user-test',
				school_id: 'school-test',
				username: 'user-test',
				password_hash: 'hash',
				name: 'User Test',
			},
		});

		await prisma.game.upsert({
			where: { id: 'game-test' },
			update: {},
			create: {
				id: 'game-test',
				school_id: 'school-test',
				creator_id: 'user-test',
				name: 'Game Test',
				type: 'quiz',
				question_ids: '[]',
			},
		});

		await prisma.gameSession.upsert({
			where: { id: 'gs-test' },
			update: {},
			create: {
				id: 'gs-test',
				game_id: 'game-test',
				user_id: 'user-test',
				school_id: 'school-test',
				completed: false,
				connected: true,
				joined_at: new Date(),
			},
		});

		await expect(
			repo.getAll('game_sessions', {
				filters: { user_id: 'user-test', connected: true, completed: false },
				limit: 50,
				offset: 0,
			}),
		).resolves.toMatchObject({ total: 1 });
	});
});

runRepositoryContractTests({
	repoFactory: () => Promise.resolve(new PrismaRepository(prisma)),
	beforeEachCleanup: async (repo) => {
		// Clear this school's questions between cases; done directly on the prisma
		// client (the repo doesn't expose a bulk-delete-by-filter).
		await prisma.question.deleteMany({ where: { school_id: 'school-test' } });
	},
	cleanup: async () => {}, // DB teardown handled in afterAll above
	label: 'PrismaRepository',
	table: 'questions',
	sample: {
		school_id: 'school-test',
		text: 'Test question?',
		type: 'mcq',
		answer: 'A',
	},
	// Unique `text` per variant → exercises filtering + pagination without
	// collisions. `type` is kept constant so the filter-by-field case is stable.
	mutator: (i) => ({
		school_id: 'school-test',
		text: `Q${i}`,
		type: 'mcq',
		answer: 'A',
	}),
	supportsIdempotentCreateMany: true,
});
