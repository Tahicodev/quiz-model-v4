// Exam Documents — printable subject (student paper) and confidential answer
// key, exported as real PDF and editable Word files.
//
// A teacher opens this from the exams table (document icon). The modal is a
// guided stepper: every step configures one aspect of the paper, and the LAST
// step is the only place the document is previewed and exported.
//   1. En-tête         — the exam-specific institutional header (saved per exam).
//   2. Revue           — which elements are actually printed on the sheet.
//   3. Mise en page    — template, columns, density, page budget.
//   4. Aperçu & export — recap of every choice + the rendered paper (sujet/corrigé).
//
// Navigation is guided but forgiving: Précédent/Suivant drive the flow, a step
// already reached stays clickable, and forward jumps unlock progressively.
//
// Everything heavy (model building, /20 validation, PDF, DOCX) happens on the
// server behind authorized routes: the browser only ever receives the rendered
// HTML preview or the finished file bytes. The answers therefore cannot leak
// into a student-facing payload.

/* global window, document */

(function () {
	'use strict';

	const API_BASE = '/exam-documents';

	const HEADER_FIELDS = [
		{ name: 'ministry', label: 'Ministry', placeholder: 'Ministère de l’Éducation nationale, du Préscolaire et des Sports' },
		{ name: 'academy', label: 'Academy / Directorate', placeholder: 'Académie régionale' },
		{ name: 'schoolName', label: 'School', placeholder: 'Nom de l’école' },
		{ name: 'academicYear', label: 'Academic year', placeholder: '2025-2026' },
		{ name: 'title', label: 'Exam title', placeholder: 'Devoir surveillé n°1' },
		{ name: 'sessionType', label: 'Session', placeholder: 'Première session / Rattrapage' },
		{ name: 'subject', label: 'Subject', placeholder: 'Mathématiques' },
		{ name: 'teacherName', label: 'Teacher', placeholder: 'Nom du professeur' },
		{ name: 'level', label: 'Level / Class', placeholder: '3ème année collège' },
		{ name: 'group', label: 'Group', placeholder: 'Groupe A' },
		{ name: 'term', label: 'Term', placeholder: 'Trimestre 2' },
		{ name: 'date', label: 'Date', placeholder: '12/03/2026' },
		{ name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', placeholder: '60', max: 600 },
	];

	const TOGGLES = [
		{ name: 'studentNameField', label: 'Name field' },
		{ name: 'studentNumberField', label: 'Student number field' },
		{ name: 'showClassField', label: 'Class field' },
	];

	// Display switches: they change the printed sheet, never the stored data.
	const DISPLAY_TOGGLES = [
		{ name: 'showHeader', label: 'Show the header (logo, school, title, information)' },
	];
	
	// Individual header elements the teacher can show/hide via the Revue tab.
	const REVIEW_FIELDS = [
		{ name: 'logo', label: 'School logo' },
		{ name: 'schoolName', label: 'School name' },
		{ name: 'subject', label: 'Subject' },
		{ name: 'level', label: 'Level / Class' },
		{ name: 'group', label: 'Group' },
		{ name: 'ministry', label: 'Ministry' },
		{ name: 'academy', label: 'Academy / Directorate' },
		{ name: 'academicYear', label: 'Academic year' },
		{ name: 'sessionType', label: 'Session' },
		{ name: 'term', label: 'Term' },
		{ name: 'title', label: 'Exam title' },
		{ name: 'teacherName', label: 'Teacher' },
		{ name: 'durationMinutes', label: 'Duration' },
		{ name: 'date', label: 'Date' },
		{ name: 'instructions', label: 'Instructions' },
		{ name: 'studentNameField', label: 'Name field' },
		{ name: 'studentNumberField', label: 'Student number field' },
		{ name: 'showClassField', label: 'Class field' },
		{ name: 'noteBox', label: 'Grade box' },
		{ name: 'scoring', label: 'Marking scheme (answer key)' },
	];

	// The guided flow. The last step is the recap + preview + export target; the
	// student paper and the answer key are two documents *inside* that step, not
	// steps of their own, so the teacher configures first and looks at the result
	// once, with every earlier choice summarised above the rendering.
	const ED_STEPS = [
		{ name: 'header', label: 'Header', hint: 'School and assignment' },
		{ name: 'review', label: 'Review', hint: 'Printed elements' },
		{ name: 'template', label: 'Layout', hint: 'Template and pagination' },
		{ name: 'preview', label: 'Preview & export', hint: 'Summary and render' },
	];

	const LAST_STEP = ED_STEPS.length - 1;

	function edEscape(unsafe) {
		return String(unsafe ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function edToast(message, kind) {
		if (typeof window.showToast === 'function') window.showToast(message, kind || 'info');
		else if (kind === 'error') console.error('[exam-documents]', message);
	}

	function edApi(method, path, body) {
		if (!window.API || typeof window.API.raw !== 'function') {
			return Promise.reject(new Error('API client unavailable (api-client.js not loaded).'));
		}
		return window.API.raw(method, path, body);
	}

	/** Free the teacher from counting: "18,5" instead of "18.5". */
	function edPoints(value) {
		const n = Number(value);
		if (!Number.isFinite(n)) return '—';
		return String(Math.round(n * 100) / 100).replace('.', ',');
	}

	function isStudentUser() {
		try {
			return typeof window.Auth?.isStudent === 'function' && window.Auth.isStudent();
		} catch (_) {
			return false;
		}
	}

	// ─── Header form ─────────────────────────────────────────────────────────
	function edTextField(field, value) {
		const type = field.type === 'number' ? 'number' : 'text';
		const attrs = [
			`data-ed-field="${edEscape(field.name)}"`,
			`id="ed-field-${edEscape(field.name)}"`,
			`type="${type}"`,
			`class="ed-input"`,
			field.placeholder ? `placeholder="${edEscape(field.placeholder)}"` : '',
			field.max ? `max="${field.max}"` : '',
			type === 'number' ? 'min="1"' : '',
			value === null || value === undefined || value === '' ? '' : `value="${edEscape(value)}"`,
		]
			.filter(Boolean)
			.join(' ');
		return `
			<div class="ed-field">
				<label class="ed-label" for="ed-field-${edEscape(field.name)}">${edEscape(field.label)}</label>
				<input ${attrs}>
			</div>`;
	}

	function edHeaderForm(header) {
		const inputs = HEADER_FIELDS.map((field) => edTextField(field, header[field.name])).join('');
		const toggle = (item, checked) => `
			<label class="ed-check">
				<input type="checkbox" data-ed-field="${item.name}" ${checked ? 'checked' : ''}>
				<span>${edEscape(item.label)}</span>
			</label>`;
		const displayToggles = DISPLAY_TOGGLES.map((item) => toggle(item, header[item.name] !== false)).join('');
		const toggles = TOGGLES.map((item) => toggle(item, header[item.name] !== false)).join('');
		const logoSrc = header.logoDataUrl || header.logoUrl || '';
		return `
			<div class="ed-form-grid">${inputs}
				<div class="ed-field">
					<label class="ed-label" for="ed-field-grouping">Question grouping</label>
					<select class="ed-input" id="ed-field-grouping" data-ed-field="grouping">
						<option value="none"${header.grouping === 'by-category' ? '' : ' selected'}>One continuous sequence</option>
						<option value="by-category"${header.grouping === 'by-category' ? ' selected' : ''}>By category (exercises)</option>
					</select>
				</div>
			</div>

			<div class="ed-field ed-field--full">
				<label class="ed-label" for="ed-field-instructions">Instructions shown on the paper</label>
				<textarea class="ed-input ed-textarea" id="ed-field-instructions" data-ed-field="instructions" rows="3"
					placeholder="Une seule réponse par question. Barème indicatif.">${edEscape(header.instructions || '')}</textarea>
			</div>

			<div class="ed-fieldset">
				<span class="ed-fieldset-title">Display</span>
				<div class="ed-checks">${displayToggles}</div>
				<p class="ed-help">Without the header the sheet starts directly on the questions; the identification fields and the grade box are still printed.</p>
			</div>

			<div class="ed-fieldset">
				<span class="ed-fieldset-title">School logo</span>
				<div class="ed-logo-row">
					<span class="ed-logo-preview${logoSrc ? ' has-image' : ''}" data-ed-role="logo-preview">
						${logoSrc ? `<img src="${edEscape(logoSrc)}" alt="">` : '<span class="ed-logo-empty">No logo</span>'}
					</span>
					<div class="ed-logo-controls">
						<input type="file" accept="image/png,image/jpeg" class="ed-input ed-file" data-ed-role="logo-file">
						<label class="ed-range-label">
							Size <span data-ed-role="scale-value">${edPoints(header.logoScale || 1)}×</span>
							<input type="range" min="0.2" max="1.5" step="0.05" class="ed-range"
								data-ed-field="logoScale" value="${edEscape(header.logoScale || 1)}">
						</label>
						<button type="button" class="btn btn-secondary btn-sm" data-ed-role="logo-clear">Remove logo</button>
					</div>
				</div>
				<p class="ed-help">The logo is stored as an uploaded file; it does not bloat the exam data.</p>
			</div>

			<div class="ed-fieldset">
				<span class="ed-fieldset-title">Identification fields (student paper)</span>
				<div class="ed-checks">${toggles}</div>
			</div>`;
	}

	function edCollectHeader(root, state) {
		const header = {};
		root.querySelectorAll('[data-ed-field]').forEach((el) => {
			const name = el.getAttribute('data-ed-field');
			if (el.type === 'checkbox') {
				header[name] = el.checked;
				return;
			}
			if (el.type === 'range') {
				header[name] = Number(el.value) || 1;
				return;
			}
			if (el.type === 'number') {
				const raw = el.value.trim();
				if (raw !== '') header[name] = Number(raw);
				return;
			}
			const raw = String(el.value ?? '').trim();
			header[name] = raw === '' ? null : raw;
		});
		// The base64 copy is only carried for the live preview / export, never
		// written into the exam record.
		if (state.logoDataUrl) header.logoDataUrl = state.logoDataUrl;
		// logoUrl lives in state (set after upload) — no DOM field carries it.
		if (state.header?.logoUrl) header.logoUrl = state.header.logoUrl;
		// Collect hiddenFields from the Revue tab checkboxes.
		const hidden = [];
		const reviewPanel = state.modal?.querySelector('[data-ed-panel="review"]');
		if (reviewPanel) {
			reviewPanel.querySelectorAll('[data-ed-hide]').forEach((el) => {
				if (!el.checked) hidden.push(el.getAttribute('data-ed-hide'));
			});
		}
		header.hiddenFields = hidden.length ? hidden : [];
		return header;
	}

	// ─── Review panel ─────────────────────────────────────────────────────────────────
	function edReviewPanelHtml() {
		const items = REVIEW_FIELDS.map((f) => `
			<label class="ed-review-item">
				<input type="checkbox" data-ed-hide="${edEscape(f.name)}" checked>
				<span>${edEscape(f.label)}</span>
			</label>`).join('');
		// No preview and no export bar here: this step only decides what is
		// printed, and the result is looked at once, in the final step.
		return `
			<div class="ed-review-section">
				<h4 class="ed-review-title">Elements shown on the sheet</h4>
				<p class="ed-help">Uncheck an element to hide it on the generated document. The data stays saved; only the printing is affected.</p>
				<div class="ed-review-grid">${items}</div>
				<div class="ed-review-actions">
					<button type="button" class="btn btn-secondary btn-sm" data-ed-role="review-all">Show all</button>
					<button type="button" class="btn btn-secondary btn-sm" data-ed-role="review-none">Hide all</button>
				</div>
			</div>`;
	}

	// ─── Panels ──────────────────────────────────────────────────────────────
	function edBanner(state, doc) {
		const preview = state.previews[doc];
		if (!preview) {
			return `<div class="ed-banner ed-banner-idle">Preview not generated — click “Refresh preview”.</div>`;
		}
		const scoring = preview.scoring || {};
		const sections = (scoring.sections || [])
			.filter((section) => section.title)
			.map((section) => `<li>${edEscape(section.title)} — <strong>${edPoints(section.subtotal)} pts</strong></li>`)
			.join('');
		const warnings = (preview.warnings || []).length
			? `<div class="ed-warn-list">${preview.warnings
					.map((w) => `<span class="ed-warn-chip">${edEscape(w.message || w.type)}</span>`)
					.join('')}</div>`
			: '';
		const error = scoring.error
			? `<div class="ed-banner-error">${edEscape(scoring.error.message)}
					<button type="button" class="btn btn-warning btn-sm" data-ed-role="normalize">Adjust to /20</button>
				</div>`
			: '';
		const normalized = scoring.normalized
			? `<span class="ed-chip ed-chip-muted">Stored marking scheme kept: ${edPoints(scoring.naturalTotal)} pts</span>`
			: '';
		const ok = scoring.valid20 || scoring.normalized;
		return `
			<div class="ed-banner ${ok ? 'ed-banner-ok' : 'ed-banner-bad'}">
				<div class="ed-banner-main">
					<span class="ed-total">Total: <strong>${edPoints(scoring.total)} / ${scoring.scale || 20}</strong></span>
					<span class="ed-chip ${ok ? 'ed-chip-ok' : 'ed-chip-bad'}">${ok ? 'Marking scheme OK' : 'Marking scheme not /20'}</span>
					${normalized}
				</div>
				${sections ? `<ul class="ed-subtotals">${sections}</ul>` : ''}
				${error}
				${warnings}
			</div>`;
	}

	function edPreviewArea(state, doc) {
		const preview = state.previews[doc];
		if (!preview) {
			return `<div class="ed-preview ed-preview-empty" data-ed-role="preview">
				<p>The preview shows the exact document that will be exported — not the quiz interface.</p>
			</div>`;
		}
		return `<div class="ed-preview" data-ed-role="preview">${preview.html || ''}</div>`;
	}

	function edDocumentToolbar(doc) {
		const isKey = doc === 'answer_key';
		return `
			<div class="ed-toolbar">
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="refresh" data-ed-doc="${doc}">Refresh preview</button>
				<span class="ed-toolbar-sep"></span>
				<button type="button" class="btn btn-primary btn-sm" data-ed-role="export" data-ed-format="pdf" data-ed-doc="${doc}">Export PDF</button>
				<button type="button" class="btn btn-primary btn-sm" data-ed-role="export" data-ed-format="docx" data-ed-doc="${doc}">Export Word</button>
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="print" data-ed-doc="${doc}">Print</button>
				${isKey ? '<span class="ed-confidential">Confidential document — teacher only.</span>' : ''}
			</div>`;
	}

	function edNormalizationPanel(state) {
		const preview = state.previews[state.activeDocument];
		const scoring = preview && preview.scoring;
		if (!scoring || !scoring.normalizedPreview) return '';
		const rows = scoring.normalizedPreview
			.map(
				(entry) => `<tr><td>${entry.number}</td><td>${edPoints(entry.from)}</td><td>${edPoints(entry.to)}</td></tr>`,
			)
			.join('');
		return `
			<div class="ed-normalize" data-ed-role="normalize-panel">
				<h4>Normalise the marking scheme to /20</h4>
				<p>The stored total is <strong>${edPoints(scoring.naturalTotal)}</strong> points. Proposed proportional
					repartition (0.25 steps, exact sum of 20). The exam points will <strong>not</strong>
					be changed: this adjustment exists only on the printed document.</p>
				<div class="ed-table-wrap">
					<table class="ed-table">
						<thead><tr><th>Question</th><th>Stored</th><th>Printed</th></tr></thead>
						<tbody>${rows}</tbody>
					</table>
				</div>
				<div class="ed-normalize-actions">
					<button type="button" class="btn btn-primary btn-sm" data-ed-role="normalize-confirm">Confirm and apply to print</button>
					<button type="button" class="btn btn-secondary btn-sm" data-ed-role="normalize-cancel">Cancel</button>
				</div>
			</div>`;
	}

	// ─── Génération personnalisée (template / pagination panel) ────────────────
	function edFmtPct(value) {
		if (value === null || value === undefined) return '—';
		return `${Math.round(Number(value) * 100)}\u00a0%`;
	}

	// Fixed accent per built-in model so each card is easy to tell apart.
	// Custom templates have dynamic ids, so they cycle through ED_CUSTOM_TPL_PALETTE.
	const ED_TPL_COLORS = {
		classique: { c: '#1f3a5f', bg: '#eef2f7' },
		moderne: { c: '#0f766e', bg: '#e6f4f1' },
		compact: { c: '#b45309', bg: '#fbf0e2' },
		officiel: { c: '#6d28d9', bg: '#f1ebfb' },
		college: { c: '#15803d', bg: '#e9f6ec' },
	};
	const ED_CUSTOM_TPL_PALETTE = [
		{ c: '#be123c', bg: '#fdeaef' },
		{ c: '#0369a1', bg: '#e6f1f8' },
		{ c: '#7c2d12', bg: '#f6ece7' },
		{ c: '#4d7c0f', bg: '#eef5e4' },
		{ c: '#6b21a8', bg: '#f2eafb' },
		{ c: '#0e7490', bg: '#e5f2f6' },
	];

	function edTemplateAccent(id, isCustom, index) {
		if (!isCustom && ED_TPL_COLORS[id]) return ED_TPL_COLORS[id];
		return ED_CUSTOM_TPL_PALETTE[Math.abs(index || 0) % ED_CUSTOM_TPL_PALETTE.length];
	}

	function edTemplateCard(tpl, active, accent) {
		const tone = accent || { c: '#94a3b8', bg: '#f1f5f9' };
		return `
			<button type="button" class="ed-tpl-card${active ? ' active' : ''}"
				style="--tpl-accent:${tone.c};--tpl-accent-soft:${tone.bg}"
				data-ed-role="tpl-card" data-ed-template="${edEscape(tpl.id)}"
				aria-pressed="${active ? 'true' : 'false'}">
				<span class="ed-tpl-head">
					<span class="ed-tpl-dot" aria-hidden="true"></span>
					<span class="ed-tpl-name">${edEscape(tpl.name)}</span>
				</span>
				<span class="ed-tpl-meta">${tpl.columns === 2 ? '2 columns' : '1 column'} · ${edEscape(tpl.headerVariant || '')}</span>
				${tpl.custom ? '<span class="ed-tpl-tag">custom</span>' : ''}
			</button>`;
	}

	function edTemplatePanelHtml(state) {
		const cards = [
			...state.builtIn.map((t) => edTemplateCard(t, t.id === state.templateId, edTemplateAccent(t.id, false))),
			...state.custom.map((t, i) =>
				edTemplateCard({ id: t.id, name: t.name, columns: t.template?.page?.columns || 1, headerVariant: t.template?.header?.variant, custom: true }, t.id === state.templateId, edTemplateAccent(t.id, true, i)),
			),
		].join('');

		// Progressive disclosure: the step opens with the template picker only.
		// The "Layout" controls (columns, density, estimate, page budget, saving a
		// custom template) stay hidden until the teacher opens them on purpose.
		if (!state.layoutOpen) {
			return `
				<div class="ed-tpl-cards" data-ed-role="tpl-cards">${cards}</div>
				<p class="ed-help">Pick a template. To fine-tune columns, density or the page budget — and to save a custom template — open the layout options.</p>
				<div class="ed-toolbar">
					<button type="button" class="btn btn-secondary btn-sm" data-ed-role="tpl-expand-layout">Customise layout →</button>
				</div>`;
		}

		const est = state.estimate;
		const estimateBox = est
			? `
				<div class="ed-estimate">
					<span>Estimated pages\u00a0: <strong>${est.analytic}</strong>${est.range ? ` (range ${est.range[0]}–${est.range[1]})` : ''}</span>
					${est.exact != null ? `<span> Actual render\u00a0: <strong>${est.exact}</strong></span>` : ''}
					${est.lastPageFill != null ? `<span> Last page filled\u00a0: <strong>${edFmtPct(est.lastPageFill)}</strong></span>` : ''}
				</div>`
			: '<p class="ed-help">Choose a template then run the estimate to know the page count.</p>';
		const suggestions = [];
		if (state.layout.columns !== 2) suggestions.push('Switching to 2 columns usually saves 1 page.');
		if (state.templateOverrides && Object.keys(state.templateOverrides).length) {
			suggestions.push('A “Fit to N pages” adjustment is active — exports will use it.');
		}
		const cmp = state.comparison
			? `
				<div class="ed-table-wrap">
					<table class="ed-table">
						<thead><tr><th>Template</th><th>Pages</th></tr></thead>
						<tbody>${state.comparison
							.map((row) => `<tr class="${row.id === state.templateId ? 'ed-row-active' : ''}"><td>${edEscape(row.name)}</td><td>${row.pages}</td></tr>`)
							.join('')}</tbody>
					</table>
				</div>`
			: '';
		const fit = state.fit
			? `
				<div class="ed-fit-result${state.fit.fits ? ' ok' : ' bad'}">
					<strong>${state.fit.fits ? `${state.fit.pages} page(s) — target met` : `${state.fit.pages} page(s), target not reachable`}</strong>
					${state.fit.levers && state.fit.levers.length ? `<span> Levers applied\u00a0: ${state.fit.levers.map(edEscape).join(', ')}</span>` : ''}
					<button type="button" class="btn btn-primary btn-sm" data-ed-role="tpl-fit-apply">Apply to document</button>
				</div>`
			: '';
		const manual = state.layout.density != null || state.layout.answerLines != null;
		return `
			<div class="ed-tpl-cards" data-ed-role="tpl-cards">${cards}</div>

			<div class="ed-fieldset">
				<span class="ed-fieldset-title">Layout</span>
				<div class="ed-checks">
					<label class="ed-radio">
						<span>Columns</span>
						<select class="ed-input" data-ed-role="tpl-columns">
							<option value="1"${state.layout.columns === 2 ? '' : ' selected'}>1 column</option>
							<option value="2"${state.layout.columns === 2 ? ' selected' : ''}>2 columns</option>
						</select>
					</label>
					<label class="ed-check">
						<input type="checkbox" data-ed-role="tpl-manual"${manual ? ' checked' : ''}>
						<span>Manual settings (density / answer space)</span>
					</label>
				</div>
				<div class="ed-manual-controls"${manual ? '' : ' hidden'}>
					<label class="ed-range-label">
						Density <span data-ed-role="density-value">${state.layout.density != null ? edPoints(state.layout.density) : 'auto'}</span>
						<input type="range" min="0.7" max="1.3" step="0.05" class="ed-range" data-ed-role="tpl-density"
							value="${state.layout.density != null ? state.layout.density : 1}">
					</label>
					<label class="ed-range-label">
						Answer lines <span data-ed-role="lines-value">${state.layout.answerLines != null ? state.layout.answerLines : 'auto'}</span>
						<input type="range" min="0" max="12" step="1" class="ed-range" data-ed-role="tpl-lines"
							value="${state.layout.answerLines != null ? state.layout.answerLines : 2}">
					</label>
				</div>
				<p class="ed-help">Fixed margins: density and answer space are the only levers; the font never goes below 9\u00a0pt.</p>
			</div>

			<div class="ed-toolbar">
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="tpl-estimate">Estimate pages</button>
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="tpl-compare">Compare the 5 templates</button>
			</div>
			${estimateBox}
			${suggestions.length ? `<ul class="ed-suggest">${suggestions.map((s) => `<li>${edEscape(s)}</li>`).join('')}</ul>` : ''}
			${cmp}

			<div class="ed-fieldset">
				<span class="ed-fieldset-title">Fit to N pages</span>
				<div class="ed-fit-row">
					<label class="ed-range-label">Target
						<input type="number" min="1" max="40" class="ed-input" data-ed-role="tpl-fit-target" value="3" style="width:5rem">
					</label>
					<button type="button" class="btn btn-primary btn-sm" data-ed-role="tpl-fit">Optimize</button>
					${state.templateOverrides ? '<button type="button" class="btn btn-secondary btn-sm" data-ed-role="tpl-clear-overrides">Remove the adjustment</button>' : ''}
				</div>
				${fit}
			</div>

			<div class="ed-toolbar">
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="tpl-save-custom">Save as custom template</button>
				<span class="ed-toolbar-sep"></span>
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="tpl-collapse-layout">← Hide layout options</button>
			</div>`;
	}

	function edTemplatePanelHost(state) {
		return state.modal?.querySelector('[data-ed-panel="template"]');
	}

	function edRenderTemplatePanel(state) {
		const host = edTemplatePanelHost(state);
		if (host) host.innerHTML = edTemplatePanelHtml(state);
	}

	function edLoadTemplates(state) {
		const render = () => {
			edRenderTemplatePanel(state);
			edBindTemplateControls(state);
		};
		if (state.templatesLoaded) {
			render();
			return Promise.resolve();
		}
		return edApi('GET', `${API_BASE}/${encodeURIComponent(state.examId)}/templates`)
			.then((result) => {
				state.builtIn = (result && result.builtIn) || [];
				state.custom = (result && result.custom) || [];
				state.templatesLoaded = true;
				render();
			})
			.catch((err) => edToast(err?.message || 'Templates unavailable.', 'error'));
	}

	function edBoundDoc(state) {
		// Estimates always describe the student paper.
		return 'student';
	}

	function edEstimate(state) {
		const body = edRequestBody(state, edBoundDoc(state));
		edSetBusy(state, true);
		return edApi('POST', `${API_BASE}/${encodeURIComponent(state.examId)}/estimate`, body)
			.then((result) => {
				state.estimate = result;
				edRenderTemplatePanel(state);
				edBindTemplateControls(state);
				return result;
			})
			.catch((err) => edToast(err?.message || 'Cannot estimate the page count.', 'error'))
			.finally(() => edSetBusy(state, false));
	}

	function edCompare(state) {
		const base = edRequestBody(state, edBoundDoc(state));
		const ids = state.builtIn.map((t) => t.id);
		edSetBusy(state, true);
		return Promise.all(
			ids.map((id) =>
				edApi('POST', `${API_BASE}/${encodeURIComponent(state.examId)}/estimate`, Object.assign({}, base, { templateId: id, exact: true }))
					.then((r) => ({ id, name: id, pages: r.exact }))
					.catch(() => ({ id, name: id, pages: '—' })),
			),
		)
			.then((rows) => {
				const names = {};
				state.builtIn.forEach((t) => { names[t.id] = t.name; });
				state.comparison = rows.map((r) => ({ ...r, name: names[r.id] || r.id }));
				edRenderTemplatePanel(state);
				edBindTemplateControls(state);
			})
			.finally(() => edSetBusy(state, false));
	}

	function edFitPages(state, targetPages) {
		const body = edRequestBody(state, edBoundDoc(state));
		body.targetPages = Number(targetPages) || 1;
		edSetBusy(state, true);
		return edApi('POST', `${API_BASE}/${encodeURIComponent(state.examId)}/fit-pages`, body)
			.then((result) => {
				state.fit = result;
				edRenderTemplatePanel(state);
				edBindTemplateControls(state);
			})
			.catch((err) => edToast(err?.message || 'Optimization failed.', 'error'))
			.finally(() => edSetBusy(state, false));
	}

	function edSaveCustomTemplate(state) {
		const name = window.prompt('Custom template name', 'My template');
		if (!name) return;
		const id = `custom-${Date.now().toString(36)}`;
		// Snapshot the current look: base template + the manual levers, nothing else.
		const template = {
			schemaVersion: 1,
			id,
			name: name.slice(0, 60),
			page: { columns: state.layout.columns === 2 ? 2 : 1 },
		};
		if (state.layout.density != null) template.theme = { density: state.layout.density };
		if (state.layout.answerLines != null) template.question = { answerSpace: { lines: state.layout.answerLines } };
		const next = [...state.custom, { id, name: name.slice(0, 60), baseId: state.templateId, template }];
		edSetBusy(state, true);
		return edApi('PUT', `${API_BASE}/${encodeURIComponent(state.examId)}/templates`, { templates: next })
			.then((saved) => {
				state.custom = (saved && saved.templates) || next;
				state.templateId = id;
				edToast('Custom template saved.', 'success');
				edRenderTemplatePanel(state);
				edBindTemplateControls(state);
			})
			.catch((err) => {
				const payload = err && err.payload;
				edToast((payload && payload.error && payload.error.message) || err?.message || 'Template rejected (out of bounds).', 'error');
			})
			.finally(() => edSetBusy(state, false));
	}

	/** Bind the change/input events of the template panel's live controls. */
	function edBindTemplateControls(state) {
		const host = edTemplatePanelHost(state);
		if (!host) return;
		const cols = host.querySelector('[data-ed-role="tpl-columns"]');
		cols?.addEventListener('change', () => {
			state.layout.columns = Number(cols.value) === 2 ? 2 : 1;
			edRenderTemplatePanel(state);
			edBindTemplateControls(state);
		});
		const manual = host.querySelector('[data-ed-role="tpl-manual"]');
		manual?.addEventListener('change', () => {
			if (manual.checked) {
				if (state.layout.density == null) state.layout.density = 1;
				if (state.layout.answerLines == null) state.layout.answerLines = 2;
			} else {
				state.layout.density = null;
				state.layout.answerLines = null;
			}
			edRenderTemplatePanel(state);
			edBindTemplateControls(state);
		});
		const density = host.querySelector('[data-ed-role="tpl-density"]');
		density?.addEventListener('input', () => {
			state.layout.density = Number(density.value);
			const label = host.querySelector('[data-ed-role="density-value"]');
			if (label) label.textContent = edPoints(state.layout.density);
		});
		const lines = host.querySelector('[data-ed-role="tpl-lines"]');
		lines?.addEventListener('input', () => {
			state.layout.answerLines = Number(lines.value);
			const label = host.querySelector('[data-ed-role="lines-value"]');
			if (label) label.textContent = String(state.layout.answerLines);
		});
	}

	// ─── Requests ────────────────────────────────────────────────────────────
	function edFormHost(modal) {
		return modal.querySelector('[data-ed-panel="header"]');
	}

	function edRequestBody(state, doc) {
		const modal = state.modal;
		const body = {
			document: doc,
			header: edCollectHeader(edFormHost(modal), state),
			normalization: {
				mode: state.normalization.mode,
				confirmed: state.normalization.confirmed,
			},
			templateId: state.templateId || 'classique',
		};
		// Only send the layout controls the teacher actually touched.
		const layout = {};
		if (state.layout.columns != null) layout.columns = state.layout.columns;
		if (state.layout.density != null) layout.density = state.layout.density;
		if (state.layout.answerLines != null) layout.answerLines = state.layout.answerLines;
		if (Object.keys(layout).length) body.layout = layout;
		// A "Tenir en N pages" result is carried verbatim so preview and file match.
		if (state.templateOverrides && Object.keys(state.templateOverrides).length) {
			body.templateOverrides = state.templateOverrides;
		}
		return body;
	}

	function edRefreshPreview(state, doc) {
		const body = edRequestBody(state, doc);
		state.busy = true;
		edSetBusy(state, true);
		return edApi('POST', `${API_BASE}/${encodeURIComponent(state.examId)}/preview`, body)
			.then((result) => {
				state.previews[doc] = result;
				// Keep the form in sync with whatever the server resolved
				// (defaults for fields the teacher left untouched).
				if (doc === state.activeDocument) edRenderDocumentPanels(state);
				else edTouchDocumentPanel(state, doc);
				return result;
			})
			.catch((err) => {
				edToast(err?.message || 'The preview failed to render.', 'error');
			})
			.finally(() => {
				state.busy = false;
				edSetBusy(state, false);
			});
	}
	
	function edSetBusy(state, busy) {
		state.modal.querySelectorAll('[data-ed-role]').forEach((el) => {
			if (el.classList.contains('ed-preview')) return;
			if (busy) el.setAttribute('disabled', 'disabled');
			else el.removeAttribute('disabled');
		});
		state.modal.classList.toggle('ed-busy', !!busy);
		// Re-enabling every control clears the Prev/Next lock; restore it.
		if (!busy) edSyncStepNav(state);
	}

	function edExport(state, doc, format) {
		if (!window.API || typeof window.API.blob !== 'function') {
			edToast('API client incomplete: download unavailable.', 'error');
			return Promise.resolve();
		}
		const body = edRequestBody(state, doc);
		body.format = format;
		edSetBusy(state, true);
		return window.API.blob('POST', `${API_BASE}/${encodeURIComponent(state.examId)}/export`, body)
			.then((result) => {
				const url = URL.createObjectURL(result.blob);
				const link = document.createElement('a');
				link.href = url;
				link.download =
					result.filename || `exam-${doc}.${format === 'pdf' ? 'pdf' : 'docx'}`;
				document.body.appendChild(link);
				link.click();
				link.remove();
				setTimeout(() => URL.revokeObjectURL(url), 4000);
				const warn = (result.warnings || []).filter((w) => w && w.type !== 'image-skipped');
				edToast(
					`File ${format === 'pdf' ? 'PDF' : 'Word'} downloaded.` +
						(warn.length ? ` ${warn.length} render warning(s).` : ''),
					warn.length ? 'warning' : 'success',
				);
				if (warn.length) console.warn('[exam-documents] render warnings', warn);
			})
			.catch((err) => {
				const payload = err && err.payload;
				if (payload && payload.error) {
					edToast(payload.error.message || 'Export refused: marking scheme not compliant.', 'error');
					state.previews[doc] = Object.assign({}, state.previews[doc], {
						scoring: payload.scoring || state.previews?.[doc]?.scoring,
						warnings: payload.warnings || [],
					});
					edRenderDocumentPanels(state);
				} else {
					edToast(err?.message || 'File generation failed.', 'error');
				}
			})
			.finally(() => edSetBusy(state, false));
	}

	function edPrint(state, doc) {
		const preview = state.previews[doc];
		if (!preview || !preview.printHtml) {
			edToast('Generate the preview first before printing.', 'warning');
			return Promise.resolve();
		}
		const win = window.open('', '_blank', 'width=900,height=1100');
		if (!win) {
			edToast('Print window blocked by the browser.', 'error');
			return Promise.resolve();
		}
		win.document.open();
		win.document.write(preview.printHtml);
		win.document.close();
		try {
			win.focus();
			win.print();
		} catch (_) {
			/* the print dialog is user-initiated in that window otherwise */
		}
		return Promise.resolve();
	}

	// ─── Panel rendering ─────────────────────────────────────────────────────
	function edDocumentPanelHtml(state, doc) {
		return `${edDocumentToolbar(doc)}${edBanner(state, doc)}${edPreviewArea(state, doc)}`;
	}

	function edTouchDocumentPanel(state, doc) {
		const panel = state.modal.querySelector(`[data-ed-panel="${doc}"]`);
		if (panel) panel.innerHTML = edDocumentPanelHtml(state, doc);
	}

	function edRenderDocumentPanels(state) {
		edTouchDocumentPanel(state, 'student');
		if (!isStudentUser()) edTouchDocumentPanel(state, 'answer_key');
		const normalizeHost = state.modal.querySelector('[data-ed-role="normalize-host"]');
		if (normalizeHost) {
			normalizeHost.innerHTML = edNormalizationPanel(state);
			normalizeHost.classList.toggle('ed-has-panel', !!normalizeHost.innerHTML.trim());
		}
		edSyncExportAvailability(state);
	}

	/** Exports are gated by the same /20 rule the server enforces. */
	function edSyncExportAvailability(state) {
		const preview = state.previews[state.activeDocument];
		const blocked = !!preview && !!(preview.scoring && preview.scoring.error);
		state.modal.querySelectorAll('[data-ed-role="export"],[data-ed-role="print"]').forEach((button) => {
			if (state.busy) return;
			button.disabled = blocked;
			button.classList.toggle('ed-disabled', blocked);
		});
		const hint = state.modal.querySelector('[data-ed-role="gate-hint"]');
		if (hint) {
			hint.style.display = blocked ? '' : 'none';
			if (preview && preview.scoring && preview.scoring.error) {
				hint.textContent = preview.scoring.error.message;
			}
		}
	}

	// ─── Stepper navigation ──────────────────────────────────────────────────
	function edStepRailHtml() {
		return ED_STEPS.map((s, i) => `
			<button type="button" class="ed-step-btn${i === 0 ? ' active' : ''}" data-ed-step="${i}" data-ed-role="step-goto">
				<span class="ed-step-num">${i + 1}</span>
				<span class="ed-step-text">
					<span class="ed-step-label">${edEscape(s.label)}</span>
					<span class="ed-step-hint">${edEscape(s.hint)}</span>
				</span>
			</button>`).join('<span class="ed-step-sep" aria-hidden="true"></span>');
	}

	function edDocSwitchHtml() {
		if (isStudentUser()) return '';
		return `
			<div class="ed-doc-switch" role="tablist" aria-label="Document">
				<button type="button" class="ed-doc-tab active" role="tab" data-ed-role="doc-switch" data-ed-doc="student">Student paper</button>
				<button type="button" class="ed-doc-tab" role="tab" data-ed-role="doc-switch" data-ed-doc="answer_key">Answer key</button>
			</div>`;
	}

	/** Refresh the footer Prev/Next availability and the step counter. */
	function edSyncStepNav(state) {
		const prev = state.modal.querySelector('[data-ed-role="step-prev"]');
		const next = state.modal.querySelector('[data-ed-role="step-next"]');
		const ind = state.modal.querySelector('[data-ed-role="step-indicator"]');
		if (prev) prev.disabled = state.step === 0;
		if (next) {
			next.disabled = state.step >= LAST_STEP;
			next.textContent = state.step === LAST_STEP - 1 ? 'See the preview →' : 'Next →';
			// The last step has no next: hide the button entirely instead of greying it out.
			next.style.display = state.step >= LAST_STEP ? 'none' : '';
		}
		if (ind) ind.textContent = `Step ${state.step + 1} of ${ED_STEPS.length} · ${ED_STEPS[state.step].label}`;
	}

	function edShowStep(state, index) {
		const target = Math.max(0, Math.min(LAST_STEP, index));
		state.step = target;
		if (target > state.maxStep) state.maxStep = target;
		const name = ED_STEPS[target].name;
		state.modal.querySelectorAll('.ed-panel').forEach((panel) => {
			panel.classList.toggle('active', panel.getAttribute('data-ed-panel') === name);
		});
		state.modal.querySelectorAll('[data-ed-step]').forEach((btn) => {
			const i = Number(btn.getAttribute('data-ed-step'));
			btn.classList.toggle('active', i === target);
			btn.classList.toggle('done', i < target);
			btn.classList.toggle('locked', i > state.maxStep);
		});
		// The template step lazily fetches the model list; the preview step is where
		// the document is actually built and exported.
		if (name === 'template') edLoadTemplates(state);
		if (name === 'preview') edEnterPreview(state);
		edSyncStepNav(state);
		edSyncExportAvailability(state);
	}

	function edShowDocument(state, doc) {
		state.activeDocument = doc;
		state.lastDocument = doc;
		state.modal.querySelectorAll('.ed-doc').forEach((panel) => {
			panel.classList.toggle('active', panel.getAttribute('data-ed-panel') === doc);
		});
		state.modal.querySelectorAll('[data-ed-role="doc-switch"]').forEach((btn) => {
			btn.classList.toggle('active', btn.getAttribute('data-ed-doc') === doc);
			btn.setAttribute('aria-selected', btn.getAttribute('data-ed-doc') === doc ? 'true' : 'false');
		});
		const normalizeHost = state.modal.querySelector('[data-ed-role="normalize-host"]');
		if (normalizeHost) {
			normalizeHost.innerHTML = edNormalizationPanel(state);
			normalizeHost.classList.toggle('ed-has-panel', !!normalizeHost.innerHTML.trim());
		}
		edSyncExportAvailability(state);
	}

	function edEnterPreview(state) {
		edRenderRecap(state);
		edRenderDocumentPanels(state);
		edShowDocument(state, state.activeDocument || 'student');
		// Build the subject preview once automatically so the final step is never blank.
		if (!state.previews.student && !state.busy) edRefreshPreview(state, 'student');
	}

	// ─── Recap of every teacher choice ───────────────────────────────────────
	function edRecapRow(label, valueHtml) {
		return `<div class="ed-recap-row"><span class="ed-recap-label">${edEscape(label)}</span><span class="ed-recap-value">${valueHtml}</span></div>`;
	}

	function edRecapHtml(state) {
		const form = edFormHost(state.modal);
		const live = form ? edCollectHeader(form, state) : (state.header || {});
		const empty = '<span class="ed-recap-empty">not filled in</span>';
		const txt = (v) => (v === null || v === undefined || String(v).trim() === '') ? empty : edEscape(String(v));
		const hasDur = live.durationMinutes !== null && live.durationMinutes !== undefined && String(live.durationMinutes).trim() !== '';

		const headerRows = [
			edRecapRow('School', txt(live.schoolName)),
			edRecapRow('Subject', txt(live.subject)),
			edRecapRow('Level / Class', txt(live.level)),
			edRecapRow('Group', txt(live.group)),
			edRecapRow('Title', txt(live.title)),
			edRecapRow('Session', txt(live.sessionType)),
			edRecapRow('Date', txt(live.date)),
			edRecapRow('Duration', hasDur ? `${edEscape(String(live.durationMinutes))} min` : '<span class="ed-recap-empty">not filled in</span>'),
		].join('');

		const totalRev = REVIEW_FIELDS.length;
		const hiddenArr = Array.isArray(live.hiddenFields) ? live.hiddenFields : [];
		const hiddenLabels = hiddenArr.map((name) => {
			const f = REVIEW_FIELDS.find((x) => x.name === name);
			return f ? f.label : name;
		});
		const reviewValue = hiddenArr.length
			? `${totalRev - hiddenArr.length}/${totalRev} · hidden: <em>${edEscape(hiddenLabels.join(', '))}</em>`
			: `${totalRev}/${totalRev} · everything is printed`;

		const built = state.builtIn.find((t) => t.id === state.templateId);
		const custom = state.custom.find((t) => t.id === state.templateId);
		const tplName = (built && built.name) || (custom && custom.name) || state.templateId;
		const layoutBits = [edEscape(tplName), state.layout.columns === 2 ? '2 columns' : '1 column'];
		if (state.layout.density != null) layoutBits.push(`density ${edPoints(state.layout.density)}`);
		if (state.layout.answerLines != null) layoutBits.push(`${state.layout.answerLines} answer line(s)`);
		if (state.templateOverrides) layoutBits.push('"fit to N pages" adjustment');
		const est = state.estimate;
		const pagesValue = est
			? `<strong>${est.analytic} page(s)</strong>${est.exact != null ? ` (render ${est.exact})` : ''}`
			: '<span class="ed-recap-empty">not estimated</span>';

		return `
			<h4 class="ed-recap-title">Summary of your choices</h4>
			<div class="ed-recap-grid">
				<div class="ed-recap-card">
					<span class="ed-recap-card-title">Header</span>
					${headerRows}
				</div>
				<div class="ed-recap-card">
					<span class="ed-recap-card-title">Review</span>
					${edRecapRow('Printed elements', reviewValue)}
					${edRecapRow('Logo', live.logoUrl ? 'yes' : '<span class="ed-recap-empty">none</span>')}
					${edRecapRow('Instructions', live.instructions ? 'shown' : '<span class="ed-recap-empty">none</span>')}
				</div>
				<div class="ed-recap-card">
					<span class="ed-recap-card-title">Layout</span>
					${edRecapRow('Template', edEscape(tplName))}
					${edRecapRow('Pagination', pagesValue)}
					${edRecapRow('Marking scheme', state.normalization.mode === 'scale-to-20' ? 'normalized to 20' : 'as stored')}
				</div>
			</div>
			<p class="ed-recap-note">Check these settings, then look at the rendering below. The student paper and the answer key are exported separately.</p>`;
	}

	function edRenderRecap(state) {
		const host = state.modal.querySelector('[data-ed-role="recap"]');
		if (host) host.innerHTML = edRecapHtml(state);
	}

	// ─── Modal ───────────────────────────────────────────────────────────────
	function openExamDocuments(examId) {
		const examsRow = (window.__DI_CONTAINER__?.repo?.getAll_sync?.('exams') || []).find(
			(e) => String(e.id) === String(examId),
		);
		const examName = (examsRow && (examsRow.name || examsRow.title)) || 'Exam';

		const state = {
			examId: String(examId),
			header: {},
			previews: { student: null, answer_key: null },
			normalization: { mode: 'as-is', confirmed: false },
			activeDocument: 'student',
			lastDocument: 'student',
			logoDataUrl: null,
			busy: false,
			// Template layer (Génération personnalisée).
			templateId: 'classique',
			layout: { columns: 1, density: null, answerLines: null },
			// Progressive disclosure of the layout controls on step 3.
			layoutOpen: false,
			templateOverrides: null,
			builtIn: [],
			custom: [],
			estimate: null,
			comparison: null,
			fit: null,
			templatesLoaded: false,
			// Stepper navigation: `step` is the visible step, `maxStep` the furthest
			// one the teacher has unlocked by pressing Suivant (soft validation).
			step: 0,
			maxStep: 0,
		};

		const modal = document.createElement('div');
		state.modal = modal;
		modal.className = 'exam-documents-modal';
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('aria-hidden', 'false');
		document.documentElement.classList.add('modal-open');
		document.body.classList.add('modal-open');

		const answerKeyPanel = isStudentUser()
			? ''
			: '<div class="ed-doc" data-ed-panel="answer_key"></div>';

		modal.innerHTML = `
			<div class="modal-content ed-modal-content">
				<div class="modal-header">
					<div class="modal-header-with-icon">
						<div class="modal-header-icon icon-violet">
							<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
								<polyline points="14 2 14 8 20 8"></polyline>
								<line x1="8" y1="13" x2="16" y2="13"></line>
								<line x1="8" y1="17" x2="13" y2="17"></line>
							</svg>
						</div>
						<div class="modal-header-text">
							<h2>Exam Documents</h2>
							<p class="modal-header-subtitle ed-subtitle">${edEscape(examName)}</p>
						</div>
					</div>
					<button class="close-btn" aria-label="Close">&times;</button>
				</div>
				<div class="ed-stepper" role="tablist" aria-label="Generation flow">${edStepRailHtml()}</div>
				<div class="modal-body ed-body">
					<section class="ed-panel active" data-ed-panel="header">
						<div class="ed-form-host">${edHeaderForm({ logoScale: 1, grouping: 'none' })}</div>
						<p class="ed-help">Empty fields stay empty on the paper: nothing is invented. School name, year, teacher, class, title and duration are pre-filled from your saved data.</p>
						<div class="ed-header-actions">
							<button type="button" class="btn btn-primary btn-sm" data-ed-role="save-header">Save header</button>
						</div>
					</section>
					<section class="ed-panel" data-ed-panel="review">${edReviewPanelHtml()}</section>
					<section class="ed-panel" data-ed-panel="template"></section>
					<section class="ed-panel" data-ed-panel="preview">
						<div class="ed-recap" data-ed-role="recap"></div>
						${edDocSwitchHtml()}
						<div class="ed-doc active" data-ed-panel="student"></div>
						${answerKeyPanel}
						<div class="ed-normalize-host" data-ed-role="normalize-host"></div>
						<p class="ed-gate-hint" data-ed-role="gate-hint" style="display:none"></p>
					</section>
				</div>
				<div class="modal-footer ed-stepper-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-ed-role="step-prev" disabled>← Previous</button>
					<span class="ed-step-indicator" data-ed-role="step-indicator"></span>
					<button type="button" class="btn btn-primary btn-sm" data-ed-role="step-next">Next →</button>
					<button type="button" class="btn btn-secondary ed-close-btn">Close</button>
				</div>
			</div>`;

		document.body.appendChild(modal);
		edTouchDocumentPanel(state, 'student');
		if (!isStudentUser()) edTouchDocumentPanel(state, 'answer_key');
		edShowStep(state, 0);

		const close = () => {
			modal.remove();
			document.documentElement.classList.remove('modal-open');
			document.body.classList.remove('modal-open');
			document.removeEventListener('keydown', onKeyDown);
		};
		const onKeyDown = (e) => {
			if (e.key === 'Escape') close();
		};
		document.addEventListener('keydown', onKeyDown);
		modal.querySelector('.close-btn').addEventListener('click', close);
		modal.querySelector('.ed-close-btn').addEventListener('click', close);
		modal.addEventListener('click', (e) => {
			if (e.target === modal) close();
		});

		// Header scale readout + logo handling.
		const scaleInput = modal.querySelector('[data-ed-field="logoScale"]');
		const scaleValue = modal.querySelector('[data-ed-role="scale-value"]');
		if (scaleInput && scaleValue) {
			scaleInput.addEventListener('input', () => {
				scaleValue.textContent = `${edPoints(scaleInput.value)}×`;
			});
		}
		const logoPreview = modal.querySelector('[data-ed-role="logo-preview"]');
		const setLogoPreview = (src) => {
			if (!logoPreview) return;
			logoPreview.classList.toggle('has-image', !!src);
			logoPreview.innerHTML = src
				? `<img src="${edEscape(src)}" alt="">`
				: '<span class="ed-logo-empty">No logo</span>';
		};
		const logoFile = modal.querySelector('[data-ed-role="logo-file"]');
		logoFile?.addEventListener('change', () => {
			const file = logoFile.files && logoFile.files[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = String(reader.result || '');
				// Show it immediately, then persist it as a real file so the
				// exam record keeps a URL instead of megabytes of base64.
				state.logoDataUrl = dataUrl;
				setLogoPreview(dataUrl);
				edApi('POST', '/uploads', { dataUrl })
					.then((uploaded) => {
						if (uploaded && uploaded.url) {
							state.header.logoUrl = uploaded.url;
							state.logoDataUrl = null;
							setLogoPreview(uploaded.url);
							edApplyHeaderToForm(state);
							edToast('Logo saved.', 'success');
						}
					})
					.catch((err) => edToast(err?.message || 'The logo could not be uploaded.', 'error'));
			};
			reader.onerror = () => edToast('Unreadable image.', 'error');
			reader.readAsDataURL(file);
		});
		modal.querySelector('[data-ed-role="logo-clear"]')?.addEventListener('click', () => {
			state.header.logoUrl = null;
			state.header.logoDataUrl = null;
			state.logoDataUrl = null;
			if (logoFile) logoFile.value = '';
			setLogoPreview('');
			edApplyHeaderToForm(state);
		});

		modal.querySelector('[data-ed-role="save-header"]')?.addEventListener('click', () => {
			const header = edCollectHeader(edFormHost(modal), state);
			delete header.logoDataUrl; // never persisted
			edSetBusy(state, true);
			edApi('PUT', `${API_BASE}/${encodeURIComponent(state.examId)}/header`, header)
				.then((saved) => {
					state.header = Object.assign({}, state.header, (saved && saved.header) || header);
					state.logoDataUrl = null;
					edApplyHeaderToForm(state);
					edToast('Header saved for this exam.', 'success');
					// Any preview built with unsaved edits must be rebuilt.
					state.previews = { student: null, answer_key: null };
					edRenderDocumentPanels(state);
				})
				.catch((err) => edToast(err?.message || 'The header could not be saved.', 'error'))
				.finally(() => edSetBusy(state, false));
		});

		modal.addEventListener('click', (e) => {
			const button = e.target.closest('[data-ed-role]');
			if (!button) return;
			const role = button.getAttribute('data-ed-role');
			const doc = button.getAttribute('data-ed-doc') || state.activeDocument;
			// Stepper navigation and the Sujet/Corrigé switch live in the same
			// delegated handler as the document actions.
			if (role === 'step-goto') {
				const i = Number(button.getAttribute('data-ed-step'));
				if (i <= state.maxStep) edShowStep(state, i);
			} else if (role === 'step-prev') {
				edShowStep(state, state.step - 1);
			} else if (role === 'step-next') {
				edShowStep(state, state.step + 1);
			} else if (role === 'doc-switch') {
				edShowDocument(state, doc);
			} else if (role === 'refresh') {
				if (doc !== state.activeDocument) edShowDocument(state, doc);
				edRefreshPreview(state, doc).then(() => edSyncExportAvailability(state));
			} else if (role === 'export') {
				if (doc !== state.activeDocument) edShowDocument(state, doc);
				edExport(state, doc, button.getAttribute('data-ed-format'));
			} else if (role === 'print') {
				if (doc !== state.activeDocument) edShowDocument(state, doc);
				edPrint(state, doc);
			} else if (role === 'normalize') {
				const preview = state.previews[doc];
				if (!preview || !preview.scoring || !preview.scoring.normalizedPreview) {
					edRefreshPreview(state, doc);
					return;
				}
				edShowDocument(state, doc);
				edRenderDocumentPanels(state);
				const host = modal.querySelector('[data-ed-role="normalize-host"]');
				host?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			} else if (role === 'normalize-confirm') {
				state.normalization = { mode: 'scale-to-20', confirmed: true };
				edRefreshPreview(state, state.activeDocument);
				edToast('Marking scheme normalized to 20 for printing (exam data unchanged).', 'success');
			} else if (role === 'normalize-cancel') {
				state.normalization = { mode: 'as-is', confirmed: false };
				edRefreshPreview(state, state.activeDocument);
			} else if (role === 'review-all') {
				modal.querySelectorAll('[data-ed-panel="review"] [data-ed-hide]').forEach((el) => { el.checked = true; });
			} else if (role === 'review-none') {
				modal.querySelectorAll('[data-ed-panel="review"] [data-ed-hide]').forEach((el) => { el.checked = false; });
			} else if (role === 'tpl-card') {
				const id = button.getAttribute('data-ed-template');
				if (id) {
					state.templateId = id;
					state.templateOverrides = null;
					state.fit = null;
					const built = state.builtIn.find((t) => t.id === id);
					const customTpl = state.custom.find((t) => t.id === id);
					const columns = built ? built.columns : customTpl?.template?.page?.columns || 1;
					state.layout = { columns: columns === 2 ? 2 : 1, density: null, answerLines: null };
					// The rendered sheets depend on the template: force a rebuild.
					state.previews = { student: null, answer_key: null };
					state.estimate = null;
					edRenderTemplatePanel(state);
					edBindTemplateControls(state);
					edRenderDocumentPanels(state);
				}
			} else if (role === 'tpl-estimate') {
				edEstimate(state);
			} else if (role === 'tpl-compare') {
				edCompare(state);
			} else if (role === 'tpl-fit') {
				const target = modal.querySelector('[data-ed-role="tpl-fit-target"]');
				edFitPages(state, target ? target.value : 3);
			} else if (role === 'tpl-fit-apply') {
				if (state.fit && state.fit.template) {
					state.templateOverrides = state.fit.template;
					state.previews = { student: null, answer_key: null };
					edToast('Adjustment applied — refresh the preview to see it.', 'success');
					edRenderTemplatePanel(state);
					edBindTemplateControls(state);
					edRenderDocumentPanels(state);
				}
			} else if (role === 'tpl-clear-overrides') {
				state.templateOverrides = null;
				state.fit = null;
				state.previews = { student: null, answer_key: null };
				edRenderTemplatePanel(state);
				edBindTemplateControls(state);
				edRenderDocumentPanels(state);
			} else if (role === 'tpl-save-custom') {
				edSaveCustomTemplate(state);
			} else if (role === 'tpl-expand-layout') {
				state.layoutOpen = true;
				edRenderTemplatePanel(state);
				edBindTemplateControls(state);
			} else if (role === 'tpl-collapse-layout') {
				state.layoutOpen = false;
				edRenderTemplatePanel(state);
			}
		});

		// Load the persisted header + resolved defaults, then show the subject.
		edApi('GET', `${API_BASE}/${encodeURIComponent(state.examId)}/header`)
			.then((result) => {
				state.header = Object.assign({}, (result && result.header) || {});
				edApplyHeaderToForm(state);
			})
			.catch((err) => edToast(err?.message || 'The header could not be loaded.', 'error'));
	}

	function edApplyHeaderToForm(state) {
		const modal = state.modal;
		Object.entries(state.header || {}).forEach(([name, value]) => {
			const el = modal.querySelector(`[data-ed-field="${name}"]`);
			if (!el) return;
			if (el.type === 'checkbox') el.checked = value !== false;
			else if (value === null || value === undefined) el.value = '';
			else el.value = String(value);
		});
		const scaleValue = modal.querySelector('[data-ed-role="scale-value"]');
		if (scaleValue) scaleValue.textContent = `${edPoints(state.header.logoScale || 1)}×`;
		const logoPreview = modal.querySelector('[data-ed-role="logo-preview"]');
		if (logoPreview && !state.logoDataUrl) {
			const src = state.header.logoUrl || '';
			logoPreview.classList.toggle('has-image', !!src);
			logoPreview.innerHTML = src
				? `<img src="${edEscape(src)}" alt="">`
				: '<span class="ed-logo-empty">No logo</span>';
		}
		// Apply hiddenFields to the review checkboxes (unchecked = hidden).
		const hidden = new Set(Array.isArray(state.header.hiddenFields) ? state.header.hiddenFields : []);
		modal.querySelectorAll('[data-ed-panel="review"] [data-ed-hide]').forEach((el) => {
			el.checked = !hidden.has(el.getAttribute('data-ed-hide'));
		});
	}

	window.openExamDocuments = openExamDocuments;
	window.ExamDocuments = { openExamDocuments };
})();
