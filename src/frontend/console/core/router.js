/**
 * src/frontend/console/core/router.js
 *
 * Hash router with permission-aware guards.
 *
 * The legacy admin surface uses a flat tab switcher. The console needs
 * routes that carry a required permission, a page title and a description,
 * plus real URLs a bookmark or a support ticket can point at.
 *
 * Route shape:
 *   { id, path, title, description, permission?:string|string[], render(ctx) }
 *
 * `path` is the hash route without the leading '#', e.g. '/organizations'.
 */

const routes = [];
let notFound = null;
let current = null;
let onChange = null;
let context = null;

/**
 * @param {Array<object>} list
 * @param {{ notFound?:object }} [options]
 */
export function defineRoutes(list, options = {}) {
	routes.length = 0;
	for (const route of list) routes.push(route);
	notFound = options.notFound || null;
}

/** Called after every successful navigation. */
export function setNavigationHandler(handler) {
	onChange = handler;
}

export function currentRoute() {
	return current;
}

/** The shared context handed to every page renderer. */
export function setContext(ctx) {
	context = ctx;
}

function normalize(path) {
	if (!path) return '/';
	const clean = String(path).split('?')[0].replace(/^#/, '');
	const trimmed = clean.replace(/\/+$/, '');
	return trimmed || '/';
}

function match(path) {
	const target = normalize(path);
	for (const route of routes) {
		if (normalize(route.path) === target) return route;
	}
	// Detail routes use a trailing parameter, e.g. '/organizations/:id'.
	for (const route of routes) {
		if (!route.path.includes(':')) continue;
		const routeParts = normalize(route.path).split('/');
		const targetParts = target.split('/');
		if (routeParts.length !== targetParts.length) continue;
		const params = {};
		let matched = true;
		for (let i = 0; i < routeParts.length; i += 1) {
			const part = routeParts[i];
			if (part.startsWith(':')) {
				params[part.slice(1)] = decodeURIComponent(targetParts[i]);
			} else if (part !== targetParts[i]) {
				matched = false;
				break;
			}
		}
		if (matched) return { ...route, params };
	}
	return null;
}

export function parseHash() {
	const hash = window.location.hash || '#/';
	const raw = hash.slice(1) || '/';
	const [pathPart, queryPart] = raw.split('?');
	const query = {};
	if (queryPart) {
		for (const [key, value] of new URLSearchParams(queryPart)) query[key] = value;
	}
	return { path: normalize(pathPart), query };
}

/** Navigate to a console route. */
export function navigate(path, { replace = false } = {}) {
	const target = path.startsWith('#') ? path : `#${path}`;
	if (replace) {
		window.history.replaceState(null, '', target);
	} else if (window.location.hash !== target) {
		window.location.hash = target;
		return; // the hashchange handler performs the render
	}
	render();
}

/**
 * Render the route matching the current hash.
 * Returns the route that was rendered (or null when access was refused).
 */
export function render() {
	const { path, query } = parseHash();
	const route = match(path) || notFound;
	if (!route) return null;

	const required = route.permission
		? Array.isArray(route.permission)
			? route.permission
			: [route.permission]
		: [];

	if (required.length && context && !context.canAny(required)) {
		current = {
			...route,
			id: route.id || 'forbidden',
			title: 'Access restricted',
			description: 'Your role does not include this section.',
			forbidden: true,
		};
		if (onChange) onChange(current, { path, query });
		return current;
	}

	current = { ...route, path, query, params: route.params || {} };
	if (onChange) onChange(current, { path, query });
	return current;
}

/** Start listening for hash changes. */
export function start() {
	window.addEventListener('hashchange', () => render());
	return render();
}

export function listRoutes() {
	return routes.map((route) => ({
		id: route.id,
		path: route.path,
		title: route.title,
		permission: route.permission,
	}));
}
