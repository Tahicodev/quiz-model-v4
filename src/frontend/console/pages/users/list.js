/**
 * src/frontend/console/pages/users/list.js
 *
 * The shared account list used by the three role sub-pages.
 *
 * Each sub-page differs only in the ROLE it filters on and the columns it
 * shows; the filtering, searching, sorting, pagination and row actions are
 * identical, so they live here once.
 */

import { api } from '../../core/api.js';
import { esc } from '../../viz/charts.js';
import { renderTable, renderPagination } from '../../components/table.js';
import { loadingBlock, errorState, emptyState } from '../../components/states.js';
import { formatDate, formatRelative, truncate } from '../../components/ui.js';
import { toolbar } from '../../components/filters.js';
import { rowActions, bindRowActions, accountActions } from '../../components/actions.js';
import { confirmDialog, toast } from '../../components/ui.js';
import { openCreateAccount } from './create.js';

const PAGE_SIZE = 25;

/**
 * @param {{ host:HTMLElement, ctx:object, role:string, title:string,
 *           subtitle:string, columns:Array, emptyMessage:string,
 *           state:object, extraFilters?:Array }} options
 */
export async function renderUserList({
	host,
	ctx,
	role,
	title,
	subtitle,
	columns,
	emptyMessage,
	state,
	extraFilters = [],
}) {
	host.innerHTML = `
		${toolbar({
			fields: `<div class="ac-field">
				<label class="ac-field__label" for="ac-user-search">Search</label>
				<input class="ac-input" id="ac-user-search" type="search" placeholder="Name, username, email…" value="${esc(
					state.search || '',
				)}" autocomplete="off" />
			</div>
			<div class="ac-field">
				<label class="ac-field__label" for="ac-user-status">Status</label>
				<select class="ac-select" id="ac-user-status">
					<option value="">All statuses</option>
					<option value="active"${state.status === 'active' ? ' selected' : ''}>Active</option>
					<option value="inactive"${state.status === 'inactive' ? ' selected' : ''}>Inactive</option>
					<option value="suspended"${state.status === 'suspended' ? ' selected' : ''}>Suspended</option>
				</select>
			</div>
			${extraFilters
				.map(
					(filter) => `<div class="ac-field">
					<label class="ac-field__label" for="${esc(filter.id)}">${esc(filter.label)}</label>
					<select class="ac-select" id="${esc(filter.id)}">
						${filter.options
							.map(
								(option) =>
									`<option value="${esc(option.value)}"${
										String(state[filter.key] ?? '') === String(option.value)
											? ' selected'
											: ''
									}>${esc(option.label)}</option>`,
							)
							.join('')}
					</select>
				</div>`,
				)
				.join('')}`,
			actions: '<button type="button" class="ac-btn" data-ac-user-refresh>Refresh</button>',
		})}
		<section class="ac-panel">
			<div class="ac-panel__header">
				<div class="ac-panel__titles">
					<h3 class="ac-panel__title">${esc(title)}</h3>
					<p class="ac-panel__subtitle">${esc(subtitle)}</p>
				</div>
				<div class="ac-panel__actions">
					<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-user-add>
						Add an account
					</button>
				</div>
			</div>
			<div class="ac-panel__body ac-panel__body--flush" data-ac-user-table>
				${loadingBlock(5)}
			</div>
		</section>`;

	const tableHost = host.querySelector('[data-ac-user-table]');

	const load = async () => {
		tableHost.innerHTML = loadingBlock(5);
		let payload;
		try {
			payload = await api.get('console/users', {
				role,
				search: state.search || undefined,
				status: state.status || undefined,
				...(state.schoolId ? { school_id: state.schoolId } : {}),
				limit: PAGE_SIZE,
				offset: state.offset || 0,
			});
		} catch (err) {
			tableHost.innerHTML = errorState({
				title: 'The accounts could not be loaded',
				message: err.message,
			});
			return;
		}

		const rows = payload?.data || [];
		const canManage = ctx.canAny(['platform.users.manage', 'school.users.manage']);

		tableHost.innerHTML =
			rows.length === 0
				? emptyState({
						title: 'No accounts',
						message: emptyMessage,
					})
				: renderTable({
						columns: [
							...columns,
							{
								key: 'actions',
								label: 'Actions',
								align: 'right',
								render: (row) => rowActions(accountActions(row, { canManage })),
							},
						],
						rows,
						rowHref: (row) => `#/users/${row.id}`,
					});

		// One delegated listener for the whole table.
		bindRowActions(tableHost, {
			open: (id) => {
				window.location.hash = `#/users/${id}`;
			},
			'toggle-status': async (id) => {
				const account = rows.find((row) => row.id === id);
				if (!account) return;
				const suspending = account.status === 'active';
				const confirmed = await confirmDialog({
					title: suspending ? `Suspend "${account.username}"?` : `Reactivate "${account.username}"?`,
					message: suspending
						? 'The account keeps everything it owns, but it can no longer sign in. The action is recorded in the audit trail.'
						: 'The account can sign in again immediately. The action is recorded in the audit trail.',
					confirmLabel: suspending ? 'Suspend the account' : 'Reactivate the account',
					danger: suspending,
				});
				if (!confirmed) return;
				try {
					await api.patch(`console/users/${encodeURIComponent(id)}`, {
						status: suspending ? 'suspended' : 'active',
						reason: suspending ? 'Suspended from the account roster' : 'Reactivated from the account roster',
					});
					toast(suspending ? 'The account was suspended.' : 'The account was reactivated.', 'success');
					load();
				} catch (err) {
					toast(err.message, 'error');
				}
			},
			delete: async (id) => {
				const account = rows.find((row) => row.id === id);
				if (!account) return;
				const confirmed = await confirmDialog({
					title: `Delete "${account.username}"?`,
					message:
						'The account is removed, together with its sessions and its results. This cannot be undone — suspending the account keeps the record if you only need to end the access.',
					confirmLabel: 'Delete the account',
					danger: true,
				});
				if (!confirmed) return;
				try {
					await api.del(`console/users/${encodeURIComponent(id)}`);
					toast('The account was deleted.', 'success');
					load();
				} catch (err) {
					toast(err.message, 'error');
				}
			},
		});

		tableHost.insertAdjacentHTML(
			'beforeend',
			renderPagination({
				total: payload?.total || 0,
				limit: payload?.limit || PAGE_SIZE,
				offset: payload?.offset || 0,
				onPage: (offset) => {
					state.offset = offset;
					load();
				},
			}),
		);
	};

	// Filters.
	const search = host.querySelector('#ac-user-search');
	let debounce = null;
	search.addEventListener('input', () => {
		window.clearTimeout(debounce);
		debounce = window.setTimeout(() => {
			state.search = search.value.trim();
			state.offset = 0;
			load();
		}, 320);
	});
	host.querySelector('#ac-user-status').addEventListener('change', (event) => {
		state.status = event.target.value;
		state.offset = 0;
		load();
	});
	for (const filter of extraFilters) {
		host.querySelector(`#${filter.id}`).addEventListener('change', (event) => {
			state[filter.key] = event.target.value;
			state.offset = 0;
			load();
		});
	}
	host.querySelector('[data-ac-user-refresh]').addEventListener('click', load);

	host.querySelector('[data-ac-user-add]')?.addEventListener('click', () => {
		openCreateAccount({
			ctx,
			role,
			onCreated: () => {
				state.offset = 0;
				load();
			},
		});
	});

	await load();
}

// ── Column sets ────────────────────────────────────────────────────────────

const statusBadge = (row) =>
	`<span class="ac-badge ac-badge--${
		row.status === 'active' ? 'success' : row.status === 'suspended' ? 'danger' : 'warning'
	}">${esc(row.status)}</span>`;

const lastSignIn = (row) =>
	row.lastLogin
		? `<span title="${esc(formatDate(row.lastLogin))}">${esc(formatRelative(row.lastLogin))}</span>`
		: '<span class="ac-badge ac-badge--warning">never</span>';

export const teacherColumns = [
	{
		key: 'name',
		label: 'Teacher',
		render: (row) =>
			`<span class="ac-table__primary">${esc(row.name || row.username)}</span><br><span class="ac-table__muted">${esc(
				row.username,
			)}${row.email ? ` · ${esc(row.email)}` : ''}</span>`,
	},
	{ key: 'status', label: 'Status', render: statusBadge },
	{ key: 'schoolName', label: 'Organization', render: (row) => esc(row.schoolName || '—') },
	{ key: 'lastLogin', label: 'Last sign-in', render: lastSignIn },
	{
		key: 'createdAt',
		label: 'Created',
		render: (row) => esc(formatDate(row.createdAt, { withTime: false })),
	},
];

export const studentColumns = [
	{
		key: 'name',
		label: 'Student',
		render: (row) =>
			`<span class="ac-table__primary">${esc(row.name || row.username)}</span><br><span class="ac-table__muted">${esc(
				row.username,
			)}${row.numero ? ` · #${esc(row.numero)}` : ''}</span>`,
	},
	{ key: 'status', label: 'Status', render: statusBadge },
	{ key: 'className', label: 'Class', render: (row) => esc(row.className || '—') },
	{ key: 'schoolName', label: 'Organization', render: (row) => esc(row.schoolName || '—') },
	{ key: 'lastLogin', label: 'Last sign-in', render: lastSignIn },
];

export const administratorColumns = [
	{
		key: 'name',
		label: 'Administrator',
		render: (row) =>
			`<span class="ac-table__primary">${esc(row.name || row.username)}</span><br><span class="ac-table__muted">${esc(
				row.username,
			)}</span>`,
	},
	{
		key: 'role',
		label: 'Level',
		render: (row) =>
			`<span class="ac-badge ${
				row.role === 'super_admin' ? 'ac-badge--violet' : 'ac-badge--brand'
			}">${esc(row.role === 'super_admin' ? 'Platform' : 'Organization')}</span>`,
	},
	{ key: 'status', label: 'Status', render: statusBadge },
	{ key: 'schoolName', label: 'Organization', render: (row) => esc(row.schoolName || '—') },
	{ key: 'lastLogin', label: 'Last sign-in', render: lastSignIn },
];

export { truncate };
