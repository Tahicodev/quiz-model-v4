/* ============================================================================
   QX UI — premium micro-interaction layer (framework-free, additive only)
   - Detects when legacy code opens an entity modal/drawer and upgrades UX:
     entity icon, ESC-to-close, backdrop click-to-close, focus trap.
   - Adds ripple + subtle polish to premium buttons.
   - Never overrides existing open/close logic — it listens and enhances.
   ============================================================================ */
(function () {
	'use strict';

	/* Map entity modal id -> { icon svg, label }. Kept tiny + dependency-free. */
	var ENTITY_META = {
		categoryModal: {
			label: 'Category',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
		},
		examModal: {
			label: 'Exam',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>',
		},
		classModal: {
			label: 'Class',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',
		},
		userModal: {
			label: 'User',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
		},
		quickCategoryModal: {
			label: 'Category',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
		},
		categoryAssignmentModal: {
			label: 'Assign',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
		},
		studentProfileModal: {
			label: 'Account',
			icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
		},
	};

	function isVisible(el) {
		if (!el) { return false; }
		var d = el.style.display;
		var open = el.classList.contains('active') || el.classList.contains('is-open');
		return d === 'block' || d === 'flex' || open;
	}

	function trapFocus(modal, e) {
		var focusables = modal.querySelectorAll(
			'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
		);
		if (!focusables.length) { return; }
		var first = focusables[0];
		var last = focusables[focusables.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault(); last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault(); first.focus();
		}
	}

	/* Find the close handler the legacy code wired: prefer existing .close or
	   a form-actions Cancel button so we reuse the app's own teardown. */
	function invokeClose(modal) {
		var closeBtn = modal.querySelector('.modal-header .close');
		if (closeBtn) { closeBtn.click(); return; }
		var cancel = modal.querySelector('.form-actions .btn-secondary, .modal-footer .btn-secondary');
		if (cancel) { cancel.click(); return; }
		modal.style.display = 'none';
		modal.classList.remove('active', 'is-open');
	}

	function decorate(modal) {
		if (modal.__qxDecorated) { return; }
		modal.__qxDecorated = true;
		var meta = ENTITY_META[modal.id] || {};

		/* Inject entity icon before the title */
		var title = modal.querySelector('.modal-header h2');
		if (title && !title.querySelector('.qx-entity-icon') && meta.icon) {
			var icon = document.createElement('span');
			icon.className = 'qx-entity-icon';
			icon.setAttribute('aria-hidden', 'true');
			icon.innerHTML = meta.icon;
			title.insertBefore(icon, title.firstChild);
		}

		/* ESC to close */
		modal.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') { e.stopPropagation(); invokeClose(modal); }
			if (e.key === 'Tab') { trapFocus(modal, e); }
		});

		/* Backdrop click (only when clicking the overlay itself, not content) */
		modal.addEventListener('mousedown', function (e) {
			if (e.target === modal) { invokeClose(modal); }
		});
	}

	/* Upgrade currently-open entity modals; watch for future opens. */
	function scan() {
		Object.keys(ENTITY_META).forEach(function (id) {
			var m = document.getElementById(id);
			if (m) { decorate(m); }
		});
	}

	/* Ripple on premium primary buttons */
	function addRipple(e) {
		var btn = e.target.closest(
			'.btn-primary, .workspace-btn:not(.ghost), #add-category-btn, #create-exam-btn, #create-class-btn, #gameForm button[type="submit"], #saveTournamentPlannerBtn'
		);
		if (!btn) { return; }
		var rect = btn.getBoundingClientRect();
		var size = Math.max(rect.width, rect.height);
		var ripple = document.createElement('span');
		ripple.className = 'qx-ripple';
		ripple.style.width = ripple.style.height = size + 'px';
		ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
		ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
		btn.appendChild(ripple);
		setTimeout(function () { ripple.remove(); }, 600);
	}

	/* Smooth slide indicator for games/tournament segmented controls */
	function wireSegmented() {
		[
			{ bar: '#gamesStudioTabs', btn: '.games-studio-tab-btn' },
			{ bar: '.tournament-studio-tabs, #tournamentStudioTabs', btn: '.tournament-studio-tab-btn' },
		].forEach(function (cfg) {
			var bar = document.querySelector(cfg.bar);
			if (!bar || bar.__qxSeg) { return; }
			bar.__qxSeg = true;
			bar.style.position = 'relative';
			var thumb = document.createElement('span');
			thumb.className = 'qx-seg-thumb';
			bar.appendChild(thumb);
			function move() {
				var active = bar.querySelector(cfg.btn + '.active');
				if (!active) { thumb.style.opacity = '0'; return; }
				thumb.style.left = active.offsetLeft + 'px';
				thumb.style.width = active.offsetWidth + 'px';
				thumb.style.opacity = '1';
			}
			bar.addEventListener('click', function () { setTimeout(move, 0); });
			window.addEventListener('resize', move);
			setTimeout(move, 0);
		});
	}

	function init() {
		scan();
		wireSegmented();
		document.addEventListener('click', addRipple, true);
		/* Observe attribute/display changes so modals opened later get upgraded */
		var mo = new MutationObserver(function () { scan(); wireSegmented(); });
		mo.observe(document.body, {
			attributes: true,
			childList: true,
			subtree: true,
			attributeFilter: ['style', 'class'],
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	window.QxUI = { decorate: scan, closeDrawer: invokeClose };
})();
