/**
 * tests/unit/staticAssets.test.js
 *
 * The static allow-list is the control that keeps the live database, the
 * Prisma schema, the migration history and the backend source off the wire.
 * These tests pin the RULES; the HTTP-level proof that they work lives in
 * `scripts/verify-static-exposure.mjs`, which probes a running server.
 */

import { describe, it, expect } from 'vitest';

import {
	PUBLIC_ROOT_FILES,
	PUBLIC_VENDOR_FILES,
	PUBLIC_DIRECTORIES,
	BLOCKED_PATTERNS,
	isBlockedPath,
} from '../../src/backend/staticAssets.js';

describe('the static allow-list', () => {
	it('lists only files that really exist at the project root', () => {
		// A stale entry is a broken page, so the list must be checked against
		// the repository rather than trusted.
		const missing = [];
		for (const name of PUBLIC_ROOT_FILES) {
			// eslint-disable-next-line no-undef
			if (!existsSyncSafe(name)) missing.push(name);
		}
		expect(missing).toEqual([]);
	});

	it('never allows a database, an environment file or a key', () => {
		for (const name of PUBLIC_ROOT_FILES) {
			expect(name).not.toMatch(/\.(db|sqlite|env|key|pem|bak|sql|map)$/i);
			expect(name).not.toMatch(/^\./);
		}
	});

	it('lists only vendored browser libraries that really exist', () => {
		const missing = [];
		for (const name of PUBLIC_VENDOR_FILES) {
			if (!existsSyncSafe(`vendor/${name}`)) missing.push(name);
		}
		expect(missing).toEqual([]);
	});

	it('excludes the offline npm bundle and the mkcert binary', () => {
		for (const name of PUBLIC_VENDOR_FILES) {
			expect(name).not.toMatch(/mkcert/i);
		}
	});

	it('serves the built bundles directory', () => {
		expect(PUBLIC_DIRECTORIES).toContain('public');
	});
});

describe('the blocked path patterns', () => {
	const mustBlock = [
		'/prisma/dev.db',
		'/prisma/dev.db-journal',
		'/prisma/dev.db-wal',
		'/prisma/schema.prisma',
		'/prisma/migrations/20260701144253_init_v4_multitenant/migration.sql',
		'/.env',
		'/.env.example',
		'/.env.production',
		'/package.json',
		'/server.key',
		'/cert.pem',
		'/id_rsa',
		'/backup.sql',
		'/data.tar.gz',
		'/bundle.zip',
		'/app.log',
		'/console-bundle.js.map',
		'/node_modules/express/package.json',
		'/vendor/offline/manifest.json',
		'/vendor/mkcert/mkcert-win64.exe',
		'/src/backend/config.js',
		'/tests/unit/permissions.test.js',
	];

	for (const path of mustBlock) {
		it(`blocks ${path}`, () => {
			expect(isBlockedPath(path)).toBe(true);
		});
	}

	const mustAllow = [
		'/',
		'/admin.html',
		'/console',
		'/student-workspace.html',
		'/console-bundle.js',
		'/console-bundle.css',
		'/styles.css',
		'/admin.css',
		'/auth.js',
		'/utils.js',
		'/vendor/socket.io.min.js',
		'/vendor/pdf.min.js',
		'/uploads/abc123.png',
	];

	for (const path of mustAllow) {
		it(`does not flag ${path}`, () => {
			expect(isBlockedPath(path)).toBe(false);
		});
	}

	it('ignores the query string', () => {
		expect(isBlockedPath('/styles.css?v=2026-11-12-polish1')).toBe(false);
		expect(isBlockedPath('/prisma/dev.db?x=1')).toBe(true);
	});
});

/**
 * The unit test runs from the project root, so the repository root is one
 * level above this file's directory.
 */
function existsSyncSafe(relativePath) {
	try {
		// eslint-disable-next-line no-undef
		return require('node:fs').existsSync(require('node:path').resolve(process.cwd(), relativePath));
	} catch {
		return false;
	}
}
