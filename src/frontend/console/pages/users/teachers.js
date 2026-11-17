/**
 * src/frontend/console/pages/users/teachers.js
 *
 * The teachers roster.
 */

import { renderUserList, teacherColumns } from './list.js';

const state = { search: '', status: '', offset: 0 };

export const teachersPage = {
	id: 'users-teachers',
	path: '/users/teachers',
	title: 'Teachers',
	description: 'The teaching staff, their activity and their access.',
	permission: ['platform.users.read', 'school.users.read'],
	async render(host, ctx) {
		await renderUserList({
			host,
			ctx,
			role: 'teacher',
			title: 'Teachers',
			subtitle:
				'Every teacher account in scope. Open an account to change its status, role or permissions.',
			columns: teacherColumns,
			emptyMessage: 'No teacher account matches the current filters.',
			state,
		});
	},
};
