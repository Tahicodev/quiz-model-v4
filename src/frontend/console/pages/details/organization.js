/**
 * src/frontend/console/pages/details/organization.js
 *
 * Organization detail.
 *
 * The administrative question here is "what is this organization, who runs
 * it, how is it using the platform, and what has been done to it?" — not the
 * pedagogical questions its teachers ask.
 */

import { api } from '../../core/api.js';
import { esc, stat, barChart } from '../../viz/charts.js';
import { renderTable } from '../../components/table.js';
import { loadingBlock, errorState, emptyState } from '../../components/states.js';
import { formatNumber, formatDate, formatRelative, confirmDialog, toast } from '../../components/ui.js';

export const organizationDetailPage = {
	id: 'organization-detail',
	path: '/organizations/:id',
	title: 'Organization',
	description: 'Profile, accounts, usage, activity and administrative history.',
	permission: ['platform.organizations.read', 'school.profile.read'],
	async render(host, ctx, route) {
		const schoolId = route.params?.id;
		host.innerHTML = `<div class="ac-stack" data-ac-org-detail>${loadingBlock(4)}</div>`;

		let data;
		try {
			const payload = await api.get(`console/organizations/${encodeURIComponent(schoolId)}`);
			data = payload.data;
		} catch (err) {
			host.innerHTML = errorState({
				title: 'This organization could not be loaded',
				message: err.message,
			});
			return;
		}

		const org = data.organization;
		const usage = data.usage;
		const canManage =
			ctx.isPlatform ||
			(ctx.session.permissions || []).includes('school.profile.manage');

		ctx.setTitle(
			org.name,
			`${org.slug} · ${org.schoolType || 'organization'}${
				org.schoolYear ? ` · academic year ${org.schoolYear}` : ''
			}`,
		);

		host.innerHTML = `
			<div class="ac-toolbar">
				<a class="ac-btn" href="#/organizations">← All organizations</a>
				<span style="flex:1"></span>
				${
					canManage
						? `<button type="button" class="ac-btn" data-ac-toggle-status>${
								org.status === 'suspended'
									? 'Reactivate organization'
									: 'Suspend organization'
							}</button>`
						: ''
				}
			</div>

			<div class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">${esc(org.name)}</h3>
						<p class="ac-panel__subtitle">${esc(org.slug)} · ${esc(
							org.schoolType || '—',
						)}${org.schoolYear ? ` · academic year ${esc(org.schoolYear)}` : ''}</p>
					</div>
					<div class="ac-panel__actions">
						<span class="ac-badge ${
							org.status === 'active'
								? 'ac-badge--success'
								: org.status === 'pending'
									? 'ac-badge--warning'
									: 'ac-badge--danger'
						}">${esc(org.status)}</span>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${esc(org.plan || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">City</p>
							<p class="ac-defs__desc">${esc(org.city || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Contact</p>
							<p class="ac-defs__desc">${esc(org.email || org.phone || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Created</p>
							<p class="ac-defs__desc">${esc(formatDate(org.createdAt, { withTime: false }))}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last activity</p>
							<p class="ac-defs__desc">${
								usage.lastActivity ? esc(formatRelative(usage.lastActivity)) : 'never'
							}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${esc(String(org.maxStudents ?? '—'))}</p>
						</div>
					</div>
					${
						org.status === 'suspended'
							? `<div class="ac-alert ac-alert--danger" style="margin-top:16px">
								<div class="ac-alert__body">
									<p class="ac-alert__title">Access is suspended</p>
									<p class="ac-alert__text">${
										org.suspendedReason ? esc(org.suspendedReason) : 'No reason was recorded.'
									} · suspended ${esc(formatDate(org.suspendedAt))}</p>
								</div>
							</div>`
							: ''
					}
				</div>
			</div>

			<div class="ac-grid ac-grid--kpi" style="margin-top:16px">
				${stat({
					label: 'Teachers',
					value: formatNumber(usage.teachers),
					note: `${formatNumber(usage.activeTeachers)} active in 30 days`,
					tone: 'primary',
					tooltip: 'Teacher accounts, and how many produced a recorded event in the last 30 days.',
				})}
				${stat({
					label: 'Students',
					value: formatNumber(usage.students),
					note: `${formatNumber(usage.activeStudents)} active in 30 days`,
					tone: 'primary',
					tooltip: 'Student accounts, and how many produced a recorded event in the last 30 days.',
				})}
				${stat({
					label: 'Attempts (30d)',
					value: formatNumber(usage.attempts30d),
					note: `${formatNumber(usage.formalAttempts30d)} formal`,
					tooltip: 'Completed attempts of any mode inside the last 30 days.',
				})}
				${stat({
					label: 'Content',
					value: formatNumber(usage.questions + usage.exams),
					note: `${formatNumber(usage.questions)} questions · ${formatNumber(
						usage.exams,
					)} exams`,
					tooltip: 'Rows that exist in this organization. These are totals, not period counts.',
				})}
				${stat({
					label: 'Needs attention',
					value: formatNumber(usage.suspendedAccounts + usage.pendingRequests),
					note: `${formatNumber(usage.suspendedAccounts)} suspended · ${formatNumber(
						usage.pendingRequests,
					)} pending`,
					tone: usage.suspendedAccounts + usage.pendingRequests > 0 ? 'warning' : '',
					tooltip: 'Suspended accounts and account requests awaiting a decision.',
				})}
			</div>

			<div class="ac-grid ac-grid--2" style="margin-top:16px">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Administrators</h3>
							<p class="ac-panel__subtitle">The accounts that can administer this organization.</p>
						</div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${renderTable({
							columns: [
								{
									key: 'name',
									label: 'Account',
									render: (row) =>
										`<a href="#/users/${row.id}" class="ac-table__primary">${esc(
											row.name,
										)}</a><br><span class="ac-table__muted">${esc(row.username)}</span>`,
								},
								{
									key: 'status',
									label: 'Status',
									render: (row) =>
										`<span class="ac-badge ac-badge--${
											row.status === 'active' ? 'success' : 'warning'
										}">${esc(row.status)}</span>`,
								},
								{
									key: 'lastLogin',
									label: 'Last sign-in',
									render: (row) =>
										row.lastLogin ? esc(formatRelative(row.lastLogin)) : 'never',
								},
							],
							rows: data.administrators,
							empty: 'This organization has no administrator account.',
						})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Classes</h3>
							<p class="ac-panel__subtitle">The organizational structure of this organization.</p>
						</div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${renderTable({
							columns: [
								{ key: 'name', label: 'Class', render: (row) => `<span class="ac-table__primary">${esc(row.name)}</span>` },
								{ key: 'studentCount', label: 'Students', align: 'right' },
								{
									key: 'createdAt',
									label: 'Created',
									render: (row) => esc(formatDate(row.createdAt, { withTime: false })),
								},
							],
							rows: data.classes,
							empty: 'No class has been created in this organization.',
						})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Accounts</h2>
				<p class="ac-section__hint">Teachers and students of this organization, with their recent activity.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Teachers</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${renderTable({
							columns: [
								{
									key: 'name',
									label: 'Teacher',
									render: (row) =>
										`<a href="#/users/${row.id}" class="ac-table__primary">${esc(
											row.name,
										)}</a>`,
								},
								{
									key: 'active',
									label: 'Active (30d)',
									render: (row) =>
										row.active
											? '<span class="ac-badge ac-badge--success">yes</span>'
											: '<span class="ac-badge ac-badge--warning">no</span>',
								},
								{
									key: 'lastLogin',
									label: 'Last sign-in',
									render: (row) =>
										row.lastLogin ? esc(formatRelative(row.lastLogin)) : 'never',
								},
							],
							rows: data.teachers,
							empty: 'No teacher account in this organization.',
						})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Students</h3></div>
					</div>
					<div class="ac-panel__body ac-panel__body--flush">
						${renderTable({
							columns: [
								{
									key: 'name',
									label: 'Student',
									render: (row) =>
										`<a href="#/users/${row.id}" class="ac-table__primary">${esc(
											row.name,
										)}</a>`,
								},
								{
									key: 'active',
									label: 'Active (30d)',
									render: (row) =>
										row.active
											? '<span class="ac-badge ac-badge--success">yes</span>'
											: '<span class="ac-badge ac-badge--warning">no</span>',
								},
								{
									key: 'lastLogin',
									label: 'Last sign-in',
									render: (row) =>
										row.lastLogin ? esc(formatRelative(row.lastLogin)) : 'never',
								},
							],
							rows: data.students,
							empty: 'No student account in this organization.',
						})}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Administrative history</h2>
				<p class="ac-section__hint">The fifteen most recent recorded actions inside this organization.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__body ac-panel__body--flush">
					${renderTable({
						columns: [
							{
								key: 'occurredAt',
								label: 'When',
								render: (row) => esc(formatDate(row.occurredAt)),
							},
							{
								key: 'actorName',
								label: 'Actor',
								render: (row) => esc(row.actorName || 'system'),
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
						empty: 'No administrative action has been recorded for this organization.',
					})}
				</div>
			</section>`;

		const toggle = host.querySelector('[data-ac-toggle-status]');
		if (toggle) {
			toggle.addEventListener('click', async () => {
				const suspending = org.status !== 'suspended';
				const confirmed = await confirmDialog({
					title: suspending ? 'Suspend this organization?' : 'Reactivate this organization?',
					message: suspending
						? 'Suspending revokes access for every account in this organization. Their data is retained.'
						: 'Reactivating restores access for the accounts that were suspended with the organization.',
					detail: suspending
						? 'The action is recorded in the audit trail with the reason you give.'
						: '',
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
					await api.patch(`console/organizations/${encodeURIComponent(schoolId)}`, {
						status: suspending ? 'suspended' : 'active',
						reason: reason || null,
					});
					toast(
						suspending ? 'Organization suspended.' : 'Organization reactivated.',
						'success',
					);
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		}
	},
};
