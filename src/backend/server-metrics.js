const MAX_REQUESTS = 10000;
const MAX_LOGS = 10000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

const requests = [];
const logs = [];

function pushBounded(collection, value, limit) {
	collection.push(value);
	if (collection.length > limit)
		collection.splice(0, collection.length - limit);
}

export function recordRequest({ method, path, status, ms }) {
	pushBounded(
		requests,
		{
			at: Date.now(),
			method: String(method || 'GET').toUpperCase(),
			path: String(path || '/').split('?')[0],
			status: Number(status) || 0,
			ms: Math.max(0, Number(ms) || 0),
		},
		MAX_REQUESTS,
	);
}

function messageFromArgs(args) {
	const strings = args.filter((arg) => typeof arg === 'string' && arg.trim());
	if (strings.length) return strings[strings.length - 1].trim();
	const error = args.find(
		(arg) => arg && typeof arg === 'object' && arg.err?.message,
	);
	if (error) return String(error.err.message);
	return 'Structured log event';
}

export function recordLog(level, args = []) {
	pushBounded(
		logs,
		{
			at: Date.now(),
			level: String(level || 'info').toLowerCase(),
			message: messageFromArgs(args),
		},
		MAX_LOGS,
	);
}

function withinWindow(event, since) {
	return event.at >= since;
}

export function getServerMetrics(minutes = 60) {
	const requestedMinutes = Number(minutes);
	const safeMinutes = Number.isFinite(requestedMinutes)
		? Math.min(24 * 60, Math.max(1, requestedMinutes))
		: 60;
	const now = Date.now();
	const since = now - Math.min(safeMinutes * 60 * 1000, MAX_WINDOW_MS);
	const windowRequests = requests.filter((event) => withinWindow(event, since));
	const windowLogs = logs.filter((event) => withinWindow(event, since));

	const apiGroups = new Map();
	for (const event of windowRequests) {
		const key = `${event.method} ${event.path}`;
		const group = apiGroups.get(key) || {
			method: event.method,
			path: event.path,
			calls: 0,
			errors: 0,
			totalMs: 0,
		};
		group.calls += 1;
		group.errors += event.status >= 400 ? 1 : 0;
		group.totalMs += event.ms;
		apiGroups.set(key, group);
	}

	const logGroups = new Map();
	for (const event of windowLogs) {
		const key = `${event.level}\u0000${event.message}`;
		const group = logGroups.get(key) || {
			level: event.level,
			message: event.message,
			count: 0,
			firstAt: event.at,
			lastAt: event.at,
		};
		group.count += 1;
		group.firstAt = Math.min(group.firstAt, event.at);
		group.lastAt = Math.max(group.lastAt, event.at);
		logGroups.set(key, group);
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
				...group,
				averageMs: group.calls ? Math.round(group.totalMs / group.calls) : 0,
			}))
			.sort((a, b) => b.calls - a.calls)
			.slice(0, 50),
		repeatedLogs: [...logGroups.values()]
			.sort((a, b) => b.count - a.count)
			.slice(0, 50),
		recentLogs: windowLogs.slice(-100).reverse(),
	};
}
