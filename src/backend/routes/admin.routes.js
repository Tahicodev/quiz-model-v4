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

const require2 = createRequire(import.meta.url);
const engine = require2('../../../game-server.cjs');

const router = Router();
router.use(requireAuth, enforceTenant);

const adminOnly = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);

/**
 * GET /api/v1/admin/metrics?minutes=60
 * Returns process-local request and log aggregates for the admin monitor.
 * The collector is intentionally in-memory: it is diagnostic, bounded, and
 * reset when the server restarts rather than becoming an audit datastore.
 */
router.get('/metrics', adminOnly, (req, res) => {
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
