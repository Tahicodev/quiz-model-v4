/**
 * src/frontend/console/pages/users.js
 *
 * Users & Access.
 *
 * The administrative question: who has access, how active are they, what
 * changed, and what should be revoked. This page is about ACCOUNT LIFECYCLE
 * and ACCESS — not about pedagogical performance.
 */

import { api } from '../core/api.js';
import { esc, stat, donut, legend } from '../viz/charts.js';
import { renderTable, bindTable, renderPagination } from '../components/table.js';
import { loadingBlock, errorState } from '../components/states.js';
import { searchField, selectField } from '../components/filters.js';
import { formatNumber, formatDate, formatRelative, toast } from '../components/ui.js';

const PAGE_SIZE = 25;

const STATE = {
	search: '',
	role: '',
	status: '',
	offset: 0,
};

const ROLE_LABEL = {
	super_admin: 'Platform administrator',
	admin: 'Administrator',
	teacher: 'Teacher',
	student: 'Student',
};

export const usersPage = {
	id: 'users',
	path: '/users',
	title: 'Users & Access',
	description:
		'Accounts, roles, invitations and access decisions across every organization in scope.',
	permission: ['platform.users.read', 'school.users.read'],
	async render(host, ctx) {
		host.innerHTML = `
			<div class="ac-toolbar">
				${searchField({ id: 'ac-user-search', placeholder: 'Search name, username or email…', value: STATE.search })}
				${selectField({
					id: 'ac-user-role',
					label: 'Role',
					value: STATE.role,
					includeAll: true,
					allLabel: 'All roles',
					options: [
						{ value: 'super_admin', label: 'Platform administrator' },
						{ value: 'admin', label: 'Administrator' },
						{ value: 'teacher', label: 'Teacher' },
						{ value: 'student', label: 'Student' },
					],
				})}
				${selectField({
					id: 'ac-user-status',
					label: 'Status',
					value: STATE.status,
					includeAll: true,
					allLabel: 'All statuses',
					options: [
						{ value: 'active', label: 'Active' },
						{ value: 'inactive', label: 'Inactive' },
						{ value: 'suspended', label: 'Suspended' },
					],
				})}
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div class="ac-grid ac-grid--kpi" data-ac-user-kpis"></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Accounts</h3>
						<p class="ac-panel__subtitle">Last sign-in comes from the recorded authentication trail, not from a guess.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-user-body>
					${loadingBlock(4)}
				</div>
			</section>`;

		const bodyHost = host.querySelector('[data-ac-user-body]');
		const kpiHost = host.querySelector('[data-ac-user-kpis]');

		let payload;
		try {
			payload = await api.get('console/users', {
				search: STATE.search || undefined,
				role: STATE.role || undefined,
				status: STATE.status || undefined,
				limit: PAGE_SIZE,
				offset: STATE.offset,
			});
		} catch (err) {
			bodyHost.innerHTML = errorState({ message: err.message });
			return;
		}

		const rows = payload.data;
		const counts = { super_admin: 0, admin: 0, teacher: 0, student: 0 };
		let suspended = 0;
		let neverSignedIn = 0;
		for (const row of rows) {
			if (counts[row.role] !== undefined) counts[row.role] += 1;
			if (row.status === 'suspended') suspended += 1;
			if (!row.lastLogin) neverSignedIn += 1;
		}

		kpiHost.innerHTML = [
			stat({
				label: 'Accounts shown',
				value: formatNumber(rows.length),
				note: payload.total > rows.length ? `of ${formatNumber(payload.total)} matching` : 'matching the filter',
				tooltip: 'Accounts matching the current search, role and status filters.',
			}),
			stat({
				label: 'Teachers',
				value: formatNumber(counts.teacher),
				tone: 'primary',
				tooltip: 'Teacher accounts in the filtered set.',
			}),
			stat({
				label: 'Students',
				value: formatNumber(counts.student),
				tooltip: 'Student accounts in the filtered set.',
			}),
			stat({
				label: 'Administrators',
				value: formatNumber(counts.admin + counts.super_admin),
				tone: 'primary',
				tooltip:
					'Organization administrators plus platform administrators. Platform administrators can reach every organization.',
			}),
			stat({
				label: 'Suspended',
				value: formatNumber(suspended),
				tone: suspended > 0 ? 'warning' : '',
				tooltip:
					'Suspended accounts cannot sign in. Their data is retained and their sessions are revoked on the next request.',
			}),
			stat({
				label: 'Never signed in',
				value: formatNumber(neverSignedIn),
				tone: neverSignedIn > 0 ? 'warning' : '',
				tooltip:
					'Accounts with no recorded sign-in. Provisioned but unused — a common sign of a stale invitation.',
			}),
		].join('');

		bodyHost.innerHTML = renderTable({
			columns: [
				{
					key: 'name',
					label: 'Account',
					render: (row) =>
						`<span class="ac-table__primary">${esc(row.name || row.username)}</span><br><span class="ac-table__muted">${esc(
							row.username,
						)}${row.email ? ` · ${esc(row.email)}` : ''}</span>`,
				},
				{
					key: 'role',
					label: 'Role',
					render: (row) =>
						`<span class="ac-badge ${
							row.role === 'super_admin'
								? 'ac-badge--violet'
								: row.role === 'admin'
									? 'ac-badge--brand'
									: ''
						}">${esc(ROLE_LABEL[row.role] || row.role)}</span>`,
				},
				{
					key: 'status',
					label: 'Status',
					render: (row) =>
						`<span class="ac-badge ${
							row.status === 'active'
								? 'ac-badge--success'
								: row.status === 'suspended'
									? 'ac-badge--danger'
									: 'ac-badge--warning'
						}">${esc(row.status)}</span>`,
				},
				{
					key: 'schoolName',
					label: 'Organization',
					render: (row) => esc(row.schoolName || '—'),
				},
				{
					key: 'className',
					label: 'Class',
					render: (row) => esc(row.className || '—'),
				},
				{
					key: 'lastLogin',
					label: 'Last sign-in',
					render: (row) =>
						row.lastLogin
							? `<span title="${esc(formatDate(row.lastLogin))}">${esc(
									formatRelative(row.lastLogin),
								)}</span>`
							: '<span class="ac-badge ac-badge--warning">never</span>',
				},
				{
					key: 'createdAt',
					label: 'Created',
					render: (row) => esc(formatDate(row.createdAt, { withTime: false })),
				},
			],
			rows,
			empty: 'No account matches the current filters.',
		});

		bodyHost.insertAdjacentHTML(
			'beforeend',
			renderPagination({
				total: payload.total,
				limit: payload.limit,
				offset: payload.offset,
				onPage: (offset) => {
					STATE.offset = offset;
					ctx.rerender();
				},
			}),
		);

		const search = host.querySelector('#ac-user-search');
		let debounce = null;
		search.addEventListener('input', () => {
			window.clearTimeout(debounce);
			debounce = window.setTimeout(() => {
				STATE.search = search.value.trim();
				STATE.offset = 0;
				ctx.rerender();
			}, 320);
		});
		host.querySelector('#ac-user-role').addEventListener('change', (event) => {
			STATE.role = event.target.value;
			STATE.offset = 0;
			ctx.rerender();
		});
		host.querySelector('#ac-user-status').addEventListener('change', (event) => {
			STATE.status = event.target.value;
			STATE.offset = 0;
			ctx.rerender();
		});
		host.querySelector('[data-ac-refresh]').addEventListener('click', () => ctx.rerender());
	},
};
