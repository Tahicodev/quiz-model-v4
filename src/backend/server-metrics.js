const MAX_REQUESTS = 10000;
const MAX_LOGS = 10000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_STR = 500;
const MAX_USERS_PER_GROUP = 5;

const requests = [];
const logs = [];

function pushBounded(collection, value, limit) {
	collection.push(value);
	if (collection.length > limit)
		collection.splice(0, collection.length - limit);
}

function trunc(value, limit = MAX_STR) {
	const s = String(value ?? '');
	return s.length > limit ? s.slice(0, limit) : s;
}

/**
 * Normalizes any user-ish input into a short display label.
 * Accepts: { id, username, role } objects, plain usernames, ids.
 * Returns '' for anonymous / unauthenticated traffic.
 */
function normalizeUser(input) {
	if (!input) return '';
	if (typeof input === 'string') {
		const s = input.trim();
		if (!s || s === 'anonymous' || s === 'unknown') return '';
		return trunc(s, 80);
	}
	if (typeof input === 'object') {
		const username =
			input.username || input.name || input.by || input.actor || input.user;
		if (username && typeof username === 'string' && username.trim())
			return trunc(username.trim(), 80);
		const id = input.userId ?? input.actorId ?? input.id ?? input.user_id;
		if (id !== undefined && id !== null && String(id).trim() !== '')
			return trunc(`id:${String(id).trim()}`, 80);
	}
	return '';
}

function normalizeRole(input) {
	if (!input) return '';
	if (typeof input === 'string') return trunc(input.trim(), 40);
	if (typeof input === 'object' && typeof input.role === 'string')
		return trunc(input.role.trim(), 40);
	return '';
}

export function recordRequest({
	method,
	path,
	status,
	ms,
	user,
	role,
	userId,
	ip,
}) {
	// `user` may be a username string or a req.user-like object.
	let label = normalizeUser(user);
	let roleLabel = normalizeRole(role || user);
	let idLabel = '';
	if (user && typeof user === 'object') {
		const rawId = user.id ?? userId;
		if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '')
			idLabel = String(rawId).trim();
	} else if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
		idLabel = String(userId).trim();
		if (!label) label = `id:${idLabel}`;
	}
	pushBounded(
		requests,
		{
			at: Date.now(),
			method: String(method || 'GET').toUpperCase(),
			path: String(path || '/').split('?')[0],
			status: Number(status) || 0,
			ms: Math.max(0, Number(ms) || 0),
			user: label || 'anonymous',
			role: roleLabel || '',
			userId: idLabel || '',
			ip: trunc(ip || '', 60),
		},
		MAX_REQUESTS,
	);
}

function messageFromArgs(args) {
	const strings = args.filter((arg) => typeof arg === 'string' && arg.trim());
	if (strings.length) return trunc(strings[strings.length - 1].trim());
	const error = args.find(
		(arg) => arg && typeof arg === 'object' && arg.err?.message,
	);
	if (error) return trunc(String(error.err.message));
	// Structured-only log: surface a meaningful hint (event name, method+path…)
	const obj = args.find((arg) => arg && typeof arg === 'object');
	if (obj) {
		if (obj.event) return trunc(`[${obj.event}] ${obj.message || ''}`.trim());
		if (obj.method && obj.path)
			return trunc(`${obj.method} ${obj.path} → ${obj.status ?? ''}`.trim());
		if (obj.message && typeof obj.message === 'string')
			return trunc(obj.message.trim());
	}
	return 'Structured log event';
}

/**
 * Best-effort caller inference: walks the stack and returns the first frame
 * outside our own plumbing (server-metrics / logger / pino internals).
 * Result looks like `auth.routes.js:98` or `server.js:107`.
 */
function inferSource() {
	try {
		const stack = new Error().stack || '';
		const lines = stack.split('\n').slice(1);
		for (const line of lines) {
			if (
				/server-metrics\.js|[\/\\]logger\.js|[\/\\]pino[\/\\]|node:internal|node_modules[\/\\]pino/.test(
					line,
				)
			)
				continue;
			const m =
				line.match(/\((.*?):(\d+):\d+\)/) || line.match(/at (.*?):(\d+):\d+/);
			if (!m) continue;
			const file = String(m[1]).split(/[\/\\]/).pop();
			if (!file || file === 'node.js') continue;
			return trunc(`${file}:${m[2]}`, 120);
		}
	} catch (_) {
		// never let diagnostics break the real log path
	}
	return '';
}

/** Pulls a human label for "who triggered this" out of structured log args. */
function userFromArgs(args) {
	for (const arg of args) {
		if (!arg || typeof arg !== 'object') continue;
		const candidates = [
			arg.username,
			arg.by,
			arg.actor,
			arg.user,
			arg.userId,
			arg.actorId,
			arg.user_id,
		];
		for (const c of candidates) {
			if (typeof c === 'string' && c.trim()) return trunc(c.trim(), 80);
			if (typeof c === 'number') return trunc(`id:${c}`, 80);
		}
		// nested req.user-shaped object: { user: { username / id } }
		if (arg.user && typeof arg.user === 'object') {
			const nested = normalizeUser(arg.user);
			if (nested) return nested;
		}
	}
	return '';
}

function roleFromArgs(args) {
	for (const arg of args) {
		if (!arg || typeof arg !== 'object') continue;
		if (typeof arg.role === 'string' && arg.role.trim())
			return trunc(arg.role.trim(), 40);
		if (arg.user && typeof arg.user === 'object' && typeof arg.user.role === 'string')
			return trunc(arg.user.role.trim(), 40);
	}
	return '';
}

/** Keeps a compact, safe copy of structured context for the details column. */
function detailsFromArgs(args) {
	const merged = {};
	for (const arg of args) {
		if (!arg || typeof arg !== 'object') continue;
		for (const [k, v] of Object.entries(arg)) {
			if (k === 'stack') continue; // stacks are huge — source column points at the file already
			if (merged[k] !== undefined) continue;
			if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
				merged[k] = trunc(String(v), 160);
			} else if (v && typeof v === 'object' && v.message) {
				merged[k] = trunc(String(v.message), 160);
			}
			if (Object.keys(merged).length >= 8) break;
		}
		if (Object.keys(merged).length >= 8) break;
	}
	return merged;
}

export function recordLog(level, args = [], context = {}) {
	const list = Array.isArray(args) ? args : [args];
	const explicitUser =
		normalizeUser(context.user || context.username) ||
		(context.userId ? `id:${trunc(String(context.userId), 40)}` : '');
	pushBounded(
		logs,
		{
			at: Date.now(),
			level: String(level || 'info').toLowerCase(),
			message: messageFromArgs(list),
			source: trunc(context.source || inferSource() || 'unknown', 120),
			user: explicitUser || userFromArgs(list) || 'system',
			role: normalizeRole(context.role) || roleFromArgs(list) || '',
			ip: trunc(context.ip || '', 60),
			details: detailsFromArgs(list),
		},
		MAX_LOGS,
	);
}

function withinWindow(event, since) {
	return event.at >= since;
}

function topUsers(counts, limit = MAX_USERS_PER_GROUP) {
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([user, count]) => ({ user, count }));
}

function matchesUser(event, needle) {
	if (!needle) return true;
	const q = String(needle).trim().toLowerCase();
	if (!q) return true;
	return [event.user, event.userId, event.role, event.ip]
		.filter(Boolean)
		.some((v) => String(v).toLowerCase().includes(q));
}

export function getServerMetrics(minutes = 60, options = {}) {
	// Back-compat: getServerMetrics({ minutes, user }) object form.
	let userFilter = '';
	if (minutes && typeof minutes === 'object') {
		options = minutes;
		minutes = options.minutes;
	}
	userFilter = String(options?.user ?? '').trim().slice(0, 80);
	const requestedMinutes = Number(minutes);
	const safeMinutes = Number.isFinite(requestedMinutes)
		? Math.min(24 * 60, Math.max(1, requestedMinutes))
		: 60;
	const now = Date.now();
	const since = now - Math.min(safeMinutes * 60 * 1000, MAX_WINDOW_MS);
	const inWindowRequests = requests.filter((event) => withinWindow(event, since));
	const inWindowLogs = logs.filter((event) => withinWindow(event, since));
	// Distinct users in the (unfiltered) window — feeds the User filter datalist.
	const userCountsAll = new Map();
	for (const event of inWindowRequests)
		userCountsAll.set(
			event.user || 'anonymous',
			(userCountsAll.get(event.user || 'anonymous') || 0) + 1,
		);
	for (const event of inWindowLogs)
		userCountsAll.set(
			event.user || 'system',
			(userCountsAll.get(event.user || 'system') || 0) + 1,
		);
	const windowRequests = userFilter
		? inWindowRequests.filter((event) => matchesUser(event, userFilter))
		: inWindowRequests;
	const windowLogs = userFilter
		? inWindowLogs.filter((event) => matchesUser(event, userFilter))
		: inWindowLogs;

	const apiGroups = new Map();
	for (const event of windowRequests) {
		const key = `${event.method} ${event.path}`;
		let group = apiGroups.get(key);
		if (!group) {
			group = {
				method: event.method,
				path: event.path,
				calls: 0,
				errors: 0,
				totalMs: 0,
				userCounts: new Map(),
				lastUser: '',
				lastRole: '',
				lastIp: '',
				lastAt: 0,
			};
			apiGroups.set(key, group);
		}
		group.calls += 1;
		group.errors += event.status >= 400 ? 1 : 0;
		group.totalMs += event.ms;
		const u = event.user || 'anonymous';
		group.userCounts.set(u, (group.userCounts.get(u) || 0) + 1);
		if (event.at >= group.lastAt) {
			group.lastAt = event.at;
			group.lastUser = u;
			group.lastRole = event.role || '';
			group.lastIp = event.ip || '';
		}
	}

	const logGroups = new Map();
	for (const event of windowLogs) {
		const key = `${event.level}\u0000${event.message}\u0000${event.source}`;
		let group = logGroups.get(key);
		if (!group) {
			group = {
				level: event.level,
				message: event.message,
				source: event.source,
				count: 0,
				firstAt: event.at,
				lastAt: event.at,
				userCounts: new Map(),
				sourceCounts: new Map(),
				lastUser: '',
			};
			logGroups.set(key, group);
		}
		group.count += 1;
		group.firstAt = Math.min(group.firstAt, event.at);
		group.lastAt = Math.max(group.lastAt, event.at);
		const u = event.user || 'system';
		group.userCounts.set(u, (group.userCounts.get(u) || 0) + 1);
		group.sourceCounts.set(
			event.source,
			(group.sourceCounts.get(event.source) || 0) + 1,
		);
		if (event.at >= group.lastAt) group.lastUser = u;
	}

	const totalMs = windowRequests.reduce((sum, event) => sum + event.ms, 0);
	const warnings = windowLogs.filter((event) => event.level === 'warn').length;
	const errors = windowLogs.filter(
		(event) => event.level === 'error' || event.level === 'fatal',
	).length;

	return {
		generatedAt: new Date(now).toISOString(),
		window: {
			minutes: safeMinutes,
			since: new Date(since).toISOString(),
			until: new Date(now).toISOString(),
		},
		filter: { user: userFilter },
		users: topUsers(userCountsAll, 100),
		summary: {
			apiCalls: windowRequests.length,
			apiErrors: windowRequests.filter((event) => event.status >= 400).length,
			warnings,
			errors,
			averageResponseMs: windowRequests.length
				? Math.round(totalMs / windowRequests.length)
				: 0,
		},
		apiCalls: [...apiGroups.values()]
			.map((group) => ({
				method: group.method,
				path: group.path,
				calls: group.calls,
				errors: group.errors,
				averageMs: group.calls ? Math.round(group.totalMs / group.calls) : 0,
				users: topUsers(group.userCounts),
				userCount: group.userCounts.size,
				lastUser: group.lastUser,
				lastRole: group.lastRole,
				lastIp: group.lastIp,
			}))
			.sort((a, b) => b.calls - a.calls)
			.slice(0, 50),
		repeatedLogs: [...logGroups.values()]
			.map((group) => ({
				level: group.level,
				message: group.message,
				source: group.source,
				count: group.count,
				firstAt: group.firstAt,
				lastAt: group.lastAt,
				users: topUsers(group.userCounts),
				userCount: group.userCounts.size,
				lastUser: group.lastUser,
			}))
			.sort((a, b) => b.count - a.count)
			.slice(0, 50),
		recentLogs: windowLogs.slice(-100).reverse(),
	};
}

// Test / diagnostics helper (not exposed over HTTP).
export function __resetServerMetrics() {
	requests.length = 0;
	logs.length = 0;
}
