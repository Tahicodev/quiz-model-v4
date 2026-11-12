/**
 * row-actions.js — shared row-action bar for the manage-section tables.
 *
 * The admin tables render their rows with plain HTML strings, so this helper
 * stays string-based too:
 *
 *   window.RowActions.render([
 *     { label, hint, icon, cls, onclick, run },
 *     { label, hint, icon, cls, onclick, run, desktop: 'overflow' },
 *   ])
 *
 * Rules:
 *   • at most MAX_VISIBLE (3) action buttons stay on the row,
 *   • every action marked `desktop: 'overflow'` moves into a "…" popover,
 *   • the "…" button only appears when there is really something to show
 *     behind it,
 *   • the popover reuses the course "Resources" styling
 *     (.course-resources-menu / .course-resources-item) so every row menu
 *     looks the same across the manage section,
 *   • `run` is the callback used by the mobile action sheet
 *     (window.RowActions.sheetItems).
 *
 * The overflow entries live in a hidden holder next to the trigger button, so
 * no global registry is needed and re-rendering a list never leaves stale
 * state behind.
 */
(function (global) {
	'use strict';

	const MAX_VISIBLE = 3;

	const MORE_ICON =
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
		'<circle cx="5" cy="12" r="1.7"></circle>' +
		'<circle cx="12" cy="12" r="1.7"></circle>' +
		'<circle cx="19" cy="12" r="1.7"></circle>' +
		'</svg>';

	let openMenuEl = null;
	let openTriggerEl = null;

	function escapeText(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function escapeAttr(value) {
		return escapeText(value).replace(/'/g, '&#039;');
	}

	/** One visible icon button. */
	function buttonHtml(action) {
		const extra = action.cls || action.className || '';
		const className = extra ? 'exam-action-btn ' + extra : 'exam-action-btn';
		const title = action.title || action.label || '';
		return (
			'<button type="button" class="' + escapeAttr(className) + '"' +
			' onclick="' + escapeAttr(action.onclick || '') + '"' +
			' title="' + escapeAttr(title) + '"' +
			' aria-label="' + escapeAttr(action.label || title) + '"' +
			(action.disabled ? ' disabled' : '') +
			(action.attrs || '') +
			'>' +
			(action.icon || '') +
			'</button>'
		);
	}

	/** One entry of the "…" popover (same look as the course Resources menu). */
	function itemHtml(action) {
		const hint = action.hint ? '<small>' + escapeText(action.hint) + '</small>' : '';
		const tone = action.tone ? ' row-action-' + action.tone : '';
		// The action keeps its own class so the menu entry carries the same
		// tint as the icon button it replaces.
		const own = action.cls || action.className || '';
		const ownClass = own ? ' ' + own : '';
		const icon = action.icon
			? '<span class="row-action-item-icon">' + (action.icon || '') + '</span>'
			: '';
		// A badge carries a progress figure (3/12 lessons, 5 documents) so the
		// menu stays as informative as the course Resources popover.
		const badge = action.badge
			? '<span class="course-resources-badge">' + escapeText(action.badge) + '</span>'
			: '';
		return (
			'<button type="button" role="menuitem" class="course-resources-item' + tone + ownClass + '"' +
			' onclick="' + escapeAttr(action.onclick || '') + '"' +
			' title="' + escapeAttr(action.title || action.label || '') + '"' +
			(action.disabled ? ' disabled aria-disabled="true"' : '') +
			'>' +
			icon +
			'<span class="course-resources-item-main">' +
			'<strong>' + escapeText(action.label || action.title || '') + '</strong>' +
			hint +
			'</span>' +
			badge +
			'</button>'
		);
	}

	/**
	 * @param {Array} actions descriptors (see file header)
	 * @returns {string} HTML for the row's action bar
	 */
	function render(actions) {
		const max = MAX_VISIBLE;
		const list = (Array.isArray(actions) ? actions : []).filter(Boolean);

		const visible = [];
		const overflow = [];

		list.forEach((action) => {
			if (action.desktop === 'none') return;
			if (action.desktop === 'overflow' || visible.length >= max) {
				overflow.push(action);
			} else {
				visible.push(action);
			}
		});

		let html = visible.map(buttonHtml).join('');
		if (!overflow.length) return html;

		html +=
			'<button type="button" class="exam-action-btn course-action-resources row-action-more"' +
			' onclick="window.RowActions.toggle(this)"' +
			' aria-haspopup="menu" aria-expanded="false"' +
			' title="More actions" aria-label="More actions">' +
			MORE_ICON +
			'</button>' +
			'<div class="row-action-overflow" data-row-action-overflow hidden>' +
			overflow.map(itemHtml).join('') +
			'</div>';

		return html;
	}

	/**
	 * Entries for the mobile action sheet (MobileActionSheet.open).
	 * @param {Array} actions descriptors
	 */
	function sheetItems(actions) {
		return (Array.isArray(actions) ? actions : [])
			.filter(Boolean)
			.filter((action) => action.mobile !== false)
			.map((action) => ({
				label: action.label || action.title || '',
				icon: action.icon || '',
				variant: action.variant || 'default',
				onClick: action.run || (() => {}),
			}));
	}

	function closeMenu() {
		if (openMenuEl && openMenuEl.parentNode) {
			openMenuEl.parentNode.removeChild(openMenuEl);
		}
		openMenuEl = null;
		if (openTriggerEl) {
			openTriggerEl.setAttribute('aria-expanded', 'false');
			openTriggerEl.classList.remove('is-open');
			openTriggerEl = null;
		}
		if (typeof document === 'undefined') return;
		document.removeEventListener('click', onDocumentClick, true);
		document.removeEventListener('keydown', onDocumentKeydown, true);
	}

	function onDocumentClick(event) {
		if (!openMenuEl) return;
		const target = event.target;
		if (openMenuEl.contains(target)) return;
		if (openTriggerEl && openTriggerEl.contains(target)) return;
		closeMenu();
	}

	function onDocumentKeydown(event) {
		if (event.key === 'Escape') closeMenu();
	}

	function positionMenu(menu, anchor) {
		const rect =
			anchor && typeof anchor.getBoundingClientRect === 'function'
				? anchor.getBoundingClientRect()
				: { right: 16, bottom: 80 };
		const menuRect = menu.getBoundingClientRect();
		const viewportW = window.innerWidth || 1200;
		const viewportH = window.innerHeight || 800;
		const top = Math.min(
			Math.max(rect.bottom + 6, 8),
			Math.max(viewportH - menuRect.height - 12, 8),
		);
		const left = Math.min(
			Math.max(rect.right - menuRect.width, 8),
			Math.max(viewportW - menuRect.width - 8, 8),
		);
		menu.style.top = top + 'px';
		menu.style.left = left + 'px';
	}

	function openMenu(trigger) {
		if (!trigger) return;
		if (openTriggerEl === trigger) {
			closeMenu();
			return;
		}
		closeMenu();

		const holder = trigger.parentElement
			? trigger.parentElement.querySelector('[data-row-action-overflow]')
			: null;
		if (!holder) return;

		const menu = document.createElement('div');
		menu.className = 'course-resources-menu row-action-menu';
		menu.setAttribute('role', 'menu');
		menu.innerHTML = holder.innerHTML;
		document.body.appendChild(menu);

		// Clicking an entry runs its own handler; the menu closes afterwards.
		menu.addEventListener('click', (event) => {
			if (event.target && event.target.closest('.course-resources-item')) {
				setTimeout(closeMenu, 0);
			}
		});

		positionMenu(menu, trigger);
		openMenuEl = menu;
		openTriggerEl = trigger;
		trigger.setAttribute('aria-expanded', 'true');
		trigger.classList.add('is-open');

		setTimeout(() => {
			document.addEventListener('click', onDocumentClick, true);
			document.addEventListener('keydown', onDocumentKeydown, true);
		}, 0);
	}

	const RowActions = {
		MAX_VISIBLE,
		render,
		sheetItems,
		openMenu,
		closeMenu,
		toggle(trigger) {
			openMenu(trigger);
		},
	};

	global.RowActions = RowActions;
	if (global.window && global.window !== global) {
		global.window.RowActions = RowActions;
	}
})(typeof globalThis !== 'undefined' ? globalThis : this);
