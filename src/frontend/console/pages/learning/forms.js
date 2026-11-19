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
		wide: true,
		body: `
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				<div class="ac-form__grid">
					${select({
						id: 'ac-obj-subject',
						label: t('field.subject'),
						value: objective?.subject_id || '',
						options: subjects.map((subject) => ({ value: subject.id, label: subject.name })),
						allLabel: null,
					})}
					${field({ id: 'ac-obj-code', label: t('field.code'), value: objective?.code || '' })}
					${field({ id: 'ac-obj-order', label: t('field.orderIndex'), type: 'number', value: objective?.order_index ?? 0 })}
					${select({
						id: 'ac-obj-bloom',
						label: t('field.bloom'),
						value: objective?.primary_bloom_dimension_id || '',
						options: bloomOptions(bloom, { lang }),
						allLabel: '—',
					})}
					<div class="ac-field ac-field--full">
						<label class="ac-field__label" for="ac-obj-statement">${esc(t('field.statement'))}</label>
						<input class="ac-input ac-input--full" id="ac-obj-statement" type="text" value="${esc(
							objective?.statement || '',
						)}" autocomplete="off" />
					</div>
					${textarea({
						id: 'ac-obj-description',
						label: t('field.description'),
						value: objective?.description || '',
						rows: 3,
					})}
					<div data-ac-obj-dependent class="ac-field ac-field--full"></div>
				</div>
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.save'))}</button>`,
	});

	const root = modal.root;
	const subjectSelect = root.querySelector('#ac-obj-subject');
	const dependent = root.querySelector('[data-ac-obj-dependent]');

	/** Category and parent are both scoped by the effective subject. */
	function paintDependent() {
		const subjectId = subjectSelect.value || objective?.subject_id || '';
		const subjectCategories = (categories || []).filter(
			(category) => !subjectId || !category.subject_id || category.subject_id === subjectId,
		);
		const subjectObjectives = ownObjectives.filter(
			(row) => !subjectId || row.subject_id === subjectId,
		);
		dependent.innerHTML = `<div class="ac-form__grid">
			${select({
				id: 'ac-obj-category',
				label: t('field.category'),
				value: objective?.category_id || '',
				options: subjectCategories.map((category) => ({ value: category.id, label: category.name })),
				allLabel: '—',
			})}
			${select({
				id: 'ac-obj-parent',
				label: t('field.parent'),
				value: objective?.parent_id || '',
				options: subjectObjectives.map((row) => ({
					value: row.id,
					label: `${row.code} — ${truncate(row.statement)}`,
				})),
				allLabel: '—',
			})}
		</div>`;
	}
	paintDependent();
	subjectSelect.addEventListener('change', paintDependent);

	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());
	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
		const button = event.currentTarget;
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
					${field({ id: 'ac-comp-code', label: t('field.code'), value: competency?.code || '' })}
					${field({ id: 'ac-comp-name', label: t('field.name'), value: competency?.name || '' })}
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
					})}
				</div>
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.save'))}</button>`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());
	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
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
					})}
					${field({ id: 'ac-link-weight', label: t('field.weight'), type: 'number', value: 1 })}
				</div>
				${checkbox({
					id: 'ac-link-primary',
					label: t('field.primaryCompetency'),
				})}
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.linkCompetency'))}</button>`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());
	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
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
					})}
					${select({
						id: 'ac-prereq-strength',
						label: t('field.strength'),
						value: 'required',
						options: ['required', 'recommended'].map((key) => ({
							value: key,
							label: t(`strength.${key}`),
						})),
					})}
					${field({
						id: 'ac-prereq-mastery',
						label: t('field.minMastery'),
						value: 'developing',
					})}
					${textarea({
						id: 'ac-prereq-rationale',
						label: t('field.rationale'),
						value: '',
						rows: 2,
					})}
				</div>
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-form-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ac-btn--primary" data-ac-form-save>${esc(t('action.addPrerequisite'))}</button>`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-form-cancel]').addEventListener('click', () => modal.close());
	root.querySelector('[data-ac-form-save]').addEventListener('click', async (event) => {
		const candidate = valueOf(root, '#ac-prereq-objective');
		if (!candidate) {
			toast(`${t('field.objective')} — ${t('error.save')}`, 'error');
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
