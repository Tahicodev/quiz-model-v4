/**
 * src/frontend/console/components/ui.js
 *
 * Small interaction primitives: toasts, modals, confirmation dialogs.
 */

import { esc } from '../viz/charts.js';

// ── Toasts ──────────────────────────────────────────────────────────────────

let toastHost = null;

function ensureToastHost() {
	if (!toastHost) {
		toastHost = document.createElement('div');
		toastHost.className = 'ac-toasts';
		toastHost.setAttribute('role', 'status');
		toastHost.setAttribute('aria-live', 'polite');
		document.body.appendChild(toastHost);
	}
	return toastHost;
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} [kind]
 */
export function toast(message, kind = 'info', timeout = 4200) {
	const host = ensureToastHost();
	const el = document.createElement('div');
	el.className = `ac-toast ac-toast--${kind}`;
	el.innerHTML = `<span class="ac-toast__text">${esc(message)}</span>`;
	host.appendChild(el);
	window.setTimeout(() => {
		el.style.opacity = '0';
		el.style.transition = 'opacity .18s ease';
		window.setTimeout(() => el.remove(), 200);
	}, timeout);
	return el;
}

// ── Modal ───────────────────────────────────────────────────────────────────

let openModals = 0;

/**
 * Open a modal.
 * @param {{ title:string, subtitle?:string, body:string|Node, footer?:string|Node,
 *           wide?:boolean, onMount?:(root:HTMLElement)=>void }} options
 * @returns {{ close:()=>void, root:HTMLElement }}
 */
export function openModal({
	title,
	subtitle = '',
	body,
	footer = '',
	wide = false,
	onMount = null,
}) {
	const backdrop = document.createElement('div');
	backdrop.className = 'ac-modal-backdrop';
	backdrop.setAttribute('role', 'dialog');
	backdrop.setAttribute('aria-modal', 'true');
	backdrop.setAttribute('aria-label', title);

	backdrop.innerHTML = `
		<div class="ac-modal${wide ? ' ac-modal--wide' : ''}">
			<div class="ac-modal__header">
				<div>
					<h2 class="ac-modal__title">${esc(title)}</h2>
					${subtitle ? `<p class="ac-modal__subtitle">${esc(subtitle)}</p>` : ''}
				</div>
				<button type="button" class="ac-close" data-ac-close aria-label="Close">&times;</button>
			</div>
			<div class="ac-modal__body" data-ac-modal-body></div>
			${footer ? `<div class="ac-modal__footer" data-ac-modal-footer></div>` : ''}
		</div>`;

	const bodyHost = backdrop.querySelector('[data-ac-modal-body]');
	if (typeof body === 'string') bodyHost.innerHTML = body;
	else if (body) bodyHost.appendChild(body);

	const footerHost = backdrop.querySelector('[data-ac-modal-footer]');
	if (footerHost) {
		if (typeof footer === 'string') footerHost.innerHTML = footer;
		else if (footer) footerHost.appendChild(footer);
	}

	function close() {
		backdrop.remove();
		openModals = Math.max(0, openModals - 1);
		if (openModals === 0) document.body.style.removeProperty('overflow');
		document.removeEventListener('keydown', onKey);
	}

	function onKey(event) {
		if (event.key === 'Escape') close();
	}

	backdrop.addEventListener('click', (event) => {
		if (event.target === backdrop) close();
	});
	backdrop.querySelectorAll('[data-ac-close]').forEach((btn) => btn.addEventListener('click', close));
	document.addEventListener('keydown', onKey);

	document.body.appendChild(backdrop);
	openModals += 1;
	document.body.style.overflow = 'hidden';

	const focusTarget = backdrop.querySelector(
		'input, select, textarea, button:not([data-ac-close])',
	);
	if (focusTarget) focusTarget.focus();

	if (onMount) onMount(backdrop);

	return { close, root: backdrop };
}

/**
 * Confirmation dialog for destructive or irreversible operations.
 * @param {{ title:string, message:string, confirmLabel?:string,
 *           danger?:boolean, detail?:string }} options
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
	title,
	message,
	detail = '',
	confirmLabel = 'Confirm',
	danger = false,
}) {
	return new Promise((resolve) => {
		const modal = openModal({
			title,
			body: `
				<p style="margin:0 0 10px;font-size:13.5px;line-height:1.55">${esc(message)}</p>
				${detail ? `<div class="ac-alert ac-alert--${danger ? 'danger' : 'info'}"><div class="ac-alert__body"><p class="ac-alert__text">${esc(detail)}</p></div></div>` : ''}
			`,
			footer: `
				<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
				<button type="button" class="ac-btn ${danger ? 'ac-btn--danger' : 'ac-btn--primary'}" data-ac-confirm>${esc(confirmLabel)}</button>
			`,
		});
		modal.root
			.querySelector('[data-ac-cancel]')
			.addEventListener('click', () => {
				modal.close();
				resolve(false);
			});
		modal.root.querySelector('[data-ac-confirm]').addEventListener('click', () => {
			modal.close();
			resolve(true);
		});
		modal.root.addEventListener('click', (event) => {
			if (event.target === modal.root) resolve(false);
		});
	});
}

// ── Small helpers ──────────────────────────────────────────────────────────

/** Escape a value for use in an HTML attribute. */
export { esc };

/** Format a number with locale separators. */
export function formatNumber(value, fallback = '—') {
	if (value === null || value === undefined || value === '') return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return n.toLocaleString();
}

/** Format a percentage (0-100) with one decimal, or an em dash. */
export function formatPercent(value, fallback = '—') {
	if (value === null || value === undefined || value === '') return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return `${n.toFixed(1)}%`;
}

/** Format a timestamp for display. */
export function formatDate(value, { withTime = true } = {}) {
	if (!value) return '—';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
	});
}

/** Human-readable "time ago" label. */
export function formatRelative(value) {
	if (!value) return 'never';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return 'never';
	const seconds = Math.round((Date.now() - date.getTime()) / 1000);
	const units = [
		['year', 31536000],
		['month', 2592000],
		['day', 86400],
		['hour', 3600],
		['minute', 60],
	];
	for (const [unit, size] of units) {
		if (Math.abs(seconds) >= size) {
			const count = Math.round(seconds / size);
			return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
		}
	}
	return 'just now';
}

/** Truncate a long string for a table cell. */
export function truncate(value, max = 48) {
	const text = String(value ?? '');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Pluralise a noun against a count: plural(1, 'attempt') → "1 attempt",
 * plural(4, 'attempt') → "4 attempts".
 */
export function plural(count, noun, suffix = 's') {
	const n = Number(count) || 0;
	return `${formatNumber(n)} ${noun}${n === 1 ? '' : suffix}`;
}
