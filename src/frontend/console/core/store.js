/**
 * src/frontend/console/core/store.js
 *
 * Console state: who the caller is, what scope they operate in, and which
 * permissions they hold.
 *
 * The store mirrors what the SERVER decided (`/console/session`). It never
 * derives permissions locally — the frontend only hides what the backend
 * already refuses to serve.
 */

import { api } from './api.js';

const state = {
	/** @type {{user:object, scope:object, permissions:string[]}|null} */
	session: null,
	/** @type {Set<string>} */
	permissions: new Set(),
	/** Selected organization when the platform scope is narrowed. */
	targetSchoolId: null,
	/** Active period key (7d | 30d | 90d | academicYear | custom). */
	period: '30d',
	/** Custom period bounds (ISO strings) when period === 'custom'. */
	customRange: null,
};

const listeners = new Set();

export function subscribe(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function emit() {
	for (const listener of listeners) {
		try {
			listener(state);
		} catch (err) {
			console.error('[console] store listener failed', err);
		}
	}
}

export function getState() {
	return state;
}

export function session() {
	return state.session;
}

export function currentUser() {
	return state.session?.user || null;
}

export function scope() {
	return state.session?.scope || null;
}

export function isPlatformScope() {
	return Boolean(state.session?.scope?.isPlatform);
}

export function organization() {
	return state.session?.scope?.organization || null;
}

/** Does the caller hold this permission? */
export function can(permission) {
	if (!permission) return true;
	return state.permissions.has(permission);
}

/** Can the caller reach ANY of the listed permissions? */
export function canAny(permissions = []) {
	const list = Array.isArray(permissions) ? permissions : [permissions];
	return list.length === 0 ? true : list.some((permission) => can(permission));
}

/** Set the platform scope's organization filter. */
export function setTargetSchool(schoolId) {
	state.targetSchoolId = schoolId || null;
	emit();
}

export function setPeriod(period, customRange = null) {
	state.period = period;
	state.customRange = customRange;
	emit();
}

/** Load (or reload) the session from the server. */
export async function loadSession() {
	const data = await api.get('console/session');
	state.session = data;
	state.permissions = new Set(Array.isArray(data.permissions) ? data.permissions : []);
	emit();
	return data;
}

export function reset() {
	state.session = null;
	state.permissions = new Set();
	state.targetSchoolId = null;
	emit();
}
