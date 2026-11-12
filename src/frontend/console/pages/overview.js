/**
 * src/frontend/console/pages/overview.js
 *
 * Overview — the platform control center.
 *
 * The page answers five questions and nothing else:
 *   1. What is happening across my platform?
 *   2. Is it growing or declining?
 *   3. Are organizations, teachers and students actively using it?
 *   4. What needs intervention?
 *   5. What should I do next?
 *
 * Every number comes from the server read model. Nothing is computed here.
 */

import { api } from '../core/api.js';
import { getState, can } from '../core/store.js';
import { esc, stat, trend, columnChart, barChart, legend, lineChart } from '../viz/charts.js';
import { renderTable, bindTable, renderPagination } from '../components/table.js';
import { loadingBlock, emptyState, errorState } from '../components/states.js';
import { periodToolbar, bindChipGroup, PERIODS } from '../components/filters.js';
import { formatNumber, formatDate, formatRelative, toast, plural } from '../components/ui.js';

const PAGE_LIMIT = 10;

export const overviewPage = {
	id: 'overview',
	path: '/',
	title: 'Overview',
	description: 'Platform health, growth, adoption and the actions that need attention.',
	permission: ['platform.console', 'school.console'],
	async render(host, ctx) {
		const state = getState();
		host.innerHTML = `<div class="ac-stack" data-ac-overview>
			${periodToolbar({ value: state.period })}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${loadingBlock(1)}</div>
			<div data-ac-alerts class="ac-stack"></div>
			<div data-ac-trends class="ac-grid ac-grid--2"></div>
			<div data-ac-orgs></div>
			<div data-ac-engagement class="ac-grid ac-grid--2"></div>
		</div>`;

		const periodKey = state.period === 'year' ? 'year' : state.period;
		const params = { period: periodKey };
		if (state.period === 'custom' && state.customRange) {
			params.from = state.customRange.from;
			params.to = state.customRange.to;
		}

		let overview;
		let trends;
		try {
			[overview, trends] = await Promise.all([
				api.get('console/overview', params),
				api.get('console/trends', params),
			]);
		} catch (err) {
			host.innerHTML = errorState({
				title: 'The overview could not be loaded',
				message: err.message,
			});
			host.querySelector('[data-ac-retry]')?.addEventListener('click', () => {
				ctx.rerender();
			});
			return;
		}

		const data = overview.data;
		const glance = data.sections.glance;
		const activity = data.sections.activity;
		const operations = data.sections.operations;
		const content = data.sections.content;
		const definitions = data.meta.definitions;

		// ── KPI strip ───────────────────────────────────────────────────────
		// Only the indicators that answer "is the platform healthy?" lead.
		const isPlatform = data.meta.scope.kind === 'platform';
		const kpis = [];

		if (isPlatform) {
			kpis.push(
				stat({
					label: 'Organizations',
					value: formatNumber(glance.organizations.total),
					note: `${glance.organizations.active} active · ${glance.organizations.pending} pending · ${glance.organizations.suspended} suspended`,
					tone: 'primary',
					tooltip:
						'Organizations are the tenants of the platform. "Active" means status = active. "New" counts organizations created inside the selected period.',
					href: '#/organizations',
				}),
				stat({
					label: 'New organizations',
					value: formatNumber(glance.organizations.newInPeriod),
					note: data.meta.scope.periodLabel,
					tooltip:
						'Organizations whose created_at falls inside the selected period. The previous equal-length period is used for the comparison when one exists.',
				}),
			);
		} else {
			kpis.push(
				stat({
					label: 'Organization',
					value: ctx.organization?.name || '—',
					note: ctx.organization?.plan ? `Plan: ${ctx.organization.plan}` : '',
					tone: 'primary',
					tooltip: 'The organization this session is scoped to.',
					href: '#/organizations',
				}),
			);
		}

		kpis.push(
			stat({
				label: 'Active teachers',
				value: formatNumber(glance.users.activeTeachers),
				note: `of ${formatNumber(glance.users.teachers)} total`,
				tone: 'success',
				tooltip: definitions.activeTeacher,
				href: '#/analytics',
			}),
			stat({
				label: 'Active students',
				value: formatNumber(glance.users.activeStudents),
				note: `of ${formatNumber(glance.users.students)} total`,
				tone: 'success',
				tooltip: definitions.activeStudent,
				href: '#/analytics',
			}),
			stat({
				label: 'Exams conducted',
				value: formatNumber(activity.examsConducted),
				note: plural(activity.formalAttempts, 'formal attempt'),
				tooltip: definitions.examsConducted,
			}),
			stat({
				label: 'Average score',
				value:
					activity.averageScore20 == null ? '—' : `${activity.averageScore20.toFixed(2)}`,
				note:
					activity.averageScoreSample > 0
						? `/20 · ${plural(activity.averageScoreSample, 'attempt')}`
						: 'no formal attempts in this period',
				tone: activity.averageScore20 == null ? '' : 'primary',
				tooltip: definitions.averageScore,
			}),
			stat({
				label: 'Service availability',
				value:
					operations.availabilityPercent == null
						? '—'
						: `${operations.availabilityPercent.toFixed(1)}%`,
				note: 'last 60 minutes',
				tone:
					operations.availabilityPercent == null
						? ''
						: operations.availabilityPercent >= 99
							? 'success'
							: 'warning',
				tooltip: operations.note,
				href: '#/health',
			}),			stat({
				label: 'Failed sign-ins',
				value: formatNumber(operations.failedAuthentications),
				note: data.meta.scope.periodLabel,
				tone: operations.failedAuthentications > 0 ? 'warning' : '',
				tooltip:
					'Failed sign-in attempts recorded in the durable security trail inside the selected period. Grouped by source address and attempted username on the Audit page.',
				href: '#/audit',
			}),
		);

		host.querySelector('[data-ac-kpis]').innerHTML = kpis.join('');

		// ── Alerts ─────────────────────────────────────────────────────────
		host.querySelector('[data-ac-alerts]').innerHTML = renderAlerts(data, glance, operations, activity);

		// ── Trends ──────────────────────────────────────────────────────────
		const trendsHost = host.querySelector('[data-ac-trends]');
		if (trends) {
			const series = trends.data.series;
			const labels = series.labels;
			const attemptsSeries = [
				{ key: 'formalAttempts', label: 'Formal exams', tone: 'primary' },
				{ key: 'trainingAttempts', label: 'Training', tone: 'info' },
				{ key: 'gameAttempts', label: 'Games', tone: 'violet' },
			];
			const accountSeries = [
				{ key: 'newTeachers', label: 'Teachers', tone: 'success' },
				{ key: 'newStudents', label: 'Students', tone: 'warning' },
			];
			const points = labels.map((label, index) => ({
				label,
				formalAttempts: series.formalAttempts[index] || 0,
				trainingAttempts: series.trainingAttempts[index] || 0,
				gameAttempts: series.gameAttempts[index] || 0,
				newTeachers: series.newTeachers[index] || 0,
				newStudents: series.newStudents[index] || 0,
			}));

			trendsHost.innerHTML = `
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Educational activity over time</h3>
							<p class="ac-panel__subtitle">Completed attempts, split by mode. ${esc(
								trends.data.meta.granularity === 'week' ? 'Weekly' : 'Daily',
							)} buckets over ${esc(trends.data.meta.periodLabel)}.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${legend(attemptsSeries)}
						${columnChart({
							points,
							series: attemptsSeries,
							labelKey: 'label',
							ariaLabel: 'Completed attempts over time by mode',
						})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Account growth</h3>
							<p class="ac-panel__subtitle">New teacher and student accounts created inside the period.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${legend(accountSeries)}
						${columnChart({
							points,
							series: accountSeries,
							labelKey: 'label',
							ariaLabel: 'New accounts over time',
						})}
					</div>
				</section>`;
		}

		// ── Organizational overview ────────────────────────────────────────
		const orgsHost = host.querySelector('[data-ac-orgs]');
		orgsHost.innerHTML = `<section class="ac-panel">
			<div class="ac-panel__header">
				<div class="ac-panel__titles">
					<h3 class="ac-panel__title">Organizations requiring attention</h3>
					<p class="ac-panel__subtitle">Active users are measured over the last 30 days. Alerts come from real account, request and activity records.</p>
				</div>
				<div class="ac-panel__actions"><a class="ac-btn ac-btn--sm" href="#/organizations">Open organizations</a></div>
			</div>
			<div class="ac-panel__body ac-panel__body--flush" data-ac-org-table>
				${loadingBlock(3)}
			</div>
		</section>`;

		try {
			const orgs = await api.get('console/organizations', { limit: PAGE_LIMIT, offset: 0 });
			const tableHost = orgsHost.querySelector('[data-ac-org-table]');
			tableHost.innerHTML = renderTable({
				columns: [
					{
						key: 'name',
						label: 'Organization',
						render: (row) =>
							`<span class="ac-table__primary">${esc(row.name)}</span><br><span class="ac-table__muted">${esc(
								row.schoolType || '',
							)} · ${esc(row.plan || '')}</span>`,
					},
					{ key: 'teachers', label: 'Teachers', align: 'right' },
					{ key: 'students', label: 'Students', align: 'right' },
					{
						key: 'activeStudents',
						label: 'Active (30d)',
						align: 'right',
						render: (row) =>
							`<span title="Active students over the last 30 days">${formatNumber(
								row.activeStudents,
							)}</span>`,
					},
					{
						key: 'attempts30d',
						label: 'Attempts (30d)',
						align: 'right',
					},
					{
						key: 'lastActivity',
						label: 'Last activity',
						render: (row) =>
							row.lastActivity
								? `<span title="${esc(formatDate(row.lastActivity))}">${esc(
										formatRelative(row.lastActivity),
									)}</span>`
								: '<span class="ac-badge ac-badge--danger">none</span>',
					},
					{
						key: 'status',
						label: 'Status',
						render: (row) =>
							`<span class="ac-badge ${
								row.status === 'active'
									? 'ac-badge--success'
									: row.status === 'pending'
										? 'ac-badge--warning'
										: 'ac-badge--danger'
							}">${esc(row.status)}</span>`,
					},
					{
						key: 'alerts',
						label: 'Alerts',
						render: (row) =>
							row.alerts.length
								? row.alerts
										.map(
											(alert) =>
												`<span class="ac-badge ac-badge--${
													alert.kind === 'danger'
														? 'danger'
														: alert.kind === 'warning'
															? 'warning'
															: 'info'
												}" title="${esc(alert.message)}">${esc(alert.code)}</span>`,
										)
										.join(' ')
								: '<span class="ac-table__muted">—</span>',
					},
				],
				rows: orgs.data,
				empty: 'No organizations are visible in this scope yet.',
				rowHref: (row) => `#/organizations/${row.id}`,
			});
		} catch (err) {
			orgsHost.querySelector('[data-ac-org-table]').innerHTML = errorState({
				message: err.message,
			});
		}

		// ── Engagement & participation ─────────────────────────────────────
		const engagementHost = host.querySelector('[data-ac-engagement]');
		engagementHost.innerHTML = `
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Teacher engagement</h3>
						<p class="ac-panel__subtitle">${esc(definitions.activeTeacher)}</p>
					</div>
				</div>
				<div class="ac-panel__body">
					${renderRatioBars([
						{ label: 'Active teachers', value: glance.users.activeTeachers, total: glance.users.teachers, tone: 'success' },
						{ label: 'Content-producing teachers', value: content.exams, total: glance.users.teachers, tone: 'primary' },
						{ label: 'Organizations with activity', value: glance.organizations.withActivity, total: glance.organizations.total, tone: 'info' },
					])}
				</div>
			</section>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Student participation</h3>
						<p class="ac-panel__subtitle">${esc(definitions.activeStudent)}</p>
					</div>
				</div>
				<div class="ac-panel__body">
					${renderRatioBars([
						{ label: 'Participating students', value: activity.participatingStudents, total: glance.users.students, tone: 'primary' },
						{ label: 'Active students (period)', value: glance.users.activeStudents, total: glance.users.students, tone: 'success' },
						{ label: 'Game sessions played', value: activity.gameSessions + activity.kidsGameSessions, total: null, tone: 'violet' },
					])}
					<div class="ac-defs" style="margin-top:16px">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Total attempts</p>
							<p class="ac-defs__desc">${formatNumber(activity.attempts)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Unique participating students</p>
							<p class="ac-defs__desc">${formatNumber(activity.participatingStudents)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Attempts vs students</p>
							<p class="ac-defs__desc">${formatNumber(activity.attempts)} attempts from ${formatNumber(
								activity.participatingStudents,
							)} students</p>
						</div>
					</div>
				</div>
			</section>`;

		// ── Period control ─────────────────────────────────────────────────
		bindChipGroup(host, 'period', async (key) => {
			if (key === 'custom') {
				const from = prompt('From (YYYY-MM-DD)', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
				if (!from) {
					toast('Custom period needs a start date.', 'error');
					return;
				}
				const to = prompt('To (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
				if (!to) {
					toast('Custom period needs an end date.', 'error');
					return;
				}
				ctx.setPeriod('custom', { from, to });
				return;
			}
			ctx.setPeriod(key);
		});
	},
};

/**
 * A horizontal proportion bar list. Used where a chart would be decorative:
 * the question is "how much of the population?", and a ratio bar answers it
 * without a coordinate system.
 */
function renderRatioBars(rows) {
	return `<div class="ac-stack" style="gap:12px">${rows
		.map((row) => {
			const ratio =
				row.total && row.total > 0 ? Math.min(1, row.total ? row.value / row.total : 0) : null;
			const pct = ratio == null ? null : Math.round(ratio * 1000) / 10;
			return `<div>
				<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;margin-bottom:4px">
					<span style="color:var(--ac-text-muted)">${esc(row.label)}</span>
					<span style="font-weight:650;font-variant-numeric:tabular-nums">${formatNumber(
						row.value,
					)}${
						row.total != null ? ` <span style="color:var(--ac-text-subtle);font-weight:500">/ ${formatNumber(row.total)}</span>` : ''
					}</span>
				</div>
				<div class="ac-chart__track" style="height:8px;border-radius:4px;overflow:hidden;background:var(--ac-surface-3)">
					<div style="height:100%;width:${pct == null ? 0 : pct}%;background:var(--ac-tone-${
						row.tone === 'success' ? 2 : row.tone === 'warning' ? 3 : row.tone === 'violet' ? 6 : 1
					});border-radius:4px"></div>
				</div>
				${pct == null ? '' : `<div style="font-size:11px;color:var(--ac-text-subtle);margin-top:2px">${pct}% of the population</div>`}
			</div>`;
		})
		.join('')}</div>`;
}

/**
 * The alerts band. Every alert is derived from a real record and an explicit
 * threshold — never from a guess.
 */
function renderAlerts(data, glance, operations, activity) {
	const alerts = [];

	if (glance.organizations.suspended > 0) {
		alerts.push({
			kind: 'danger',
			title: `${glance.organizations.suspended} organization${
				glance.organizations.suspended === 1 ? ' is' : 's are'
			} suspended`,
			text: 'Suspended organizations cannot sign in. Review whether access should be restored.',
			action: { label: 'Review organizations', href: '#/organizations?status=suspended' },
		});
	}
	if (glance.organizations.pending > 0) {
		alerts.push({
			kind: 'warning',
			title: `${glance.organizations.pending} organization${
				glance.organizations.pending === 1 ? '' : 's'
			} awaiting activation`,
			text: 'Provisioned organizations that have never been activated.',
			action: { label: 'Review organizations', href: '#/organizations?status=pending' },
		});
	}
	if (glance.users.pendingInvitations > 0) {
		alerts.push({
			kind: 'info',
			title: `${glance.users.pendingInvitations} account request${
				glance.users.pendingInvitations === 1 ? '' : 's'
			} awaiting a decision`,
			text: 'Account requests are waiting for an administrator to approve or reject them.',
			action: { label: 'Review requests', href: '#/users?status=pending' },
		});
	}
	if (glance.users.suspended > 0) {
		alerts.push({
			kind: 'warning',
			title: `${glance.users.suspended} suspended account${
				glance.users.suspended === 1 ? '' : 's'
			}`,
			text: 'Suspended accounts keep their data but cannot sign in.',
			action: { label: 'Review accounts', href: '#/users?status=suspended' },
		});
	}
	if (operations.failedAuthentications > 0) {
		alerts.push({
			kind: 'warning',
			title: `${operations.failedAuthentications} failed sign-in attempt${
				operations.failedAuthentications === 1 ? '' : 's'
			} in this period`,
			text: 'Grouped by source address and attempted username on the Audit page — a concentration may indicate credential stuffing.',
			action: { label: 'Inspect security events', href: '#/audit' },
		});
	}
	if (
		operations.serverErrorRatePercent != null &&
		operations.serverErrorRatePercent >= 1
	) {
		alerts.push({
			kind: 'danger',
			title: `Server error rate at ${operations.serverErrorRatePercent}%`,
			text: 'More than one in a hundred requests failed with a server error in the last hour. See System Health for the affected endpoints.',
			action: { label: 'Open system health', href: '#/health' },
		});
	}
	if (
		activity.attemptsPrevious != null &&
		activity.attempts > 0 &&
		activity.attemptsPrevious > 0
	) {
		const delta = Math.round(((activity.attempts - activity.attemptsPrevious) / activity.attemptsPrevious) * 1000) / 10;
		if (delta <= -30) {
			alerts.push({
				kind: 'warning',
				title: `Attempts fell ${Math.abs(delta)}% versus the previous period`,
				text: 'A sharp drop usually means an organization stopped using the platform, or a term boundary was crossed.',
				action: { label: 'Compare organizations', href: '#/analytics' },
			});
		}
	}

	if (!alerts.length) {
		return `<div class="ac-alert ac-alert--info">
			<div class="ac-alert__body">
				<p class="ac-alert__title">No administrative alerts</p>
				<p class="ac-alert__text">Every monitored threshold is inside its normal range for ${esc(
					data.meta.scope.periodLabel.toLowerCase(),
				)}.</p>
			</div>
		</div>`;
	}

	return `<div class="ac-alert-list">${alerts
		.map(
			(alert) => `
			<div class="ac-alert-item">
				<div class="ac-alert-item__body">
					<p class="ac-alert-item__title">${esc(alert.title)}</p>
					<p class="ac-alert-item__text">${esc(alert.text)}</p>
				</div>
				<div class="ac-alert-item__action">
					<a class="ac-btn ac-btn--sm" href="${esc(alert.action.href)}">${esc(alert.action.label)}</a>
				</div>
			</div>`,
		)
		.join('')}</div>`;
}
