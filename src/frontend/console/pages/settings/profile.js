/**
 * src/frontend/console/pages/settings/profile.js
 *
 * My profile — the signed-in user's own account.
 *
 * Ported from the legacy "My Profile" settings tab. The fields are the same
 * records; the role, the status and the class assignments are deliberately
 * NOT editable here — they belong to an administrator, and the console's
 * account page is where they are managed.
 *
 * The password change is a separate action because it is a different kind of
 * operation: it proves the current credential and revokes the other sessions.
 */

import { api } from '../../core/api.js';
import { toast } from '../../components/ui.js';
import { panel, field, select, escapeHtml } from './index.js';

const TITLES = [
	{ value: '', label: '—' },
	{ value: 'Mr', label: 'Mr' },
	{ value: 'Mme', label: 'Mme' },
	{ value: 'Mlle', label: 'Mlle' },
	{ value: 'Dr', label: 'Dr' },
];

export async function profileSection(ctx) {
	const session = ctx.session || {};
	const user = session.user || {};

	const markup = [
		panel({
			title: 'My profile',
			subtitle:
				'Your own account information. The role, the status and the class assignments are managed by an administrator.',
			body: `<div class="ac-field-grid">
					${select({
						id: 'set-profile-title',
						label: 'Title',
						options: TITLES,
						value: user.title ?? '',
					})}
					${field({
						id: 'set-profile-name',
						label: 'Full name',
						value: user.name ?? '',
					})}
					${field({
						id: 'set-profile-email',
						label: 'Email',
						value: user.email ?? '',
						type: 'email',
					})}
					${field({
						id: 'set-profile-phone',
						label: 'Phone',
						value: user.phone ?? '',
						type: 'tel',
					})}
				</div>
				<div class="ac-defs" style="margin-bottom:14px">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Username</p>
						<p class="ac-defs__desc">${escapeHtml(user.username || '—')}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${escapeHtml(user.roleLabel || user.role || '—')}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization</p>
						<p class="ac-defs__desc">${escapeHtml(
							ctx.organization?.name || user.schoolName || '—',
						)}</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-profile>Save profile</button>
						<span class="ac-table__muted" data-ac-profile-status></span>
					</div>
				</div>`,
		}),
		panel({
			title: 'Change my password',
			subtitle:
				'The current password is required. Every other session of this account ends when the password changes.',
			body: `<div class="ac-field-grid">
					${field({
						id: 'set-profile-current',
						label: 'Current password',
						type: 'password',
						full: true,
					})}
					${field({
						id: 'set-profile-new',
						label: 'New password',
						type: 'password',
						hint: 'At least 8 characters.',
					})}
					${field({
						id: 'set-profile-confirm',
						label: 'Confirm new password',
						type: 'password',
					})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-change-password>Update password</button>
						<span class="ac-table__muted" data-ac-password-status></span>
					</div>
				</div>`,
		}),
	].join('');

	function bind(root) {
		root.querySelector('[data-ac-save-profile]')?.addEventListener('click', async () => {
			const el = root.querySelector('[data-ac-profile-status]');
			const read = (id) => root.querySelector(`#${id}`)?.value ?? '';
			try {
				await api.patch('users/me', {
					title: read('set-profile-title'),
					name: read('set-profile-name'),
					email: read('set-profile-email'),
					phone: read('set-profile-phone'),
				});
				if (el) el.textContent = 'Saved.';
				toast('Profile saved.', 'success');
			} catch (err) {
				if (el) el.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		root.querySelector('[data-ac-change-password]')?.addEventListener('click', async () => {
			const el = root.querySelector('[data-ac-password-status]');
			const current = root.querySelector('#set-profile-current')?.value ?? '';
			const next = root.querySelector('#set-profile-new')?.value ?? '';
			const confirm = root.querySelector('#set-profile-confirm')?.value ?? '';
			if (!current || !next) {
				toast('The current and the new password are both required.', 'error');
				return;
			}
			if (next !== confirm) {
				toast('The two new passwords do not match.', 'error');
				return;
			}
			if (next.length < 8) {
				toast('The new password must be at least 8 characters.', 'error');
				return;
			}
			try {
				await api.post('auth/change-password', {
					oldPassword: current,
					newPassword: next,
				});
				root.querySelector('#set-profile-current').value = '';
				root.querySelector('#set-profile-new').value = '';
				root.querySelector('#set-profile-confirm').value = '';
				if (el) el.textContent = 'The password was changed.';
				toast('Password changed. Your other sessions were signed out.', 'success');
			} catch (err) {
				if (el) el.textContent = err.message;
				toast(err.message, 'error');
			}
		});
	}

	return { markup, bind };
}
