/**
 * src/frontend/console/pages/learning/bulk-classify.js
 *
 * Bulk classification: give several questions the SAME single criterion.
 *
 * Deliberately narrow. A bulk action that could assign several weighted
 * criteria per question would need a per-question judgement the operator
 * cannot make in one dialog — so this writes exactly one criterion of weight
 * 1.00, which is the honest "these questions all assess this objective at
 * this Bloom level" statement. Anything finer is the single editor's job.
 *
 * The PUTs run SEQUENTIALLY: the server replaces the whole criteria set per
 * question and re-derives its caches, and a burst of parallel writes against
 * the same school would only make a partial failure harder to read. A
 * failure stops nothing — the dialog reports which questions were done and
 * which were not, and the list stays open until the operator closes it.
 */

import { api } from '../../core/api.js';
import { esc } from '../../viz/charts.js';
import { openModal, toast } from '../../components/ui.js';
import { getLanguage, translator } from './labels.js';
import { bloomOptions } from './common.js';
import { questionLabel } from './pedagogy-editor.js';

/**
 * @param {{ questions: Array<object>, bloom: Array, objectives: Array,
 *           onDone?: (result:{done:number,failed:number})=>void }} options
 */
export function openBulkClassify({ questions, bloom, objectives, onDone = null }) {
	const lang = getLanguage();
	const t = translator(lang);
	const targets = Array.isArray(questions) ? questions : [];

	const modal = openModal({
		title: t('bulk.title', { count: targets.length }),
		subtitle: t('bulk.confirm'),
		body: `
			<div class="learning-bulk" data-ac-bulk>
				<div class="learning-bulk__grid">
					<label class="ac-field">
						<span class="ac-field__label">${esc(t('field.objective'))}</span>
						<select class="ac-select" data-ac-bulk-objective>
							<option value="">— ${esc(t('field.objective'))} —</option>
							${objectives
								.map(
									(objective) =>
										`<option value="${esc(objective.id)}">${esc(
											`${objective.code} — ${truncate(objective.statement)}`,
										)}</option>`,
								)
								.join('')}
						</select>
					</label>
					<label class="ac-field">
						<span class="ac-field__label">${esc(t('field.bloom'))}</span>
						<select class="ac-select" data-ac-bulk-bloom>
							<option value="">— ${esc(t('field.bloom'))} —</option>
							${bloomOptions(bloom, { lang })
								.map(
									(option) =>
										`<option value="${esc(option.value)}">${esc(option.label)}</option>`,
								)
								.join('')}
						</select>
					</label>
					<label class="ac-field">
						<span class="ac-field__label">${esc(t('field.weight'))}</span>
						<input class="ac-input" type="text" value="1.00" data-ac-bulk-weight readonly />
					</label>
				</div>

				<label class="ac-check">
					<input type="checkbox" data-ac-bulk-reviewed checked />
					<span class="ac-check__label">${esc(t('action.markReviewed'))}</span>
				</label>

				<div class="learning-bulk__progress" data-ac-bulk-progress hidden></div>
				<div class="learning-bulk__failures" data-ac-bulk-failures hidden></div>
			</div>`,
		footer: `
			<div class="learning-panel__footer">
				<button type="button" class="ac-btn" data-ac-bulk-cancel>${esc(t('action.cancel'))}</button>
				<button type="button" class="ac-btn ac-btn--ghost" data-ac-bulk-done hidden>${esc(
					t('action.close'),
				)}</button>
				<button type="button" class="ac-btn ac-btn--primary" data-ac-bulk-run>${esc(
					t('action.classifySelected'),
				)}</button>
			</div>`,
	});

	const root = modal.root;
	const progress = root.querySelector('[data-ac-bulk-progress]');
	const failures = root.querySelector('[data-ac-bulk-failures]');
	const runButton = root.querySelector('[data-ac-bulk-run]');
	const doneButton = root.querySelector('[data-ac-bulk-done]');
	const cancelButton = root.querySelector('[data-ac-bulk-cancel]');

	cancelButton.addEventListener('click', () => modal.close());
	doneButton.addEventListener('click', () => modal.close());

	runButton.addEventListener('click', async () => {
		const objectiveId = root.querySelector('[data-ac-bulk-objective]').value;
		const bloomId = root.querySelector('[data-ac-bulk-bloom]').value;
		if (!objectiveId || !bloomId) {
			toast(`${t('field.objective')} / ${t('field.bloom')}`, 'error');
			return;
		}
		if (targets.length === 0) return;

		const markReviewed = Boolean(root.querySelector('[data-ac-bulk-reviewed]').checked);
		runButton.disabled = true;
		failures.hidden = true;
		failures.innerHTML = '';
		progress.hidden = false;

		const failed = [];
		let done = 0;
		for (let index = 0; index < targets.length; index += 1) {
			const question = targets[index];
			progress.textContent = `${index + 1} / ${targets.length}`;
			try {
				await api.put(`learning/questions/${encodeURIComponent(question.id)}/pedagogy`, {
					criteria: [
						{ objective_id: objectiveId, bloom_dimension_id: bloomId, weight: 1 },
					],
					source: 'manual',
					mark_reviewed: markReviewed,
				});
				done += 1;
			} catch (err) {
				failed.push({ question, message: err.message });
			}
		}

		progress.textContent = t('bulk.done', { count: done });
		runButton.hidden = true;
		doneButton.hidden = false;
		cancelButton.hidden = true;

		if (failed.length) {
			failures.hidden = false;
			failures.innerHTML = `<p class="ac-field__hint">${esc(
				t('bulk.partial', { done, failed: failed.length }),
			)}</p>
			<ul class="learning-bulk__list">${failed
				.map(
					(entry) =>
						`<li><strong>${esc(questionLabel(entry.question))}</strong> — ${esc(entry.message)}</li>`,
				)
				.join('')}</ul>`;
			toast(t('bulk.partial', { done, failed: failed.length }), 'error');
		} else {
			toast(t('bulk.done', { count: done }), 'success');
		}

		if (onDone) onDone({ done, failed: failed.length });
	});
}

function truncate(value, max = 60) {
	const text = String(value ?? '');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
