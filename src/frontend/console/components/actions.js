/**
 * src/frontend/console/components/actions.js
 *
 * The row-action strip.
 *
 * Every list in the console that holds a RECORD — an account, an
 * organization — offers the same set of actions on that record, in the same
 * place, in the same order. A table where one row can be edited and another
 * cannot is a table nobody trusts.
 *
 * The buttons are rendered by the page and wired by `bindRowActions`, which
 * delegates the clicks: a page with fifty rows binds ONE listener.
 */

/**
 * Render the action strip for one row.
 *
 * @param {Array<{id:string,label:string,value?:string,title?:string,
 *                tone?:'primary'|'danger'|'ghost',hidden?:boolean}>} actions
 * @returns {string} markup
 */
export function rowActions(actions = []) {
	const buttons = actions
		.filter((action) => !action.hidden)
		.map(
			(action) =>
				`<button type="button" class="ac-btn ac-btn--sm${
					action.tone ? ` ac-btn--${action.tone}` : ''
				}" data-ac-action="${escapeAttr(action.id)}" data-ac-action-value="${escapeAttr(
					action.value ?? '',
				)}" title="${escapeAttr(action.title || action.label)}">${escapeAttr(action.label)}</button>`,
		)
		.join('');
	return `<div class="ac-row-actions">${buttons}</div>`;
}

/**
 * Bind the action strip. One delegated listener per table.
 *
 * @param {HTMLElement} root
 * @param {Record<string,(value:string, button:HTMLElement)=>void>} handlers
 */
export function bindRowActions(root, handlers = {}) {
	root.addEventListener('click', (event) => {
		const button = event.target.closest('[data-ac-action]');
		if (!button || !root.contains(button)) return;
		// The row itself is a link; a click on an action must not follow it.
		event.preventDefault();
		event.stopPropagation();
		const handler = handlers[button.dataset.acAction];
		if (handler) handler(button.dataset.acActionValue, button);
	});
}

/** The actions every account row offers. */
export function accountActions(account, { canManage = true, canDelete = true } = {}) {
	const actions = [
		{ id: 'open', label: 'Open', value: account.id, title: 'Open the account' },
	];
	if (canManage) {
		actions.push({
			id: 'toggle-status',
			label: account.status === 'active' ? 'Suspend' : 'Reactivate',
			value: account.id,
			title:
				account.status === 'active'
					? 'End this account\'s access and keep its record'
					: 'Restore this account\'s access',
		});
	}
	if (canDelete) {
		actions.push({
			id: 'delete',
			label: 'Delete',
			value: account.id,
			tone: 'danger',
			title: 'Remove this account permanently',
		});
	}
	return actions;
}

/** The actions every organization row offers. */
export function organizationActions(organization, { canManage = true } = {}) {
	const actions = [{ id: 'open', label: 'Open', value: organization.id }];
	if (canManage) {
		actions.push({
			id: 'toggle-status',
			label: organization.status === 'suspended' ? 'Reactivate' : 'Suspend',
			value: organization.id,
			title:
				organization.status === 'suspended'
					? 'Restore this organization\'s access'
					: 'Revoke this organization\'s access',
		});
		actions.push({
			id: 'edit',
			label: 'Edit',
			value: organization.id,
			title: 'Edit the organization profile',
		});
		actions.push({
			id: 'delete',
			label: 'Delete',
			value: organization.id,
			tone: 'danger',
			title: 'Remove the organization and everything in it',
		});
	}
	return actions;
}

function escapeAttr(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
