/**
 * src/frontend/console/pages/health.js
 *
 * System Health & Operations.
 *
 * Everything on this page is measured from real instrumentation. Where a
 * number cannot be measured, the page says so instead of showing zero —
 * the availability figure in particular is explicitly windowed and
 * process-local, and the page says that in plain language.
 */

import { api } from '../core/api.js';
import { esc, stat, columnChart, barChart, legend } from '../viz/charts.js';
import { renderTable } from '../components/table.js';
import { loadingBlock, errorState, emptyState } from '../components/states.js';
import { formatNumber, formatDate, formatRelative } from '../components/ui.js';

const WINDOWS = [
	{ key: '15', label: '15 min' },
	{ key: '60', label: '1 hour' },
	{ key: '360', label: '6 hours' },
	{ key: '1440', label: '24 hours' },
];

const STATE = { minutes: '60' };

export const healthPage = {
	id: 'health',
	path: '/health',
	title: 'System Health & Operations',
	description:
		'Service availability, error trends, latency, database and storage — measured, not asserted.',
	permission: ['platform.health.read', 'school.health.read'],
	async render(host, ctx) {
		host.innerHTML = `
			<div class="ac-toolbar">
				<div class="ac-chip-group" role="group" aria-label="Window">
					${WINDOWS.map(
						(window) =>
							`<button type="button" class="ac-chip${
								STATE.minutes === window.key ? ' is-active' : ''
							}" data-ac-window="${window.key}">${esc(window.label)}</button>`,
					).join('')}
				</div>
				<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>
			</div>
			<div data-ac-health><div class="ac-skeleton-stack" aria-busy="true">
				<div class="ac-skeleton" style="width:45%"></div>
				<div class="ac-skeleton" style="width:100%"></div>
			</div></div>`;

		let payload;
		try {
			payload = await api.get('console/health', { minutes: STATE.minutes });
		} catch (err) {
			host.querySelector('[data-ac-health]').innerHTML = errorState({ message: err.message });
			return;
		}

		const data = payload.data;
		const api_ = data.sections.api;
		const latency = data.sections.latency;
		const database = data.sections.database;
		const realtime = data.sections.realtime;
		const storage = data.sections.storage;
		const scheduled = data.sections.scheduled;

		const availabilityTone =
			api_.availabilityPercent == null
				? ''
				: api_.availabilityPercent >= 99
					? 'success'
					: api_.availabilityPercent >= 95
						? 'warning'
						: 'danger';

		host.querySelector('[data-ac-health]').innerHTML = `
			<div class="ac-grid ac-grid--kpi">
				${stat({
					label: 'API availability',
					value:
						api_.availabilityPercent == null ? '—' : `${api_.availabilityPercent.toFixed(1)}%`,
					note: `${formatNumber(api_.totalCalls)} requests in the window`,
					tone: availabilityTone,
					tooltip: data.meta.notes.availability,
				})}
				${stat({
					label: 'Server error rate',
					value:
						api_.serverErrorRatePercent == null
							? '—'
							: `${api_.serverErrorRatePercent.toFixed(1)}%`,
					note: `${formatNumber(api_.serverErrors ?? 0)} server errors`,
					tone:
						api_.serverErrorRatePercent == null
							? ''
							: api_.serverErrorRatePercent >= 1
								? 'danger'
								: api_.serverErrorRatePercent > 0
									? 'warning'
									: 'success',
					tooltip:
						'Share of API requests in the window that failed with a 5xx status. This is the measure of service health: a 4xx is a client mistake, not an outage.',
				})}
				${stat({
					label: 'Error rate (all)',
					value: api_.errorRatePercent == null ? '—' : `${api_.errorRatePercent.toFixed(1)}%`,
					note: `${formatNumber(api_.errors)} failed requests`,
					tone:
						api_.errorRatePercent == null
							? ''
							: api_.errorRatePercent >= 20
								? 'warning'
								: '',
					tooltip:
						'Share of API requests in the window that returned a 4xx or 5xx status. A high value here with a low server error rate usually means rejected or expired requests, not an outage.',
				})}
				${stat({
					label: 'p95 latency',
					value: latency.available && latency.p95 != null ? `${latency.p95} ms` : '—',
					note:
						latency.available && latency.p50 != null
							? `p50 ${latency.p50} ms · p99 ${latency.p99} ms`
							: 'no requests in the window',
					tone: latency.available && latency.p95 != null && latency.p95 > 1000 ? 'warning' : '',
					tooltip: data.meta.notes.latency,
				})}
				${stat({
					label: 'Database',
					value: database.available ? 'Reachable' : 'Unreachable',
					note: database.available ? `${database.roundTripMs} ms round trip` : database.error || '',
					tone: database.available ? 'success' : 'danger',
					tooltip:
						'A live COUNT query against the configured database, plus the row counts of the principal tables.',
				})}
				${stat({
					label: 'Uptime',
					value: formatRelative(new Date(data.meta.process.startedAt)),
					note: `process started ${formatDate(data.meta.process.startedAt)}`,
					tooltip:
						'Process uptime. The request log resets with the process, so availability cannot be measured across a restart.',
				})}
				${stat({
					label: 'Storage used',
					value: storage.available ? `${storage.megabytes} MB` : '—',
					note: storage.available ? `${formatNumber(storage.files)} files in uploads` : storage.error || '',
					tooltip: data.meta.notes.storage,
				})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Request profile</h2>
				<p class="ac-section__hint">Status-code distribution and the endpoints responsible for the failures.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Status codes</h3>
							<p class="ac-panel__subtitle">Every API response recorded in the window.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${
							latency.available && latency.statuses?.length
								? barChart({
										rows: latency.statuses.map((entry) => ({
											label: entry.bucket,
											value: entry.count,
										})),
										value: 'value',
										label: (row) => row.label,
										display: (value) => formatNumber(value),
										tone: (row) =>
											row.label === '5xx'
												? 'danger'
												: row.label === '4xx'
													? 'warning'
													: 'success',
										ariaLabel: 'Response status distribution',
									})
								: emptyState({
										title: 'No requests recorded',
										message: 'The request log is empty for this window. It is process-local and starts empty after a restart.',
									})
						}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Storage & realtime</h3>
							<p class="ac-panel__subtitle">On-disk footprint and live connection tracking.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Uploads</p>
								<p class="ac-defs__desc">${storage.available ? `${storage.megabytes} MB` : '—'}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Files</p>
								<p class="ac-defs__desc">${storage.available ? formatNumber(storage.files) : '—'}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Realtime status</p>
								<p class="ac-defs__desc">${esc(realtime.status || 'unknown')}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Tracked connections</p>
								<p class="ac-defs__desc">${formatNumber(realtime.trackedConnections ?? 0)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:14px 0 0;font-size:12px">${esc(
							storage.available ? storage.directory : storage.error || '',
						)}</p>
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Endpoints</h2>
				<p class="ac-section__hint">The twenty busiest endpoints in the window, with their own error rate.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">API traffic</h3>
						<p class="ac-panel__subtitle">Sorted by call volume. Error rate is computed per endpoint.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${renderTable({
						columns: [
							{ key: 'method', label: 'Method' },
							{ key: 'path', label: 'Path', render: (row) => `<code>${esc(row.path)}</code>` },
							{ key: 'calls', label: 'Calls', align: 'right' },
							{ key: 'errors', label: 'Errors', align: 'right' },
							{
								key: 'errorRatePercent',
								label: 'Error rate',
								align: 'right',
								render: (row) =>
									`<span class="ac-badge ${
										row.errorRatePercent >= 5
											? 'ac-badge--danger'
											: row.errorRatePercent > 0
												? 'ac-badge--warning'
												: 'ac-badge--success'
									}">${row.errorRatePercent.toFixed(1)}%</span>`,
							},
							{ key: 'averageMs', label: 'Avg (ms)', align: 'right' },
						],
						rows: api_.endpoints || [],
						empty: 'No API traffic was recorded in this window.',
					})}
				</div>
			</section>

			<div class="ac-section">
				<h2 class="ac-section__title">Scheduled work</h2>
				<p class="ac-section__hint">${esc(scheduled.note || '')}</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Background tasks</h3>
						<p class="ac-panel__subtitle">Each task runs on a fixed interval inside the server process.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${renderTable({
						columns: [
							{ key: 'name', label: 'Task', render: (row) => `<span class="ac-table__primary">${esc(row.name)}</span>` },
							{ key: 'intervalMinutes', label: 'Interval', align: 'right', render: (row) => `${row.intervalMinutes} min` },
							{ key: 'description', label: 'Purpose' },
						],
						rows: scheduled.tasks || [],
						empty: 'No scheduled task is registered.',
					})}
				</div>
			</section>

			${
				(api_.repeatedLogs || []).length
					? `<div class="ac-section">
						<h2 class="ac-section__title">Repeated log entries</h2>
						<p class="ac-section__hint">The same message appearing again and again is usually the real defect.</p>
					</div>
					<section class="ac-panel">
						<div class="ac-panel__header">
							<div class="ac-panel__titles">
								<h3 class="ac-panel__title">Log clusters</h3>
								<p class="ac-panel__subtitle">Grouped by level, message and source. Process-local.</p>
							</div>
						</div>
						<div class="ac-panel__body ac-panel__body--flush">
							${renderTable({
								columns: [
									{
										key: 'level',
										label: 'Level',
										render: (row) =>
											`<span class="ac-badge ac-badge--${
												row.level === 'error' || row.level === 'fatal'
													? 'danger'
													: row.level === 'warn'
														? 'warning'
														: 'info'
											}">${esc(row.level)}</span>`,
									},
									{ key: 'message', label: 'Message' },
									{ key: 'source', label: 'Source', render: (row) => `<code>${esc(row.source)}</code>` },
									{ key: 'count', label: 'Count', align: 'right' },
									{ key: 'lastAt', label: 'Last seen', render: (row) => esc(formatDate(row.lastAt)) },
								],
								rows: api_.repeatedLogs,
								empty: 'No repeated log entries in this window.',
							})}
						</div>
					</section>`
					: ''
			}`;

		host.querySelectorAll('[data-ac-window]').forEach((button) => {
			button.addEventListener('click', () => {
				STATE.minutes = button.dataset.acWindow;
				ctx.rerender();
			});
		});
		host.querySelector('[data-ac-refresh]').addEventListener('click', () => ctx.rerender());
	},
};
