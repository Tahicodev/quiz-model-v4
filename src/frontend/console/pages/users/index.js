/**
 * src/frontend/console/pages/users/index.js
 *
 * Users & access — the hub.
 *
 * The three account populations are separate pages, because they are used
 * separately: a teacher list is a teaching roster, a student list is an
 * enrolment roster, and an administrator list is an access-control roster.
 * Mixing them in one table is what made the old list unusable.
 *
 * Offline (a school installation) the populations are:
 *   • teachers     — the teaching staff
 *   • students     — the enrolled pupils
 *   • administrators — the school's director
 *
 * SaaS adds a fourth distinction, which the platform administrator level
 * carries: a PLATFORM administrator administers every organization, while an
 * ORGANIZATION administrator administers only their own. Both appear on the
 * administrators page, labelled.
 */

import { api } from '../../core/api.js';
import { esc, stat } from '../../viz/charts.js';
import { loadingBlock, errorState } from '../../components/states.js';
import { openCreateAccount } from './create.js';

export const usersHubPage = {
	id: 'users',
	path: '/users',
	title: 'Users & Access',
	description:
		'Accounts, roles and access — separated by the population each list serves.',
	permission: ['platform.users.read', 'school.users.read'],
	async render(host, ctx) {
		host.innerHTML = `<div class="ac-stack" data-ac-users-hub>${loadingBlock(3)}</div>`;

		let payload;
		try {
			payload = await api.get('console/users?limit=200');
		} catch (err) {
			host.querySelector('[data-ac-users-hub]').innerHTML = errorState({
				title: 'The accounts could not be loaded',
				message: err.message,
			});
			return;
		}

		const rows = Array.isArray(payload?.data) ? payload.data : [];
		const count = (role) => rows.filter((row) => row.role === role).length;
		const active = (role) =>
			rows.filter((row) => row.role === role && row.status === 'active').length;
		const never = rows.filter((row) => !row.lastLogin).length;
		const suspended = rows.filter((row) => row.status === 'suspended').length;

		const isPlatform = ctx.isPlatform;

		const card = ({ href, icon, title, desc, count: value, activeCount }) => `
			<a class="ac-role-card" href="${esc(href)}">
				<span class="ac-role-card__icon">${icon}</span>
				<p class="ac-role-card__title">${esc(title)}</p>
				<p class="ac-role-card__desc">${esc(desc)}</p>
				<p class="ac-role-card__count">${formatNumber(value)} <small>${
					activeCount != null ? `· ${formatNumber(activeCount)} active` : 'account'
				}</small></p>
			</a>`;

		host.querySelector('[data-ac-users-hub]').innerHTML = `
			<div class="ac-grid ac-grid--kpi">
				${stat({
					label: 'Accounts in scope',
					value: formatNumber(rows.length),
					note: 'matching the current scope',
				})}
				${stat({
					label: 'Never signed in',
					value: formatNumber(never),
					note: 'provisioned, unused',
					tone: never > 0 ? 'warning' : '',
					tooltip: 'Accounts with no recorded sign-in. They may be waiting for the person to use them.',
				})}
				${stat({
					label: 'Suspended',
					value: formatNumber(suspended),
					note: 'no access',
					tone: suspended > 0 ? 'warning' : '',
				})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Manage accounts</h2>
				<p class="ac-section__hint">Each population has its own page, its own filters and its own actions.</p>
			</div>

			<div class="ac-quick-actions" style="margin-bottom:16px">
				<button type="button" class="ac-quick-action" data-ac-add-account>Add an account</button>
			</div>

			<div class="ac-role-cards">
				${card({
					href: '#/users/teachers',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',
					title: 'Teachers',
					desc: 'The teaching staff. Their classes, subjects and content.',
					count: count('teacher'),
					activeCount: active('teacher'),
				})}
				${card({
					href: '#/users/students',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
					title: 'Students',
					desc: 'The enrolled pupils, their class and their activity.',
					count: count('student'),
					activeCount: active('student'),
				})}
				${card({
					href: '#/users/administrators',
					icon: '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
					title: isPlatform ? 'Directors & platform administrators' : 'Directors',
					desc: isPlatform
						? 'The school directors, and the platform administrators who reach every organization.'
						: 'The people who administer this school.',
					count: count('admin') + count('super_admin'),
					activeCount: active('admin') + active('super_admin'),
				})}
			</div>

			${
				never > 0
					? `<div class="ac-alert ac-alert--warning" style="margin-top:16px">
						<div class="ac-alert__body">
							<p class="ac-alert__title">${formatNumber(never)} account(s) have never signed in</p>
							<p class="ac-alert__text">They may be waiting to be used, or they may have been provisioned in error. Open the relevant page to review them.</p>
						</div>
					</div>`
					: ''
			}`;

		host.querySelector('[data-ac-add-account]')?.addEventListener('click', () => {
			openCreateAccount({ ctx });
		});
	},
};

function formatNumber(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return '0';
	return n.toLocaleString();
}
