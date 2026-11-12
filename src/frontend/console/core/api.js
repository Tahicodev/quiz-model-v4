/**
 * src/frontend/console/core/api.js
 *
 * Console API client.
 *
 * Shares the session conventions of the legacy admin surface
 * (`quizSession` in sessionStorage/localStorage + the httpOnly refresh
 * cookie scoped to the "admin" portal), so an administrator signed in on
 * /admin.html is already signed in here — and vice versa.
 *
 * A 401 triggers ONE refresh (single-flight) and one retry. If the refresh
 * fails the session is cleared and the caller is sent back to sign-in.
 */

const STORAGE_SESSION = 'quizSession';
const STORAGE_TOKEN = 'quizAuthToken';

let accessToken = '';
let refreshing = null;
let onUnauthorized = null;

/** Register a callback invoked when the session cannot be recovered. */
export function setUnauthorizedHandler(handler) {
	onUnauthorized = handler;
}

function readStoredToken() {
	try {
		const raw =
			sessionStorage.getItem(STORAGE_SESSION) || localStorage.getItem(STORAGE_SESSION);
		const session = raw ? JSON.parse(raw) : null;
		if (session?.token) return session.token;
	} catch {
		/* malformed storage — fall through */
	}
	return localStorage.getItem(STORAGE_TOKEN) || '';
}

export function getToken() {
	if (accessToken) return accessToken;
	accessToken = readStoredToken();
	return accessToken;
}

export function setToken(token) {
	if (!token) return;
	accessToken = token;
	try {
		const raw = sessionStorage.getItem(STORAGE_SESSION) || localStorage.getItem(STORAGE_SESSION);
		const session = raw ? JSON.parse(raw) : null;
		if (session) {
			session.token = token;
			sessionStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
			const shared = localStorage.getItem(STORAGE_SESSION);
			const sharedSession = shared ? JSON.parse(shared) : null;
			if (
				sharedSession &&
				String(sharedSession.userId || '') === String(session.userId || '') &&
				String(sharedSession.role || '').toLowerCase() ===
					String(session.role || '').toLowerCase()
			) {
				localStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
			}
		}
		localStorage.setItem(STORAGE_TOKEN, token);
	} catch {
		/* storage is best-effort */
	}
}

export function clearToken() {
	accessToken = '';
	try {
		localStorage.removeItem(STORAGE_SESSION);
		localStorage.removeItem(STORAGE_TOKEN);
		sessionStorage.removeItem(STORAGE_SESSION);
	} catch {
		/* ignore */
	}
}

function apiBase() {
	return (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';
}

async function refreshAccessToken() {
	if (refreshing) return refreshing;
	refreshing = fetch(`${apiBase()}/auth/refresh`, {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ portal: 'admin' }),
	})
		.then(async (response) => {
			if (!response.ok) throw new Error(`Refresh failed (${response.status})`);
			const data = await response.json();
			if (!data?.accessToken) throw new Error('Refresh returned no token');
			setToken(data.accessToken);
			return data.accessToken;
		})
		.finally(() => {
			refreshing = null;
		});
	return refreshing;
}

/**
 * A console HTTP error carrying the server's structured payload.
 */
export class ApiError extends Error {
	constructor(message, status, code, fields) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.fields = fields || null;
	}
}

async function parseError(response) {
	let payload = null;
	try {
		payload = await response.json();
	} catch {
		/* non-JSON error body */
	}
	const error = payload?.error || {};
	return new ApiError(
		error.message || payload?.message || `Request failed (${response.status})`,
		response.status,
		error.code || payload?.code || null,
		error.fields || null,
	);
}

/**
 * Perform a request against the console API.
 * @param {string} path path relative to /api/v1 (e.g. 'console/session')
 * @param {{ method?:string, body?:any, query?:object, retry?:boolean }} [options]
 */
export async function request(path, options = {}) {
	const { method = 'GET', body = null, query = null, retry = true } = options;
	let url = `${apiBase()}/${String(path).replace(/^\//, '')}`;
	if (query && typeof query === 'object') {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === '') continue;
			params.set(key, String(value));
		}
		const qs = params.toString();
		if (qs) url += `?${qs}`;
	}

	const headers = { Accept: 'application/json' };
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	if (body !== null && body !== undefined) headers['Content-Type'] = 'application/json';

	const response = await fetch(url, {
		method,
		headers,
		credentials: 'include',
		body: body === null || body === undefined ? undefined : JSON.stringify(body),
	});

	if (response.status === 401 && retry) {
		try {
			await refreshAccessToken();
		} catch {
			clearToken();
			if (onUnauthorized) onUnauthorized();
			throw new ApiError('Your session has ended. Please sign in again.', 401, 'UNAUTHORIZED');
		}
		return request(path, { ...options, retry: false });
	}

	if (!response.ok) throw await parseError(response);
	if (response.status === 204) return null;
	return response.json();
}

export const api = {
	get: (path, query) => request(path, { method: 'GET', query }),
	post: (path, body) => request(path, { method: 'POST', body }),
	patch: (path, body) => request(path, { method: 'PATCH', body }),
	put: (path, body) => request(path, { method: 'PUT', body }),
	del: (path, body) => request(path, { method: 'DELETE', body }),
};
