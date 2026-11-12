/**
 * src/frontend/console/pages/audit.js
 *
 * Activity & Audit.
 *
 * Two streams, switched by the tabs at the top:
 *   ACTIONS  — administrative actions: who changed what, when, with what outcome.
 *   SECURITY — authentication events: who tried to sign in, and whether they
 *              succeeded. This is the stream that surfaces suspicious activity.
 *
 * Both are server-filtered and server-paginated. The console never downloads
 * the full trail.
 */

import { api } from '../core/api.js';
import { esc, stat, barChart } from '../viz/charts.js';
import { renderTable, renderPagination } from '../components/table.js';
import { loadingBlock, errorState, emptyState } from '../components/states.js';
import { searchField, selectField } from '../components/filters.js';
import { formatNumber, formatDate, openModal } from '../components/ui.js';

const PAGE_SIZE = 25;

const STATE = {
	stream: 'actions',
	search: '',
	action: '',
	entityType: '',
	eventType: '',
	outcome: '',
	severity: '',
	offset: 0,
};

export const auditPage = {
	id: 'audit',
	path: '/audit',
	title: 'Activity & Audit',
	description:
		'Every administrative action and every authentication event, searchable and traceable.',
	permission: ['platform.audit.read', 'school.audit.read'],
	async render(host, ctx) {
		host.innerHTML = `
			<div class="ac-toolbar">
				<div class="ac-chip-group" role="group" aria-label="Trail">
					<button type="button" class="ac-chip is-active" data-ac-stream="actions">Administrative actions</button>
					<button type="button" class="ac-chip" data-ac-stream="security">Security events</button>
				</div>
				${searchField({ id: 'ac-audit-search', placeholder: 'Search the trail…', value: STATE.search })}
				<span data-ac-audit-filters></span>
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div class="ac-grid ac-grid--kpi" data-ac-audit-kpis></div>
			<section class="ac-panel" style="margin-top:16px">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title" data-ac-audit-title>Administrative actions</h3>
						<p class="ac-panel__subtitle" data-ac-audit-subtitle></p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush" data-ac-audit-body>
					${loadingBlock(5)}
				</div>
			</section>
			<div class="ac-grid ac-grid--2" style="margin-top:16px" data-ac-audit-charts></div>`;

		const bodyHost = host.querySelector('[data-ac-audit-body]');
		const kpiHost = host.querySelector('[data-ac-audit-kpis]');
		const chartHost = host.querySelector('[data-ac-audit-charts]');
		const filtersHost = host.querySelector('[data-ac-audit-filters]');

		let summaryPayload;
		try {
			summaryPayload = await api.get('console/audit/summary');
		} catch {
			// The summary is a convenience; the trail itself is what matters.
			summaryPayload = { summary: {}, facets: {} };
		}
		const facetsData = summaryPayload.facets || {};
		const summaryData = summaryPayload.summary || {};

		// Filters depend on the active stream.
		filtersHost.innerHTML =
			STATE.stream === 'actions'
				? `${selectField({
						id: 'ac-audit-action',
						label: 'Action',
						value: STATE.action,
						includeAll: true,
						allLabel: 'All actions',
						options: (facetsData.actions || []).map((facet) => ({
							value: facet.value,
							label: `${facet.label} (${facet.count})`,
						})),
					})}
					${selectField({
						id: 'ac-audit-entity',
						label: 'Entity',
						value: STATE.entityType,
						includeAll: true,
						allLabel: 'All entities',
						options: (facetsData.entityTypes || []).map((facet) => ({
							value: facet.value,
							label: `${facet.label} (${facet.count})`,
						})),
					})}`
				: `${selectField({
						id: 'ac-audit-event',
						label: 'Event',
						value: STATE.eventType,
						includeAll: true,
						allLabel: 'All events',
						options: (facetsData.securityEventTypes || []).map((facet) => ({
							value: facet.value,
							label: facet.label,
						})),
					})}`;
		bindFilters(host, ctx);

		// KPI strip.
		const securityCounts = summaryData.security || {};
		kpiHost.innerHTML = [
			stat({
				label: 'Failed sign-ins',
				value: formatNumber(securityCounts.login_failure || 0),
				tone: (securityCounts.login_failure || 0) > 0 ? 'warning' : '',
				tooltip:
					'Recorded failed authentication attempts. A concentration on one address or one username is the signal to investigate.',
			}),
			stat({
				label: 'Successful sign-ins',
				value: formatNumber(securityCounts.login_success || 0),
				tooltip: 'Recorded successful authentication events.',
			}),
			stat({
				label: 'Sessions revoked',
				value: formatNumber(securityCounts.session_revoked || 0),
				tone: (securityCounts.session_revoked || 0) > 0 ? 'warning' : '',
				tooltip: 'Sessions an administrator forcibly ended.',
			}),
			stat({
				label: 'Denied actions',
				value: formatNumber(summaryData.deniedActions || 0),
				tone: (summaryData.deniedActions || 0) > 0 ? 'danger' : '',
				tooltip: 'Administrative actions that were refused. The refusal is itself recorded.',
			}),
			stat({
				label: 'Password changes',
				value: formatNumber(
					(securityCounts.password_change || 0) + (securityCounts.password_reset || 0),
				),
				tooltip: 'Password changes and recovery-code resets recorded in the security trail.',
			}),
		].join('');

		// The trail.
		let payload;
		try {
			payload = await api.get('console/audit', {
				stream: STATE.stream,
				search: STATE.search || undefined,
				action: STATE.stream === 'actions' ? STATE.action || undefined : undefined,
				entityType:
					STATE.stream === 'actions' ? STATE.entityType || undefined : undefined,
				eventType: STATE.stream === 'security' ? STATE.eventType || undefined : undefined,
				limit: PAGE_SIZE,
				offset: STATE.offset,
			});
		} catch (err) {
			bodyHost.innerHTML = errorState({ message: err.message });
			return;
		}

		host.querySelector('[data-ac-audit-title]').textContent =
			STATE.stream === 'actions' ? 'Administrative actions' : 'Security events';
		host.querySelector('[data-ac-audit-subtitle]').textContent =
			STATE.stream === 'actions'
				? 'Every administrative change, with the outcome it produced.'
				: 'Every authentication and access-control event, with the source address.';

		bodyHost.innerHTML =
			STATE.stream === 'actions'
				? renderTable({
						columns: [
							{
								key: 'occurredAt',
								label: 'When',
								render: (row) => `<span title="${esc(formatDate(row.occurredAt))}">${esc(
									formatDate(row.occurredAt),
								)}</span>`,
							},
							{
								key: 'actorName',
								label: 'Actor',
								render: (row) =>
									row.actorName
										? `<span class="ac-table__primary">${esc(row.actorName)}</span><br><span class="ac-table__muted">${esc(
												row.actorRole || '',
											)}</span>`
										: '<span class="ac-table__muted">system</span>',
							},
							{
								key: 'action',
								label: 'Action',
								render: (row) => `<span class="ac-badge">${esc(row.actionLabel)}</span>`,
							},
							{
								key: 'entityType',
								label: 'Entity',
								render: (row) =>
									`${esc(row.entityTypeLabel)}<br><span class="ac-table__muted">${esc(
										row.entityId,
									)}</span>`,
							},
							{
								key: 'outcome',
								label: 'Outcome',
								render: (row) =>
									`<span class="ac-badge ac-badge--${
										row.outcome === 'success'
											? 'success'
											: row.outcome === 'denied'
												? 'danger'
												: 'warning'
									}">${esc(row.outcome)}</span>`,
							},
							{
								key: 'severity',
								label: 'Severity',
								render: (row) =>
									`<span class="ac-badge ac-badge--${
										row.severity === 'critical'
											? 'danger'
											: row.severity === 'warning'
												? 'warning'
												: ''
									}">${esc(row.severity)}</span>`,
							},
							{
								key: 'schoolName',
								label: 'Organization',
								render: (row) => esc(row.schoolName || '—'),
							},
						],
						rows: payload.data,
						empty: 'No administrative action matches the current filters.',
						rowClass: (row) => (row.outcome === 'denied' ? 'ac-row--denied' : ''),
					})
				: renderTable({
						columns: [
							{
								key: 'occurredAt',
								label: 'When',
								render: (row) => `<span title="${esc(formatDate(row.occurredAt))}">${esc(
									formatDate(row.occurredAt),
								)}</span>`,
							},
							{
								key: 'typeLabel',
								label: 'Event',
								render: (row) => `<span class="ac-badge">${esc(row.typeLabel)}</span>`,
							},
							{
								key: 'username',
								label: 'Account',
								render: (row) =>
									row.userName
										? `<span class="ac-table__primary">${esc(row.userName)}</span><br><span class="ac-table__muted">${esc(
												row.username || '',
											)}</span>`
										: esc(row.username || '—'),
							},
							{
								key: 'reason',
								label: 'Reason',
								render: (row) => esc(row.reason || '—'),
							},
							{
								key: 'outcome',
								label: 'Outcome',
								render: (row) =>
									`<span class="ac-badge ac-badge--${
										row.outcome === 'success'
											? 'success'
											: row.outcome === 'denied'
												? 'danger'
												: 'warning'
									}">${esc(row.outcome)}</span>`,
							},
							{
								key: 'severity',
								label: 'Severity',
								render: (row) =>
									`<span class="ac-badge ac-badge--${
										row.severity === 'critical'
											? 'danger'
											: row.severity === 'warning'
												? 'warning'
												: ''
									}">${esc(row.severity)}</span>`,
							},
							{ key: 'ip', label: 'Source', render: (row) => esc(row.ip || '—') },
						],
						rows: payload.data,
						empty: 'No security event matches the current filters.',
					});

		bodyHost.insertAdjacentHTML(
			'beforeend',
			renderPagination({
				total: payload.total,
				limit: payload.limit,
				offset: payload.offset,
				onPage: (offset) => {
					STATE.offset = offset;
					ctx.rerender();
				},
			}),
		);

		// Suspicious-activity panel: concentration of failed sign-ins.
		const sources = summaryData.topFailureSources || {};
		if (sources.byIp?.length || sources.byUsername?.length) {
			chartHost.innerHTML = `
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Failed sign-in sources</h3>
							<p class="ac-panel__subtitle">Top source addresses by attempt count. A concentration may indicate credential stuffing.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${barChart({
							rows: (sources.byIp || []).map((row) => ({ label: row.ip, value: row.count })),
							value: 'value',
							label: (row) => row.label,
							display: (value) => formatNumber(value),
							tone: 'danger',
							ariaLabel: 'Failed sign-ins by source address',
						})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Targeted usernames</h3>
							<p class="ac-panel__subtitle">Attempted usernames by failure count.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${barChart({
							rows: (sources.byUsername || []).map((row) => ({ label: row.username, value: row.count })),
							value: 'value',
							label: (row) => row.label,
							display: (value) => formatNumber(value),
							tone: 'warning',
							ariaLabel: 'Failed sign-ins by attempted username',
						})}
					</div>
				</section>`;
		} else {
			chartHost.innerHTML = '';
		}

		// Stream switch.
		host.querySelectorAll('[data-ac-stream]').forEach((button) => {
			button.addEventListener('click', () => {
				STATE.stream = button.dataset.acStream;
				STATE.offset = 0;
				ctx.rerender();
			});
		});

		const search = host.querySelector('#ac-audit-search');
		let debounce = null;
		search.addEventListener('input', () => {
			window.clearTimeout(debounce);
			debounce = window.setTimeout(() => {
				STATE.search = search.value.trim();
				STATE.offset = 0;
				ctx.rerender();
			}, 320);
		});
		host.querySelector('[data-ac-refresh]').addEventListener('click', () => ctx.rerender());
	},
};

function bindFilters(host, ctx) {
	const action = host.querySelector('#ac-audit-action');
	if (action) {
		action.addEventListener('change', (event) => {
			STATE.action = event.target.value;
			STATE.offset = 0;
			ctx.rerender();
		});
	}
	const entity = host.querySelector('#ac-audit-entity');
	if (entity) {
		entity.addEventListener('change', (event) => {
			STATE.entityType = event.target.value;
			STATE.offset = 0;
			ctx.rerender();
		});
	}
	const eventType = host.querySelector('#ac-audit-event');
	if (eventType) {
		eventType.addEventListener('change', (element) => {
			STATE.eventType = element.target.value;
			STATE.offset = 0;
			ctx.rerender();
		});
	}
}
