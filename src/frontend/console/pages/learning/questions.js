/**
 * src/frontend/console/pages/learning/questions.js
 *
 * Question pedagogy — the bank, seen through its classification.
 *
 * The rows are ordinary questions (`GET /questions`), narrowed by the three
 * Phase 1 filters: the derived classification, the primary Bloom dimension,
 * and the objective. The first two are cached columns on the question itself,
 * so they are plain server-side filters. The objective is NOT: a criterion is
 * the join between a question and an objective, so the page resolves the
 * objective to its criteria rows first and then asks for exactly those
 * question ids — the server still owns the paging, the total and the scoping.
 *
 * Filter state lives at module scope so switching the panel language (which
 * re-renders the page) does not silently drop the operator's filters.
 */

import { api } from '../../core/api.js';
import { esc } from '../../viz/charts.js';
import { renderTable, renderPagination, bindTable } from '../../components/table.js';
import { searchField, selectField, toolbar } from '../../components/filters.js';
import { rowActions, bindRowActions } from '../../components/actions.js';
import { getLanguage, translator } from './labels.js';
import {
	tr,
	learningShell,
	bindLearningShell,
	ensureEnabled,
	renderLoadError,
	renderLoading,
	fetchBloom,
	bloomLabel,
	bloomById,
	pedagogyChip,
} from './common.js';
import { openPedagogyEditor } from './pedagogy-editor.js';
import { openBulkClassify } from './bulk-classify.js';

const STATUS_KEYS = ['unclassified', 'partial', 'classified', 'needs_review'];
/** Objectives are pulled once per render to fill the filter and the editor. */
const REFERENCE_LIMIT = 200;
/** Matches the cap the questions route applies to an explicit id set. */
const OBJECTIVE_QUESTION_LIMIT = 500;

/** Module-scoped so a language switch (a re-render) keeps the filters. */
const state = {
	search: '',
	status: '',
	bloomId: '',
	objectiveId: '',
	limit: 50,
	offset: 0,
	/** id → question, so a bulk action can name its targets, pages included. */
	selected: new Map(),
};

export const pedagogyQuestionsPage = {
	id: 'learning-questions',
	path: '/learning/questions',
	title: 'Question pedagogy',
	description: 'Classify the questions of this organization against its learning objectives.',
	permission: ['school.learning.read', 'class.learning.read'],
	async render(host, ctx) {
		if (!(await ensureEnabled(host, ctx))) return;
		renderLoading(host, ctx, 5);

		let bloom;
		let objectives;
		let competencies;
		let page;
		try {
			[bloom, objectives, competencies, page] = await Promise.all([
				fetchBloom(),
				fetchObjectives(),
				fetchCompetencies(),
				fetchQuestions(),
			]);
		} catch (err) {
			renderLoadError(host, ctx, err);
			return;
		}

		const lang = getLanguage();
		const t = translator(lang);
		const canClassify = ctx.canAny(['school.learning.manage', 'class.learning.classify']);
		const rows = Array.isArray(page?.data) ? page.data : [];
		const total = Number(page?.total ?? rows.length);
		const noObjectives = objectives.length === 0;

		// A changed filter invalidates the selection: the selected rows may no
		// longer be in the list, and a bulk action must never touch a row the
		// operator can no longer see.
		const signature = [state.search, state.status, state.bloomId, state.objectiveId].join('|');
		if (signature !== state.signature) {
			state.signature = signature;
			state.selected.clear();
		}

		const body = `
			${noObjectives ? noObjectivesAlert(t) : ''}
			${toolbar({
				fields:
					searchField({
						id: 'ac-learning-search',
						placeholder: t('action.search'),
						value: state.search,
					}) +
					selectField({
						id: 'ac-learning-status',
						label: t('field.pedagogyStatus'),
						value: state.status,
						includeAll: true,
						allLabel: t('table.status'),
						options: STATUS_KEYS.map((key) => ({ value: key, label: t(`status.${key}`) })),
					}) +
					selectField({
						id: 'ac-learning-bloom',
						label: t('field.bloom'),
						value: state.bloomId,
						includeAll: true,
						allLabel: t('field.bloom'),
						options: bloom.map((dimension) => ({
							value: dimension.id,
							label: bloomLabel(dimension, lang),
						})),
					}) +
					selectField({
						id: 'ac-learning-objective',
						label: t('field.objective'),
						value: state.objectiveId,
						includeAll: true,
						allLabel: t('field.objective'),
						options: objectives.map((objective) => ({
							value: objective.id,
							label: `${objective.code} — ${truncate(objective.statement)}`,
						})),
					}),
				actions: `
					<button type="button" class="ac-btn ac-btn--sm" data-ac-learning-refresh>${esc(t('action.refresh'))}</button>
					<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-learning-bulk${
						canClassify && state.selected.size > 0 ? '' : ' disabled'
					}>${esc(t('action.classifySelected'))}${
						state.selected.size ? ` (${state.selected.size})` : ''
					}</button>
					<button type="button" class="ac-btn ac-btn--sm" data-ac-learning-selectall${
						rows.length ? '' : ' disabled'
					}>${esc(t('action.selectAll'))}</button>
					<button type="button" class="ac-btn ac-btn--sm" data-ac-learning-clearsel${
						state.selected.size ? '' : ' disabled'
					}>${esc(t('action.clearSelection'))}</button>`,
			})}
			<div data-ac-learning-table>
				${renderTable({
					columns: tableColumns({ lang, t, bloom, canClassify, classifiable: !noObjectives }),
					rows,
					empty: t('empty.questions.message'),
					rowClass: (row) => (state.selected.has(row.id) ? 'is-selected' : ''),
				})}
			</div>
			${renderPagination({ total, limit: state.limit, offset: state.offset })}`;

		host.innerHTML = learningShell({ body });
		bindLearningShell(host, ctx);
		bindControls(host, ctx, { rows, objectives, bloom, competencies, canClassify, classifiable: !noObjectives });
	},
};

// ── Data ─────────────────────────────────────────────────────────────────────

function fetchObjectives() {
	return api
		.get('learning/objectives', { status: 'active', limit: REFERENCE_LIMIT })
		.then((payload) => (Array.isArray(payload?.data) ? payload.data : []));
}

function fetchCompetencies() {
	return api
		.get('learning/competencies', { status: 'active', limit: REFERENCE_LIMIT })
		.then((payload) => (Array.isArray(payload?.data) ? payload.data : []));
}

/** The question page itself, with the three Phase 1 filters applied. */
async function fetchQuestions() {
	const query = { limit: state.limit, offset: state.offset };
	if (state.search) query.search = state.search;
	if (state.status) query.pedagogy_status = state.status;
	if (state.bloomId) query.primary_bloom_dimension_id = state.bloomId;

	if (state.objectiveId) {
		const criteria = await api.get(
			`learning/objectives/${encodeURIComponent(state.objectiveId)}/questions`,
			{ limit: OBJECTIVE_QUESTION_LIMIT },
		);
		const ids = [...new Set((criteria?.data || []).map((row) => row.question_id).filter(Boolean))];
		// No question assesses this objective: an empty result, not a full list.
		if (ids.length === 0) return { data: [], total: 0 };
		query.ids = ids.join(',');
	}

	return api.get('questions', query);
}

// ── Markup ───────────────────────────────────────────────────────────────────

function tableColumns({ lang, t, bloom, canClassify, classifiable }) {
	return [
		{
			key: 'select',
			label: '',
			className: 'learning-col-select',
			render: (row) =>
				`<input type="checkbox" data-ac-learning-row="${esc(row.id)}"${
					state.selected.has(row.id) ? ' checked' : ''
				} aria-label="${esc(t('action.classify'))}" />`,
		},
		{
			key: 'text',
			label: t('table.question'),
			render: (row) => `<span class="learning-question">
				<span class="learning-question__text">${esc(truncate(row.text, 90))}</span>
				<span class="learning-question__type">${esc(row.type || '')}</span>
			</span>`,
		},
		{
			key: 'bloom',
			label: t('table.bloom'),
			render: (row) => {
				const dimension = bloomById(bloom, row.primary_bloom_dimension_id);
				return dimension
					? esc(bloomLabel(dimension, lang))
					: `<span class="ac-muted">${esc(t('status.unclassified'))}</span>`;
			},
		},
		{
			key: 'pedagogy_status',
			label: t('table.status'),
			render: (row) => pedagogyChip(lang, row.pedagogy_status || 'unclassified'),
		},
		{
			key: 'actions',
			label: '',
			className: 'learning-col-actions',
			render: (row) =>
				canClassify
					? rowActions([
							{
								id: 'classify',
								label: t('action.classify'),
								value: row.id,
								tone: 'primary',
								hidden: !classifiable,
							},
						])
					: '',
		},
	];
}

function noObjectivesAlert(t) {
	return `<div class="ac-alert ac-alert--warning">
		<div class="ac-alert__body">
			<p class="ac-alert__title">${esc(t('empty.objectives.title'))}</p>
			<p class="ac-alert__text">${esc(t('empty.objectives.message'))}</p>
			<a class="ac-btn ac-btn--sm" href="#/learning/taxonomy">${esc(t('nav.taxonomy'))}</a>
		</div>
	</div>`;
}

// ── Wiring ───────────────────────────────────────────────────────────────────

function bindControls(host, ctx, { rows, objectives, bloom, competencies, canClassify, classifiable }) {
	for (const dimension of bloom) bloomCache.set(dimension.id, dimension);

	const rerender = () => ctx.rerender();

	// Filters. Each one resets the page: page 3 of the previous result set is
	// meaningless once the result set changes.
	const search = host.querySelector('#ac-learning-search');
	let debounce = null;
	search?.addEventListener('input', () => {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			state.search = search.value.trim();
			state.offset = 0;
			rerender();
		}, 220);
	});

	const onSelect = (id, key) => {
		const select = host.querySelector(`#${id}`);
		select?.addEventListener('change', () => {
			state[key] = select.value;
			state.offset = 0;
			rerender();
		});
	};
	onSelect('ac-learning-status', 'status');
	onSelect('ac-learning-bloom', 'bloomId');
	onSelect('ac-learning-objective', 'objectiveId');

	host.querySelector('[data-ac-learning-refresh]')?.addEventListener('click', rerender);

	bindTable(host, {
		onPage: (offset) => {
			state.offset = offset;
			rerender();
		},
	});

	// Selection.
	host.querySelectorAll('[data-ac-learning-row]').forEach((box) => {
		box.addEventListener('change', () => {
			const row = rows.find((candidate) => candidate.id === box.dataset.acLearningRow);
			if (!row) return;
			if (box.checked) state.selected.set(row.id, row);
			else state.selected.delete(row.id);
			// Only the counter and the disable states change: re-render the
			// toolbar zone instead of the whole page (which would lose focus).
			refreshSelectionButtons(host);
		});
	});

	host.querySelector('[data-ac-learning-selectall]')?.addEventListener('click', () => {
		for (const row of rows) state.selected.set(row.id, row);
		rerender();
	});
	host.querySelector('[data-ac-learning-clearsel]')?.addEventListener('click', () => {
		state.selected.clear();
		rerender();
	});

	// Row action: open the panel for that question.
	if (canClassify) {
		bindRowActions(host, {
			classify: (questionId) => {
				const question = rows.find((row) => row.id === questionId);
				if (question) openEditor({ question, ctx, bloom, objectives, competencies });
			},
		});
	}

	// Bulk classify the current selection.
	host.querySelector('[data-ac-learning-bulk]')?.addEventListener('click', () => {
		if (!canClassify || state.selected.size === 0) return;
		openBulkClassify({
			questions: [...state.selected.values()],
			bloom,
			objectives,
			onDone: ({ done }) => {
				if (done > 0) {
					state.selected.clear();
					rerender();
				}
			},
		});
	});
}

function refreshSelectionButtons(host) {
	const bulk = host.querySelector('[data-ac-learning-bulk]');
	const clear = host.querySelector('[data-ac-learning-clearsel]');
	const count = state.selected.size;
	if (bulk) {
		bulk.disabled = count === 0;
		bulk.textContent = count
			? `${tr()('action.classifySelected')} (${count})`
			: tr()('action.classifySelected');
	}
	if (clear) clear.disabled = count === 0;
}

function openEditor({ question, ctx, bloom, objectives, competencies }) {
	openPedagogyEditor({
		question,
		bloom,
		objectives,
		competencies,
		onSaved: () => {
			state.selected.delete(question.id);
			ctx.rerender();
		},
	});
}

function truncate(value, max = 60) {
	const text = String(value ?? '');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
