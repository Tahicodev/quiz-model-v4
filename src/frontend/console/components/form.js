/**
 * src/frontend/console/components/form.js
 *
 * The console's form primitives.
 *
 * They live here rather than in a page so that every surface — the settings
 * page, the account dialogs, the preset editors — renders the same control
 * in the same way. A control that looks different on two pages is a control
 * an operator has to learn twice.
 */

import { esc } from '../viz/charts.js';

/**
 * One settings card: a titled panel with an optional action area.
 */
export function panel({
	title,
	subtitle = '',
	body,
	actions = '',
	flush = false,
	id = '',
} = {}) {
	return `<section class="ac-section-panel"${id ? ` id="${esc(id)}"` : ''}>
		<div class="ac-section-panel__head">
			<div>
				<h3 class="ac-section-panel__title">${esc(title)}</h3>
				${subtitle ? `<p class="ac-section-panel__subtitle">${esc(subtitle)}</p>` : ''}
			</div>
			${actions ? `<div class="ac-panel__actions">${actions}</div>` : ''}
		</div>
		<div class="ac-section-panel__body${flush ? ' ac-section-panel__body--flush' : ''}">${body}</div>
	</section>`;
}

/** A labelled text input. */
export function field({
	id,
	label,
	value = '',
	type = 'text',
	hint = '',
	full = false,
	placeholder = '',
	disabled = false,
	required = false,
} = {}) {
	return `<div class="ac-field${full ? ' ac-field--full' : ''}" data-ac-field>
		<label class="ac-field__label" for="${esc(id)}">${esc(label)}${
			required ? ' <span class="ac-required" aria-hidden="true" title="Required">*</span>' : ''
		}</label>
		<input class="ac-input ac-input--full" id="${esc(id)}" type="${esc(type)}" value="${esc(
		value ?? '',
	)}" placeholder="${esc(placeholder)}" autocomplete="off" ${required ? 'aria-required="true"' : ''} ${
		disabled ? 'disabled' : ''
	} />
		${hint ? `<p class="ac-field__hint">${esc(hint)}</p>` : ''}
	</div>`;
}

/** A labelled multi-line input. */
export function textarea({
	id,
	label,
	value = '',
	hint = '',
	rows = 4,
	placeholder = '',
} = {}) {
	return `<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${esc(id)}">${esc(label)}</label>
		<textarea class="ac-input ac-input--full" id="${esc(id)}" rows="${rows}" placeholder="${esc(
		placeholder,
	)}">${esc(value)}</textarea>
		${hint ? `<p class="ac-field__hint">${esc(hint)}</p>` : ''}
	</div>`;
}

/** A labelled select. */
export function select({
	id,
	label,
	options = [],
	value = '',
	hint = '',
	allLabel = null,
	required = false,
} = {}) {
	const all = allLabel
		? `<option value=""${value ? '' : ' selected'}>${esc(allLabel)}</option>`
		: '';
	return `<div class="ac-field" data-ac-field>
		<label class="ac-field__label" for="${esc(id)}">${esc(label)}${
			required ? ' <span class="ac-required" aria-hidden="true" title="Required">*</span>' : ''
		}</label>
		<select class="ac-select" id="${esc(id)}" ${required ? 'aria-required="true"' : ''}>
			${all}
			${options
				.map(
					(option) =>
						`<option value="${esc(option.value)}"${
							String(option.value) === String(value) ? ' selected' : ''
						}>${esc(option.label)}</option>`,
				)
				.join('')}
		</select>
		${hint ? `<p class="ac-field__hint">${esc(hint)}</p>` : ''}
	</div>`;
}

/** A labelled checkbox rendered as a switch. */
export function switchRow({ id, label, hint = '', checked = false, disabled = false } = {}) {
	return `<div class="ac-switch-row">
		<div class="ac-switch-row__text">
			<p class="ac-switch-row__label">${esc(label)}</p>
			${hint ? `<p class="ac-switch-row__hint">${esc(hint)}</p>` : ''}
		</div>
		<button
			type="button"
			class="ac-switch"
			id="${esc(id)}"
			role="switch"
			aria-checked="${checked ? 'true' : 'false'}"
			${disabled ? 'disabled' : ''}
		></button>
	</div>`;
}

/** A labelled checkbox (the plain form, for the dialogs). */
export function checkbox({ id, label, hint = '', checked = false } = {}) {
	return `<label class="ac-check">
		<input type="checkbox" id="${esc(id)}" ${checked ? 'checked' : ''} />
		<span>
			<span class="ac-check__label">${esc(label)}</span>
			${hint ? `<span class="ac-check__hint">${esc(hint)}</span>` : ''}
		</span>
	</label>`;
}

/** The local escape, so a component does not need the chart helper. */
export function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
