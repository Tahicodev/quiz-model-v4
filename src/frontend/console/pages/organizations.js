/**
 * src/frontend/console/pages/organizations.js
 *
 * Organizations — the platform's tenants.
 *
 * The administrative question this page answers is "which organizations are
 * healthy, growing, or at risk?", not "how did my class score?". Usage is
 * aggregated at organization level; student-level performance stays in
 * Analytics.
 */

import { api } from '../core/api.js';
import { esc, stat, barChart } from '../viz/charts.js';
import { renderTable, bindTable, renderPagination } from '../components/table.js';
import { loadingBlock, errorState, emptyState } from '../components/states.js';
import { searchField, selectField } from '../components/filters.js';
import { formatNumber, formatDate, formatRelative, toast } from '../components/ui.js';

const PAGE_SIZE = 25;

const STATE = {
	search: '',
	status: '',
	offset: 0,
	sort: { key: 'name', direction: 'asc' },
};

export const organizationsPage = {
	id: 'organizations',
	path: '/organizations',
	title: 'Organizations',
	description:
		'Every organization on the platform, its accounts, its usage and the conditions that need attention.',
	permission: ['platform.organizations.read', 'school.profile.read'],
	async render(host, ctx) {
		host.innerHTML = `
			<div class="ac-toolbar">
				${searchField({ id: 'ac-org-search', placeholder: 'Search organizations…', value: STATE.search })}
				${selectField({
					id: 'ac-org-status',
					label: 'Status',
					value: STATE.status,
					includeAll: true,
					allLabel: 'All statuses',
					options: [
						{ value: 'active', label: 'Active' },
						{ value: 'pending', label: 'Pending' },
						{ value: 'suspended', label: 'Suspended' },
					],
				})}
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div class="ac-grid ac-grid--kpi" data-ac-org-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Organizations</h3>
						<p class="ac-panel__subtitle">Active users are measured over the last 30 days from real sign-ins, attempts and content creation.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-org-body>
					${loadingBlock(4)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-org-charts></div>`;

		const bodyHost = host.querySelector('[data-ac-org-body]');
		const kpiHost = host.querySelector('[data-ac-org-kpis]');
		const chartHost = host.querySelector('[data-ac-org-charts]');

		let payload;
		try {
			payload = await api.get('console/organizations', {
				search: STATE.search || undefined,
				status: STATE.status || undefined,
				limit: PAGE_SIZE,
				offset: STATE.offset,
			});
		} catch (err) {
			bodyHost.innerHTML = errorState({ message: err.message });
			return;
		}

		const rows = payload.data;

		// KPIs are computed from the rows the server returned for the CURRENT
		// filter — they describe the filtered set, not the whole platform.
		const total = rows.length;
		const active = rows.filter((row) => row.status === 'active').length;
		const pending = rows.filter((row) => row.status === 'pending').length;
		const suspended = rows.filter((row) => row.status === 'suspended').length;
		const teachers = rows.reduce((sum, row) => sum + (row.teachers || 0), 0);
		const students = rows.reduce((sum, row) => sum + (row.students || 0), 0);
		const inactive = rows.filter((row) => row.alerts.some((alert) => alert.code === 'inactive' || alert.code === 'no_activity')).length;

		kpiHost.innerHTML = [
			stat({
				label: 'Organizations shown',
				value: formatNumber(total),
				note: payload.total > rows.length ? `of ${formatNumber(payload.total)} matching` : 'matching the filter',
				tooltip: 'The number of organizations matching the current search and status filter.',
			}),
			stat({
				label: 'Active',
				value: formatNumber(active),
				tone: 'success',
				tooltip: 'Organizations whose lifecycle status is "active".',
			}),
			stat({
				label: 'Pending / suspended',
				value: `${formatNumber(pending)} / ${formatNumber(suspended)}`,
				tone: pending + suspended > 0 ? 'warning' : '',
				tooltip: 'Organizations awaiting activation, and organizations whose access has been revoked.',
			}),
			stat({
				label: 'Accounts',
				value: formatNumber(teachers + students),
				note: `${formatNumber(teachers)} teachers · ${formatNumber(students)} students`,
				tooltip: 'Teacher and student accounts across the organizations shown.',
			}),
			stat({
				label: 'Needing attention',
				value: formatNumber(inactive),
				tone: inactive > 0 ? 'warning' : '',
				tooltip:
					'Organizations with no activity in the last 30 days, or with no recorded activity at all.',
			}),
		].join('');

		bodyHost.innerHTML = renderTable({
			columns: [
				{
					key: 'name',
					label: 'Organization',
					sortable: true,
					render: (row) =>
						`<a href="#/organizations/${row.id}" class="ac-table__primary">${esc(row.name)}</a><br><span class="ac-table__muted">${esc(
							row.slug,
						)}</span>`,
				},
				{
					key: 'status',
					label: 'Status',
					sortable: true,
					render: (row) =>
						`<span class="ac-badge ${
							row.status === 'active'
								? 'ac-badge--success'
								: row.status === 'pending'
									? 'ac-badge--warning'
									: 'ac-badge--danger'
						}">${esc(row.status)}</span>`,
				},
				{ key: 'plan', label: 'Plan', render: (row) => esc(row.plan || '—') },
				{ key: 'teachers', label: 'Teachers', align: 'right', sortable: true },
				{ key: 'students', label: 'Students', align: 'right', sortable: true },
				{
					key: 'activeTeachers',
					label: 'Active teachers',
					align: 'right',
					sortable: true,
					render: (row) => `${formatNumber(row.activeTeachers)} / ${formatNumber(row.teachers)}`,
				},
				{
					key: 'activeStudents',
					label: 'Active students',
					align: 'right',
					sortable: true,
					render: (row) => `${formatNumber(row.activeStudents)} / ${formatNumber(row.students)}`,
				},
				{
					key: 'attempts30d',
					label: 'Attempts (30d)',
					align: 'right',
					sortable: true,
				},
				{
					key: 'lastActivity',
					label: 'Last activity',
					sortable: true,
					render: (row) =>
						row.lastActivity
							? `<span title="${esc(formatDate(row.lastActivity))}">${esc(
									formatRelative(row.lastActivity),
								)}</span>`
							: '<span class="ac-badge ac-badge--danger">none</span>',
				},
				{
					key: 'alerts',
					label: 'Alerts',
					render: (row) =>
						row.alerts.length
							? row.alerts
									.map(
										(alert) =>
											`<span class="ac-badge ac-badge--${
												alert.kind === 'danger'
													? 'danger'
													: alert.kind === 'warning'
														? 'warning'
														: 'info'
											}" title="${esc(alert.message)}">${esc(alert.code)}</span>`,
									)
									.join(' ')
							: '<span class="ac-table__muted">—</span>',
				},
			],
			rows,
			sort: STATE.sort,
			onSort: (key) => {
				STATE.sort = {
					key,
					direction: STATE.sort.key === key && STATE.sort.direction === 'asc' ? 'desc' : 'asc',
				};
				ctx.rerender();
			},
			empty: ctx.isPlatform
				? 'No organization matches the current search and status filter.'
				: 'This session is scoped to a single organization.',
			rowHref: (row) => `#/organizations/${row.id}`,
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

		// Usage comparison chart — only meaningful at platform scope.
		if (ctx.isPlatform && rows.length) {
			const top = [...rows]
				.sort((a, b) => (b.activeStudents || 0) - (a.activeStudents || 0))
				.slice(0, 8);
			chartHost.innerHTML = `
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Usage by organization</h3>
							<p class="ac-panel__subtitle">Active students over the last 30 days, highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${barChart({
							rows: top.map((row) => ({ label: row.name, value: row.activeStudents || 0 })),
							value: 'value',
							label: (row) => row.label,
							display: (value) => formatNumber(value),
							tone: 'primary',
							ariaLabel: 'Active students by organization',
						})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Account distribution</h3>
							<p class="ac-panel__subtitle">Teachers and students per organization in the current filter.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${barChart({
							rows: top.map((row) => ({
								label: row.name,
								teachers: row.teachers || 0,
								students: row.students || 0,
							})),
							value: 'students',
							label: (row) => row.label,
							display: (value) => formatNumber(value),
							tone: 'primary',
							ariaLabel: 'Students by organization',
						})}
					</div>
				</section>`;
		} else {
			chartHost.innerHTML = '';
		}

		// Filters.
		const search = host.querySelector('#ac-org-search');
		let debounce = null;
		search.addEventListener('input', () => {
			window.clearTimeout(debounce);
			debounce = window.setTimeout(() => {
				STATE.search = search.value.trim();
				STATE.offset = 0;
				ctx.rerender();
			}, 320);
		});
		host.querySelector('#ac-org-status').addEventListener('change', (event) => {
			STATE.status = event.target.value;
			STATE.offset = 0;
			ctx.rerender();
		});
		host.querySelector('[data-ac-refresh]').addEventListener('click', () => ctx.rerender());
	},
};
