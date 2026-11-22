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
import { confirmDialog, toast } from '../../components/ui.js';
import { esc, stat } from '../../viz/charts.js';
import { bindLearningShell, ensureEnabled, learningShell, renderLoadError, tr } from './common.js';
import { setAdaptiveEnabled, teacherCreationEnabled } from './flags.js';

const ICONS = {
	learning:
		'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>',
	bell:
		'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
	taxonomy:
		'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M3 12h18M3 17h10"/></svg>',
	classify:
		'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
};

export const learningHubPage = {
	id: 'learning',
	path: '/learning',
	title: 'Learning',
	description:
		'The learning taxonomy governance of this organization (teachers classify questions in the application\'s Questions tab).',
	permission: ['school.learning.read', 'class.learning.read'],
	async render(host, ctx) {
		if (!(await ensureEnabled(host, ctx))) return;

		const t = tr();
		const canManage = ctx.canAny(['school.learning.manage']);

		let objectives;
		let proposed;
		let competencies;
		try {
			[objectives, proposed, competencies] = await Promise.all([
				api.get('learning/objectives', { limit: 1 }),
				api.get('learning/objectives', { status: 'proposed', limit: 1 }),
				api.get('learning/competencies', { limit: 1 }),
			]);
		} catch (err) {
			renderLoadError(host, ctx, err);
			return;
		}

		const total = (payload) => Number(payload?.total ?? 0);
		const proposedCount = total(proposed);
		const teacherPolicy = teacherCreationEnabled();

		// The hero answers "is learning on?" in one glance: a status chip, the
		// policy in force, and — for an administrator — the switch itself.
		const hero = `<section class="learning-hero">
			<div class="learning-hero__main">
				<span class="learning-hero__icon" aria-hidden="true">${ICONS.learning}</span>
				<div class="learning-hero__text">
					<p class="learning-hero__eyebrow">${esc(t('hub.eyebrow'))}</p>
					<h2 class="learning-hero__title">${esc(t('flag.enabled.title'))}</h2>
					<p class="learning-hero__body">${esc(t('flag.enabled.body'))}</p>
					<div class="learning-hero__chips">
						<span class="learning-chip learning-chip--obj-active">${esc(t('hub.status.enabled'))}</span>
						<span class="learning-chip learning-chip--obj-proposed">${esc(
							teacherPolicy ? t('flag.teacherCreation.on') : t('flag.teacherCreation.off'),
						)}</span>
					</div>
				</div>
			</div>
			${
				canManage
					? `<div class="learning-hero__actions"><button type="button" class="ac-btn ac-btn--danger" data-ac-learning-disable>${esc(
							t('flag.toggle.off'),
						)}</button></div>`
					: `<p class="ac-field__hint">${esc(t('flag.adminOnly'))}</p>`
			}
		</section>`;

		// A proposal waiting for a decision is the one thing on this page that
		// needs the administrator to act, so it earns its own call-out.
		const attention =
			canManage && proposedCount > 0
				? `<a class="learning-attention" href="#/learning/taxonomy?tab=proposals">
						<span class="learning-attention__icon" aria-hidden="true">${ICONS.bell}</span>
						<span class="learning-attention__text">
							<strong>${esc(t('hub.attention.title', { count: proposedCount.toLocaleString() }))}</strong>
							<span>${esc(t('hub.attention.body'))}</span>
						</span>
						<span class="learning-attention__cta">${esc(t('hub.attention.cta'))} <span aria-hidden="true">→</span></span>
					</a>`
				: '';

		const kpis = `<div class="ac-grid ac-grid--kpi">
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
					note: t('nav.taxonomy'),
					href: '#/learning/taxonomy?tab=competencies',
				})}
			</div>`;

		const cards = `<div class="ac-role-cards learning-cards">
				<a class="ac-role-card learning-card" href="#/learning/taxonomy">
					<span class="ac-role-card__icon">${ICONS.taxonomy}</span>
					<p class="ac-role-card__title">${esc(t('nav.taxonomy'))}</p>
					<p class="ac-role-card__desc">${esc(t('card.taxonomy.desc'))}</p>
					<p class="ac-role-card__count">${total(objectives).toLocaleString()} <small>${esc(
						t('summary.objectives'),
					)}</small></p>
					<span class="learning-card__foot">${esc(t('card.open'))} <span aria-hidden="true">→</span></span>
				</a>
				<div class="ac-role-card learning-card learning-card--static">
					<span class="ac-role-card__icon">${ICONS.classify}</span>
					<span class="learning-card__badge">${esc(t('card.classify.badge'))}</span>
					<p class="ac-role-card__title">${esc(t('card.classify.title'))}</p>
					<p class="ac-role-card__desc">${esc(t('card.classify.desc'))}</p>
					<span class="learning-card__foot learning-card__foot--muted">${esc(t('card.questions.moved'))}</span>
				</div>
			</div>`;

		const body = `${hero}
			${attention}
			${kpis}

			<div class="ac-section learning-section-head">
				<h2 class="ac-section__title">${esc(t('hub.cards.title'))}</h2>
				<p class="ac-section__hint">${esc(t('learning.description'))}</p>
			</div>

			${cards}`;

		host.innerHTML = learningShell({ body });
		bindLearningShell(host, ctx);

		const disable = host.querySelector('[data-ac-learning-disable]');
		if (disable) {
			disable.addEventListener('click', async () => {
				const ok = await confirmDialog({
					title: t('flag.toggle.off'),
					message: t('hub.disable.confirm'),
					confirmLabel: t('flag.toggle.off'),
					danger: true,
				});
				if (!ok) return;
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
