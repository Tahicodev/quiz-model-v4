/**
 * src/frontend/console/pages/learning/pedagogy-editor.js
 *
 * The Question Pedagogy panel: one question, its assessment criteria.
 *
 * The criteria ARE the classification — `Question.pedagogy_status` and
 * `Question.primary_bloom_dimension_id` are caches the server derives from
 * these rows on every write. That is why this panel replaces the whole set
 * through `PUT /learning/questions/:id/pedagogy` instead of patching fields
 * one at a time: the weights must be validated as a set (they have to total
 * 1.00), and a half-saved set would leave a wrong cache behind.
 *
 * Phase 1 has no AI suggestion: every row here is typed by a person, and the
 * "Reviewed by me" stamp records that a person did it.
 */

import { api } from '../../core/api.js';
import { esc } from '../../viz/charts.js';
import { loadingBlock, errorState } from '../../components/states.js';
import { openModal, confirmDialog, toast, formatDate } from '../../components/ui.js';
import { getLanguage, translator } from './labels.js';
import { bloomOptions, pedagogyChip } from './common.js';

/** Matches the server's own tolerance, so the browser never disagrees with it. */
const WEIGHT_TOLERANCE = 0.001;

/**
 * Open the pedagogy panel for one question.
 *
 * @param {{ question: object, bloom: Array, objectives: Array, competencies: Array,
 *           onSaved?: (payload:object)=>void }} options
 */
export async function openPedagogyEditor({ question, bloom, objectives, competencies, onSaved = null }) {
	const lang = getLanguage();
	const t = translator(lang);

	const modal = openModal({
		title: t('action.classify'),
		subtitle: questionLabel(question),
		wide: true,
		body: `<div data-ac-pedagogy-host>${loadingBlock(3)}</div>`,
		footer: '<div data-ac-pedagogy-footer></div>',
	});

	const bodyHost = modal.root.querySelector('[data-ac-pedagogy-host]');
	const footerHost = modal.root.querySelector('[data-ac-pedagogy-footer]');

	let loaded;
	try {
		loaded = await api.get(`learning/questions/${encodeURIComponent(question.id)}/pedagogy`);
	} catch (err) {
		bodyHost.innerHTML = errorState({ title: t('error.load'), message: err.message, retry: false });
		return;
	}

	const state = {
		rows: (loaded.criteria || []).map(rowToState),
		status: loaded.pedagogy_status,
		reviewedAt: loaded.question?.pedagogy_reviewed_at || null,
		busy: false,
	};

	paint();

	// The body is re-rendered whenever a criterion is added or removed, so the
	// listeners live on the PERSISTENT hosts and are delegated once.
	bodyHost.addEventListener('input', (event) => {
		if (event.target.matches('[data-ac-crit-weight]')) updateSum();
	});
	bodyHost.addEventListener('click', (event) => {
		const target = event.target.closest('[data-ac-remove-criterion]');
		if (!target) return;
		event.preventDefault();
		state.rows = readRows();
		state.rows.splice(Number(target.dataset.acRemoveCriterion), 1);
		paint();
	});
	bodyHost.addEventListener('click', (event) => {
		if (!event.target.closest('[data-ac-add-criterion]')) return;
		event.preventDefault();
		state.rows = readRows();
		state.rows.push(emptyRow(objectives));
		paint();
	});

	footerHost.addEventListener('click', (event) => {
		const button = event.target.closest('button');
		if (!button || state.busy) return;
		if (button.matches('[data-ac-pedagogy-cancel]')) modal.close();
		if (button.matches('[data-ac-pedagogy-clear]')) clear();
		if (button.matches('[data-ac-pedagogy-save]')) save(button);
	});

	// ── Rendering ────────────────────────────────────────────────────────────

	function paint() {
		bodyHost.innerHTML = criteriaBody(state, { bloom, objectives, competencies, lang, t });
		footerHost.innerHTML = criteriaFooter(state, { lang, t });
		updateSum();
	}

	/** The live "x / 1.00" indicator, plus the save button's enabled state. */
	function updateSum() {
		const rows = readRows();
		const sum = rows.reduce((acc, row) => acc + (Number.isFinite(row.weight) ? row.weight : 0), 0);
		const indicator = bodyHost.querySelector('[data-ac-weight-sum]');
		const complete = rows.length > 0 && Math.abs(sum - 1) <= WEIGHT_TOLERANCE;
		if (indicator) {
			indicator.textContent = `${sum.toFixed(2)} / 1.00`;
			indicator.classList.toggle('is-complete', complete);
			indicator.classList.toggle('is-incomplete', rows.length > 0 && !complete);
		}
		const save = footerHost.querySelector('[data-ac-pedagogy-save]');
		if (save) save.disabled = state.busy || !complete;
	}

	/** Read the DOM back into plain rows. Called before every re-render. */
	function readRows() {
		return Array.from(bodyHost.querySelectorAll('[data-ac-criterion]')).map((node) => ({
			objective_id: node.querySelector('[data-ac-crit-objective]').value,
			bloom_dimension_id: node.querySelector('[data-ac-crit-bloom]').value,
			competency_id: node.querySelector('[data-ac-crit-competency]').value || null,
			weight: Number(node.querySelector('[data-ac-crit-weight]').value),
			criterion_key: node.querySelector('[data-ac-crit-key]').value.trim(),
			max_score: valueOrNull(node.querySelector('[data-ac-crit-max]').value),
			rubric: node.querySelector('[data-ac-crit-rubric]').value.trim(),
		}));
	}

	// ── Writes ───────────────────────────────────────────────────────────────

	async function save(button) {
		const rows = readRows();
		const problem = localProblem(rows, t);
		if (problem) {
			toast(problem, 'error');
			return;
		}

		state.busy = true;
		button.disabled = true;
		const markReviewed = Boolean(footerHost.querySelector('[data-ac-mark-reviewed]')?.checked);
		try {
			const payload = await api.put(`learning/questions/${encodeURIComponent(question.id)}/pedagogy`, {
				criteria: rows.map(toWireCriterion),
				source: 'manual',
				mark_reviewed: markReviewed,
			});
			toast(t('toast.classified'), 'success');
			modal.close();
			if (onSaved) onSaved(payload);
		} catch (err) {
			state.busy = false;
			button.disabled = false;
			toast(err.message, 'error');
		}
	}

	async function clear() {
		const ok = await confirmDialog({
			title: t('action.clearClassification'),
			message: t('action.clearClassification'),
			detail: questionLabel(question),
			confirmLabel: t('action.clearClassification'),
			danger: true,
		});
		if (!ok) return;

		state.busy = true;
		try {
			const payload = await api.del(`learning/questions/${encodeURIComponent(question.id)}/pedagogy`);
			toast(t('toast.cleared'), 'success');
			modal.close();
			if (onSaved) onSaved(payload);
		} catch (err) {
			state.busy = false;
			toast(err.message, 'error');
		}
	}
}

// ── Markup ───────────────────────────────────────────────────────────────────

function criteriaBody(state, { bloom, objectives, competencies, lang, t }) {
	const stamp = state.reviewedAt
		? `<p class="learning-panel__stamp">${esc(t('action.markReviewed'))} · ${esc(formatDate(state.reviewedAt))}</p>`
		: '';

	if (state.rows.length === 0) {
		return `<div class="learning-criteria" data-ac-criteria>
			<div class="learning-panel__status-row">
				${pedagogyChip(lang, 'unclassified')}
				<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-add-criterion>${esc(
					t('action.addCriterion'),
				)}</button>
			</div>
			<p class="ac-field__hint">${esc(t('hint.noCriteria'))}</p>
			${stamp}
		</div>`;
	}

	const rows = state.rows
		.map((row, index) =>
			criterionRow(row, index, { bloom, objectives, competencies, lang, t }),
		)
		.join('');

	return `<div class="learning-criteria" data-ac-criteria>
		<div class="learning-panel__status-row">
			${pedagogyChip(lang, state.status)}
			<span class="learning-weightsum" data-ac-weight-sum>0.00 / 1.00</span>
		</div>
		<div class="learning-criteria__rows">${rows}</div>
		<div class="learning-criteria__actions">
			<button type="button" class="ac-btn ac-btn--sm" data-ac-add-criterion>${esc(t('action.addCriterion'))}</button>
			<span class="ac-field__hint">${esc(t('hint.weightSum'))}</span>
		</div>
		${stamp}
	</div>`;
}

function criterionRow(row, index, { bloom, objectives, competencies, lang, t }) {
	const objectiveOptions = [
		{ value: '', label: `— ${t('field.objective')} —` },
		...objectives.map((objective) => ({
			value: objective.id,
			label: objectiveOptionLabel(objective),
		})),
	];
	const bloomChoices = [{ value: '', label: `— ${t('field.bloom')} —` }, ...bloomOptions(bloom, { lang })];
	const competencyChoices = [
		{ value: '', label: `— ${t('field.competency')} —` },
		...competencies.map((competency) => ({
			value: competency.id,
			label: `${competency.code} — ${competency.name}`,
		})),
	];

	return `<div class="learning-criterion" data-ac-criterion data-ac-criterion-index="${index}">
		<div class="learning-criterion__head">
			<span class="learning-criterion__key">${esc(t('field.criterionKey'))} ${
				index + 1
			}</span>
			<button type="button" class="ac-btn ac-btn--sm ac-btn--ghost" data-ac-remove-criterion="${index}">${esc(
				t('action.removeCriterion'),
			)}</button>
		</div>
		<div class="learning-criterion__grid">
			<label class="ac-field">
				<span class="ac-field__label">${esc(t('field.objective'))}</span>
				<select class="ac-select" data-ac-crit-objective>${options(objectiveOptions, row.objective_id)}</select>
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${esc(t('field.bloom'))}</span>
				<select class="ac-select" data-ac-crit-bloom>${options(bloomChoices, row.bloom_dimension_id)}</select>
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${esc(t('field.competency'))}</span>
				<select class="ac-select" data-ac-crit-competency>${options(
					competencyChoices,
					row.competency_id,
				)}</select>
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${esc(t('field.weight'))}</span>
				<input class="ac-input" type="number" min="0" max="1" step="0.05" value="${esc(
					Number(row.weight) || 0,
				)}" data-ac-crit-weight />
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${esc(t('field.criterionKey'))}</span>
				<input class="ac-input" type="text" value="${esc(row.criterion_key || '')}" data-ac-crit-key />
			</label>
			<label class="ac-field">
				<span class="ac-field__label">${esc(t('field.maxScore'))}</span>
				<input class="ac-input" type="number" min="0" step="0.5" value="${esc(
					row.max_score ?? '',
				)}" data-ac-crit-max />
			</label>
		</div>
		<label class="ac-field ac-field--full">
			<span class="ac-field__label">${esc(t('field.rubric'))}</span>
			<textarea class="ac-input ac-input--full" rows="2" data-ac-crit-rubric>${esc(row.rubric || '')}</textarea>
			<span class="ac-field__hint">${esc(t('hint.rubricJson'))}</span>
		</label>
	</div>`;
}

function criteriaFooter(state, { t }) {
	return `<div class="learning-panel__footer">
		<div class="learning-panel__footer-left">
			<button type="button" class="ac-btn ac-btn--sm ac-btn--danger" data-ac-pedagogy-clear${
				state.rows.length === 0 ? ' disabled' : ''
			}>${esc(t('action.clearClassification'))}</button>
		</div>
		<label class="ac-check">
			<input type="checkbox" data-ac-mark-reviewed checked />
			<span class="ac-check__label">${esc(t('action.markReviewed'))}</span>
		</label>
		<button type="button" class="ac-btn" data-ac-pedagogy-cancel>${esc(t('action.cancel'))}</button>
		<button type="button" class="ac-btn ac-btn--primary" data-ac-pedagogy-save disabled>${esc(
			t('action.save'),
		)}</button>
	</div>`;
}

function options(choices, selected) {
	return choices
		.map(
			(choice) =>
				`<option value="${esc(choice.value)}"${
					String(choice.value) === String(selected ?? '') ? ' selected' : ''
				}>${esc(choice.label)}</option>`,
		)
		.join('');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A short, human label for the question the panel is editing. */
export function questionLabel(question) {
	return `${question.type || 'question'} · ${truncateText(question.text)}`;
}

function truncateText(value, max = 70) {
	const text = String(value ?? '');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function objectiveOptionLabel(objective) {
	const statement = String(objective.statement ?? '');
	return `${objective.code} — ${statement.length > 60 ? `${statement.slice(0, 59)}…` : statement}`;
}

function valueOrNull(value) {
	return value === '' || value == null ? null : Number(value);
}

function emptyRow(objectives) {
	return {
		objective_id: objectives.length === 1 ? objectives[0].id : '',
		bloom_dimension_id: '',
		competency_id: null,
		weight: 1,
		criterion_key: '',
		max_score: null,
		rubric: '',
	};
}

/** One stored criterion row → editor state. */
function rowToState(criterion) {
	return {
		objective_id: criterion.objective_id || '',
		bloom_dimension_id: criterion.bloom_dimension_id || '',
		competency_id: criterion.competency_id || null,
		weight: Number(criterion.weight) || 0,
		criterion_key: criterion.criterion_key && criterion.criterion_key !== 'main' ? criterion.criterion_key : '',
		max_score: criterion.max_score ?? null,
		rubric: rubricText(criterion.rubric_json),
	};
}

/** `rubric_json` round-trips as a JSON string; show whatever a person typed. */
function rubricText(value) {
	if (!value) return '';
	if (typeof value === 'object') return value.text != null ? String(value.text) : '';
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === 'object' && parsed.text != null) return String(parsed.text);
		return typeof parsed === 'string' ? parsed : '';
	} catch (_error) {
		return String(value);
	}
}

/** Editor row → wire criterion (the shape `CriteriaSetSchema` accepts). */
function toWireCriterion(row) {
	const criterion = {
		objective_id: row.objective_id,
		bloom_dimension_id: row.bloom_dimension_id,
		weight: row.weight,
	};
	if (row.competency_id) criterion.competency_id = row.competency_id;
	if (row.criterion_key) criterion.criterion_key = row.criterion_key;
	if (row.max_score != null && Number.isFinite(row.max_score)) criterion.max_score = row.max_score;
	if (row.rubric) criterion.rubric_json = { text: row.rubric };
	return criterion;
}

/** The client-side check, so an obviously invalid set never becomes a request. */
function localProblem(rows, t) {
	if (rows.length === 0) return t('hint.criteriaRequired');
	for (const row of rows) {
		if (!row.objective_id) return `${t('field.objective')} — ${t('error.save')}`;
		if (!row.bloom_dimension_id) return `${t('field.bloom')} — ${t('error.save')}`;
		if (!Number.isFinite(row.weight) || row.weight < 0) return `${t('field.weight')} — ${t('error.save')}`;
	}
	const sum = rows.reduce((acc, row) => acc + row.weight, 0);
	if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) return t('hint.weightSum');
	return null;
}
