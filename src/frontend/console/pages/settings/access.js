/**
 * src/frontend/console/pages/settings/access.js
 *
 * Users & access — who can reach this platform, and what is waiting for a
 * decision.
 *
 * Ported from the legacy "Users" settings tab, which held three things:
 * the user management table, the pending imports, and the profile & account
 * requests. Here:
 *
 *   • the account management table became the Users & Access HUB and its
 *     three roster pages (teachers, students, administrators) — a table of
 *     every account with a search box was never usable
 *   • the pending imports stayed in the classroom surface (they are a
 *     teaching-time tool, not a governance one)
 *   • the profile and account requests moved HERE, because granting access
 *     is exactly what this page is about
 */

import { api } from '../../core/api.js';
import { renderTable } from '../../components/table.js';
import { stat } from '../../viz/charts.js';
import { toast } from '../../components/ui.js';
import { panel, escapeHtml, loadSettings } from './index.js';

export async function accessSection(ctx) {
	const [usersPayload, profilePayload, accountPayload] = await Promise.all([
		api.get('console/users?limit=500'),
		api.get('profile-requests?status=pending').catch(() => []),
		api.get('account-requests?status=pending').catch(() => []),
	]);

	const users = Array.isArray(usersPayload?.data) ? usersPayload.data : [];
	const profileRequests = Array.isArray(profilePayload) ? profilePayload : [];
	const accountRequests = Array.isArray(accountPayload) ? accountPayload : [];

	const count = (role) => users.filter((row) => row.role === role).length;
	const never = users.filter((row) => !row.lastLogin).length;
	const suspended = users.filter((row) => row.status === 'suspended').length;

	const markup = [
		panel({
			title: 'Users & access',
			subtitle: 'Who can reach this platform, and what they may do.',
			body: `<div class="ac-grid ac-grid--kpi" style="margin-bottom:16px">
					${stat({
						label: 'Teachers',
						value: String(count('teacher')),
						note: 'accounts',
					})}
					${stat({
						label: 'Students',
						value: String(count('student')),
						note: 'accounts',
					})}
					${stat({
						label: 'Administrators',
						value: String(count('admin') + count('super_admin')),
						note: 'accounts',
					})}
					${stat({
						label: 'Never signed in',
						value: String(never),
						note: 'provisioned, unused',
						tone: never > 0 ? 'warning' : '',
					})}
					${stat({
						label: 'Suspended',
						value: String(suspended),
						note: 'no access',
						tone: suspended > 0 ? 'warning' : '',
					})}
				</div>
				<div class="ac-quick-actions">
					<a class="ac-quick-action" href="#/users/teachers">Manage teachers</a>
					<a class="ac-quick-action" href="#/users/students">Manage students</a>
					<a class="ac-quick-action" href="#/users/administrators">Manage administrators</a>
					<a class="ac-quick-action" href="#/audit?stream=security">Review access events</a>
				</div>`,
		}),
		panel({
			title: 'Account requests',
			subtitle:
				'New accounts registered from a browser. They cannot sign in until a request is approved.',
			body: accountRequests.length
				? renderTable({
						columns: [
							{
								key: 'full_name',
								label: 'Requested account',
								render: (row) =>
									`<span class="ac-table__primary">${escapeHtml(row.full_name || '')}</span><br><span class="ac-table__muted">${escapeHtml(
										row.username || '',
									)}${row.student_number ? ` · #${escapeHtml(row.student_number)}` : ''}</span>`,
							},
							{
								key: 'class_name',
								label: 'Class',
								render: (row) => escapeHtml(row.class_name || '—'),
							},
							{
								key: 'note',
								label: 'Note',
								render: (row) => escapeHtml(row.note || '—'),
							},
							{
								key: 'actions',
								label: '',
								align: 'right',
								render: (row) =>
									`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-account="${escapeHtml(
										row.id,
									)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-account="${escapeHtml(
										row.id,
									)}">Reject</button>`,
							},
						],
						rows: accountRequests,
					})
				: '<p class="ac-empty__message">No account request is waiting.</p>',
		}),
		panel({
			title: 'Profile change requests',
			subtitle: 'A student asking for a correction to their record.',
			body: profileRequests.length
				? renderTable({
						columns: [
							{
								key: 'user_id',
								label: 'Account',
								render: (row) =>
									`<a href="#/users/${escapeHtml(row.user_id)}" class="ac-table__primary">${escapeHtml(
										row.user_id,
									)}</a>`,
							},
							{
								key: 'changes',
								label: 'Requested change',
								render: (row) => escapeHtml(describeChanges(row.changes_json)),
							},
							{
								key: 'note',
								label: 'Note',
								render: (row) => escapeHtml(row.note || '—'),
							},
							{
								key: 'actions',
								label: '',
								align: 'right',
								render: (row) =>
									`<button type="button" class="ac-btn ac-btn--sm" data-ac-approve-profile="${escapeHtml(
										row.id,
									)}">Approve</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-reject-profile="${escapeHtml(
										row.id,
									)}">Reject</button>`,
							},
						],
						rows: profileRequests,
					})
				: '<p class="ac-empty__message">No profile change request is waiting.</p>',
		}),
	].join('');

	function bind(root) {
		const review = async (path, id, approve, label) => {
			try {
				await api.post(`${path}/${encodeURIComponent(id)}/${approve ? 'approve' : 'reject'}`, {
					note: null,
				});
				toast(`${label} ${approve ? 'approved' : 'rejected'}.`, 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		};

		root.querySelectorAll('[data-ac-approve-account]').forEach((button) => {
			button.addEventListener('click', () =>
				review('account-requests', button.dataset.acApproveAccount, true, 'The request was'),
			);
		});
		root.querySelectorAll('[data-ac-reject-account]').forEach((button) => {
			button.addEventListener('click', () =>
				review('account-requests', button.dataset.acRejectAccount, false, 'The request was'),
			);
		});
		root.querySelectorAll('[data-ac-approve-profile]').forEach((button) => {
			button.addEventListener('click', () =>
				review('profile-requests', button.dataset.acApproveProfile, true, 'The request was'),
			);
		});
		root.querySelectorAll('[data-ac-reject-profile]').forEach((button) => {
			button.addEventListener('click', () =>
				review('profile-requests', button.dataset.acRejectProfile, false, 'The request was'),
			);
		});
	}

	return { markup, bind };
}

/** Render a profile-request diff as readable text. */
function describeChanges(json) {
	if (!json) return '—';
	try {
		const changes = typeof json === 'string' ? JSON.parse(json) : json;
		const entries = Object.entries(changes || {});
		if (!entries.length) return '—';
		return entries.map(([key, value]) => `${key}: ${value}`).join(' · ');
	} catch {
		return String(json);
	}
}
