/**
 * src/frontend/console/components/states.js
 *
 * Loading, empty and error states. Every console page has to be honest
 * about all three: a panel that silently renders nothing is indistinguishable
 * from "there is no data".
 */

import { esc } from '../viz/charts.js';

/** Skeleton placeholder while a panel's data loads. */
export function loadingPanel(rows = 4) {
	return `<div class="ac-skeleton-stack" aria-busy="true" aria-live="polite">
		${Array.from({ length: rows })
			.map((_, index) => `<div class="ac-skeleton" style="width:${100 - index * 9}%"></div>`)
			.join('')}
	</div>`;
}

/** Inline loading block (inside a panel body). */
export function loadingBlock(rows = 3) {
	return `<div class="ac-skeleton-stack" aria-busy="true">
		${Array.from({ length: rows })
			.map((_, index) => `<div class="ac-skeleton" style="width:${100 - index * 12}%"></div>`)
			.join('')}
	</div>`;
}

/**
 * Empty state.
 * @param {{ title?:string, message?:string, action?:string }} options
 */
export function emptyState({
	title = 'No data',
	message = 'There is nothing to report for the current filters and period.',
	action = '',
} = {}) {
	return `<div class="ac-empty">
		<div class="ac-empty__icon" aria-hidden="true">
			<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg>
		</div>
		<p class="ac-empty__title">${esc(title)}</p>
		<p class="ac-empty__message">${esc(message)}</p>
		${action}
	</div>`;
}

/**
 * Error state with a retry affordance.
 * @param {{ title?:string, message?:string, retry?:boolean }} options
 */
export function errorState({
	title = 'This section could not be loaded',
	message = 'An unexpected error occurred. The rest of the console is unaffected.',
	retry = true,
} = {}) {
	return `<div class="ac-error" role="alert">
		<div>
			<p class="ac-error__title">${esc(title)}</p>
			<p class="ac-error__message">${esc(message)}</p>
		</div>
		${
			retry
				? '<button type="button" class="ac-btn ac-btn--sm" data-ac-retry>Retry</button>'
				: ''
		}
	</div>`;
}

/**
 * A metric that cannot be computed honestly.
 * The console never substitutes 0 for "we cannot measure this".
 */
export function unavailableNote(reason) {
	return `<p class="ac-empty__message" style="margin:0;font-size:12px">
		<strong>Not measurable with the current data.</strong> ${esc(reason || '')}
	</p>`;
}
