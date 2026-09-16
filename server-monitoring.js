(function () {
	'use strict';

	let refreshTimer = null;

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function formatTime(value) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString();
	}

	function formatNumber(value) {
		return Number(value || 0).toLocaleString();
	}

	function setText(id, value) {
		const element = document.getElementById(id);
		if (element) element.textContent = value;
	}

	function renderApiCalls(items) {
		const body = document.getElementById('monitoringApiBody');
		if (!body) return;
		body.innerHTML = items.length
			? items
					.map(
						(item) =>
							`<tr><td><code>${escapeHtml(item.method)}</code></td><td>${escapeHtml(item.path)}</td><td>${formatNumber(item.calls)}</td><td>${formatNumber(item.errors)}</td><td>${escapeHtml(item.averageMs)} ms</td></tr>`,
					)
					.join('')
			: '<tr><td colspan="5" class="empty-state-small">No API calls in this window</td></tr>';
	}

	function renderRepeatedLogs(items) {
		const body = document.getElementById('monitoringLogBody');
		if (!body) return;
		body.innerHTML = items.length
			? items
					.map(
						(item) =>
							`<tr><td><span class="monitoring-level monitoring-level-${escapeHtml(item.level)}">${escapeHtml(item.level)}</span></td><td>${escapeHtml(item.message)}</td><td>${formatNumber(item.count)}</td><td>${escapeHtml(formatTime(item.lastAt))}</td></tr>`,
					)
					.join('')
			: '<tr><td colspan="4" class="empty-state-small">No server logs in this window</td></tr>';
	}

	function renderRecentLogs(items) {
		const body = document.getElementById('monitoringRecentBody');
		if (!body) return;
		body.innerHTML = items.length
			? items
					.map(
						(item) =>
							`<tr><td>${escapeHtml(formatTime(item.at))}</td><td><span class="monitoring-level monitoring-level-${escapeHtml(item.level)}">${escapeHtml(item.level)}</span></td><td>${escapeHtml(item.message)}</td></tr>`,
					)
					.join('')
			: '<tr><td colspan="3" class="empty-state-small">No recent server logs</td></tr>';
	}

	async function loadMonitoring() {
		const select = document.getElementById('monitoringWindow');
		if (!select || !window.API?.raw) return;
		const refreshButton = document.getElementById('monitoringRefresh');
		if (refreshButton) refreshButton.disabled = true;
		try {
			const response = await window.API.raw(
				'GET',
				`/admin/metrics?minutes=${encodeURIComponent(select.value)}`,
			);
			const metrics = response?.data || {};
			const summary = metrics.summary || {};
			setText('monitoringApiCalls', formatNumber(summary.apiCalls));
			setText('monitoringApiErrors', formatNumber(summary.apiErrors));
			setText('monitoringWarnings', formatNumber(summary.warnings));
			setText('monitoringErrors', formatNumber(summary.errors));
			setText(
				'monitoringLatency',
				`${formatNumber(summary.averageResponseMs)} ms`,
			);
			setText(
				'monitoringUpdated',
				metrics.generatedAt ? `Updated ${formatTime(metrics.generatedAt)}` : '',
			);
			renderApiCalls(metrics.apiCalls || []);
			renderRepeatedLogs(metrics.repeatedLogs || []);
			renderRecentLogs(metrics.recentLogs || []);
		} catch (error) {
			if (typeof showToast === 'function')
				showToast(
					error.message || 'Unable to load server monitoring data',
					'error',
				);
		} finally {
			if (refreshButton) refreshButton.disabled = false;
		}
	}

	function configureAutoRefresh() {
		const checkbox = document.getElementById('monitoringAutoRefresh');
		if (!checkbox || checkbox.dataset.bound) return;
		checkbox.dataset.bound = 'true';
		checkbox.addEventListener('change', () => {
			clearInterval(refreshTimer);
			refreshTimer = checkbox.checked
				? setInterval(loadMonitoring, 15000)
				: null;
		});
	}

	window.loadServerMonitoring = function () {
		configureAutoRefresh();
		loadMonitoring();
	};

	document.addEventListener('DOMContentLoaded', () => {
		const refreshButton = document.getElementById('monitoringRefresh');
		const select = document.getElementById('monitoringWindow');
		if (refreshButton) refreshButton.addEventListener('click', loadMonitoring);
		if (select) select.addEventListener('change', loadMonitoring);
	});
})();
