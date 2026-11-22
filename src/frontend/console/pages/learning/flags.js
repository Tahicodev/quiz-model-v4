/**
 * src/frontend/console/pages/learning/flags.js
 *
 * The Phase 1 learning flags, read once per session and shared by every
 * learning page.
 *
 * WHY THIS MODULE
 * ───────────────
 * The flags live in the `settings` table with admin visibility, so a teacher
 * cannot read them through `/settings/*`. `GET /learning/flags` exposes the
 * two booleans to anyone who may read the taxonomy — the client then knows
 * whether to draw the learning surfaces at all, and whether an objective it
 * creates is published or proposed. The flags are NOT the authority: the API
 * enforces `learning.adaptive.enabled` on every learning route except
 * `/learning/flags` (403 FEATURE_DISABLED), and the permission middleware
 * still guards each route. The client copy exists so the console can draw the
 * disabled state without provoking a stream of 403s; it is never trusted in
 * place of the server check.
 */

import { api } from '../../core/api.js';

/** The setting key the master switch is stored under. */
export const ADAPTIVE_SETTING_KEY = 'learning.adaptive.enabled';

/** Every permission that may read the taxonomy (mirrors the API guard). */
export const LEARNING_READ_PERMISSIONS = [
	'school.learning.read',
	'class.learning.read',
	'school.learning.manage',
	'class.learning.classify',
];

/** Every permission that may classify / propose (mirrors the API guard). */
export const LEARNING_WRITE_PERMISSIONS = [
	'school.learning.manage',
	'class.learning.classify',
];

/** Only administrators manage the taxonomy itself. */
export const LEARNING_MANAGE_PERMISSIONS = ['school.learning.manage'];

const state = {
	loaded: false,
	/** Master switch — when false the learning UI is not drawn at all. */
	adaptive_enabled: false,
	/** Whether a teacher-created objective is published or proposed (D2). */
	teacher_objective_creation: false,
};

/** Read the flags from the server (memoized; pass `force` to re-read). */
export async function loadFlags({ force = false } = {}) {
	if (state.loaded && !force) return { ...state };
	try {
		const payload = await api.get('learning/flags');
		state.adaptive_enabled = payload?.adaptive_enabled === true;
		state.teacher_objective_creation = payload?.teacher_objective_creation === true;
		state.loaded = true;
	} catch (_error) {
		// A caller who cannot read the flags (or a transient failure) must not
		// see a half-drawn learning surface: both flags stay OFF.
		state.adaptive_enabled = false;
		state.teacher_objective_creation = false;
		state.loaded = true;
	}
	return { ...state };
}

/** The cached flags (no request). */
export function getFlags() {
	return { ...state };
}

/** Whether the Phase 1 surfaces are enabled for this organization. */
export function isAdaptiveEnabled() {
	return state.adaptive_enabled === true;
}

/** Whether teachers publish objectives directly instead of proposing them. */
export function teacherCreationEnabled() {
	return state.teacher_objective_creation === true;
}

/** Forget the cached flags (used when re-reading after a toggle). */
export function resetFlags() {
	state.loaded = false;
}

/**
 * Write the master switch. This is the admin-only `PATCH /settings/:key` path —
 * the same one the Settings page uses — and it is the ONLY learning write that
 * does not go through `/learning/*`.
 */
export async function setAdaptiveEnabled(enabled) {
	const value = enabled ? 'true' : 'false';
	await api.patch(`settings/${encodeURIComponent(ADAPTIVE_SETTING_KEY)}`, {
		key: ADAPTIVE_SETTING_KEY,
		value,
	});
	state.loaded = true;
	state.adaptive_enabled = enabled === true;
	return enabled === true;
}
