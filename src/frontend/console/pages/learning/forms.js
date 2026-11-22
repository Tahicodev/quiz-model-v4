/**
 * src/frontend/console/pages/learning/forms.js
 *
 * The taxonomy editors: objective, competency, competency link, prerequisite.
 *
 * They are dialogs rather than routes because each one is a short, bounded
 * edit on a record the operator already has in front of them — and because a
 * half-filled objective form is not an address worth bookmarking.
 *
 * Every form posts the fields the operator actually filled in. Optional
 * fields left blank are sent as null (a real clear), never as an empty string
 * the server would have to guess about.
 *
 * NOTE: these dialogs are not RTL yet. The frozen spec confines `dir` to the
 * learning-panel root, and a modal lives outside it; making the panel's own
 * dialogs RTL belongs to the localization pass, not here.
 */

import { api } from '../../core/api.js';
import { esc } from '../../viz/charts.js';
import { openModal, toast } from '../../components/ui.js';
import { field, textarea, select, checkbox } from '../../components/form.js';
import { getLanguage, translator } from './labels.js';
import { bloomOptions } from './common.js';

// ── Objective ────────────────────────────────────────────────────────────────

/**
 * @param {{ objective?:object|null, subjects:Array, objectives:Array, categories:Array,
 *           bloom:Array, onSaved:(record:object)=>void }} options
 */
export function openObjectiveForm({ objective = null, subjects, objectives, categories, bloom, onSaved }) {
	const lang = getLanguage();
	const t = translator(lang);
	const isEdit = Boolean(objective);
	const editingId = objective?.id || null;
	const ownObjectives = (objectives || []).filter((row) => row.id !== editingId);

	const modal = openModal({
		title: isEdit ? t('action.edit') : t('action.newObjective'),
		subtitle: isEdit ? objective.code : t('hint.teacherProposal'),
		body: `
			<div class="ac-form ac-form--objective" data-ac-form>
				<div data-ac-form-error hidden></div>
				${isEdit && !objective.proposed_by ? `<p class="ac-field__hint ac-provenance-note">${esc(t('form.note.official'))}</p>` : ''}

				<section class="ac-form__section">
					<h3 class="ac-form__section-title">${esc(t('objSection.context'))}</h3>
					<div class="ac-form__row">
						${select({
							id: 'ac-obj-subject',
							label: t('field.subject'),
							value: objective?.subject_id || '',
							options: subjects.map((subject) => ({ value: subject.id, label: subject.name })),
							allLabel: null,
							required: true,
						})}
						<div data-ac-obj-parent-slot class="ac-field" data-ac-field></div>
					</div>
				</section>

				<section class="ac-form__section">
					<h3 class="ac-form__section-title">${esc(t('objSection.outcome'))}</h3>
					<div class="ac-field ac-field--full" data-ac-field>
						<label class="ac-field__label ac-field__label--primary" for="ac-obj-statement">${esc(t('field.statement'))}<span class="ac-required" aria-hidden="true" title="${esc(t('form.requiredMark'))}">*</span></label>
						<textarea class="ac-input ac-input--full ac-input--statement" id="ac-obj-statement" rows="3" aria-required="true" autocomplete="off" placeholder="${esc(t('form.hint.statement'))}">${esc(
							objective?.statement || '',
						)}</textarea>
					</div>
					${textarea({
						id: 'ac-obj-description',
						label: t('field.description'),
						value: objective?.description || '',
						rows: 2,
					})}
				</section>

				<section class="ac-form__section">
					<h3 class="ac-form__section-title">${esc(t('objSection.organization'))}</h3>
					<div class="ac-form__row">
						${field({ id: 'ac-obj-code', label: t('field.code'), value: objective?.code || '', hint: t('form.hint.code'), required: true })}
						<div data-ac-obj-category-slot class="ac-field" data-ac-field></div>
					</div>
					<div class="ac-form__row">
						${select({
							id: 'ac-obj-bloom',
							label: t('field.bloom'),
							value: objective?.primary_bloom_dimension_id || '',
							options: bloomOptions(bloom, { lang }),
							allLabel: t('option.none'),
						})}
						${field({ id: 'ac-obj-order', label: t('field.orderIndex'), type: 'number', value: objective?.order_index ?? 0, hint: t('form.hint.order') })}
					</div>
				</section>
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.save'))}</button>`,
	});

	const root = modal.root;
	const subjectSelect = root.querySelector('#ac-obj-subject');
	const parentSlot = root.querySelector('[data-ac-obj-parent-slot]');
	const categorySlot = root.querySelector('[data-ac-obj-category-slot]');

	/** Category and parent are both scoped by the effective subject, but each
	 *  lives in its own conceptual group (context vs organization). */
	function paintDependent() {
		const subjectId = subjectSelect.value || objective?.subject_id || '';
		const subjectCategories = (categories || []).filter(
			(category) => !subjectId || !category.subject_id || category.subject_id === subjectId,
		);
		const subjectObjectives = ownObjectives.filter(
			(row) => !subjectId || row.subject_id === subjectId,
		);
		parentSlot.innerHTML = select({
			id: 'ac-obj-parent',
			label: t('field.parent'),
			value: objective?.parent_id || '',
			options: subjectObjectives.map((row) => ({
				value: row.id,
				label: `${row.code} — ${truncate(row.statement)}`,
			})),
			allLabel: t('option.none'),
		});
		categorySlot.innerHTML = select({
			id: 'ac-obj-category',
			label: t('field.category'),
			value: objective?.category_id || '',
			options: subjectCategories.map((category) => ({ value: category.id, label: category.name })),
			allLabel: t('option.none'),
		});
	}
	paintDependent();
	subjectSelect.addEventListener('change', paintDependent);

	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());

	/** Clear the invalid highlight as soon as the teacher fixes a field. */
	bindInvalidClear(root);

	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
		const button = event.currentTarget;

		// Client-side required check: fail fast with the field highlighted, so the
		// teacher never loses a half-written form to a server 500.
		if (requireFields(root, ['#ac-obj-subject', '#ac-obj-code', '#ac-obj-statement']).length) {
			showMissing(root, t);
			return;
		}

		const body = {
			subject_id: valueOf(root, '#ac-obj-subject'),
			code: valueOf(root, '#ac-obj-code'),
			statement: valueOf(root, '#ac-obj-statement'),
			description: nullish(root.querySelector('#ac-obj-description')),
			category_id: nullish(root.querySelector('#ac-obj-category')),
			parent_id: nullish(root.querySelector('#ac-obj-parent')),
			primary_bloom_dimension_id: nullish(root.querySelector('#ac-obj-bloom')),
		};
		const order = valueOf(root, '#ac-obj-order');
		if (order !== '') body.order_index = order;

		await submit({
			root,
			button,
			url: isEdit ? `learning/objectives/${encodeURIComponent(editingId)}` : 'learning/objectives',
			method: isEdit ? 'patch' : 'post',
			body,
			toastMessage: t('toast.objectiveSaved'),
			onSaved: (record) => {
				modal.close();
				onSaved?.(record);
			},
		});
	});
}

// ── Competency ───────────────────────────────────────────────────────────────

export function openCompetencyForm({ competency = null, subjects, competencies, onSaved }) {
	const lang = getLanguage();
	const t = translator(lang);
	const isEdit = Boolean(competency);
	const editingId = competency?.id || null;

	const modal = openModal({
		title: isEdit ? t('action.edit') : t('action.newCompetency'),
		subtitle: isEdit ? competency.code : '',
		wide: true,
		body: `
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${field({
						id: 'ac-comp-code',
						label: t('field.code'),
						value: competency?.code || '',
						hint: t('form.hint.code'),
						required: true,
					})}
					${field({
						id: 'ac-comp-name',
						label: t('field.name'),
						value: competency?.name || '',
						hint: t('hint.form.name'),
						required: true,
					})}
					${select({
						id: 'ac-comp-kind',
						label: t('field.kind'),
						value: competency?.kind || 'competency',
						options: ['competency', 'skill', 'domain'].map((key) => ({
							value: key,
							label: t(`kind.${key}`),
						})),
					})}
					${select({
						id: 'ac-comp-subject',
						label: t('field.subject'),
						value: competency?.subject_id || '',
						options: subjects.map((subject) => ({ value: subject.id, label: subject.name })),
						allLabel: '—',
					})}
					${select({
						id: 'ac-comp-parent',
						label: t('field.parent'),
						value: competency?.parent_id || '',
						options: (competencies || [])
							.filter((row) => row.id !== editingId)
							.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
						allLabel: '—',
					})}
					${textarea({
						id: 'ac-comp-description',
						label: t('field.description'),
						value: competency?.description || '',
						rows: 3,
						hint: t('hint.form.description'),
					})}
				</div>
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.save'))}</button>`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());
	bindInvalidClear(root);
	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
		if (requireFields(root, ['#ac-comp-code', '#ac-comp-name']).length) {
			showMissing(root, t);
			return;
		}
		await submit({
			root,
			button: event.currentTarget,
			url: isEdit ? `learning/competencies/${encodeURIComponent(editingId)}` : 'learning/competencies',
			method: isEdit ? 'patch' : 'post',
			body: {
				code: valueOf(root, '#ac-comp-code'),
				name: valueOf(root, '#ac-comp-name'),
				description: nullish(root.querySelector('#ac-comp-description')),
				kind: valueOf(root, '#ac-comp-kind'),
				subject_id: nullish(root.querySelector('#ac-comp-subject')),
				parent_id: nullish(root.querySelector('#ac-comp-parent')),
			},
			toastMessage: t('toast.competencySaved'),
			onSaved: (record) => {
				modal.close();
				onSaved?.(record);
			},
		});
	});
}

// ── Objective ↔ competency link ──────────────────────────────────────────────

export function openCompetencyLinkForm({ objective, competencies, onSaved }) {
	const lang = getLanguage();
	const t = translator(lang);

	const modal = openModal({
		title: t('action.linkCompetency'),
		subtitle: `${objective.code} — ${truncate(objective.statement)}`,
		body: `
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${select({
						id: 'ac-link-competency',
						label: t('field.competency'),
						value: '',
						options: (competencies || []).map((row) => ({
							value: row.id,
							label: `${row.code} — ${row.name}`,
						})),
						allLabel: '—',
						required: true,
					})}
					${field({
						id: 'ac-link-weight',
						label: t('field.weight'),
						type: 'number',
						value: 1,
						hint: t('hint.form.weight'),
					})}
				</div>
				${checkbox({
					id: 'ac-link-primary',
					label: t('field.primaryCompetency'),
					hint: t('hint.form.primary'),
				})}
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.linkCompetency'))}</button>`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());
	bindInvalidClear(root);
	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
		if (requireFields(root, ['#ac-link-competency']).length) {
			showMissing(root, t);
			return;
		}
		await submit({
			root,
			button: event.currentTarget,
			url: `learning/objectives/${encodeURIComponent(objective.id)}/competencies`,
			method: 'post',
			body: {
				competency_id: valueOf(root, '#ac-link-competency'),
				weight: Number(valueOf(root, '#ac-link-weight')) || 1,
				is_primary: root.querySelector('#ac-link-primary').checked,
			},
			toastMessage: t('toast.linked'),
			onSaved: () => {
				modal.close();
				onSaved?.();
			},
		});
	});
}

// ── Prerequisite ─────────────────────────────────────────────────────────────

export function openPrerequisiteForm({ objective, objectives, onSaved }) {
	const lang = getLanguage();
	const t = translator(lang);
	const candidates = (objectives || []).filter((row) => row.id !== objective?.id);

	const modal = openModal({
		title: t('action.addPrerequisite'),
		subtitle: `${objective.code} — ${truncate(objective.statement)}`,
		body: `
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${select({
						id: 'ac-prereq-objective',
						label: t('field.objective'),
						value: '',
						options: candidates.map((row) => ({
							value: row.id,
							label: `${row.code} — ${truncate(row.statement)}`,
						})),
						allLabel: '—',
						required: true,
					})}
					${select({
						id: 'ac-prereq-strength',
						label: t('field.strength'),
						value: 'required',
						hint: t('hint.form.strength'),
						options: ['required', 'recommended'].map((key) => ({
							value: key,
							label: t(`strength.${key}`),
						})),
					})}
					${field({
						id: 'ac-prereq-mastery',
						label: t('field.minMastery'),
						value: 'developing',
						hint: t('hint.form.minMastery'),
					})}
					${textarea({
						id: 'ac-prereq-rationale',
						label: t('field.rationale'),
						value: '',
						rows: 2,
						hint: t('hint.form.rationale'),
					})}
				</div>
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.addPrerequisite'))}</button>`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());
	bindInvalidClear(root);
	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
		if (requireFields(root, ['#ac-prereq-objective']).length) {
			showMissing(root, t);
			return;
		}
		await submit({
			root,
			button: event.currentTarget,
			url: `learning/objectives/${encodeURIComponent(objective.id)}/prerequisites`,
			method: 'post',
			body: {
				prerequisite_objective_id: candidate,
				strength: valueOf(root, '#ac-prereq-strength'),
				min_mastery_state: valueOf(root, '#ac-prereq-mastery') || 'developing',
				rationale: nullish(root.querySelector('#ac-prereq-rationale')),
			},
			toastMessage: t('toast.prerequisiteAdded'),
			onSaved: () => {
				modal.close();
				onSaved?.();
			},
		});
	});
}

// ── Shared plumbing ──────────────────────────────────────────────────────────

async function submit({ root, button, url, method, body, toastMessage, onSaved }) {
	button.disabled = true;
	hideFormError(root);
	try {
		const record = await (method === 'patch' ? api.patch(url, body) : api.post(url, body));
		toast(toastMessage, 'success');
		onSaved?.(record);
	} catch (err) {
		button.disabled = false;
		showFormError(root, err);
	}
}

/** Highlight required controls that are still empty. Returns them. */
function requireFields(root, selectors) {
	const missing = [];
	selectors.forEach((selector) => {
		const control = root.querySelector(selector);
		const box = control ? control.closest('[data-ac-field]') : null;
		if (control && !String(control.value || '').trim()) {
			missing.push(control);
			if (box) box.classList.add('ac-field--invalid');
		} else if (box) {
			box.classList.remove('ac-field--invalid');
		}
	});
	return missing;
}

/** Show the standard "required fields" alert and focus the first offender. */
function showMissing(root, t) {
	const host = root.querySelector('[data-ac-form-error]');
	if (host) {
		host.hidden = false;
		host.innerHTML = `<div class="ac-alert ac-alert--danger"><div class="ac-alert__body"><p class="ac-alert__text">${esc(
			t('form.requiredMissing'),
		)}</p></div></div>`;
	}
	root.querySelector('.ac-field--invalid .ac-input, .ac-field--invalid .ac-select')?.focus();
}

/**
 * Clear the invalid highlight as soon as the operator fixes a field. Delegated,
 * so it also covers fields a select re-renders (e.g. the objective parent).
 */
function bindInvalidClear(root) {
	const clear = (event) => {
		const box = event.target?.closest?.('[data-ac-field]');
		if (box) box.classList.remove('ac-field--invalid');
	};
	root.addEventListener('input', clear);
	root.addEventListener('change', clear);
}

function showFormError(root, err) {
	const host = root.querySelector('[data-ac-form-error]');
	if (!host) return;
	const lines = fieldMessages(err);
	host.hidden = false;
	host.innerHTML = `<div class="ac-alert ac-alert--danger"><div class="ac-alert__body">${lines
		.map((line) => `<p class="ac-alert__text">${esc(line)}</p>`)
		.join('')}</div></div>`;
}

function hideFormError(root) {
	const host = root.querySelector('[data-ac-form-error]');
	if (host) {
		host.hidden = true;
		host.innerHTML = '';
	}
}

/** Turn a `ValidationError` payload into one readable line per field. */
function fieldMessages(err) {
	const fields = err?.fields && typeof err.fields === 'object' ? err.fields : null;
	if (!fields) return [err?.message || 'The change could not be saved'];
	const lines = [];
	for (const [key, messages] of Object.entries(fields)) {
		const list = Array.isArray(messages) ? messages : [messages];
		for (const message of list) lines.push(`${key}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
	}
	return lines.length ? lines : [err?.message || 'The change could not be saved'];
}

function valueOf(root, selector) {
	return String(root.querySelector(selector)?.value ?? '').trim();
}

function nullish(element) {
	const value = String(element?.value ?? '').trim();
	return value === '' ? null : value;
}

function truncate(value, max = 56) {
	const text = String(value ?? '');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
