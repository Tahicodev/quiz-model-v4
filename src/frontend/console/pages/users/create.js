/**
 * src/frontend/console/pages/users/create.js
 *
 * "Add an account" — the console's counterpart of the legacy administration
 * panel's user modal.
 *
 * The account is created inside the caller's organization. The password is
 * hashed with bcrypt on the server and is never returned to a browser.
 *
 * The roles are the three the platform knows. A platform administrator may
 * create an account in another organization; an organization administrator
 * always creates in their own.
 */

import { api } from '../../core/api.js';
import { toast, openModal } from '../../components/ui.js';
import { esc } from '../../viz/charts.js';

const ROLES = [
	{ value: 'student', label: 'Student' },
	{ value: 'teacher', label: 'Teacher' },
	{ value: 'admin', label: 'Administrator' },
	{ value: 'super_admin', label: 'Platform administrator' },
];

/**
 * Open the "add an account" dialog.
 *
 * @param {{ ctx:object, role?:string, onCreated?:(account:object)=>void }} options
 */
export function openCreateAccount({ ctx, role = 'student', onCreated = null }) {
	const isPlatform = Boolean(ctx?.isPlatform);
	// A roster may ask for several roles ("admin,super_admin"); the dialog
	// presumes the first one.
	const defaultRole = String(role || 'student').split(',')[0].trim() || 'student';
	const modal = openModal({
		title: 'Add an account',
		subtitle:
			'The account is created in your organization. The password is stored hashed and is never shown again.',
		body: `<div class="ac-field-grid">
				<label class="ac-field">
					<span class="ac-field__label">Full name</span>
					<input class="ac-input ac-input--full" id="ac-new-name" type="text" placeholder="e.g. Amina Berrada" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Username</span>
					<input class="ac-input ac-input--full" id="ac-new-username" type="text" placeholder="e.g. amina" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Role</span>
					<select class="ac-select ac-input--full" id="ac-new-role">
						${ROLES.map(
							(option) =>
								`<option value="${esc(option.value)}"${
									option.value === defaultRole ? ' selected' : ''
								}>${esc(option.label)}</option>`,
						).join('')}
					</select>
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Student number <small>(students)</small></span>
					<input class="ac-input ac-input--full" id="ac-new-numero" type="text" placeholder="optional" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Email</span>
					<input class="ac-input ac-input--full" id="ac-new-email" type="email" placeholder="optional" autocomplete="off" />
				</label>
				<label class="ac-field">
					<span class="ac-field__label">Phone</span>
					<input class="ac-input ac-input--full" id="ac-new-phone" type="tel" placeholder="optional" autocomplete="off" />
				</label>
				<label class="ac-field ac-field--full">
					<span class="ac-field__label">Password</span>
					<input class="ac-input ac-input--full" id="ac-new-password" type="text" autocomplete="off" placeholder="At least 8 characters" />
					<span class="ac-field__hint">Share it with the account holder through a channel you trust. It is shown here once and is never stored in clear text.</span>
				</label>
				${
					isPlatform
						? `<label class="ac-field ac-field--full">
					<span class="ac-field__label">Organization id</span>
					<input class="ac-input ac-input--full" id="ac-new-school" type="text" placeholder="Leave blank for your own organization" autocomplete="off" />
					<span class="ac-field__hint">A platform administrator can create an account in another organization by naming its id here.</span>
				</label>`
						: ''
				}
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Create the account</button>
		`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
	root.querySelector('[data-ac-confirm]').addEventListener('click', async () => {
		const read = (id) => root.querySelector(`#${id}`)?.value?.trim() ?? '';
		const name = read('ac-new-name');
		const username = read('ac-new-username');
		const password = read('ac-new-password');

		if (!name || !username) {
			toast('A name and a username are required.', 'error');
			return;
		}
		if (password.length < 8) {
			toast('The password must be at least 8 characters.', 'error');
			return;
		}

		const payload = {
			name,
			username,
			password,
			role: read('ac-new-role') || 'student',
		};
		const numero = read('ac-new-numero');
		const email = read('ac-new-email');
		const phone = read('ac-new-phone');
		if (numero) payload.numero = numero;
		if (email) payload.email = email;
		if (phone) payload.phone = phone;
		const schoolId = read('ac-new-school');
		if (schoolId) payload.school_id = schoolId;

		try {
			const result = await api.post('console/users', payload);
			modal.close();
			toast(`The account "${username}" was created.`, 'success');
			if (typeof onCreated === 'function') onCreated(result?.data);
			else if (ctx?.rerender) ctx.rerender();
		} catch (err) {
			toast(err.message, 'error');
		}
	});

	return modal;
}
