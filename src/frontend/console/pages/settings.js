/**
 * src/frontend/console/pages/settings.js
 *
 * Platform Settings — the access model and the configuration the console
 * governs.
 *
 * Two parts:
 *   1. The role & permission catalog — what the platform actually enforces,
 *      read from the server so it can never drift from the code.
 *   2. The scope of the current session — what this administrator can reach,
 *      and what they cannot.
 *
 * There is deliberately NO billing, subscription or quota management here:
 * the business model does not support it yet. `School.plan` and
 * `School.max_students` are shown as OBSERVED configuration, and nothing is
 * enforced from them.
 */

import { api } from '../core/api.js';
import { esc, stat } from '../viz/charts.js';
import { renderTable } from '../components/table.js';
import { loadingBlock, errorState } from '../components/states.js';
import { formatDate } from '../components/ui.js';

export const settingsPage = {
	id: 'settings',
	path: '/settings',
	title: 'Platform Settings',
	description:
		'The access model the platform enforces, and the scope of this administration session.',
	permission: ['platform.settings.manage', 'school.settings.manage'],
	async render(host, ctx) {
		host.innerHTML = `<div data-ac-settings><div class="ac-skeleton-stack" aria-busy="true">
			<div class="ac-skeleton" style="width:50%"></div>
			<div class="ac-skeleton" style="width:100%"></div>
		</div></div>`;

		let payload;
		try {
			payload = await api.get('console/roles');
		} catch (err) {
			host.querySelector('[data-ac-settings]').innerHTML = errorState({ message: err.message });
			return;
		}

		const roles = payload.roles || [];
		const catalog = payload.catalog || [];
		const organization = ctx.organization;

		host.querySelector('[data-ac-settings]').innerHTML = `
			<div class="ac-grid ac-grid--kpi">
				${stat({
					label: 'Roles',
					value: String(roles.length),
					note: 'system roles',
					tooltip: 'The role catalog. Roles are fixed by the application; permissions can be granted or denied per user.',
				})}
				${stat({
					label: 'Permissions',
					value: String(
						catalog.reduce((sum, group) => sum + group.permissions.length, 0),
					),
					note: `${catalog.length} groups`,
					tooltip: 'The permission catalog, grouped by scope.',
				})}
				${stat({
					label: 'Your scope',
					value: ctx.isPlatform ? 'Platform' : 'Organization',
					note: ctx.isPlatform ? 'every organization' : organization?.name || '',
					tone: ctx.isPlatform ? 'primary' : '',
					tooltip:
						'The slice of the platform this session can reach. A platform administrator sees every organization; an organization administrator sees only their own.',
				})}
				${stat({
					label: 'Your permissions',
					value: String(ctx.session.permissions?.length || 0),
					note: 'effective for this session',
					tooltip:
						'The permissions the server granted this session, after applying any per-user grants or denies.',
				})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">This session</h2>
				<p class="ac-section__hint">What this administrator is, and what they can reach.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Session scope</h3>
						<p class="ac-panel__subtitle">The scope is decided by the server from the signed token. A query parameter can narrow a platform session; it can never widen it.</p>
					</div>
				</div>
				<div class="ac-panel__body">
					<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Signed in as</p>
							<p class="ac-defs__desc">${esc(ctx.session.user.name)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Role</p>
							<p class="ac-defs__desc">${esc(ctx.session.user.roleLabel)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Scope</p>
							<p class="ac-defs__desc">${esc(
								ctx.isPlatform ? 'Every organization' : organization?.name || '—',
							)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Organization status</p>
							<p class="ac-defs__desc">${esc(organization?.status || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Plan</p>
							<p class="ac-defs__desc">${esc(organization?.plan || '—')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Student capacity</p>
							<p class="ac-defs__desc">${esc(
								organization?.maxStudents != null
									? String(organization.maxStudents)
									: '—',
							)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Academic year</p>
							<p class="ac-defs__desc">${esc(organization?.schoolYear || 'not set')}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Last sign-in</p>
							<p class="ac-defs__desc">${esc(formatDate(ctx.session.user.lastLogin))}</p>
						</div>
					</div>
					<div class="ac-alert ac-alert--info" style="margin-top:16px">
						<div class="ac-alert__body">
							<p class="ac-alert__title">Plan and capacity are observed, not enforced</p>
							<p class="ac-alert__text">The business model does not support subscriptions or quotas yet. The plan and the student capacity recorded on the organization are displayed for information only — no entitlement is derived from them.</p>
						</div>
					</div>
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Access model</h2>
				<p class="ac-section__hint">The roles the platform enforces and the permissions each carries.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Roles</h3>
						<p class="ac-panel__subtitle">System roles are defined by the application and cannot be edited here.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${renderTable({
						columns: [
							{
								key: 'label',
								label: 'Role',
								render: (row) =>
									`<span class="ac-table__primary">${esc(row.label)}</span><br><span class="ac-table__muted">${esc(
										row.description || '',
									)}</span>`,
							},
							{ key: 'key', label: 'Key', render: (row) => `<code>${esc(row.key)}</code>` },
							{
								key: 'scopeLabel',
								label: 'Scope',
								render: (row) => `<span class="ac-badge">${esc(row.scopeLabel)}</span>`,
							},
							{
								key: 'permissions',
								label: 'Permissions',
								align: 'right',
								render: (row) => String(row.permissions.length),
							},
							{
								key: 'isAssignable',
								label: 'Assignable',
								render: (row) =>
									row.isAssignable
										? '<span class="ac-badge ac-badge--success">yes</span>'
										: '<span class="ac-badge">no</span>',
							},
						],
						rows: roles,
						empty: 'The role catalog is empty.',
					})}
				</div>
			</section>

			${catalog
				.map(
					(group) => `
				<div class="ac-section">
					<h2 class="ac-section__title">${esc(group.group)} permissions</h2>
					<p class="ac-section__hint">Scope: ${esc(group.scope || '—')}</p>
				</div>
				<section class="ac-panel">
					<div class="ac-panel__body ac-panel__body--flush">
						${renderTable({
							columns: [
								{
									key: 'label',
									label: 'Permission',
									render: (row) =>
										`<span class="ac-table__primary">${esc(row.label)}</span><br><span class="ac-table__muted">${esc(
											row.description || '',
										)}</span>`,
								},
								{ key: 'id', label: 'Identifier', render: (row) => `<code>${esc(row.id)}</code>` },
								{
									key: 'scope',
									label: 'Scope',
									render: (row) => `<span class="ac-badge">${esc(row.scope || '—')}</span>`,
								},
							],
							rows: group.permissions,
							empty: 'No permission in this group.',
						})}
					</div>
				</section>`,
				)
				.join('')}`;
	},
};
