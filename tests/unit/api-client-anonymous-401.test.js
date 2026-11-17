// @vitest-environment node
/**
 * api-client.js — a 401 on an ANONYMOUS call is "not signed in", never
 * "the signed-in session died".
 *
 * Before the fix, every unauthenticated page load (bootstrap probe, public
 * catalogue read, …) hit the 401 branch, which wiped the stored session and
 * redirected the login form away before a teacher could ever sign in.
 *
 * The client is a classic browser script (no exports), so it is evaluated in
 * a VM sandbox with a stubbed `fetch` and then driven through `window.API`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, beforeEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = readFileSync(path.join(ROOT, 'api-client.js'), 'utf8');

function makeResponse(status, body, headers) {
	return {
		status,
		ok: status >= 200 && status < 300,
		text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
		blob: () => Promise.resolve({ body }),
		headers: {
			get: (name) => (headers && headers[name.toLowerCase()]) || null,
		},
	};
}

/**
 * Build a minimal browser-ish sandbox, evaluate api-client.js inside it and
 * return `{ window, calls }` so each test can assert on the exact requests.
 */
function loadApiClient(fetchImpl) {
	const calls = [];
	const store = new Map();
	const localStorage = {
		getItem: (k) => (store.has(k) ? store.get(k) : null),
		setItem: (k, v) => store.set(k, String(v)),
		removeItem: (k) => store.delete(k),
		clear: () => store.clear(),
	};
	const sessionStorage = {
		getItem: (k) => (store.has('s:' + k) ? store.get('s:' + k) : null),
		setItem: (k, v) => store.set('s:' + k, String(v)),
		removeItem: (k) => store.delete('s:' + k),
		clear: () => {
			for (const key of [...store.keys()]) if (key.startsWith('s:')) store.delete(key);
		},
	};

	const sandbox = {
		console,
		setTimeout,
		clearTimeout,
		localStorage,
		sessionStorage,
		fetch: (url, init) => {
			calls.push({ url, init });
			return Promise.resolve(fetchImpl(url, init, calls.length - 1));
		},
		atob: (v) => Buffer.from(String(v), 'base64').toString('binary'),
		btoa: (v) => Buffer.from(String(v), 'binary').toString('base64'),
		unescape: (v) => String(v),
		encodeURIComponent,
		decodeURIComponent,
		CustomEvent: class CustomEvent {
			constructor(type, init) {
				this.type = type;
				this.detail = init && init.detail;
			}
		},
		FormData: class FormData {},
		Blob: class Blob {},
		URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
	};
	sandbox.window = sandbox;
	sandbox.globalThis = sandbox;
	sandbox.self = sandbox;

	const context = vm.createContext(sandbox);
	vm.runInContext(SOURCE, context, { filename: 'api-client.js' });

	return { window: sandbox, calls };
}

describe('api-client anonymous requests', () => {
	beforeEach(() => {
		// Nothing global to reset — each test builds a fresh sandbox.
	});

	it('rejects an anonymous 401 without treating it as an expired session', async () => {
		let invalidated = false;
		const { window, calls } = loadApiClient(() => makeResponse(401, { error: 'Unauthorized' }));
		window.__invalidateAuthSession = () => {
			invalidated = true;
		};

		await expect(window.API.list('exams')).rejects.toMatchObject({
			status: 401,
			isAuthFailure: false,
			isAnonymous: true,
		});

		// The whole point: an anonymous 401 must NOT run the session-expiry
		// path (which cleared the storage and bounced the user to "/").
		expect(invalidated).toBe(false);
		expect(window.__AUTH_SESSION_EXPIRED__).toBeFalsy();
		// No refresh attempt either — there was no session to refresh.
		expect(calls).toHaveLength(1);
		expect(calls[0].init.headers.Authorization).toBeUndefined();
	});

	it('does not attach an Authorization header when there is no token', async () => {
		const { window, calls } = loadApiClient(() => makeResponse(200, { ok: true }));

		await window.API.list('classes');

		expect(calls).toHaveLength(1);
		expect(calls[0].init.headers.Authorization).toBeUndefined();
		expect(calls[0].init.credentials).toBe('include');
	});

	it('attaches the bearer token when a session exists', async () => {
		const { window, calls } = loadApiClient(() => makeResponse(200, { ok: true }));
		window.__authToken = 'token-abc';

		await window.API.list('classes');

		expect(calls).toHaveLength(1);
		expect(calls[0].init.headers.Authorization).toBe('Bearer token-abc');
	});

	it('still refreshes a 401 for an authenticated call', async () => {
		const { window, calls } = loadApiClient((url, init, index) => {
			// First call: the stale token is rejected. Second call: retried
			// after the refresh succeeded.
			return index === 0
				? makeResponse(401, { error: 'Unauthorized' })
				: makeResponse(200, { ok: true });
		});
		window.__authToken = 'stale-token';

		let refreshed = false;
		window.__legacyBridgeRefresh = () => {
			refreshed = true;
			window.__authToken = 'fresh-token';
			return Promise.resolve('fresh-token');
		};

		await window.API.list('classes');

		expect(refreshed).toBe(true);
		expect(calls).toHaveLength(2);
		expect(calls[0].init.headers.Authorization).toBe('Bearer stale-token');
		expect(calls[1].init.headers.Authorization).toBe('Bearer fresh-token');
	});

	it('does not refresh on a public auth path', async () => {
		const { window, calls } = loadApiClient(() => makeResponse(401, { error: 'Unauthorized' }));
		window.__authToken = 'stale-token';

		let refreshed = false;
		window.__legacyBridgeRefresh = () => {
			refreshed = true;
			return Promise.resolve('fresh-token');
		};

		await expect(window.API.login('teacher', 'secret')).rejects.toMatchObject({
			status: 401,
		});

		expect(refreshed).toBe(false);
		expect(calls).toHaveLength(1);
	});
});
