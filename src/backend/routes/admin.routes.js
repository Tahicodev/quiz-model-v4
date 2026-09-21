/**
 * src/backend/routes/admin.routes.js
 *
 * Admin-only maintenance endpoints. Currently just the destructive
 * "reset data" flow used by the Settings → Data tab: it wipes the school's
 * content back to the first-setup state (seed defaults) while keeping the
 * admin accounts alive so the caller can log back in.
 *
 * The legacy bulk endpoint only UPSERTS rows (it can never delete), so a
 * dedicated route is required to actually clear tables.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';
import { getServerMetrics } from '../server-metrics.js';
import { getIO } from '../realtime/socket.server.js';
import { createRequire } from 'module';
import { networkInterfaces, hostname } from 'os';
import { statSync, existsSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const require2 = createRequire(import.meta.url);
const engine = require2('../../../game-server.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
// roof: src/backend/routes → project root
const PROJECT_ROOT = resolve(__dirname, '../../..');
const SCHEMA_PATH = join(PROJECT_ROOT, 'prisma', 'schema.prisma');

const CDN_PROBE_HOSTS = [
	{ id: 'cdnjs', host: 'https://cdnjs.cloudflare.com', vendored: true },
	{ id: 'google-fonts', host: 'https://fonts.googleapis.com' },
	{ id: 'jsdelivr', host: 'https://cdn.jsdelivr.net', vendored: true },
	{ id: 'sheetjs', host: 'https://cdn.sheetjs.com', vendored: true },
	{ id: 'socket.io', host: 'https://cdn.socket.io', vendored: true },
];

const router = Router();
router.use(requireAuth, enforceTenant);

const adminOnly = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);
const monitoringAccess = requireRole([
	ROLES.ADMIN,
	ROLES.SUPER_ADMIN,
	ROLES.TEACHER,
]);

// ── Setup diagnostics (Settings → Setup wizard) ─────────────────────────────
// Read-only: helps the admin prepare this PC to serve up to ~20 classroom
// devices over the Wi-Fi LAN. Nothing here changes configuration — it reports
// live facts (LAN addresses, listening host/port, NODE_ENV, which SQLite file
// Prisma is using, CDN reachability) so the wizard can guide the admin.

function maskDatabaseUrl(url) {
	try {
		if (String(url || '').startsWith('file:')) return url;
		const u = new URL(url);
		if (u.username) u.username = '****';
		if (u.password) u.password = '****';
		return u.toString();
	} catch (_) {
		return url;
	}
}

function fileInfo(p) {
	try {
		const s = statSync(p);
		return {
			path: p,
			exists: s.isFile(),
			size: s.size,
			mtime: s.mtime.toISOString(),
		};
	} catch (_) {
		return { path: p, exists: false, size: 0, mtime: null };
	}
}

function lanAddresses() {
	const out = [];
	const ifaces = networkInterfaces();
	// Virtual / Hyper-V / WSL / Docker adapters — not suitable for classroom access
	const VIRTUAL_RE = /veth|vEthernet|WSL|Hyper-V|Docker|Loopback|VPN|Tailscale|Hamachi|vmnet|VirtualBox|vSwitch/i;
	for (const [name, list] of Object.entries(ifaces || {})) {
		for (const i of list || []) {
			if (i.family !== 'IPv4' || i.internal) continue;
			if (/^(127\.|169\.254\.)/.test(i.address)) continue;
			const isVirtual = VIRTUAL_RE.test(name);
			const isPrivate = /^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./.test(i.address);
			out.push({
				interface: name,
				address: i.address,
				netmask: i.netmask || '',
				prefixLength: i.prefixLength != null ? i.prefixLength : 24,
				recommended: !isVirtual && isPrivate,
				type: isVirtual ? 'virtual' : 'physical',
			});
		}
	}
	// Sort: recommended first
	out.sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0));
	return out;
}

function resolveDatabaseFiles() {
	const root = PROJECT_ROOT;
	const schemaDir = join(root, 'prisma');
	const filePathPart = (
		String(config.databaseUrl || '').match(/^file:(.+)$/i) || []
	)[1];
	const details = {
		url: maskDatabaseUrl(config.databaseUrl),
		schemaExists: existsSync(SCHEMA_PATH),
		candidates: [],
		// The two files that matter in practice: prisma/dev.db (real data) and
		// a root ./dev.db (only present if the app was ever run with the URL
		// "file:./dev.db" interpreted relative to the working directory).
		expected: fileInfo(join(root, 'prisma', 'dev.db')),
		rootDevDb: fileInfo(join(root, 'dev.db')),
	};
	if (filePathPart) {
		const clean = filePathPart.split('?')[0].split('#')[0].trim();
		const seen = new Set();
		for (const base of [schemaDir, root]) {
			const abs = resolve(base, clean);
			const key = abs.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			details.candidates.push(fileInfo(abs));
		}
		// Prisma resolves sqlite relative paths against schema.prisma's folder
		// — this is the file the running server actually reads/writes.
		details.inferred = resolve(schemaDir, clean);
		details.inferredInfo = fileInfo(details.inferred);
	}
	return details;
}

async function probeCdn() {
	const results = [];
	await Promise.allSettled(
		CDN_PROBE_HOSTS.map(async ({ id, host, vendored }) => {
			if (vendored) {
				results.push({ id, host, ok: true, status: 200, ms: 0, vendored: true });
				return;
			}
			const started = Date.now();
			const ctrl = new AbortController();
			const timer = setTimeout(() => ctrl.abort(), 4000);
			try {
				const res = await fetch(host + '/', {
					signal: ctrl.signal,
					redirect: 'follow',
					headers: { 'User-Agent': 'quiz-app-diagnostics' },
				});
				results.push({ id, host, ok: true, status: res.status, ms: Date.now() - started });
			} catch (e) {
				results.push({
					id,
					host,
					ok: false,
					status: null,
					ms: Date.now() - started,
					error: String((e && e.message) || e).slice(0, 160),
				});
			} finally {
				clearTimeout(timer);
			}
		}),
	);
	return results.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

const execAsync = promisify(exec);

/**
 * Returns the Windows network profile category for connected adapters.
 * Only works on Windows; returns null on other platforms.
 */
async function getNetworkProfile() {
	if (process.platform !== 'win32') return null;
	try {
		const { stdout } = await execAsync(
			'powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory, Name | ConvertTo-Json"',
			{ timeout: 8000 },
		);
		const parsed = JSON.parse(stdout);
		const profiles = Array.isArray(parsed) ? parsed : [parsed];
		const CATEGORY_MAP = { 0: 'Public', 1: 'Private', 2: 'DomainAuthenticated' };
		return profiles.map((p) => ({
			interface: p.InterfaceAlias || '',
			category: typeof p.NetworkCategory === 'number' ? (CATEGORY_MAP[p.NetworkCategory] || 'Unknown') : (p.NetworkCategory || 'Unknown'),
			name: p.Name || '',
		}));
	} catch (e) {
		logger.warn('getNetworkProfile failed', { error: String(e.message || e).slice(0, 200) });
		return null;
	}
}

/**
 * Changes the Windows network profile category for a given interface.
 * Requires admin privileges. Returns { ok, message }.
 */
async function setNetworkProfile(interfaceAlias, category) {
	if (process.platform !== 'win32') return { ok: false, message: 'Only supported on Windows' };
	const valid = ['Public', 'Private', 'DomainAuthenticated'];
	if (!valid.includes(category)) return { ok: false, message: 'Invalid category. Use: Public, Private, or DomainAuthenticated' };
	try {
		const cmd = `powershell -NoProfile -Command "Set-NetConnectionProfile -InterfaceAlias '${interfaceAlias.replace(/'/g, "''")}' -NetworkCategory '${category}'"`;
		await execAsync(cmd, { timeout: 8000 });
		return { ok: true, message: `Network profile for "${interfaceAlias}" changed to ${category}` };
	} catch (e) {
		const msg = String(e.message || e).slice(0, 300);
		if (msg.includes('admin') || msg.includes('elevated') || msg.includes('privilege')) {
			return { ok: false, message: 'Insufficient privileges. Run the server as Administrator, or use the PowerShell command below.' };
		}
		return { ok: false, message: msg };
	}
}

/**
 * Reports every fact the Settings → Setup wizard needs. Exported (not just
 * used by the route) so we can smoke-test the diagnostics outside Express.
 */
export async function buildSetupDiagnostics() {
	const [cdn, networkProfile] = await Promise.all([probeCdn(), getNetworkProfile()]);
	return {
		hostBinding: '0.0.0.0',
		port: config.port || 3000,
		nodeEnv: config.nodeEnv || 'development',
		cookieSecure: (config.nodeEnv || 'development') === 'production',
		process: {
			platform: process.platform,
			hostname: hostname(),
			uptimeSec: Math.round(process.uptime()),
			pid: process.pid,
			cwd: PROJECT_ROOT,
		},
		lan: lanAddresses(),
		database: resolveDatabaseFiles(),
		cdn,
		networkProfile,
		capacity: { maxUsers: 100, maxGamePlayers: 30 },
	};
}

/**
 * GET /api/v1/admin/setup/diagnostics
 * Admin-only, read-only classroom networking report for the Setup wizard.
 */
router.get('/setup/diagnostics', adminOnly, async (req, res, next) => {
	try {
		res.json({ data: await buildSetupDiagnostics() });
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/v1/admin/setup/network-profile
 * Changes the Windows network profile category for an interface.
 * Body: { interfaceAlias: string, category: 'Public' | 'Private' | 'DomainAuthenticated' }
 */
router.post('/setup/network-profile', adminOnly, async (req, res, next) => {
	try {
		const { interfaceAlias, category } = req.body || {};
		if (!interfaceAlias || !category) {
			return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'interfaceAlias and category are required' } });
		}
		const result = await setNetworkProfile(interfaceAlias, category);
		if (result.ok) {
			res.json({ data: result });
		} else {
			res.status(400).json({ error: { code: 'SETUP_ERROR', message: result.message } });
		}
	} catch (err) {
		next(err);
	}
});

/**
 * GET /api/v1/admin/metrics?minutes=60
 * Returns process-local request and log aggregates for the admin monitor.
 * The collector is intentionally in-memory: it is diagnostic, bounded, and
 * reset when the server restarts rather than becoming an audit datastore.
 */
router.get('/metrics', monitoringAccess, (req, res) => {
	res.json({ data: getServerMetrics(req.query.minutes) });
});

// Same defaults prisma/seed.js installs on a fresh database.
const SEED_SETTINGS = [
	{ key: 'app.name', value: 'Quiz App', visibility: 'public' },
	{ key: 'app.language', value: 'en', visibility: 'public' },
	{ key: 'app.logo_url', value: '', visibility: 'public' },
	{ key: 'exam.default_duration', value: '60', visibility: 'teacher' },
	{ key: 'exam.default_passing_score', value: '50', visibility: 'teacher' },
	{ key: 'game.max_players', value: '30', visibility: 'teacher' },
	{ key: 'auth.allow_student_register', value: 'false', visibility: 'admin' },
	{ key: 'auth.registration_code', value: '', visibility: 'admin' },
	// system.recovery_code_hash is wiped with the settings table above and NOT
	// re-seeded here — by design. A factory reset returns the school to a clean
	// first-setup state where the admin must (re)set the recovery code through
	// the Quick Start Security step. The School row itself is never touched:
	// the school's name/type/address/contacts/logo survive the reset so each
	// tenant keeps its identity across a data wipe.
];

const DEFAULT_GAME_PRESETS = [
	{ name: 'Lightning Race', game_type: 'race', game_mode: 'solo' },
	{ name: 'Sprint Race', game_type: 'sprint-race', game_mode: 'solo' },
	{ name: 'Card Battle', game_type: 'cards', game_mode: 'solo' },
	{ name: 'Card Draw Battle', game_type: 'cards-draw', game_mode: 'solo' },
	{ name: 'Hot Potato', game_type: 'hot-potato', game_mode: 'solo' },
	{ name: 'Last Survivor', game_type: 'last-survivor', game_mode: 'solo' },
];

/**
 * POST /api/v1/admin/reset-data
 * Body: { confirm: 'RESET' } — a typed confirmation so a stray click or a
 * buggy script can never trigger the wipe.
 *
 * Wipes every content table for THIS school (tenant-scoped — never touches
 * other schools), keeps admin/super_admin accounts, restores seed defaults
 * and clears the in-memory game engine state.
 */
router.post('/reset-data', adminOnly, async (req, res, next) => {
	try {
		if (String(req.body?.confirm || '') !== 'RESET') {
			throw new ForbiddenError('Type RESET to confirm the data reset.');
		}

		const { repo, auditSvc } = getContainer();
		const schoolId = req.schoolId;
		const deleted = {};

		// Junction tables have no school_id column — they're scoped through their
		// parent rows (both parents are wiped here), so they get a bare deleteMany.
		const NO_SCHOOL_SCOPE = new Set(['exam_questions', 'exam_classes']);

		const wipe = async (table, extraWhere = {}) => {
			const model = repo.modelFor ? repo.modelFor(table) : null;
			if (!model || typeof model.deleteMany !== 'function') {
				deleted[table] = 0;
				return;
			}
			const where = NO_SCHOOL_SCOPE.has(table)
				? { ...extraWhere }
				: { school_id: schoolId, ...extraWhere };
			const result = await model.deleteMany({ where });
			deleted[table] = typeof result?.count === 'number' ? result.count : 0;
		};

		// Child → parent FK order.
		await wipe('results');
		await wipe('game_sessions');
		await wipe('tournament_entries');
		await wipe('tournament_history');
		await wipe('tournaments');
		await wipe('games');
		await wipe('exam_sessions');
		await wipe('exam_questions');
		await wipe('exam_classes');
		await wipe('exams');
		await wipe('questions');
		await wipe('categories');
		await wipe('teacher_assignments');
		await wipe('teacher_messages');
		await wipe('notifications');
		await wipe('profile_requests');
		await wipe('account_requests');
		await wipe('audit_logs');
		// Refresh tokens of the accounts about to be wiped must die with them —
		// capture the ids BEFORE the user delete (after it they're unfindable).
		const userModel = repo.modelFor ? repo.modelFor('users') : null;
		const refreshTokenModel = repo.modelFor
			? repo.modelFor('refresh_tokens')
			: null;
		if (userModel && refreshTokenModel) {
			const removedUsers = await userModel.findMany({
				where: {
					school_id: schoolId,
					role: { in: [ROLES.STUDENT, ROLES.TEACHER] },
				},
				select: { id: true },
			});
			if (removedUsers.length) {
				await refreshTokenModel.deleteMany({
					where: { user_id: { in: removedUsers.map((u) => u.id) } },
				});
			}
		}
		// Keep admin/super_admin logins (teachers + students are wiped).
		await wipe('users', {
			role: { in: [ROLES.STUDENT, ROLES.TEACHER] },
		});
		await wipe('classes');
		await wipe('game_presets');
		// Personal AI configs of the wiped teachers/users are orphaned now — drop
		// them (shared admin-published models survive the reset).
		const aiModel = repo.modelFor ? repo.modelFor('ai_configs') : null;
		if (aiModel) {
			const remainingUsers = await userModel.findMany({
				where: { school_id: schoolId },
				select: { id: true },
			});
			const keepIds = new Set(remainingUsers.map((u) => u.id));
			const allCfgs = await aiModel.findMany({
				where: { school_id: schoolId },
				select: { id: true, owner_id: true },
			});
			const orphans = allCfgs.filter(
				(c) => c.owner_id && !keepIds.has(c.owner_id),
			);
			if (orphans.length) {
				await aiModel.deleteMany({
					where: { id: { in: orphans.map((c) => c.id) } },
				});
			}
			deleted.ai_configs = orphans.length;
		}

		// Settings: drop every key (including setup flags so the Quick Start
		// shows again), then restore the seed defaults.
		await wipe('settings');

		// Gamification: reset to the default row.
		const gamificationModel = repo.modelFor
			? repo.modelFor('gamification')
			: null;
		if (gamificationModel) {
			await gamificationModel.deleteMany({ where: { school_id: schoolId } });
			await gamificationModel
				.create({
					data: {
						school_id: schoolId,
						exp_per_correct: 10,
						exp_per_win: 100,
						auto_award_badges: true,
					},
				})
				.catch(() => {});
			deleted.gamification = 1;
		}

		const settingsModel = repo.modelFor ? repo.modelFor('settings') : null;
		if (settingsModel) {
			for (const s of SEED_SETTINGS) {
				await settingsModel.upsert({
					where: { school_id_key: { school_id: schoolId, key: s.key } },
					create: { school_id: schoolId, ...s },
					update: { value: s.value },
				});
			}
		}

		const presetModel = repo.modelFor ? repo.modelFor('game_presets') : null;
		if (presetModel) {
			for (const p of DEFAULT_GAME_PRESETS) {
				await presetModel.create({
					data: {
						school_id: schoolId,
						name: p.name,
						game_type: p.game_type,
						game_mode: p.game_mode,
						rules_json: JSON.stringify({}),
						is_default: true,
					},
				});
			}
		}

		// Kill every live lobby/game in the engine's memory.
		let clearedGames = 0;
		try {
			clearedGames = engine.resetActiveGames ? engine.resetActiveGames() : 0;
		} catch (e) {
			logger.warn('admin.routes: engine reset failed (continuing)', {
				error: e?.message,
			});
		}

		// Broadcast the wipe to every connected client of THIS school. Any other
		// open tab still holds its own in-memory cache of the deleted rows and
		// would re-push them on its next bulk sync (data resurrection). The
		// client handler drops all local mirrors + caches and re-bootstraps from
		// the now-empty server, so every tab converges on the reset state.
		try {
			const io = getIO();
			io.to(`school:${schoolId}`).emit('school:data-reset', {
				schoolId,
				resetAt: new Date().toISOString(),
				by: req.user.username,
			});
			logger.info('admin.routes: data-reset broadcast sent', { schoolId });
		} catch (e) {
			logger.warn('admin.routes: data-reset broadcast failed (continuing)', {
				error: e?.message,
			});
		}

		try {
			await auditSvc.log({
				schoolId,
				actorId: req.user.id,
				entityType: 'school',
				entityId: schoolId,
				action: 'reset_data',
				ip: req.ip,
			});
		} catch (_) {
			// audit table was just wiped — recreate entry is best-effort only
		}

		logger.info('admin.routes: school data reset', {
			schoolId,
			by: req.user.username,
			deleted,
			clearedGames,
		});

		res.json({
			success: true,
			message: 'All data was reset to the first-setup state.',
			deleted,
			clearedGames,
		});
	} catch (err) {
		next(err);
	}
});

export default router;
