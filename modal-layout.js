/* Keep modal action bars in a dedicated row below the scrolling content. */
(function () {
	function normalizeModal(modalContent) {
		if (!(modalContent instanceof HTMLElement)) return;
		const modalBody = Array.from(modalContent.children).find((child) =>
			child.classList.contains('modal-body'),
		);
		if (!modalBody) return;

		modalContent.querySelectorAll('.form-actions').forEach((actions) => {
			if (actions.closest('.modal-content') !== modalContent) return;
			if (actions.parentElement === modalBody) return;

			const form = actions.closest('form');
			if (form && modalContent.contains(form)) {
				if (!form.id) {
					form.id = `modal-form-${Math.random().toString(36).slice(2, 10)}`;
				}
				actions
					.querySelectorAll('button, input, select, textarea, fieldset, output')
					.forEach((control) => control.setAttribute('form', form.id));
			}

			modalBody.appendChild(actions);
		});
	}

	function init() {
		document.querySelectorAll('.modal .modal-content').forEach(normalizeModal);

		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (!(node instanceof HTMLElement)) return;
					if (node.matches('.modal .modal-content')) normalizeModal(node);
					node.querySelectorAll?.('.modal .modal-content').forEach(normalizeModal);
					const owningContent = node.closest('.modal .modal-content');
					if (owningContent) normalizeModal(owningContent);
				});
			});
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}
})();
