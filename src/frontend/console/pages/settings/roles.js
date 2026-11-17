/**
 * src/frontend/console/pages/settings/roles.js
 *
 * Roles & permissions — the access model the platform enforces.
 *
 * The catalog is READ, not written: the roles are the code's enforcement
 * default and the permission catalog is the contract. What an administrator
 * changes is the per-account override, and that lives on the account page
 * (`#/users/:id`), where it is scoped to one person.
 */

import { api } from '../../core/api.js';
import { renderTable } from '../../components/table.js';
import { panel, escapeHtml } from './index.js';

export async function rolesSection() {
	const payload = await api.get('console/roles');
	const roles = payload.roles || [];
	const catalog = payload.catalog || [];

	const markup = [
		panel({
			title: 'Roles',
			subtitle: 'The roles the platform knows, and what each one may do.',
			body: renderTable({
				columns: [
					{
						key: 'label',
						label: 'Role',
						render: (row) =>
							`<span class="ac-table__primary">${escapeHtml(row.label)}</span><br><span class="ac-table__muted">${escapeHtml(
								row.description || '',
							)}</span>`,
					},
					{ key: 'key', label: 'Key', render: (row) => `<code>${escapeHtml(row.key)}</code>` },
					{
						key: 'scopeLabel',
						label: 'Scope',
						render: (row) => `<span class="ac-badge">${escapeHtml(row.scopeLabel)}</span>`,
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
							`<span class="ac-badge ac-badge--${row.isAssignable ? 'success' : ''}">${
								row.isAssignable ? 'yes' : 'no'
							}</span>`,
					},
				],
				rows: roles,
			}),
		}),
		panel({
			title: 'Permission catalog',
			subtitle: 'Every capability, grouped by the scope it applies in.',
			body: catalog
				.map(
					(group) => `<h4 class="ac-section-panel__title" style="margin:14px 0 6px">${escapeHtml(
						group.group,
					)}</h4>${renderTable({
						columns: [
							{
								key: 'label',
								label: 'Permission',
								render: (row) =>
									`<span class="ac-table__primary">${escapeHtml(row.label)}</span><br><span class="ac-table__muted">${escapeHtml(
										row.description || '',
									)}</span>`,
							},
							{ key: 'id', label: 'Identifier', render: (row) => `<code>${escapeHtml(row.id)}</code>` },
						],
						rows: group.permissions,
					})}`,
				)
				.join(''),
		}),
	].join('');

	return { markup, bind: null };
}
