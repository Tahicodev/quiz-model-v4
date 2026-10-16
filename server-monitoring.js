(function () {
	'use strict';

	let refreshTimer = null;
	let latestMetrics = null;

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

	function formatUsers(users, userCount) {
		const list = Array.isArray(users) ? users : [];
		if (!list.length) return '-';
		const shown = list
			.slice(0, 3)
			.map((u) =>
				u && u.count > 1
					? `${u.user} (×${u.count})`
					: `${u?.user ?? ''}`,
			)
			.join(', ');
		const extra =
			typeof userCount === 'number' && userCount > list.length
				? ` +${userCount - list.length} more`
				: '';
		return `${shown}${extra}`;
	}

	function formatCaller(item) {
		const user = item.lastUser || item.user || '-';
		const bits = [user];
		if (item.lastRole || item.role) bits.push(`(${(item.lastRole || item.role)})`);
		if (item.lastIp || item.ip) bits.push(`· ${(item.lastIp || item.ip)}`);
		return bits.join(' ');
	}

	function formatDetails(details) {
		if (!details || typeof details !== 'object') return '';
		try {
			const entries = Object.entries(details)
				.filter(([, v]) => v !== undefined && v !== '')
				.slice(0, 6)
				.map(([k, v]) => `${k}=${v}`);
			return entries.join(' ');
		} catch (_) {
			return '';
		}
	}

	function renderApiCalls(items) {
		const body = document.getElementById('monitoringApiBody');
		if (!body) return;
		body.innerHTML = items.length
			? items
					.map(
						(item) =>
							`<tr><td><code>${escapeHtml(item.method)}</code></td><td>${escapeHtml(item.path)}</td><td>${formatNumber(item.calls)}</td><td>${formatNumber(item.errors)}</td><td>${escapeHtml(item.averageMs)} ms</td><td title="${escapeHtml(formatUsers(item.users, item.userCount))}">${escapeHtml(formatUsers(item.users, item.userCount))}</td><td title="${escapeHtml(item.lastIp || '')}">${escapeHtml(formatCaller(item))}</td></tr>`,
					)
					.join('')
			: '<tr><td colspan="7" class="empty-state-small">No API calls in this window</td></tr>';
	}

	function renderRepeatedLogs(items) {
		const body = document.getElementById('monitoringLogBody');
		if (!body) return;
		body.innerHTML = items.length
			? items
					.map(
						(item) =>
							`<tr><td><span class="monitoring-level monitoring-level-${escapeHtml(item.level)}">${escapeHtml(item.level)}</span></td><td>${escapeHtml(item.message)}</td><td><code>${escapeHtml(item.source || '-')}</code></td><td title="${escapeHtml(formatUsers(item.users, item.userCount))}">${escapeHtml(item.lastUser || formatUsers(item.users, item.userCount))}</td><td>${formatNumber(item.count)}</td><td>${escapeHtml(formatTime(item.lastAt))}</td></tr>`,
					)
					.join('')
			: '<tr><td colspan="6" class="empty-state-small">No server logs in this window</td></tr>';
	}

	function renderRecentLogs(items) {
		const body = document.getElementById('monitoringRecentBody');
		if (!body) return;
		body.innerHTML = items.length
			? items
					.map((item) => {
						const details = formatDetails(item.details);
						const tip = details ? ` • ${details}` : '';
						return `<tr title="${escapeHtml((item.source || '') + (item.user ? ` • ${item.user}` : '') + tip)}"><td>${escapeHtml(formatTime(item.at))}</td><td><span class="monitoring-level monitoring-level-${escapeHtml(item.level)}">${escapeHtml(item.level)}</span></td><td>${escapeHtml(item.message)}${details ? `<div class="text-muted small">${escapeHtml(details)}</div>` : ''}</td><td><code>${escapeHtml(item.source || '-')}</code></td><td>${escapeHtml(formatCaller(item))}</td></tr>`;
					})
					.join('')
			: '<tr><td colspan="5" class="empty-state-small">No recent server logs</td></tr>';
	}

	function csvCell(value) {
		return `"${String(value ?? '').replace(/"/g, '""')}"`;
	}

	function exportMonitoringCsv() {
		if (!latestMetrics) {
			if (typeof showToast === 'function')
				showToast('Refresh monitoring data before exporting', 'error');
			return;
		}

		const rows = [
			[
				'Section',
				'Method',
				'Path',
				'Calls',
				'Errors',
				'Average response',
				'Level',
				'Message',
				'Count',
				'Last seen',
				'Time',
				'Source',
				'User',
				'Role',
				'IP',
				'Users',
			],
		];
		(latestMetrics.apiCalls || []).forEach((item) => {
			rows.push([
				'API endpoints',
				item.method,
				item.path,
				item.calls,
				item.errors,
				`${item.averageMs} ms`,
				'',
				'',
				'',
				'',
				'',
				'',
				item.lastUser || '',
				item.lastRole || '',
				item.lastIp || '',
				formatUsers(item.users, item.userCount),
			]);
		});
		(latestMetrics.repeatedLogs || []).forEach((item) => {
			rows.push([
				'Repeated logs',
				'',
				'',
				'',
				'',
				'',
				item.level,
				item.message,
				item.count,
				formatTime(item.lastAt),
				'',
				item.source || '',
				item.lastUser || '',
				'',
				'',
				formatUsers(item.users, item.userCount),
			]);
		});
		(latestMetrics.recentLogs || []).forEach((item) => {
			rows.push([
				'Recent logs',
				'',
				'',
				'',
				'',
				'',
				item.level,
				item.message,
				'',
				'',
				formatTime(item.at),
				item.source || '',
				item.user || '',
				item.role || '',
				item.ip || '',
				formatDetails(item.details),
			]);
		});

		const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
		const url = URL.createObjectURL(
			new Blob([csv], { type: 'text/csv;charset=utf-8' }),
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = `server-monitoring-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	function getUserFilter() {
		const input = document.getElementById('monitoringUser');
		return (input?.value || '').trim();
	}

	function collectFallbackUsers(metrics) {
		const counts = new Map();
		const add = (name) => {
			const key = String(name || '').trim();
			if (!key) return;
			counts.set(key, (counts.get(key) || 0) + 1);
		};
		(metrics.apiCalls || []).forEach((item) =>
			(item.users || []).forEach((u) => add(u?.user)),
		);
		(metrics.repeatedLogs || []).forEach((item) =>
			(item.users || []).forEach((u) => add(u?.user)),
		);
		(metrics.recentLogs || []).forEach((item) => add(item.user));
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 100)
			.map(([user, count]) => ({ user, count }));
	}

	function populateUserList(metrics) {
		const select = document.getElementById('monitoringUser');
		if (!select) return;
		// Union server-provided users with anything visible in the tables, so
		// the dropdown is never emptier than the data on screen (e.g. when
		// the running server predates the `users` field).
		const merged = new Map();
		(metrics.users || []).forEach((u) => {
			const key = String(u?.user || '').trim();
			if (key) merged.set(key, (merged.get(key) || 0) + (Number(u.count) || 1));
		});
		collectFallbackUsers(metrics).forEach((u) => {
			if (!merged.has(u.user)) merged.set(u.user, u.count);
		});
		const users = [...merged.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([user, count]) => ({ user, count }));
		// Keep the active filter even if it is absent from this window's list
		// (e.g. typed/IP filter echoed back by the server).
		const active = (metrics.filter?.user || getUserFilter()).trim();
		if (active && !merged.has(active)) users.unshift({ user: active, count: 0 });
		select.innerHTML =
			'<option value="">All users</option>' +
			users
				.map(
					(u) =>
						`<option value="${escapeHtml(u.user)}"${u.user === active ? ' selected' : ''}>${escapeHtml(u.count > 0 ? `${u.user} (×${u.count})` : u.user)}</option>`,
				)
				.join('');
		select.value = active || '';
	}

	async function loadMonitoring() {
		const select = document.getElementById('monitoringWindow');
		if (!select || !window.API?.raw) return;
		const refreshButton = document.getElementById('monitoringRefresh');
		if (refreshButton) refreshButton.disabled = true;
		try {
			const user = getUserFilter();
			let url = `/admin/metrics?minutes=${encodeURIComponent(select.value)}`;
			if (user) url += `&user=${encodeURIComponent(user)}`;
			const response = await window.API.raw('GET', url);
			const metrics = response?.data || {};
			latestMetrics = metrics;
			const summary = metrics.summary || {};
			setText('monitoringApiCalls', formatNumber(summary.apiCalls));
			setText('monitoringApiErrors', formatNumber(summary.apiErrors));
			setText('monitoringWarnings', formatNumber(summary.warnings));
			setText('monitoringErrors', formatNumber(summary.errors));
			setText(
				'monitoringLatency',
				`${formatNumber(summary.averageResponseMs)} ms`,
			);
			const activeFilter = metrics.filter?.user || user;
			setText(
				'monitoringUpdated',
				`${metrics.generatedAt ? `Updated ${formatTime(metrics.generatedAt)}` : ''}${activeFilter ? ` • Filtered by user: ${activeFilter}` : ''}`,
			);
			populateUserList(metrics);
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

	let userDebounce = null;

	function configureUserFilter() {
		const input = document.getElementById('monitoringUser');
		if (!input || input.dataset.bound) return;
		input.dataset.bound = 'true';
		if (input.tagName === 'SELECT') {
			input.addEventListener('change', loadMonitoring);
		} else {
			input.addEventListener('input', () => {
				clearTimeout(userDebounce);
				userDebounce = setTimeout(loadMonitoring, 400);
			});
			input.addEventListener('change', loadMonitoring);
		}
		const clearButton = document.getElementById('monitoringClearUser');
		if (clearButton && !clearButton.dataset.bound) {
			clearButton.dataset.bound = 'true';
			clearButton.addEventListener('click', () => {
				input.value = '';
				loadMonitoring();
			});
		}
	}

	window.loadServerMonitoring = function () {
		configureAutoRefresh();
		configureUserFilter();
		loadMonitoring();
	};

	document.addEventListener('DOMContentLoaded', () => {
		const refreshButton = document.getElementById('monitoringRefresh');
		const select = document.getElementById('monitoringWindow');
		const exportButton = document.getElementById('monitoringExport');
		if (refreshButton) refreshButton.addEventListener('click', loadMonitoring);
		if (select) select.addEventListener('change', loadMonitoring);
		if (exportButton)
			exportButton.addEventListener('click', exportMonitoringCsv);
		configureUserFilter();
	});
})();
