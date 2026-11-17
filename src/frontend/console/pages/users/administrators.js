/**
 * src/frontend/console/pages/users/administrators.js
 *
 * The directors & platform administrators roster.
 *
 * Offline, a school installation has one level: the school's director. On a
 * SaaS deployment there are two, and the page labels which is which:
 *
 *   • Platform administrator    — administers every organization
 *   • Organization administrator — administers one organization
 */

import { renderUserList, administratorColumns } from './list.js';

const state = { search: '', status: '', offset: 0 };

export const administratorsPage = {
	id: 'users-administrators',
	path: '/users/administrators',
	title: 'Directors & administrators',
	description:
		'The accounts that can administer — the school director, and on a SaaS deployment the platform administrators.',
	permission: ['platform.users.read', 'school.users.read'],
	async render(host, ctx) {
		await renderUserList({
			host,
			ctx,
			// Both levels: the organization's own directors AND, on a SaaS
			// deployment, the platform administrators.
			role: 'admin,super_admin',
			title: ctx.isPlatform ? 'Directors & platform administrators' : 'Directors',
			subtitle: ctx.isPlatform
				? 'A platform administrator reaches every organization; an organization administrator reaches only their own.'
				: 'The accounts that administer this school.',
			columns: administratorColumns,
			emptyMessage: 'No administrator account matches the current filters.',
			state,
		});
	},
};
