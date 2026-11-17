/**
 * src/frontend/console/components/filters.js
 *
 * Filter bar primitives: the shared period selector and a generic toolbar.
 *
 * The period selection is GLOBAL to the console (one store value) so every
 * page reports the same window — a KPI on the Overview and a row in the
 * Analytics table must never describe different periods.
 */

import { esc } from '../viz/charts.js';

/** The periods the console offers. Keys match the backend period resolver. */
export const PERIODS = Object.freeze([
	{ key: '7d', label: '7 days' },
	{ key: '30d', label: '30 days' },
	{ key: '90d', label: '90 days' },
	{ key: 'year', label: 'Academic year' },
	{ key: 'custom', label: 'Custom' },
]);

/**
 * Render a chip group.
 * @param {{ options:Array<{key:string,label:string}>, value:string,
 *           name:string, onSelect?:(key:string)=>void }} options
 */
export function chipGroup({ options, value, name, onSelect = null }) {
	return `<div class="ac-chip-group" role="group" aria-label="Period">${options
		.map(
			(option) =>
				`<button type="button" class="ac-chip${option.key === value ? ' is-active' : ''}" data-ac-chip="${
					name
				}" data-ac-value="${esc(option.key)}" aria-pressed="${option.key === value}">${esc(
					option.label,
				)}</button>`,
		)
		.join('')}</div>`;
}

/**
 * Bind a chip group to a callback.
 */
export function bindChipGroup(root, name, onSelect) {
	root.querySelectorAll(`[data-ac-chip="${name}"]`).forEach((btn) => {
		btn.addEventListener('click', () => onSelect(btn.dataset.acValue));
	});
}

/**
 * A labelled search box.
 */
export function searchField({ id = 'ac-search', placeholder = 'Search…', value = '' }) {
	return `<div class="ac-field">
		<label class="ac-field__label" for="${esc(id)}">Search</label>
		<input class="ac-input" id="${esc(id)}" type="search" placeholder="${esc(
			placeholder,
		)}" value="${esc(value)}" autocomplete="off" />
	</div>`;
}

/**
 * A labelled select.
 */
export function selectField({
	id,
	label,
	options = [],
	value = '',
	allLabel = null,
	includeAll = false,
}) {
	return `<div class="ac-field">
		<label class="ac-field__label" for="${esc(id)}">${esc(label)}</label>
		<select class="ac-select" id="${esc(id)}" data-ac-select="${esc(id)}">
			${includeAll ? `<option value=""${value ? '' : ' selected'}>${esc(allLabel || 'All')}</option>` : ''}
			${options
				.map(
					(option) =>
						`<option value="${esc(option.value)}"${
							String(option.value) === String(value) ? ' selected' : ''
						}>${esc(option.label)}</option>`,
				)
				.join('')}
		</select>
	</div>`;
}

/**
 * The console toolbar.
 *
 * It is deliberately TWO rows:
 *
 *   row 1 — the controls that belong together: the chip group on the left
 *           and the trailing action (usually Refresh) pushed to the right
 *   row 2 — the field filters, on a line of their own
 *
 * On a single row the search box and the status select used to push the
 * refresh button off the panel, and the audit filter chips collided with the
 * search field. Two rows keep every control where the eye expects it and
 * nothing overflows.
 *
 * A page with NO chip group has nothing to put on the first row, so the
 * trailing action joins the field row instead — still pushed to the right
 * edge, but without a row that holds a single lonely button.
 *
 * @param {{ chips?:string, fields?:string, filters?:string, actions?:string }} parts
 * @returns {string} markup
 */
export function toolbar({ chips = '', fields = '', filters = '', actions = '' } = {}) {
	const secondRow = fields || filters;

	if (!chips) {
		// No chip group: the action belongs to the field row.
		if (!secondRow) {
			return `<div class="ac-toolbar"><div class="ac-toolbar__row">
				<div class="ac-toolbar__push">${actions}</div>
			</div></div>`;
		}
		return `<div class="ac-toolbar">
			<div class="ac-toolbar__row ac-toolbar__row--fields">
				${fields}${filters}
				${actions ? `<div class="ac-toolbar__push">${actions}</div>` : ''}
			</div>
		</div>`;
	}

	return `<div class="ac-toolbar">
		<div class="ac-toolbar__row">
			${chips}
			${actions ? `<div class="ac-toolbar__push">${actions}</div>` : ''}
		</div>
		${
			secondRow
				? `<div class="ac-toolbar__row ac-toolbar__row--fields">${fields}${filters}</div>`
				: ''
		}
	</div>`;
}

/**
 * The shared period toolbar. Renders the chip group plus, when the custom
 * period is selected, the two date inputs.
 */
export function periodToolbar({ value, customFrom = '', customTo = '' }) {
	const custom =
		value === 'custom'
			? `<div class="ac-field">
					<label class="ac-field__label" for="ac-period-from">From</label>
					<input class="ac-input" id="ac-period-from" type="date" value="${esc(customFrom)}" />
				</div>
				<div class="ac-field">
					<label class="ac-field__label" for="ac-period-to">To</label>
					<input class="ac-input" id="ac-period-to" type="date" value="${esc(customTo)}" />
				</div>`
			: '';
	return toolbar({
		chips: chipGroup({ options: PERIODS, value, name: 'period' }),
		fields: custom,
	});
}
