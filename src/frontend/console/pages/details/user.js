/**
 * src/frontend/console/pages/details/user.js
 *
 * Account detail and access management.
 *
 * This is where the administrative actions live: activate, suspend,
 * reactivate, change a role, grant or deny a permission, revoke sessions.
 * Every action is server-validated, scope-checked and audit-logged.
 */

import { api } from '../../core/api.js';
import { esc, stat } from '../../viz/charts.js';
import { renderTable } from '../../components/table.js';
import { loadingBlock, errorState, emptyState } from '../../components/states.js';
import {
	formatNumber,
	formatDate,
	formatRelative,
	confirmDialog,
	toast,
	openModal,
} from '../../components/ui.js';

const ROLE_LABEL = {
	super_admin: 'Platform administrator',
	admin: 'Organization administrator',
	teacher: 'Teacher',
	student: 'Student',
};

export const userDetailPage = {
	id: 'user-detail',
	path: '/users/:id',
	title: 'Account',
	description: 'Profile, access, recent activity and the administrative actions available.',
	permission: ['platform.users.read', 'school.users.read'],
	async render(host, ctx, route) {
		const userId = route.params?.id;
		host.innerHTML = `<div class="ac-stack" data-ac-user-detail>${loadingBlock(4)}</div>`;

		let data;
		try {
			const payload = await api.get(`console/users/${encodeURIComponent(userId)}`);
			data = payload.data;
		} catch (err) {
			host.innerHTML = errorState({
				title: 'This account could not be loaded',
				message: err.message,
			});
			return;
		}

		const account = data.account;
		const canManage =
			ctx.isPlatform || (ctx.session.permissions || []).includes('school.users.manage');
		const canManageRoles =
			ctx.isPlatform || (ctx.session.permissions || []).includes('school.roles.manage');

		ctx.setTitle(
			account.name || account.username,
			`${ROLE_LABEL[account.role] || account.role} · ${
				data.organization?.name || 'organization'
			} · ${account.status}`,
		);

		host.innerHTML = `
			<div class="ac-toolbar">
				<a class="ac-btn" href="#/users">← All accounts</a>
				<span style="flex:1"></span>
				${
					canManage
						? `<button type="button" class="ac-btn" data-ac-toggle-status>${
								account.status === 'active'
									? 'Suspend account'
									: 'Reactivate account'
							}</button>`
						: ''
				}
				${
					canManageRoles
						? '<button type="button" class="ac-btn" data-ac-change-role>Change role</button>'
						: ''
				}
				${
					canManageRoles
						? '<button type="button" class="ac-btn" data-ac-grant>Grant permission</button>'
						: ''
				}
				<button type="button" class="ac-btn" data-ac-revoke-sessions>Revoke sessions</button>
			</div>

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${esc(account.name || account.username)}</h3>
						<p class="ac-panel__subtitle">${esc(account.username)}${
							account.email ? ` · ${esc(account.email)}` : ''
						}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ac-badge--brand">${esc(
							ROLE_LABEL[account.role] || account.role,
						)}</span>
						<span class="ac-badge ac-badge--${
							account.status === 'active'
								? 'success'
								: account.status === 'suspended'
									? 'danger'
									: 'warning'
						}">${esc(account.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Organization</p>
							<p class="ac-defs__desc">${esc(data.organization?.name || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Class</p>
							<p class="ac-defs__desc">${esc(data.class?.name || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student number</p>
							<p class="ac-defs__desc">${esc(account.numero || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${
								account.lastLogin ? esc(formatRelative(account.lastLogin)) : 'never'
							}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Account created</p>
							<p class="ac-defs__desc">${esc(
								formatDate(account.createdAt, { withTime: false }),
							)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Attempts (30d)</p>
							<p class="ac-defs__desc">${formatNumber(data.activity.attempts30d)}</p>
						</div>
					</div>
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${stat({
					label: 'Attempts (30d)',
					value: formatNumber(data.activity.attempts30d),
					note: `${formatNumber(data.activity.formalAttempts30d)} formal`,
					tooltip: 'Completed attempts of any mode inside the last 30 days.',
				})}
				${stat({
					label: 'Last sign-in',
					value: account.lastLogin ? esc(formatRelative(account.lastLogin)) : 'never',
					tone: account.lastLogin ? 'primary' : 'warning',
					tooltip: 'From the recorded authentication trail.',
				})}
				${stat({
					label: 'Permission overrides',
					value: formatNumber(data.permissionOverrides.length),
					note: data.permissionOverrides.length ? 'grants or denies on top of the role' : 'role baseline only',
					tone: data.permissionOverrides.length ? 'warning' : '',
					tooltip:
						'Individual permissions granted to, or denied from, this account on top of what its role carries.',
				})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Access</h2>
				<p class="ac-section__hint">The effective access of this account.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Permission overrides</h3>
						<p class="ac-panel__subtitle">Removing an override restores the role's baseline.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${
						data.permissionOverrides.length
							? renderTable({
									columns: [
										{ key: 'permission', label: 'Permission', render: (row) => `<code>${esc(row.permission)}</code>` },
										{
											key: 'effect',
											label: 'Effect',
											render: (row) =>
												`<span class="ac-badge ac-badge--${
													row.effect === 'grant' ? 'success' : 'danger'
												}">${esc(row.effect)}</span>`,
										},
										{
											key: 'scopeKey',
											label: 'Applies to',
											render: (row) => esc(row.scopeKey === '*' ? 'every scope' : row.scopeKey),
										},
										{ key: 'reason', label: 'Reason', render: (row) => esc(row.reason || '—') },
										{
											key: 'createdAt',
											label: 'Recorded',
											render: (row) => esc(formatDate(row.createdAt)),
										},
										{
											key: 'actions',
											label: '',
											className: 'ac-table__actions',
											render: (row) =>
												canManageRoles
													? `<button type="button" class="ac-btn ac-btn--sm" data-ac-remove-override="${esc(
															row.permission,
														)}">Remove</button>`
													: '',
										},
									],
									rows: data.permissionOverrides,
								})
							: emptyState({
									title: 'No overrides',
									message:
										'This account holds exactly the permissions its role carries. Nothing has been granted or denied on top.',
								})
					}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Recent activity</h2>
				<p class="ac-section__hint">The ten most recent recorded attempts, and the fifteen most recent actions.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Recent attempts</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${renderTable({
							columns: [
								{
									key: 'dateTaken',
									label: 'When',
									render: (row) => esc(formatDate(row.dateTaken)),
								},
								{ key: 'mode', label: 'Mode' },
								{
									key: 'score20',
									label: 'Score',
									align: 'right',
									render: (row) =>
										row.mode === 'exam'
											? `${row.score20.toFixed(2)} /20`
											: `${Math.round(row.score)}%`,
								},
							],
							rows: data.recentResults,
							empty: 'This account has no recorded attempt.',
						})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Administrative actions</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${renderTable({
							columns: [
								{
									key: 'occurredAt',
									label: 'When',
									render: (row) => esc(formatDate(row.occurredAt)),
								},
								{ key: 'action', label: 'Action' },
								{ key: 'entityType', label: 'Entity' },
								{
									key: 'outcome',
									label: 'Outcome',
									render: (row) =>
										`<span class="ac-badge ac-badge--${
											row.outcome === 'success' ? 'success' : 'warning'
										}">${esc(row.outcome)}</span>`,
								},
							],
							rows: data.recentActivity,
							empty: 'This account has performed no recorded administrative action.',
						})}
					</div>
				</section>
			</div>`;

		bindActions(host, ctx, userId, account, data);
	},
};

function bindActions(host, ctx, userId, account, data) {
	const toggle = host.querySelector('[data-ac-toggle-status]');
	if (toggle) {
		toggle.addEventListener('click', async () => {
			const suspending = account.status === 'active';
			const confirmed = await confirmDialog({
				title: suspending ? 'Suspend this account?' : 'Reactivate this account?',
				message: suspending
					? 'The account will not be able to sign in. Its data is retained.'
					: 'The account will be able to sign in again.',
				detail: 'The action is recorded in the audit trail and in the security event trail.',
				confirmLabel: suspending ? 'Suspend' : 'Reactivate',
				danger: suspending,
			});
			if (!confirmed) return;

			let reason = null;
			if (suspending) {
				reason = window.prompt('Reason for suspending (recorded in the audit trail):', '');
				if (reason === null) return;
			}
			try {
				await api.patch(`console/users/${encodeURIComponent(userId)}`, {
					status: suspending ? 'suspended' : 'active',
					reason: reason || null,
				});
				toast(suspending ? 'Account suspended.' : 'Account reactivated.', 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		});
	}

	const changeRole = host.querySelector('[data-ac-change-role]');
	if (changeRole) {
		changeRole.addEventListener('click', async () => {
			const roles = [
				{ value: 'admin', label: 'Organization administrator' },
				{ value: 'teacher', label: 'Teacher' },
				{ value: 'student', label: 'Student' },
			];
			const modal = openModal({
				title: 'Change the role of this account',
				subtitle: 'The change is recorded in the audit trail with the previous role.',
				body: `<div class="ac-field">
					<label class="ac-field__label" for="ac-new-role">New role</label>
					<select class="ac-select" id="ac-new-role">
						${roles
							.map(
								(role) =>
									`<option value="${role.value}"${
										role.value === account.role ? ' selected' : ''
									}>${role.label}</option>`,
							)
							.join('')}
					</select>
				</div>`,
				footer: `
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Change role</button>
				`,
			});
			modal.root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
			modal.root.querySelector('[data-ac-confirm]').addEventListener('click', async () => {
				const role = modal.root.querySelector('#ac-new-role').value;
				modal.close();
				try {
					await api.patch(`console/users/${encodeURIComponent(userId)}`, { role });
					toast('Role updated.', 'success');
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});
	}

	const grant = host.querySelector('[data-ac-grant]');
	if (grant) {
		grant.addEventListener('click', async () => {
			let catalog = [];
			try {
				const payload = await api.get('console/roles');
				catalog = (payload.catalog || []).flatMap((group) => group.permissions);
			} catch {
				toast('The permission catalog could not be loaded.', 'error');
				return;
			}
			const existing = new Set(data.permissionOverrides.map((row) => row.permission));

			const modal = openModal({
				title: 'Grant or deny a permission',
				subtitle:
					'Grants and denies sit on top of the role. A deny removes a permission the role carries.',
				body: `<div class="ac-field">
						<label class="ac-field__label" for="ac-permission">Permission</label>
						<select class="ac-select" id="ac-permission">
							${catalog
								.map(
									(entry) =>
										`<option value="${entry.id}"${
											existing.has(entry.id) ? ' disabled' : ''
										}>${entry.label} — ${entry.id}</option>`,
								)
								.join('')}
						</select>
					</div>
					<div class="ac-field" style="margin-top:12px">
						<label class="ac-field__label" for="ac-effect">Effect</label>
						<select class="ac-select" id="ac-effect">
							<option value="grant">Grant</option>
							<option value="deny">Deny</option>
						</select>
					</div>
					<div class="ac-field" style="margin-top:12px">
						<label class="ac-field__label" for="ac-override-reason">Reason</label>
						<input class="ac-input" id="ac-override-reason" type="text" placeholder="Why is this override needed?" />
					</div>`,
				footer: `
					<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
					<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Apply</button>
				`,
			});
			modal.root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
			modal.root.querySelector('[data-ac-confirm]').addEventListener('click', async () => {
				const permission = modal.root.querySelector('#ac-permission').value;
				const effect = modal.root.querySelector('#ac-effect').value;
				const reason = modal.root.querySelector('#ac-override-reason').value || null;
				modal.close();
				try {
					await api.post(`console/users/${encodeURIComponent(userId)}/permissions`, {
						permission,
						effect,
						reason,
					});
					toast('Permission override applied.', 'success');
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});
	}

	host.querySelectorAll('[data-ac-remove-override]').forEach((button) => {
		button.addEventListener('click', async () => {
			const permission = button.dataset.acRemoveOverride;
			const confirmed = await confirmDialog({
				title: 'Remove this override?',
				message: `The account returns to the permissions its role carries. "${permission}" is no longer individually granted or denied.`,
				confirmLabel: 'Remove override',
			});
			if (!confirmed) return;
			try {
				await api.del(
					`console/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(permission)}`,
				);
				toast('Override removed.', 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		});
	});

	const revoke = host.querySelector('[data-ac-revoke-sessions]');
	if (revoke) {
		revoke.addEventListener('click', async () => {
			const confirmed = await confirmDialog({
				title: 'Revoke every session of this account?',
				message:
					'All sign-ins of this account end immediately. The next sign-in starts a new session.',
				detail: 'The revocation is recorded in the security event trail.',
				confirmLabel: 'Revoke sessions',
				danger: true,
			});
			if (!confirmed) return;
			try {
				await api.del(`console/users/${encodeURIComponent(userId)}/sessions`);
				toast('Sessions revoked.', 'success');
			} catch (err) {
				toast(err.message, 'error');
			}
		});
	}
}
