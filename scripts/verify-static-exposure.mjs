/**
 * scripts/verify-static-exposure.mjs
 *
 * HTTP-level proof that the static allow-list actually holds.
 *
 * The unit test pins the RULES; this script probes a RUNNING server and
 * checks that the sensitive paths really are unreachable while the public
 * assets really are served. It is the check to run after touching
 * `src/backend/staticAssets.js` or the static mounts in `server.js`.
 *
 *   node scripts/verify-static-exposure.mjs [baseUrl]
 *   node scripts/verify-static-exposure.mjs http://192.168.1.20:3000
 *
 * Exit code 0 = everything behaved as expected.
 */

const BASE = (process.argv[2] || process.env.VERIFY_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Paths that must NOT be readable. */
const MUST_BLOCK = [
	'/prisma/dev.db',
	'/prisma/dev.db-journal',
	'/prisma/schema.prisma',
	'/prisma/migrations/20260701144253_init_v4_multitenant/migration.sql',
	'/.env',
	'/.env.example',
	'/package.json',
	'/package-lock.json',
	'/src/backend/config.js',
	'/src/backend/server.js',
	'/scripts/create-platform-admin.mjs',
	'/tests/unit/permissions.test.js',
	'/docs/ADMIN_CONSOLE_AUDIT.md',
	'/node_modules/express/package.json',
	'/vendor/offline/manifest.json',
	'/vendor/mkcert/mkcert-win64.exe',
	'/Dockerfile',
	'/docker-compose.yml',
	'/setup.bat',
	'/install.sh',
	'/certs/server.key',
	'/prisma/migrations',
];

/** Paths that MUST be served — the application would be broken otherwise. */
const MUST_SERVE = [
	'/',
	'/admin.html',
	'/console',
	'/student-workspace.html',
	'/console-bundle.js',
	'/console-bundle.css',
	'/styles.css',
	'/admin.css',
	'/theme.css',
	'/auth.js',
	'/utils.js',
	'/api-client.js',
	'/legacy-bridge.js',
	'/overview-dashboard.js',
	'/teacher-analytics.js',
	'/teacher-overview.js',
	'/results-management.js',
	'/questions-management.js',
	'/exam-management.js',
	'/student-workspace.js',
	'/student-courses.js',
	'/landing.js',
	'/vendor/socket.io.min.js',
	'/vendor/pdf.min.js',
	'/vendor/xlsx.full.min.js',
	'/vendor/mammoth.browser.min.js',
	'/student-bundle.js',
	'/kids/index.html',
	'/kids/play.html',
	'/kids/games/math-quest-core.js',
	'/health',
];

async function probe(path) {
	try {
		const res = await fetch(`${BASE}${path}`, {
			redirect: 'manual',
			headers: { 'User-Agent': 'quiz-static-verify/1.0' },
		});
		// Drain the body so the socket can be reused.
		const body = await res.text();
		return { status: res.status, bytes: body.length };
	} catch (err) {
		return { status: 0, bytes: 0, error: err.message };
	}
}

async function main() {
	console.log(`Verifying static exposure against ${BASE}\n`);

	let failures = 0;

	console.log('── must NOT be served ──');
	for (const path of MUST_BLOCK) {
		const r = await probe(path);
		const blocked = r.status === 404 || r.status === 403 || r.status === 0;
		if (!blocked) failures += 1;
		console.log(
			`  ${blocked ? 'BLOCKED' : 'LEAK   '} ${String(r.status).padEnd(4)} ${path}${
				blocked ? '' : `  (${r.bytes} bytes served!)`
			}`,
		);
	}

	console.log('\n── must be served ──');
	for (const path of MUST_SERVE) {
		const r = await probe(path);
		const served = r.status >= 200 && r.status < 400;
		if (!served) failures += 1;
		console.log(
			`  ${served ? 'OK     ' : 'MISSING'} ${String(r.status).padEnd(4)} ${path}`,
		);
	}

	console.log(
		failures === 0
			? '\n✓ Static exposure verified: nothing sensitive is served, every public asset is.'
			: `\n✗ ${failures} problem(s) found.`,
	);
	process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
