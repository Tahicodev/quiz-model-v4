// Exam Documents — printable subject (student paper) and confidential answer
// key, exported as real PDF and editable Word files.
//
// A teacher opens this from the exams table (document icon). The modal has
// three tabs:
//   1. En-tête      — the exam-specific institutional header (saved per exam).
//   2. Sujet élève  — the student paper preview + exports. NO answers, ever.
//   3. Corrigé      — the teacher answer key preview + exports (confidential).
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
		{ name: 'ministry', label: 'Ministère', placeholder: 'Ministère de l’Éducation nationale, du Préscolaire et des Sports' },
		{ name: 'academy', label: 'Académie / Direction', placeholder: 'Académie régionale' },
		{ name: 'schoolName', label: 'Établissement', placeholder: 'Nom de l’école' },
		{ name: 'academicYear', label: 'Année scolaire', placeholder: '2025-2026' },
		{ name: 'title', label: 'Titre de l’épreuve', placeholder: 'Devoir surveillé n°1' },
		{ name: 'sessionType', label: 'Session', placeholder: 'Première session / Rattrapage' },
		{ name: 'subject', label: 'Matière', placeholder: 'Mathématiques' },
		{ name: 'teacherName', label: 'Enseignant', placeholder: 'Nom du professeur' },
		{ name: 'level', label: 'Niveau / Classe', placeholder: '3ème année collège' },
		{ name: 'group', label: 'Groupe', placeholder: 'Groupe A' },
		{ name: 'term', label: 'Trimestre', placeholder: 'Trimestre 2' },
		{ name: 'date', label: 'Date', placeholder: '12/03/2026' },
		{ name: 'durationMinutes', label: 'Durée (minutes)', type: 'number', placeholder: '60', max: 600 },
	];

	const TOGGLES = [
		{ name: 'studentNameField', label: 'Champ Nom & prénom' },
		{ name: 'studentNumberField', label: 'Champ N° élève' },
		{ name: 'showClassField', label: 'Champ Classe' },
	];

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
			return Promise.reject(new Error('API client indisponible (api-client.js non chargé).'));
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
		const toggles = TOGGLES.map(
			(toggle) => `
			<label class="ed-check">
				<input type="checkbox" data-ed-field="${toggle.name}" ${header[toggle.name] === false ? '' : 'checked'}>
				<span>${edEscape(toggle.label)}</span>
			</label>`,
		).join('');
		const logoSrc = header.logoDataUrl || header.logoUrl || '';
		return `
			<div class="ed-form-grid">${inputs}
				<div class="ed-field">
					<label class="ed-label" for="ed-field-grouping">Regroupement des questions</label>
					<select class="ed-input" id="ed-field-grouping" data-ed-field="grouping">
						<option value="none"${header.grouping === 'by-category' ? '' : ' selected'}>Une seule suite continue</option>
						<option value="by-category"${header.grouping === 'by-category' ? ' selected' : ''}>Par catégorie (exercices)</option>
					</select>
				</div>
			</div>

			<div class="ed-field ed-field--full">
				<label class="ed-label" for="ed-field-instructions">Consignes affichées sur le sujet</label>
				<textarea class="ed-input ed-textarea" id="ed-field-instructions" data-ed-field="instructions" rows="3"
					placeholder="Une seule réponse par question. Barème indicatif.">${edEscape(header.instructions || '')}</textarea>
			</div>

			<div class="ed-fieldset">
				<span class="ed-fieldset-title">Logo de l’établissement</span>
				<div class="ed-logo-row">
					<span class="ed-logo-preview${logoSrc ? ' has-image' : ''}" data-ed-role="logo-preview">
						${logoSrc ? `<img src="${edEscape(logoSrc)}" alt="">` : '<span class="ed-logo-empty">Aucun logo</span>'}
					</span>
					<div class="ed-logo-controls">
						<input type="file" accept="image/png,image/jpeg" class="ed-input ed-file" data-ed-role="logo-file">
						<label class="ed-range-label">
							Taille <span data-ed-role="scale-value">${edPoints(header.logoScale || 1)}×</span>
							<input type="range" min="0.2" max="1.5" step="0.05" class="ed-range"
								data-ed-field="logoScale" value="${edEscape(header.logoScale || 1)}">
						</label>
						<button type="button" class="btn btn-secondary btn-sm" data-ed-role="logo-clear">Retirer le logo</button>
					</div>
				</div>
				<p class="ed-help">Le logo est enregistré comme fichier téléversé ; il ne grossit pas les données de l’examen.</p>
			</div>

			<div class="ed-fieldset">
				<span class="ed-fieldset-title">Champs d’identification (sujet élève)</span>
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
		return header;
	}

	// ─── Panels ──────────────────────────────────────────────────────────────
	function edBanner(state, doc) {
		const preview = state.previews[doc];
		if (!preview) {
			return `<div class="ed-banner ed-banner-idle">Aperçu non généré — cliquez sur « Actualiser l’aperçu ».</div>`;
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
					<button type="button" class="btn btn-warning btn-sm" data-ed-role="normalize">Ajuster sur 20</button>
				</div>`
			: '';
		const normalized = scoring.normalized
			? `<span class="ed-chip ed-chip-muted">Barème enregistré conservé : ${edPoints(scoring.naturalTotal)} pts</span>`
			: '';
		const ok = scoring.valid20 || scoring.normalized;
		return `
			<div class="ed-banner ${ok ? 'ed-banner-ok' : 'ed-banner-bad'}">
				<div class="ed-banner-main">
					<span class="ed-total">Total : <strong>${edPoints(scoring.total)} / ${scoring.scale || 20}</strong></span>
					<span class="ed-chip ${ok ? 'ed-chip-ok' : 'ed-chip-bad'}">${ok ? 'Barème conforme' : 'Barème non conforme'}</span>
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
				<p>L’aperçu affiche le document exact qui sera exporté — pas l’interface de quiz.</p>
			</div>`;
		}
		return `<div class="ed-preview" data-ed-role="preview">${preview.html || ''}</div>`;
	}

	function edDocumentToolbar(doc) {
		const isKey = doc === 'answer_key';
		return `
			<div class="ed-toolbar">
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="refresh" data-ed-doc="${doc}">Actualiser l’aperçu</button>
				<span class="ed-toolbar-sep"></span>
				<button type="button" class="btn btn-primary btn-sm" data-ed-role="export" data-ed-format="pdf" data-ed-doc="${doc}">Exporter PDF</button>
				<button type="button" class="btn btn-primary btn-sm" data-ed-role="export" data-ed-format="docx" data-ed-doc="${doc}">Exporter Word</button>
				<button type="button" class="btn btn-secondary btn-sm" data-ed-role="print" data-ed-doc="${doc}">Imprimer</button>
				${isKey ? '<span class="ed-confidential">Document confidentiel — réservé à l’enseignant.</span>' : ''}
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
				<h4>Normalisation du barème sur 20</h4>
				<p>Le total enregistré est de <strong>${edPoints(scoring.naturalTotal)}</strong> points. Répartition
					proportionnelle proposée (pas de 0,25, somme exacte de 20). Les points de l’examen ne seront
					<strong>pas</strong> modifiés : cet ajustement n’existe que sur le document imprimé.</p>
				<div class="ed-table-wrap">
					<table class="ed-table">
						<thead><tr><th>Question</th><th>Enregistré</th><th>Imprimé</th></tr></thead>
						<tbody>${rows}</tbody>
					</table>
				</div>
				<div class="ed-normalize-actions">
					<button type="button" class="btn btn-primary btn-sm" data-ed-role="normalize-confirm">Confirmer et appliquer à l’impression</button>
					<button type="button" class="btn btn-secondary btn-sm" data-ed-role="normalize-cancel">Annuler</button>
				</div>
			</div>`;
	}

	// ─── Requests ────────────────────────────────────────────────────────────
	function edFormHost(modal) {
		return modal.querySelector('[data-ed-panel="header"]');
	}

	function edRequestBody(state, doc) {
		const modal = state.modal;
		return {
			document: doc,
			header: edCollectHeader(edFormHost(modal), state),
			normalization: {
				mode: state.normalization.mode,
				confirmed: state.normalization.confirmed,
			},
		};
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
				edToast(err?.message || "L’aperçu a échoué.", 'error');
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
	}

	function edExport(state, doc, format) {
		if (!window.API || typeof window.API.blob !== 'function') {
			edToast('Client API incomplet : téléchargement indisponible.', 'error');
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
					`Fichier ${format === 'pdf' ? 'PDF' : 'Word'} téléchargé.` +
						(warn.length ? ` ${warn.length} avertissement(s) de rendu.` : ''),
					warn.length ? 'warning' : 'success',
				);
				if (warn.length) console.warn('[exam-documents] render warnings', warn);
			})
			.catch((err) => {
				const payload = err && err.payload;
				if (payload && payload.error) {
					edToast(payload.error.message || 'Export refusé : barème non conforme.', 'error');
					state.previews[doc] = Object.assign({}, state.previews[doc], {
						scoring: payload.scoring || state.previews?.[doc]?.scoring,
						warnings: payload.warnings || [],
					});
					edRenderDocumentPanels(state);
				} else {
					edToast(err?.message || "La génération du fichier a échoué.", 'error');
				}
			})
			.finally(() => edSetBusy(state, false));
	}

	function edPrint(state, doc) {
		const preview = state.previews[doc];
		if (!preview || !preview.printHtml) {
			edToast('Générez d’abord l’aperçu avant d’imprimer.', 'warning');
			return Promise.resolve();
		}
		const win = window.open('', '_blank', 'width=900,height=1100');
		if (!win) {
			edToast('Fenêtre d’impression bloquée par le navigateur.', 'error');
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

	function edShowTab(state, name) {
		state.activeDocument = name === 'header' ? state.lastDocument : name;
		state.modal.querySelectorAll('.ed-tab-btn').forEach((tab) => {
			tab.classList.toggle('active', tab.getAttribute('data-ed-tab') === name);
		});
		state.modal.querySelectorAll('.ed-panel').forEach((panel) => {
			panel.classList.toggle('active', panel.getAttribute('data-ed-panel') === name);
		});
		const normalizeHost = state.modal.querySelector('[data-ed-role="normalize-host"]');
		if (normalizeHost) normalizeHost.innerHTML = edNormalizationPanel(state);
		edSyncExportAvailability(state);
	}

	// ─── Modal ───────────────────────────────────────────────────────────────
	function openExamDocuments(examId) {
		const examsRow = (window.__DI_CONTAINER__?.repo?.getAll_sync?.('exams') || []).find(
			(e) => String(e.id) === String(examId),
		);
		const examName = (examsRow && (examsRow.name || examsRow.title)) || 'Examen';

		const state = {
			examId: String(examId),
			header: {},
			previews: { student: null, answer_key: null },
			normalization: { mode: 'as-is', confirmed: false },
			activeDocument: 'student',
			lastDocument: 'student',
			logoDataUrl: null,
			busy: false,
		};

		const modal = document.createElement('div');
		state.modal = modal;
		modal.className = 'exam-documents-modal';
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		modal.setAttribute('aria-hidden', 'false');
		document.documentElement.classList.add('modal-open');
		document.body.classList.add('modal-open');

		const studentTab = isStudentUser()
			? ''
			: '<button type="button" class="ed-tab-btn" data-ed-tab="answer_key">Corrigé</button>';

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
				<div class="ed-tabs">
					<button type="button" class="ed-tab-btn active" data-ed-tab="header">En-tête</button>
					<button type="button" class="ed-tab-btn" data-ed-tab="student">Sujet élève</button>
					${studentTab}
				</div>
				<div class="modal-body ed-body">
					<div class="ed-panel active" data-ed-panel="header">
						<div class="ed-form-host">${edHeaderForm({ logoScale: 1, grouping: 'none' })}</div>
						<p class="ed-help">Les champs vides restent vides sur le papier : rien n’est inventé. Nom de l’école, année, enseignant, classe, titre et durée sont pré-remplis depuis vos données enregistrées.</p>
						<div class="ed-header-actions">
							<button type="button" class="btn btn-primary btn-sm" data-ed-role="save-header">Enregistrer l’en-tête</button>
							<button type="button" class="btn btn-secondary btn-sm" data-ed-role="goto-student">Voir le sujet</button>
						</div>
					</div>
					<div class="ed-panel" data-ed-panel="student"></div>
					${studentTab ? '<div class="ed-panel" data-ed-panel="answer_key"></div>' : ''}
					<div class="ed-normalize-host" data-ed-role="normalize-host"></div>
					<p class="ed-gate-hint" data-ed-role="gate-hint" style="display:none"></p>
				</div>
				<div class="modal-footer">
					<span class="ed-footer-note">Sujet et corrigé sont deux fichiers distincts.</span>
					<button type="button" class="btn btn-secondary ed-close-btn">Close</button>
				</div>
			</div>`;

		document.body.appendChild(modal);
		edTouchDocumentPanel(state, 'student');
		if (!isStudentUser()) edTouchDocumentPanel(state, 'answer_key');

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

		modal.querySelectorAll('.ed-tab-btn').forEach((tab) => {
			tab.addEventListener('click', () => {
				const name = tab.getAttribute('data-ed-tab');
				if (name !== 'header') state.lastDocument = name;
				edShowTab(state, name);
			});
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
				: '<span class="ed-logo-empty">Aucun logo</span>';
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
							edToast('Logo enregistré.', 'success');
						}
					})
					.catch((err) => edToast(err?.message || 'Le logo n’a pas pu être téléversé.', 'error'));
			};
			reader.onerror = () => edToast('Image illisible.', 'error');
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
					edToast('En-tête enregistré pour cet examen.', 'success');
					// Any preview built with unsaved edits must be rebuilt.
					state.previews = { student: null, answer_key: null };
					edRenderDocumentPanels(state);
				})
				.catch((err) => edToast(err?.message || "L’en-tête n’a pas pu être enregistré.", 'error'))
				.finally(() => edSetBusy(state, false));
		});

		modal.querySelector('[data-ed-role="goto-student"]')?.addEventListener('click', () => {
			state.lastDocument = 'student';
			edShowTab(state, 'student');
			edRefreshPreview(state, 'student');
		});

		modal.addEventListener('click', (e) => {
			const button = e.target.closest('[data-ed-role]');
			if (!button) return;
			const role = button.getAttribute('data-ed-role');
			const doc = button.getAttribute('data-ed-doc') || state.activeDocument;
			if (role === 'refresh') {
				if (doc !== state.activeDocument) edShowTab(state, doc);
				edRefreshPreview(state, doc).then(() => edSyncExportAvailability(state));
			} else if (role === 'export') {
				if (doc !== state.activeDocument) edShowTab(state, doc);
				edExport(state, doc, button.getAttribute('data-ed-format'));
			} else if (role === 'print') {
				if (doc !== state.activeDocument) edShowTab(state, doc);
				edPrint(state, doc);
			} else if (role === 'normalize') {
				const preview = state.previews[doc];
				if (!preview || !preview.scoring || !preview.scoring.normalizedPreview) {
					edRefreshPreview(state, doc);
					return;
				}
				edShowTab(state, doc);
				edRenderDocumentPanels(state);
				const host = modal.querySelector('[data-ed-role="normalize-host"]');
				host?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			} else if (role === 'normalize-confirm') {
				state.normalization = { mode: 'scale-to-20', confirmed: true };
				edRefreshPreview(state, state.activeDocument);
				edToast('Barème normalisé sur 20 pour l’impression (données de l’examen inchangées).', 'success');
			} else if (role === 'normalize-cancel') {
				state.normalization = { mode: 'as-is', confirmed: false };
				edRefreshPreview(state, state.activeDocument);
			}
		});

		// Load the persisted header + resolved defaults, then show the subject.
		edApi('GET', `${API_BASE}/${encodeURIComponent(state.examId)}/header`)
			.then((result) => {
				state.header = Object.assign({}, (result && result.header) || {});
				edApplyHeaderToForm(state);
			})
			.catch((err) => edToast(err?.message || "L’en-tête n’a pas pu être chargé.", 'error'));
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
				: '<span class="ed-logo-empty">Aucun logo</span>';
		}
	}

	window.openExamDocuments = openExamDocuments;
	window.ExamDocuments = { openExamDocuments };
})();
