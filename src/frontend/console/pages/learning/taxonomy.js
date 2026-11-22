/**
 * src/frontend/console/pages/learning/taxonomy.js
 *
 * The taxonomy workbench: objectives, competencies, and the proposal queue.
 *
 * Three tabs, because the three populations differ:
 *   • Objectives   — everyone who may read learning; a teacher creates a
 *                    proposal, an administrator creates an active objective.
 *   • Competencies — administrators only (the API is admin-only, so showing
 *                    the tab to a teacher would offer a form that always 403s).
 *   • Proposals    — administrators only: the teacher proposals awaiting a
 *                    decision, each with an approve/reject that carries a note.
 *
 * An objective opens into a detail view (same tab) with its competency links
 * and prerequisite edges — the two relations the API keeps, and the two an
 * administrator actually curates.
 */

import { api } from '../../core/api.js';
import { esc } from '../../viz/charts.js';
import { renderTable, renderPagination, bindTable } from '../../components/table.js';
import { searchField, selectField, toolbar } from '../../components/filters.js';
import { rowActions, bindRowActions } from '../../components/actions.js';
import { openModal, confirmDialog, toast, formatDate } from '../../components/ui.js';
import { textarea } from '../../components/form.js';
import { emptyState } from '../../components/states.js';
import { getLanguage, translator } from './labels.js';
import {
	learningShell,
	bindLearningShell,
	ensureEnabled,
	renderLoadError,
	renderLoading,
	fetchBloom,
	bloomLabel,
	bloomById,
	objectiveChip,
} from './common.js';
import {
	openObjectiveForm,
	openCompetencyForm,
	openCompetencyLinkForm,
	openPrerequisiteForm,
} from './forms.js';

const OBJECTIVE_STATUSES = ['proposed', 'active', 'rejected', 'archived'];
const COMPETENCY_KINDS = ['competency', 'skill', 'domain'];
const COMPETENCY_STATUSES = ['active', 'archived'];
const LOOKUP_LIMIT = 200;

const TAB_ICONS = {
	objectives:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>',
	competencies:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
	proposals:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
};

const TAB_DESCRIPTIONS = {
	objectives: 'tax.desc.objectives',
	competencies: 'tax.desc.competencies',
	proposals: 'tax.desc.proposals',
};

/** Module-scoped so a language switch keeps the operator's place. */
const state = {
	tab: 'objectives',
	detailId: null,
	search: '',
	status: '',
	kind: '',
	limit: 25,
	offset: 0,
};

export const taxonomyPage = {
	id: 'learning-taxonomy',
	path: '/learning/taxonomy',
	title: 'Taxonomy',
	description: 'The learning objectives and competencies of this organization.',
	permission: ['school.learning.read', 'class.learning.read'],
	async render(host, ctx, route) {
		if (!(await ensureEnabled(host, ctx))) return;
		renderLoading(host, ctx, 5);

		const canManage = ctx.canAny(['school.learning.manage']);
		// A hub card can point straight at a tab (`#/learning/taxonomy?tab=...`).
		const requested = route?.query?.tab;
		if (['objectives', 'competencies', 'proposals'].includes(requested)) {
			state.tab = requested;
			state.detailId = null;
			state.offset = 0;
		}
		// The API is the authority; the tabs follow it so a teacher is never
		// offered a form the server would refuse.
		if (!canManage && state.tab !== 'objectives') state.tab = 'objectives';

		let lookups;
		try {
			lookups = await fetchLookups();
		} catch (err) {
			renderLoadError(host, ctx, err);
			return;
		}

		if (state.detailId) {
			await renderDetail(host, ctx, { canManage, lookups });
			return;
		}

		let payload;
		try {
			payload = await fetchTabData();
		} catch (err) {
			renderLoadError(host, ctx, err);
			return;
		}

		const lang = getLanguage();
		const t = translator(lang);
		const rows = Array.isArray(payload?.data) ? payload.data : [];
		const total = Number(payload?.total ?? rows.length);

		const body = `
			${tabBar({ state, t, canManage, total })}
			${tabBody({ state, rows, total, lang, t, canManage, lookups })}`;

		host.innerHTML = learningShell({ body });
		bindLearningShell(host, ctx);
		bindTaxonomy(host, ctx, { rows, t, canManage, lookups });
	},
};

// ── Data ─────────────────────────────────────────────────────────────────────

/**
 * The catalogs the whole page needs: subjects and categories (for the
 * objective form), the Bloom catalog (server-labelled), and every objective
 * (so a parent, a prerequisite or a link can be named without a second read).
 */
async function fetchLookups() {
	const [subjects, categories, bloom, objectives] = await Promise.all([
		api.get('subjects', { limit: LOOKUP_LIMIT }).then((payload) => payload?.data || []),
		api.get('categories', { limit: LOOKUP_LIMIT }).then((payload) => payload?.data || []),
		fetchBloom(),
		api.get('learning/objectives', { limit: LOOKUP_LIMIT }).then((payload) => payload?.data || []),
	]);
	return { subjects, categories, bloom, objectives };
}

function fetchTabData() {
	if (state.tab === 'competencies') {
		const query = { limit: state.limit, offset: state.offset };
		if (state.search) query.search = state.search;
		if (state.kind) query.kind = state.kind;
		if (state.status) query.status = state.status;
		return api.get('learning/competencies', query);
	}

	const query = { limit: state.limit, offset: state.offset };
	if (state.search) query.search = state.search;
	if (state.tab === 'proposals') query.status = 'proposed';
	else if (state.status) query.status = state.status;
	return api.get('learning/objectives', query);
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function tabBar({ state: view, t, canManage, total }) {
	const tabs = [{ key: 'objectives', label: t('summary.objectives') }];
	if (canManage) {
		tabs.push({ key: 'competencies', label: t('summary.competencies') });
		tabs.push({ key: 'proposals', label: t('summary.proposed') });
	}
	const count = Number(total ?? 0).toLocaleString();
	return `<div class="learning-tabs-block">
		<div class="learning-tabs" role="tablist" aria-label="${esc(t('learning.title'))}">${tabs
			.map((tab) => {
				const active = tab.key === view.tab;
				return `<button type="button" class="learning-tab${active ? ' is-active' : ''}" role="tab" aria-selected="${active}" tabindex="${
					active ? '0' : '-1'
				}" data-ac-learning-tab="${esc(tab.key)}">
					<span class="learning-tab__icon" aria-hidden="true">${TAB_ICONS[tab.key] || ''}</span>
					<span class="learning-tab__label">${esc(tab.label)}</span>
					${active ? `<span class="learning-tab__count">${count}</span>` : ''}
				</button>`;
			})
			.join('')}</div>
		<p class="learning-tabs__desc">${esc(t(TAB_DESCRIPTIONS[view.tab] || 'learning.description'))}</p>
	</div>`;
}

/** A count + "clear filters" line between the toolbar and the table. */
function resultsRow({ view, total, t }) {
	const active = Boolean(view.search || view.kind || (view.tab !== 'proposals' && view.status));
	return `<div class="learning-results">
		<span class="learning-results__count">${esc(
			t('results.count', { count: Number(total ?? 0).toLocaleString() }),
		)}</span>
		${
			active
				? `<button type="button" class="ac-btn ac-btn--sm learning-results__clear" data-ac-tax-clear>${esc(
						t('action.clearFilters'),
					)}</button>`
				: ''
		}
	</div>`;
}

function tabBody({ state: view, rows, total, lang, t, canManage, lookups }) {
	const results = resultsRow({ view, total, t });
	if (view.tab === 'competencies') {
		return `
			${toolbar({
				fields:
					searchField({ id: 'ac-tax-search', placeholder: t('action.search'), value: view.search }) +
					selectField({
						id: 'ac-tax-kind',
						label: t('field.kind'),
						value: view.kind,
						includeAll: true,
						allLabel: t('field.kind'),
						options: COMPETENCY_KINDS.map((key) => ({ value: key, label: t(`kind.${key}`) })),
					}) +
					selectField({
						id: 'ac-tax-status',
						label: t('field.status'),
						value: view.status,
						includeAll: true,
						allLabel: t('field.status'),
						options: COMPETENCY_STATUSES.map((key) => ({ value: key, label: t(`objective.${key}`) })),
					}),
				actions:
					`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${esc(t('action.refresh'))}</button>` +
					`<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-new-competency>${esc(
						t('action.newCompetency'),
					)}</button>`,
			})}
			${results}
			${renderTable({
				columns: competencyColumns({ lang, t, lookups }),
				rows,
				empty: t('empty.competencies.message'),
			})}
			${renderPagination({ total, limit: view.limit, offset: view.offset })}`;
	}

	if (view.tab === 'proposals') {
		return `
			${toolbar({
				fields: searchField({ id: 'ac-tax-search', placeholder: t('action.search'), value: view.search }),
				actions: `<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${esc(t('action.refresh'))}</button>`,
			})}
			${results}
			${renderTable({
				columns: proposalColumns({ lang, t }),
				rows,
				empty: t('empty.proposals.message'),
			})}
			${renderPagination({ total, limit: view.limit, offset: view.offset })}`;
	}

	return `
		${toolbar({
			fields:
				searchField({ id: 'ac-tax-search', placeholder: t('action.search'), value: view.search }) +
				selectField({
					id: 'ac-tax-status',
					label: t('field.status'),
					value: view.status,
					includeAll: true,
					allLabel: t('field.status'),
					options: OBJECTIVE_STATUSES.map((key) => ({ value: key, label: t(`objective.${key}`) })),
				}),
			actions:
				`<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-refresh>${esc(t('action.refresh'))}</button>` +
				`<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-new-objective>${esc(
					canManage ? t('action.newObjective') : t('action.proposeObjective'),
				)}</button>`,
		})}
		${results}
		${renderTable({
			columns: objectiveColumns({ lang, t, canManage, lookups }),
			rows,
			empty: t('empty.objectives.message'),
		})}
		${renderPagination({ total, limit: view.limit, offset: view.offset })}`;
}

// ── Columns ──────────────────────────────────────────────────────────────────

function objectiveColumns({ lang, t, canManage, lookups }) {
	return [
		{ key: 'code', label: t('table.code'), render: (row) => esc(row.code) },
		{ key: 'statement', label: t('table.statement'), render: (row) => esc(truncate(row.statement, 90)) },
		{
			key: 'subject',
			label: t('table.subject'),
			render: (row) => esc(subjectName(lookups.subjects, row.subject_id)),
		},
		{
			key: 'bloom',
			label: t('table.bloom'),
			render: (row) => {
				const dimension = bloomById(lookups.bloom, row.primary_bloom_dimension_id);
				return dimension ? esc(bloomLabel(dimension, lang)) : '—';
			},
		},
		{ key: 'status', label: t('field.status'), render: (row) => objectiveChip(lang, row.status) },
		{
			key: 'actions',
			label: '',
			className: 'learning-col-actions',
			render: (row) =>
				rowActions([
					{ id: 'open', label: t('action.open'), value: row.id },
					{ id: 'edit', label: t('action.edit'), value: row.id },
					{
						id: 'archive',
						label: t('action.archive'),
						value: row.id,
						tone: 'danger',
						hidden: !canManage || row.status === 'archived',
					},
				]),
		},
	];
}

function competencyColumns({ lang, t, lookups }) {
	return [
		{ key: 'code', label: t('table.code'), render: (row) => esc(row.code) },
		{ key: 'name', label: t('table.competency'), render: (row) => esc(truncate(row.name, 80)) },
		{ key: 'kind', label: t('table.kind'), render: (row) => esc(t(`kind.${row.kind || 'competency'}`)) },
		{
			key: 'subject',
			label: t('table.subject'),
			render: (row) => esc(subjectName(lookups.subjects, row.subject_id)),
		},
		{ key: 'status', label: t('field.status'), render: (row) => objectiveChip(lang, row.status) },
		{
			key: 'actions',
			label: '',
			className: 'learning-col-actions',
			render: (row) =>
				rowActions([
					{ id: 'edit-competency', label: t('action.edit'), value: row.id },
					{
						id: 'archive-competency',
						label: t('action.archive'),
						value: row.id,
						tone: 'danger',
						hidden: row.status === 'archived',
					},
				]),
		},
	];
}

function proposalColumns({ lang, t }) {
	return [
		{ key: 'code', label: t('table.code'), render: (row) => esc(row.code) },
		{ key: 'statement', label: t('table.statement'), render: (row) => esc(truncate(row.statement, 110)) },
		{ key: 'created', label: t('table.created'), render: (row) => esc(formatDate(row.created_at, { withTime: false })) },
		{ key: 'status', label: t('field.status'), render: (row) => objectiveChip(lang, row.status) },
		{
			key: 'actions',
			label: '',
			className: 'learning-col-actions',
			render: (row) =>
				rowActions([
					{ id: 'approve', label: t('action.approve'), value: row.id, tone: 'primary' },
					{ id: 'reject', label: t('action.reject'), value: row.id, tone: 'danger' },
				]),
		},
	];
}

// ── Objective detail ─────────────────────────────────────────────────────────

async function renderDetail(host, ctx, { canManage, lookups }) {
	const lang = getLanguage();
	const t = translator(lang);

	let objective;
	try {
		objective = await api.get(`learning/objectives/${encodeURIComponent(state.detailId)}`);
	} catch (err) {
		// The objective is gone (or foreign): fall back to the list rather than
		// leaving the operator on a dead detail view.
		state.detailId = null;
		renderLoadError(host, ctx, err);
		return;
	}

	const links = Array.isArray(objective.competencies) ? objective.competencies : [];
	const prerequisites = Array.isArray(objective.prerequisites) ? objective.prerequisites : [];
	const dimension = bloomById(lookups.bloom, objective.primary_bloom_dimension_id);

	const linkAction = canManage
		? `<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-link>${esc(
				t('action.linkCompetency'),
			)}</button>`
		: '';
	const prereqAction = canManage
		? `<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-tax-prereq>${esc(
				t('action.addPrerequisite'),
			)}</button>`
		: '';

	const body = `
		<div class="learning-detail">
			<div class="learning-detail__bar">
				<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-back><span aria-hidden="true">←</span> ${esc(
					t('summary.objectives'),
				)}</button>
				${
					canManage
						? `<button type="button" class="ac-btn ac-btn--sm" data-ac-tax-edit="${esc(objective.id)}">${esc(
								t('action.edit'),
							)}</button>`
						: ''
				}
			</div>
			<div class="learning-detail__head">
				<span class="learning-detail__code">${esc(objective.code)}</span>
				${objectiveChip(lang, objective.status)}
			</div>
			<p class="learning-detail__statement">${esc(objective.statement)}</p>
			${objective.description ? `<p class="learning-detail__description">${esc(objective.description)}</p>` : ''}
			<dl class="learning-facts">
				<div class="learning-fact">
					<dt>${esc(t('field.subject'))}</dt>
					<dd>${esc(subjectName(lookups.subjects, objective.subject_id))}</dd>
				</div>
				${
					dimension
						? `<div class="learning-fact">
								<dt>${esc(t('field.bloom'))}</dt>
								<dd>${esc(bloomLabel(dimension, lang))}</dd>
							</div>`
						: ''
				}
				<div class="learning-fact">
					<dt>${esc(t('summary.competencies'))}</dt>
					<dd>${links.length.toLocaleString()}</dd>
				</div>
				<div class="learning-fact">
					<dt>${esc(t('summary.prerequisites'))}</dt>
					<dd>${prerequisites.length.toLocaleString()}</dd>
				</div>
			</dl>
		</div>

		<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<h3 class="ac-section-panel__title">${esc(t('summary.competencies'))} <span class="learning-section-count">${links.length.toLocaleString()}</span></h3>
				${canManage ? `<div class="ac-panel__actions">${linkAction}</div>` : ''}
			</div>
			<div class="ac-section-panel__body">
				${
					links.length
						? linkTable(links, { t, canManage })
						: emptyState({
								title: t('empty.competencies.title'),
								message: t('empty.competencies.message'),
								action: linkAction,
							})
				}
			</div>
		</section>

		<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<h3 class="ac-section-panel__title">${esc(t('summary.prerequisites'))} <span class="learning-section-count">${prerequisites.length.toLocaleString()}</span></h3>
				${canManage ? `<div class="ac-panel__actions">${prereqAction}</div>` : ''}
			</div>
			<div class="ac-section-panel__body">
				${
					prerequisites.length
						? prerequisiteTable(prerequisites, { t, canManage, lookups })
						: emptyState({
								title: t('empty.prerequisites.title'),
								message: t('empty.prerequisites.message'),
								action: prereqAction,
							})
				}
			</div>
		</section>`;

	host.innerHTML = learningShell({ body });
	bindLearningShell(host, ctx);

	host.querySelector('[data-ac-tax-back]')?.addEventListener('click', () => {
		state.detailId = null;
		ctx.rerender();
	});
	host.querySelector('[data-ac-tax-edit]')?.addEventListener('click', () => {
		openObjectiveForm({
			objective,
			subjects: lookups.subjects,
			objectives: lookups.objectives,
			categories: lookups.categories,
			bloom: lookups.bloom,
			onSaved: () => ctx.rerender(),
		});
	});
	host.querySelectorAll('[data-ac-tax-link]').forEach((button) => {
		button.addEventListener('click', async () => {
			openCompetencyLinkForm({
				objective,
				competencies: await loadCompetencies(),
				onSaved: () => ctx.rerender(),
			});
		});
	});
	host.querySelectorAll('[data-ac-tax-prereq]').forEach((button) => {
		button.addEventListener('click', () => {
			openPrerequisiteForm({
				objective,
				objectives: lookups.objectives,
				onSaved: () => ctx.rerender(),
			});
		});
	});

	bindRowActions(host, {
		unlink: async (competencyId) => {
			try {
				await api.del(
					`learning/objectives/${encodeURIComponent(objective.id)}/competencies/${encodeURIComponent(
						competencyId,
					)}`,
				);
				toast(t('toast.unlinked'), 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		},
		'unlink-prerequisite': async (prerequisiteId) => {
			try {
				await api.del(
					`learning/objectives/${encodeURIComponent(objective.id)}/prerequisites/${encodeURIComponent(
						prerequisiteId,
					)}`,
				);
				toast(t('toast.prerequisiteRemoved'), 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		},
	});
}

function linkTable(links, { t, canManage }) {
	return renderTable({
		columns: [
			{ key: 'code', label: t('table.code'), render: (row) => esc(row.code || '—') },
			{ key: 'name', label: t('table.competency'), render: (row) => esc(row.name || '—') },
			{ key: 'weight', label: t('table.weight'), render: (row) => esc(String(row.weight ?? '—')) },
			{
				key: 'actions',
				label: '',
				className: 'learning-col-actions',
				render: (row) =>
					canManage
						? rowActions([
								{
									id: 'unlink',
									label: t('action.unlink'),
									value: row.competency_id,
									tone: 'danger',
								},
							])
						: '',
			},
		],
		rows: links,
		empty: t('empty.competencies.message'),
	});
}

function prerequisiteTable(prerequisites, { t, canManage, lookups }) {
	return renderTable({
		columns: [
			{
				key: 'objective',
				label: t('table.objective'),
				render: (row) => esc(objectiveLabel(lookups.objectives, row.prerequisite_objective_id)),
			},
			{ key: 'strength', label: t('field.strength'), render: (row) => esc(t(`strength.${row.strength}`)) },
			{ key: 'min_mastery_state', label: t('field.minMastery'), render: (row) => esc(row.min_mastery_state || '—') },
			{ key: 'rationale', label: t('field.rationale'), render: (row) => esc(truncate(row.rationale || '—', 60)) },
			{
				key: 'actions',
				label: '',
				className: 'learning-col-actions',
				render: (row) =>
					canManage
						? rowActions([
								{
									id: 'unlink-prerequisite',
									label: t('action.remove'),
									value: row.prerequisite_objective_id,
									tone: 'danger',
								},
							])
						: '',
			},
		],
		rows: prerequisites,
		empty: t('empty.prerequisites.message'),
	});
}

// ── Wiring ───────────────────────────────────────────────────────────────────

function bindTaxonomy(host, ctx, { rows, t, canManage, lookups }) {
	const tabButtons = Array.from(host.querySelectorAll('[data-ac-learning-tab]'));
	tabButtons.forEach((button, index) => {
		button.addEventListener('click', () => {
			state.tab = button.dataset.acLearningTab;
			state.detailId = null;
			state.offset = 0;
			state.search = '';
			state.status = '';
			state.kind = '';
			ctx.rerender();
		});
		// Roving tabindex: arrow keys move between tabs without a round-trip
		// through the rest of the page. Direction follows the panel's `dir`.
		button.addEventListener('keydown', (event) => {
			const rtl = (host.querySelector('[data-ac-learning-panel]')?.getAttribute('dir') || 'ltr') === 'rtl';
			const forward = event.key === 'ArrowRight' ? !rtl : event.key === 'ArrowLeft' ? rtl : null;
			if (forward === null && event.key !== 'Home' && event.key !== 'End') return;
			event.preventDefault();
			let next = index;
			if (event.key === 'Home') next = 0;
			else if (event.key === 'End') next = tabButtons.length - 1;
			else next = (index + (forward ? 1 : -1) + tabButtons.length) % tabButtons.length;
			tabButtons[next].focus();
			tabButtons[next].click();
		});
	});

	const search = host.querySelector('#ac-tax-search');
	let debounce = null;
	search?.addEventListener('input', () => {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			state.search = search.value.trim();
			state.offset = 0;
			ctx.rerender();
		}, 220);
	});
	for (const [id, key] of [
		['ac-tax-status', 'status'],
		['ac-tax-kind', 'kind'],
	]) {
		const select = host.querySelector(`#${id}`);
		select?.addEventListener('change', () => {
			state[key] = select.value;
			state.offset = 0;
			ctx.rerender();
		});
	}

	host.querySelector('[data-ac-tax-refresh]')?.addEventListener('click', () => ctx.rerender());
	host.querySelector('[data-ac-tax-clear]')?.addEventListener('click', () => {
		state.search = '';
		state.status = '';
		state.kind = '';
		state.offset = 0;
		ctx.rerender();
	});
	bindTable(host, { onPage: (offset) => { state.offset = offset; ctx.rerender(); } });

	host.querySelector('[data-ac-tax-new-objective]')?.addEventListener('click', () => {
		openObjectiveForm({
			subjects: lookups.subjects,
			objectives: lookups.objectives,
			categories: lookups.categories,
			bloom: lookups.bloom,
			onSaved: () => ctx.rerender(),
		});
	});
	host.querySelector('[data-ac-tax-new-competency]')?.addEventListener('click', () => {
		openCompetencyForm({
			subjects: lookups.subjects,
			competencies: rows,
			onSaved: () => ctx.rerender(),
		});
	});

	bindRowActions(host, {
		open: (id) => {
			state.detailId = id;
			ctx.rerender();
		},
		edit: (id) => {
			const objective = rows.find((row) => row.id === id);
			if (!objective) return;
			openObjectiveForm({
				objective,
				subjects: lookups.subjects,
				objectives: lookups.objectives,
				categories: lookups.categories,
				bloom: lookups.bloom,
				onSaved: () => ctx.rerender(),
			});
		},
		archive: async (id) => {
			const objective = rows.find((row) => row.id === id);
			const ok = await confirmDialog({
				title: t('action.archive'),
				message: t('action.archive'),
				detail: objective ? `${objective.code} — ${truncate(objective.statement, 80)}` : '',
				confirmLabel: t('action.archive'),
				danger: true,
			});
			if (!ok) return;
			try {
				await api.patch(`learning/objectives/${encodeURIComponent(id)}`, { status: 'archived' });
				toast(t('toast.archived'), 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		},
		'edit-competency': (id) => {
			const competency = rows.find((row) => row.id === id);
			if (!competency) return;
			openCompetencyForm({
				competency,
				subjects: lookups.subjects,
				competencies: rows,
				onSaved: () => ctx.rerender(),
			});
		},
		'archive-competency': async (id) => {
			const competency = rows.find((row) => row.id === id);
			const ok = await confirmDialog({
				title: t('action.archive'),
				message: t('action.archive'),
				detail: competency ? `${competency.code} — ${competency.name}` : '',
				confirmLabel: t('action.archive'),
				danger: true,
			});
			if (!ok) return;
			try {
				await api.post(`learning/competencies/${encodeURIComponent(id)}/archive`, {});
				toast(t('toast.competencySaved'), 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		},
		approve: (id) => {
			const objective = rows.find((row) => row.id === id);
			if (objective) openReviewForm({ objective, mode: 'approve', t, onDone: () => ctx.rerender() });
		},
		reject: (id) => {
			const objective = rows.find((row) => row.id === id);
			if (objective) openReviewForm({ objective, mode: 'reject', t, onDone: () => ctx.rerender() });
		},
	});
}

/** The competency catalog, read on demand (only an administrator needs it). */
async function loadCompetencies() {
	try {
		const payload = await api.get('learning/competencies', { limit: LOOKUP_LIMIT, status: 'active' });
		return payload?.data || [];
	} catch (_error) {
		return [];
	}
}

/** A tiny form for the two review decisions. A note is required to reject. */
function openReviewForm({ objective, mode, t, onDone }) {
	const approving = mode === 'approve';
	const modal = openModal({
		title: approving ? t('action.approve') : t('action.reject'),
		subtitle: `${objective.code} — ${truncate(objective.statement, 70)}`,
		body: `
			<div class="ac-form" data-ac-form>
				<div data-ac-form-error hidden></div>
				${textarea({
					id: 'ac-review-note',
					label: t('field.reviewNote'),
					value: '',
					rows: 3,
					hint: approving ? '' : t('hint.teacherProposal'),
				})}
			</div>`,
		footer: `
			<button type="button" class="ac-btn" data-ac-review-cancel>${esc(t('action.cancel'))}</button>
			<button type="button" class="ac-btn ${approving ? 'ac-btn--primary' : 'ac-btn--danger'}" data-ac-review-save>${esc(
				approving ? t('action.approve') : t('action.reject'),
			)}</button>`,
	});

	const root = modal.root;
	root.querySelector('[data-ac-review-cancel]').addEventListener('click', () => modal.close());
	root.querySelector('[data-ac-review-save]').addEventListener('click', async (event) => {
		const note = root.querySelector('#ac-review-note').value.trim();
		if (!approving && !note) {
			showInlineError(root, t('field.reviewNote'));
			return;
		}
		const button = event.currentTarget;
		button.disabled = true;
		try {
			await api.post(
				`learning/objectives/${encodeURIComponent(objective.id)}/${approving ? 'approve' : 'reject'}`,
				{ note: note || null },
			);
			toast(approving ? t('toast.approved') : t('toast.rejected'), 'success');
			modal.close();
			onDone?.();
		} catch (err) {
			button.disabled = false;
			showInlineError(root, err.message);
		}
	});
}

function showInlineError(root, message) {
	const host = root.querySelector('[data-ac-form-error]');
	if (!host) return;
	host.hidden = false;
	host.innerHTML = `<div class="ac-alert ac-alert--danger"><div class="ac-alert__body"><p class="ac-alert__text">${esc(
		message,
	)}</p></div></div>`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function subjectName(subjects, subjectId) {
	if (!subjectId) return '—';
	return (subjects || []).find((subject) => subject.id === subjectId)?.name || '—';
}

function objectiveLabel(objectives, objectiveId) {
	const objective = (objectives || []).find((row) => row.id === objectiveId);
	return objective ? `${objective.code} — ${truncate(objective.statement, 50)}` : '—';
}

function truncate(value, max = 60) {
	const text = String(value ?? '');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
