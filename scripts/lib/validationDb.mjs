/**
 * scripts/lib/validationDb.mjs
 *
 * An ISOLATED database for the validation scripts.
 *
 * The validation scripts seed organizations, accounts, exams and results. If
 * they ran against the development database they would leave their fixtures
 * behind in the real data — which is exactly what happened once already.
 *
 * So they get their own SQLite file, migrated from scratch, and they delete
 * it when they are done. The development database is never touched.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();

/**
 * Prepare an isolated database and return a client bound to it.
 *
 * @param {string} name  a file name under prisma/, e.g. 'validation-offline.db'
 * @returns {Promise<{ prisma: PrismaClient, url: string, file: string, cleanup: () => void }>}
 */
export async function useIsolatedDatabase(name) {
	const file = path.join(ROOT, 'prisma', name);
	for (const suffix of ['', '-journal', '-wal', '-shm']) {
		try {
			fs.rmSync(`${file}${suffix}`, { force: true });
		} catch {
			/* nothing to remove */
		}
	}
	fs.writeFileSync(file, '');

	// Prisma resolves a relative SQLite URL against prisma/.
	const url = `file:./${name}`;

	execFileSync(
		process.execPath,
		[
			path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
			'migrate',
			'deploy',
			'--schema',
			path.join(ROOT, 'prisma', 'schema.prisma'),
		],
		{
			cwd: ROOT,
			env: { ...process.env, DATABASE_URL: url },
			stdio: 'pipe',
		},
	);

	const prisma = new PrismaClient({ datasources: { db: { url } } });

	return {
		prisma,
		url,
		file,
		cleanup() {
			try {
				prisma.$disconnect();
			} catch {
				/* already closed */
			}
			for (const suffix of ['', '-journal', '-wal', '-shm']) {
				try {
					fs.rmSync(`${file}${suffix}`, { force: true });
				} catch {
					/* already gone */
				}
			}
		},
	};
}
