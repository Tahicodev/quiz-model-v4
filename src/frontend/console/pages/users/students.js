/**
 * src/frontend/console/pages/users/students.js
 *
 * The students roster.
 */

import { renderUserList, studentColumns } from './list.js';

const state = { search: '', status: '', offset: 0 };

export const studentsPage = {
	id: 'users-students',
	path: '/users/students',
	title: 'Students',
	description: 'The enrolled pupils, their class and their activity.',
	permission: ['platform.users.read', 'school.users.read'],
	async render(host, ctx) {
		await renderUserList({
			host,
			ctx,
			role: 'student',
			title: 'Students',
			subtitle:
				'Every student account in scope. Open an account to change its status, role or permissions.',
			columns: studentColumns,
			emptyMessage: 'No student account matches the current filters.',
			state,
		});
	},
};
