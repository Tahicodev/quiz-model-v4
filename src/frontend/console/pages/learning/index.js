/**
 * src/frontend/console/pages/learning/index.js
 *
 * Learning — the hub.
 *
 * It answers three questions in order: is learning enabled here, what does
 * this organization have, and where do I go next. When the switch is off it
 * shows the state and (for an administrator) the way to turn it on — the
 * sub-pages are not even offered, so nobody walks into a dead end.
 */

import { api } from '../../core/api.js';
import { toast } from '../../components/ui.js';
import { esc, stat } from '../../viz/charts.js';
import { bindLearningShell, ensureEnabled, learningShell, renderLoadError, tr } from './common.js';
import { setAdaptiveEnabled, teacherCreationEnabled } from './flags.js';

export const learningHubPage = {
	id: 'learning',
	path: '/learning',
	title: 'Learning',
	description: 'The learning taxonomy and question classification of this organization.',
	permission: ['school.learning.read', 'class.learning.read'],
	async render(host, ctx) {
		if (!(await ensureEnabled(host, ctx))) return;

		const t = tr();
		const canManage = ctx.canAny(['school.learning.manage']);

		let objectives;
		let proposed;
		let competencies;
		let questions;
		try {
			[objectives, proposed, competencies, questions] = await Promise.all([
				api.get('learning/objectives', { limit: 1 }),
				api.get('learning/objectives', { status: 'proposed', limit: 1 }),
				api.get('learning/competencies', { limit: 1 }),
				// `limit: 1` asks for the total, not the rows: the hub reports
				// how much there is, it never lists it.
				api.get('questions', { limit: 1 }),
			]);
		} catch (err) {
			renderLoadError(host, ctx, err);
			return;
		}

		const total = (payload) => Number(payload?.total ?? 0);
		const proposedCount = total(proposed);

		const statePanel = `<section class="ac-section-panel">
			<div class="ac-section-panel__head">
				<div>
					<h3 class="ac-section-panel__title">${esc(t('flag.enabled.title'))}</h3>
					<p class="ac-section-panel__subtitle">${esc(t('flag.enabled.body'))}</p>
				</div>
				${
					canManage
						? `<div class="ac-panel__actions"><button type="button" class="ac-btn ac-btn--danger" data-ac-learning-disable>${esc(
								t('flag.toggle.off'),
							)}</button></div>`
						: ''
				}
			</div>
			<div class="ac-section-panel__body">
				<div class="learning-panel__fact">
					<span class="learning-panel__fact-label">${esc(t('table.objective'))}</span>
					<span>${esc(
						teacherCreationEnabled() ? t('flag.teacherCreation.on') : t('flag.teacherCreation.off'),
					)}</span>
				</div>
				${canManage ? '' : `<p class="ac-field__hint">${esc(t('flag.adminOnly'))}</p>`}
			</div>
		</section>`;

		const body = `<div class="ac-grid ac-grid--kpi">
				${stat({
					label: t('summary.objectives'),
					value: total(objectives).toLocaleString(),
					note: t('nav.taxonomy'),
					href: '#/learning/taxonomy',
				})}
				${stat({
					label: t('summary.proposed'),
					value: proposedCount.toLocaleString(),
					note: t('table.proposedBy'),
					tone: proposedCount > 0 ? 'warning' : '',
					href: canManage ? '#/learning/taxonomy?tab=proposals' : '',
				})}
				${stat({
					label: t('summary.competencies'),
					value: total(competencies).toLocaleString(),
					note: t('table.competency'),
					href: '#/learning/taxonomy?tab=competencies',
				})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">${esc(t('learning.title'))}</h2>
				<p class="ac-section__hint">${esc(t('learning.description'))}</p>
			</div>

			<div class="ac-role-cards">
				<a class="ac-role-card" href="#/learning/questions">
					<span class="ac-role-card__icon"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></span>
					<p class="ac-role-card__title">${esc(t('nav.questions'))}</p>
					<p class="ac-role-card__desc">${esc(t('card.questions.desc'))}</p>
					<p class="ac-role-card__count">${total(questions).toLocaleString()} <small>${esc(
						t('table.question'),
					)}</small></p>
				</a>
				<a class="ac-role-card" href="#/learning/taxonomy">
					<span class="ac-role-card__icon"><svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg></span>
					<p class="ac-role-card__title">${esc(t('nav.taxonomy'))}</p>
					<p class="ac-role-card__desc">${esc(t('card.taxonomy.desc'))}</p>
					<p class="ac-role-card__count">${total(objectives).toLocaleString()} <small>${esc(
						t('summary.objectives'),
					)}</small></p>
				</a>
			</div>

			${statePanel}`;

		host.innerHTML = learningShell({ body });
		bindLearningShell(host, ctx);

		const disable = host.querySelector('[data-ac-learning-disable]');
		if (disable) {
			disable.addEventListener('click', async () => {
				disable.disabled = true;
				try {
					await setAdaptiveEnabled(false);
					toast(t('toast.flagOff'), 'success');
					ctx.rerender();
				} catch (err) {
					disable.disabled = false;
					toast(err.message, 'error');
				}
			});
		}
	},
};
