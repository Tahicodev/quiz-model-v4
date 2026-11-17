/**
 * src/frontend/console/pages/organizations/forms.js
 *
 * The organization dialogs: create, edit and delete.
 *
 * They live here rather than in the page so that the list page and the
 * detail page offer the same operation with the same fields and the same
 * confirmation.
 */

import { api } from '../../core/api.js';
import { toast, openModal, confirmDialog } from '../../components/ui.js';
import { field, select, escapeHtml } from '../../components/form.js';

const SCHOOL_TYPES = [
	{ value: 'primaire', label: 'Primaire (Primary)' },
	{ value: 'college', label: 'Collège (Middle School)' },
	{ value: 'lycee', label: 'Lycée (High School)' },
	{ value: 'autre', label: 'Autre (Other)' },
];

const PLANS = [
	{ value: 'free', label: 'Free' },
	{ value: 'pro', label: 'Pro' },
	{ value: 'enterprise', label: 'Enterprise' },
];

/**
 * Create an organization.
 *
 * The new organization starts as `pending`: provisioned, but not able to
 * sign in until it is activated. Onboarding is therefore never half-live.
 */
export function openCreateOrganization({ onCreated = null } = {}) {
	const modal = openModal({
		title: 'Add an organization',
		subtitle:
			'The organization is created as "pending": it is provisioned, but it cannot sign in until you activate it.',
		body: `<div class="ac-field-grid">
				${field({
					id: 'ac-org-new-name',
					label: 'Name',
					placeholder: 'Lycée Al Khawarizmi',
					full: true,
				})}
				${field({
					id: 'ac-org-new-slug',
					label: 'Slug',
					placeholder: 'derived from the name',
					hint: 'A unique identifier. Leave it blank to derive it from the name.',
					full: true,
				})}
				${select({
					id: 'ac-org-new-type',
					label: 'Type',
					options: SCHOOL_TYPES,
					value: 'primaire',
				})}
				${select({
					id: 'ac-org-new-plan',
					label: 'Plan',
					options: PLANS,
					value: 'free',
				})}
				${field({
					id: 'ac-org-new-year',
					label: 'Academic year',
					placeholder: '2025-2026',
				})}
				${field({
					id: 'ac-org-new-capacity',
					label: 'Student capacity',
					type: 'number',
					value: '100',
					hint: 'Recorded for information; no entitlement is derived from it yet.',
				})}
				${field({ id: 'ac-org-new-city', label: 'City' })}
				${field({ id: 'ac-org-new-email', label: 'Email', type: 'email' })}
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Create the organization</button>
		`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
	root.querySelector('[data-ac-confirm]').addEventListener('click', async () => {
		const read = (id) => root.querySelector(`#${id}`)?.value?.trim() ?? '';
		const name = read('ac-org-new-name');
		if (!name) {
			toast('The organization needs a name.', 'error');
			return;
		}
		try {
			const result = await api.post('console/organizations', {
				name,
				slug: read('ac-org-new-slug') || undefined,
				school_type: read('ac-org-new-type'),
				plan: read('ac-org-new-plan'),
				school_year: read('ac-org-new-year') || undefined,
				max_students: Number(read('ac-org-new-capacity')) || 100,
				city: read('ac-org-new-city') || undefined,
				email: read('ac-org-new-email') || undefined,
			});
			modal.close();
			toast('The organization was created. It is pending until you activate it.', 'success');
			if (typeof onCreated === 'function') onCreated(result?.data);
		} catch (err) {
			toast(err.message, 'error');
		}
	});

	return modal;
}

/**
 * Edit an organization's profile.
 *
 * @param {object} organization the row, as the console reads it
 */
export function openEditOrganization(organization, { onSaved = null } = {}) {
	const modal = openModal({
		title: `Edit "${organization.name}"`,
		subtitle: 'The profile of the organization. The slug is its unique identifier and is not changed here.',
		wide: true,
		body: `<div class="ac-field-grid">
				${field({ id: 'ac-org-edit-name', label: 'Name', value: organization.name, full: true })}
				${select({
					id: 'ac-org-edit-type',
					label: 'Type',
					options: SCHOOL_TYPES,
					value: organization.schoolType || organization.school_type || 'primaire',
				})}
				${select({
					id: 'ac-org-edit-plan',
					label: 'Plan',
					options: PLANS,
					value: organization.plan || 'free',
				})}
				${field({
					id: 'ac-org-edit-year',
					label: 'Academic year',
					value: organization.schoolYear || organization.school_year || '',
				})}
				${field({
					id: 'ac-org-edit-capacity',
					label: 'Student capacity',
					type: 'number',
					value: String(organization.maxStudents ?? organization.max_students ?? 100),
				})}
				${field({ id: 'ac-org-edit-city', label: 'City', value: organization.city || '' })}
				${field({ id: 'ac-org-edit-phone', label: 'Phone', value: organization.phone || '' })}
				${field({ id: 'ac-org-edit-email', label: 'Email', value: organization.email || '' })}
				${field({
					id: 'ac-org-edit-address',
					label: 'Address',
					value: organization.address || '',
					full: true,
				})}
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Save the profile</button>
		`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
	root.querySelector('[data-ac-confirm]').addEventListener('click', async () => {
		const read = (id) => root.querySelector(`#${id}`)?.value?.trim() ?? '';
		try {
			await api.patch(`console/organizations/${encodeURIComponent(organization.id)}`, {
				profile: {
					name: read('ac-org-edit-name'),
					school_type: read('ac-org-edit-type'),
					plan: read('ac-org-edit-plan'),
					school_year: read('ac-org-edit-year') || null,
					max_students: Number(read('ac-org-edit-capacity')) || 100,
					city: read('ac-org-edit-city') || null,
					phone: read('ac-org-edit-phone') || null,
					email: read('ac-org-edit-email') || null,
					address: read('ac-org-edit-address') || null,
				},
			});
			modal.close();
			toast('The organization profile was saved.', 'success');
			if (typeof onSaved === 'function') onSaved();
		} catch (err) {
			toast(err.message, 'error');
		}
	});

	return modal;
}

/**
 * Delete an organization and everything in it.
 */
export async function confirmDeleteOrganization(organization, { onDeleted = null } = {}) {
	const confirmed = await confirmDialog({
		title: `Delete "${organization.name}"?`,
		message:
			'The organization is removed together with every account, class, question, exam, result and generated document it owns. This cannot be undone. Suspending the organization instead keeps everything and ends the access.',
		detail: 'Type DELETE on the confirmation to go ahead.',
		confirmLabel: 'Delete the organization',
		danger: true,
	});
	if (!confirmed) return false;

	try {
		await api.del(`console/organizations/${encodeURIComponent(organization.id)}`, {
			confirm: 'DELETE',
		});
		toast('The organization was deleted.', 'success');
		if (typeof onDeleted === 'function') onDeleted();
		return true;
	} catch (err) {
		toast(err.message, 'error');
		return false;
	}
}

/**
 * Suspend or reactivate an organization.
 */
export async function toggleOrganizationStatus(organization, { onChanged = null } = {}) {
	const suspending = organization.status !== 'suspended';
	const confirmed = await confirmDialog({
		title: suspending
			? `Suspend "${organization.name}"?`
			: `Reactivate "${organization.name}"?`,
		message: suspending
			? 'Nobody in the organization can sign in until it is restored. Nothing is deleted, and the administrator of the organization can still reach the console to reactivate it.'
			: 'The organization can sign in again immediately.',
		confirmLabel: suspending ? 'Suspend the organization' : 'Reactivate the organization',
		danger: suspending,
	});
	if (!confirmed) return false;
	try {
		await api.patch(`console/organizations/${encodeURIComponent(organization.id)}`, {
			status: suspending ? 'suspended' : 'active',
			reason: suspending ? 'Suspended from the console' : 'Reactivated from the console',
		});
		toast(suspending ? 'The organization was suspended.' : 'The organization was reactivated.', 'success');
		if (typeof onChanged === 'function') onChanged();
		return true;
	} catch (err) {
		toast(err.message, 'error');
		return false;
	}
}
