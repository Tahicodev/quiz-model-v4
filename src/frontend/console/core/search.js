/**
 * src/frontend/console/core/search.js
 *
 * The global search.
 *
 * The header input used to be decoration — rendered, never wired. It now
 * opens one panel that answers the question an operator actually asks:
 * "where is the thing I am looking for?" Three kinds of answer, one list:
 *
 *   1. The places of the console — pages, settings sections, wizard steps
 *      (matched locally, instantly, no request).
 *   2. The accounts — a live `GET /console/users?search=` when the session
 *      may read accounts.
 *   3. The organizations — a live `GET /console/organizations?search=` when
 *      the session may read organizations.
 *
 * Nothing is invented: the two live kinds come from the same endpoints the
 * pages use, scoped by the server to what the caller may see.
 */

import { api } from './api.js';

/**
 * The static index: every place the console can take you.
 *
 * `sections` comes from the settings page's own registry (pages/settings/
 * index.js `SECTIONS`), so a section added there appears in the search
 * without touching this file.
 */
export function buildPlaceIndex(PAGES, sections = []) {
	const places = [];
	for (const page of PAGES) {
		if (page.id === 'not-found' || page.id === 'forbidden') continue;
		places.push({
			kind: 'page',
			title: page.title,
			sub: page.description || '',
			path: page.path === '/' ? '/' : page.path,
			keywords: `${page.title} ${page.description || ''}`.toLowerCase(),
		});
	}
	for (const section of sections) {
		places.push({
			kind: 'settings',
			title: section.label,
			sub: 'Settings',
			path: `/settings?section=${encodeURIComponent(section.id)}`,
			keywords: `settings ${section.label}`.toLowerCase(),
		});
	}
	return places;
}

/** Score a query against one indexed place. Higher wins, 0 = no match. */
function score(query, place) {
	const text = place.keywords;
	const title = place.title.toLowerCase();
	if (!query) return 0;
	// A prefix of the title beats everything else.
	if (title.startsWith(query)) return 100 - title.length * 0.01;
	const at = title.indexOf(query);
	if (at !== -1) return 60 - at;
	// Whole-query substring in the keywords (description…).
	if (text.includes(query)) return 30;
	// Every word of the query appears somewhere.
	const words = query.split(/\s+/).filter(Boolean);
	if (words.length > 1 && words.every((word) => text.includes(word))) return 20;
	return 0;
}

/**
 * Run one search.
 *
 * @param {string} rawQuery
 * @param {{ places:Array, canUsers:boolean, canOrganizations:boolean }} ctx
 * @returns {Promise<Array<{kind:string,title:string,sub?:string,path:string,badge?:string}>>}
 */
export async function runSearch(rawQuery, { places, canUsers = false, canOrganizations = false } = {}) {
	const query = String(rawQuery || '').trim().toLowerCase();
	if (!query) return [];

	// 1) The local places — always, instantly.
	const local = places
		.map((place) => ({ place, value: score(query, place) }))
		.filter((row) => row.value > 0)
		.sort((a, b) => b.value - a.value)
		.slice(0, 6)
		.map(({ place }) => ({ ...place, badge: 'Page' }));

	// 2) The live records — only what the session may read, in parallel,
	//    and a failure of one kind never blanks the panel.
	const [users, organizations] = await Promise.all([
		canUsers
			? api
					.get(`console/users?search=${encodeURIComponent(rawQuery.trim())}&limit=4`)
					.catch(() => null)
			: Promise.resolve(null),
		canOrganizations
			? api
					.get(`console/organizations?search=${encodeURIComponent(rawQuery.trim())}&limit=4`)
					.catch(() => null)
			: Promise.resolve(null),
	]);

	const userRows = (users?.data || [])
		.slice(0, 4)
		.map((row) => ({
			kind: 'user',
			title: row.name || row.username,
			sub: row.username && row.name ? row.username : row.roleLabel || '',
			path: `/users/${row.id}`,
			badge: row.roleLabel || 'Account',
		}));

	const organizationRows = (organizations?.data || [])
		.slice(0, 4)
		.map((row) => ({
			kind: 'organization',
			title: row.name,
			sub: row.status === 'suspended' ? 'suspended' : '',
			path: `/organizations/${row.id}`,
			badge: 'Organization',
		}));

	return [...local, ...userRows, ...organizationRows];
}
