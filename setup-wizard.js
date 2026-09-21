/**
 * setup-wizard.js
 *
 * Classroom Setup Wizard — a guided multi-step modal that diagnoses the
 * LAN classroom deployment issues and walks the admin through fixing them.
 *
 * Opened from Settings → Setup (admin-only) or via window.openSetupWizard().
 * Fetches live server diagnostics, generates QR codes for student join URLs,
 * provides copy-to-clipboard commands for firewall rules, and offers a
 * backup shortcut for database safety.
 */
(function () {
	'use strict';

	var STEP_DEFS = [
		{ id: 'server', title: 'Server & Network', icon: '🖥️' },
		{ id: 'access', title: 'Student Access', icon: '📱' },
		{ id: 'firewall', title: 'Windows Firewall', icon: '🛡️' },
		{ id: 'database', title: 'Database Safety', icon: '💾' },
		{ id: 'offline', title: 'Offline & CDNs', icon: '🌐' },
		{ id: 'summary', title: 'Summary', icon: '✅' },
	];

	var state = {
		currentStep: 0,
		diagnostics: null,
		loading: false,
		error: null,
	};

	// ─── Helpers ────────────────────────────────────────────────────────────

	function esc(s) {
		return String(s == null ? '' : s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function toast(msg, type) {
		if (typeof showToast === 'function') showToast(msg, type);
		else if (window.showToast) window.showToast(msg, type);
	}

	function copyText(text) {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			return navigator.clipboard.writeText(text).then(function () {
				toast('Copied to clipboard', 'success');
			});
		}
		var ta = document.createElement('textarea');
		ta.value = text;
		ta.style.cssText = 'position:fixed;top:-9999px';
		document.body.appendChild(ta);
		ta.select();
		document.execCommand('copy');
		document.body.removeChild(ta);
		toast('Copied to clipboard', 'success');
		return Promise.resolve();
	}

	function badge(status, label) {
		var cls =
			status === 'ok'
				? 'sw-badge sw-badge-ok'
				: status === 'warn'
					? 'sw-badge sw-badge-warn'
					: status === 'fail'
						? 'sw-badge sw-badge-fail'
						: 'sw-badge sw-badge-info';
		return '<span class="' + cls + '">' + esc(label) + '</span>';
	}

	function firewallCommand(profile) {
		return (
			'New-NetFirewallRule `\\n' +
			'  -DisplayName "Quiz App TCP 3000" `\\n' +
			'  -Direction Inbound `\\n' +
			'  -Action Allow `\\n' +
			'  -Protocol TCP `\\n' +
			'  -LocalPort 3000 `\\n' +
			'  -Profile ' +
			profile
		);
	}

	// ─── Fetch diagnostics ──────────────────────────────────────────────────

	function fetchDiagnostics() {
		state.loading = true;
		state.error = null;
		renderWizard();
		if (!(window.API && window.API.raw)) {
			state.error = 'API unavailable';
			state.loading = false;
			renderWizard();
			return;
		}
		window.API.raw('GET', '/admin/setup/diagnostics')
			.then(function (resp) {
				state.diagnostics = (resp && resp.data) || resp;
				state.loading = false;
				renderWizard();
			})
			.catch(function (err) {
				state.error = (err && err.message) || 'Failed to load diagnostics';
				state.loading = false;
				renderWizard();
			});
	}

	// ─── Computed checks ────────────────────────────────────────────────────

	function getChecks() {
		var d = state.diagnostics;
		if (!d) return [];
		var checks = [];

		// Server binding
		checks.push({
			id: 'binding',
			label: 'Server listening on 0.0.0.0:' + (d.port || 3000),
			status: d.hostBinding === '0.0.0.0' ? 'ok' : 'warn',
			detail:
				d.hostBinding === '0.0.0.0'
					? 'All network interfaces — students can reach this server.'
					: 'Server is not bound to all interfaces.',
		});

		// NODE_ENV
		var envOk = d.nodeEnv !== 'production';
		checks.push({
			id: 'env',
			label: 'NODE_ENV = ' + (d.nodeEnv || 'development'),
			status: envOk ? 'ok' : 'warn',
			detail: envOk
				? 'HTTP works for login/refresh cookies.'
				: 'Production mode sets Secure cookies — HTTP login will fail. Use HTTPS or set NODE_ENV=development.',
		});

		// LAN addresses
		checks.push({
			id: 'lan',
			label: d.lan && d.lan.length ? d.lan.length + ' LAN address(es) found' : 'No LAN addresses found',
			status: d.lan && d.lan.length ? 'ok' : 'fail',
			detail: d.lan && d.lan.length
				? d.lan.map(function (a) { return a.address; }).join(', ')
				: 'No IPv4 LAN interface detected.',
		});

		// Database
		var dbOk = d.database && d.database.inferredInfo && d.database.inferredInfo.exists;
		checks.push({
			id: 'database',
			label: 'Database file exists',
			status: dbOk ? 'ok' : 'warn',
			detail: d.database && d.database.inferred
				? 'Prisma uses: ' + d.database.inferred
				: 'Could not resolve database path.',
		});

		// CDNs
		if (d.cdn && d.cdn.length) {
			var okCount = d.cdn.filter(function (c) { return c.ok; }).length;
			checks.push({
				id: 'cdn',
				label: 'CDN reachability: ' + okCount + '/' + d.cdn.length,
				status: okCount === d.cdn.length ? 'ok' : okCount > 0 ? 'warn' : 'fail',
				detail: okCount === d.cdn.length
					? 'All CDN resources reachable.'
					: 'Some CDN resources unreachable — offline or restricted network.',
			});
		}

		return checks;
	}

	function allOk() {
		var checks = getChecks();
		return checks.length > 0 && checks.every(function (c) { return c.status === 'ok'; });
	}

	// ─── Step renderers ─────────────────────────────────────────────────────

	function renderServerStep() {
		var d = state.diagnostics;
		if (!d) return '<p class="sw-loading">Loading diagnostics…</p>';

		var html = '<h3 class="sw-step-title">🖥️ Server &amp; Network</h3>';
		html += '<p class="sw-step-desc">This server must listen on all network interfaces so students can connect from their devices over Wi-Fi.</p>';

		html += '<div class="sw-info-grid">';
		html += '<div class="sw-info-item"><span class="sw-info-label">Bind Address</span><span class="sw-info-value">' + esc(d.hostBinding) + '</span>' + badge(d.hostBinding === '0.0.0.0' ? 'ok' : 'warn', d.hostBinding === '0.0.0.0' ? '✓ OK' : '⚠ Check') + '</div>';
		html += '<div class="sw-info-item"><span class="sw-info-label">Port</span><span class="sw-info-value">' + esc(d.port) + '</span>' + badge('ok', '✓ OK') + '</div>';
		html += '<div class="sw-info-item"><span class="sw-info-label">NODE_ENV</span><span class="sw-info-value">' + esc(d.nodeEnv) + '</span>' + badge(d.nodeEnv !== 'production' ? 'ok' : 'warn', d.nodeEnv !== 'production' ? '✓ HTTP OK' : '⚠ HTTPS needed') + '</div>';
		html += '<div class="sw-info-item"><span class="sw-info-label">Cookies</span><span class="sw-info-value">' + (d.cookieSecure ? 'Secure (HTTPS only)' : 'Not Secure (HTTP OK)') + '</span>' + badge(d.cookieSecure ? 'warn' : 'ok', d.cookieSecure ? '⚠ May break on HTTP' : '✓ Works on HTTP') + '</div>';
		html += '<div class="sw-info-item"><span class="sw-info-label">Platform</span><span class="sw-info-value">' + esc(d.process && d.process.platform) + '</span></div>';
		html += '<div class="sw-info-item"><span class="sw-info-label">Hostname</span><span class="sw-info-value">' + esc(d.process && d.process.hostname) + '</span></div>';
		html += '</div>';

		if (d.cookieSecure) {
			html += '<div class="sw-warning-box"><strong>⚠ Production mode detected.</strong> Refresh cookies are marked <code>Secure</code>, so browsers will not send them over plain HTTP. For a temporary classroom setup, use <code>NODE_ENV=development</code> in your <code>.env</code> file. For production, use HTTPS or a reverse proxy.</div>';
		}

		return html;
	}

	function renderAccessStep() {
		var d = state.diagnostics;
		if (!d) return '<p class="sw-loading">Loading diagnostics…</p>';

		var port = d.port || 3000;
		var html = '<h3 class="sw-step-title">📱 Student Access</h3>';
		html += '<p class="sw-step-desc">Students must use the server\'s LAN IP address — not <code>localhost</code>. Share these URLs or let them scan the QR code.</p>';

		if (!d.lan || !d.lan.length) {
			html += '<div class="sw-warning-box">⚠ No LAN addresses detected. Make sure the server is connected to Wi-Fi or Ethernet.</div>';
			return html;
		}

		// Find the recommended address (physical adapter on private network)
		var recommended = d.lan.find(function (a) { return a.recommended; });
		var primaryIp = recommended ? recommended.address : d.lan[0].address;
		var primaryUrl = 'http://' + primaryIp + ':' + port;

		html += '<div class="sw-primary-url">';
		html += '<div class="sw-primary-url-label">Students should open:</div>';
		html += '<div class="sw-primary-url-value">' + esc(primaryUrl) + '</div>';
		if (recommended) {
			html += '<div style="margin-bottom:0.5rem">' + badge('ok', '✓ Recommended') + ' <span style="font-size:0.82rem;color:#64748b">' + esc(recommended.interface) + ' (physical adapter)</span></div>';
		}
		html += '<button type="button" class="btn btn-secondary sw-copy-btn" onclick="window.setupWizardCopy(\'' + esc(primaryUrl) + '\')">📋 Copy URL</button>';
		html += '</div>';

		// QR code (uses recommended address)
		html += '<div class="sw-qr-section">';
		html += '<div class="sw-qr-label">QR Code — students can scan with their phone camera:</div>';
		html += '<div class="sw-qr-container" id="swQrContainer"></div>';
		html += '</div>';

		// All LAN IPs
		if (d.lan.length > 1) {
			html += '<div class="sw-secondary-urls">';
			html += '<div class="sw-secondary-label">All available addresses:</div>';
			html += '<ul class="sw-url-list">';
			d.lan.forEach(function (iface) {
				var url = 'http://' + iface.address + ':' + port;
				var tag = iface.recommended ? badge('ok', 'Recommended') : (iface.type === 'virtual' ? badge('warn', 'Virtual') : '');
				html += '<li><span class="sw-url-iface">' + esc(iface.interface) + '</span> ';
				html += '<span class="sw-url-addr">' + esc(url) + '</span> ';
				if (tag) html += ' ' + tag;
				html += ' <button type="button" class="btn btn-sm sw-copy-inline" onclick="window.setupWizardCopy(\'' + esc(url) + '\')">📋</button></li>';
			});
			html += '</ul>';
			html += '</div>';
		}

		html += '<div class="sw-info-box">💡 Students must <strong>not</strong> use <code>localhost</code> on their own devices. They must use the server\'s Wi-Fi IP shown above. Virtual adapters (Hyper-V, WSL, Docker) are not reachable from other devices.</div>';

		return html;
	}

	function renderFirewallStep() {
		var d = state.diagnostics;
		var html = '<h3 class="sw-step-title">🛡️ Windows Firewall &amp; Network Profile</h3>';
		html += '<p class="sw-step-desc">Two things must be configured for students to reach the server: the Windows network profile must be <strong>Private</strong>, and a firewall rule must allow inbound TCP on port 3000.</p>';

		// ── Network Profile section ──
		html += '<div class="sw-cmd-section">';
		html += '<div class="sw-cmd-label">Network Profile (Windows classification):</div>';

		var profiles = d && d.networkProfile;
		if (profiles && profiles.length) {
			html += '<table class="sw-cdn-table"><thead><tr><th>Interface</th><th>Profile</th><th>Action</th></tr></thead><tbody>';
			profiles.forEach(function (p) {
				var isPrivate = p.category === 'Private';
				var isDomain = p.category === 'DomainAuthenticated';
				var statusBadge = isPrivate ? badge('ok', '✓ Private') : (isDomain ? badge('info', 'Domain') : badge('warn', '⚠ Public'));
				var action = '';
				if (!isPrivate && !isDomain) {
					action = '<button type="button" class="btn btn-sm btn-primary sw-copy-inline" onclick="window.setupWizardSetProfile(\'' + esc(p.interface) + '\', \'Private\')" id="swProfileBtn_' + esc(p.interface) + '">Switch to Private</button>';
				}
				html += '<tr>';
				html += '<td class="sw-mono">' + esc(p.interface) + '</td>';
				html += '<td>' + statusBadge + '</td>';
				html += '<td>' + action + '</td>';
				html += '</tr>';
			});
			html += '</tbody></table>';
			html += '<div id="swProfileResult"></div>';
		} else {
			html += '<p class="text-muted">Could not detect network profiles (non-Windows or insufficient permissions).</p>';
			html += '<div class="sw-cmd-section">';
			html += '<div class="sw-cmd-label">Run this in PowerShell (as Admin) to check manually:</div>';
			html += '<pre class="sw-cmd-block">Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory</pre>';
			html += '<button type="button" class="btn btn-secondary sw-copy-btn" onclick="window.setupWizardCopy(\'Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory\')">📋 Copy</button>';
			html += '</div>';
		}
		html += '</div>';

		// ── Firewall rule section ──
		var cmdPrivate = firewallCommand('Private');
		var cmdAny = firewallCommand('Any');

		html += '<div class="sw-cmd-section">';
		html += '<div class="sw-cmd-label">Firewall rule — run in PowerShell <strong>as Administrator</strong>:</div>';
		html += '<pre class="sw-cmd-block" id="swCmdPrivate">' + esc(cmdPrivate) + '</pre>';
		html += '<button type="button" class="btn btn-secondary sw-copy-btn" onclick="window.setupWizardCopy(document.getElementById(\'swCmdPrivate\').textContent)">📋 Copy Command</button>';
		html += '</div>';

		html += '<div class="sw-cmd-section">';
		html += '<div class="sw-cmd-label">Alternative (all profiles — use if Private switch fails):</div>';
		html += '<pre class="sw-cmd-block" id="swCmdAny">' + esc(cmdAny) + '</pre>';
		html += '<button type="button" class="btn btn-secondary sw-copy-btn" onclick="window.setupWizardCopy(document.getElementById(\'swCmdAny\').textContent)">📋 Copy Command</button>';
		html += '</div>';

		html += '<div class="sw-info-box">💡 After creating the firewall rule and setting the profile to Private, test from a student device by opening one of the URLs from the previous step.</div>';

		html += '<div class="sw-checklist">';
		html += '<div class="sw-check-item"><input type="checkbox" id="swFwCheck1" onchange="window.setupWizardCheckUpdate()"> <label for="swFwCheck1">Firewall rule created (command run as Admin)</label></div>';
		html += '<div class="sw-check-item"><input type="checkbox" id="swFwCheck2" onchange="window.setupWizardCheckUpdate()"> <label for="swFwCheck2">Wi-Fi network is <strong>Private</strong> (not Public)</label></div>';
		html += '<div class="sw-check-item"><input type="checkbox" id="swFwCheck3" onchange="window.setupWizardCheckUpdate()"> <label for="swFwCheck3">Client / AP isolation is <strong>disabled</strong> on the router</label></div>';
		html += '<div class="sw-check-item"><input type="checkbox" id="swFwCheck4" onchange="window.setupWizardCheckUpdate()"> <label for="swFwCheck4">Server computer will not sleep during class</label></div>';
		html += '</div>';

		return html;
	}

	function renderDatabaseStep() {
		var d = state.diagnostics;
		if (!d) return '<p class="sw-loading">Loading diagnostics…</p>';

		var db = d.database || {};
		var html = '<h3 class="sw-step-title">💾 Database Safety</h3>';
		html += '<p class="sw-step-desc">Back up the database before making any changes. The database is a single SQLite file.</p>';

		html += '<div class="sw-info-grid">';
		html += '<div class="sw-info-item"><span class="sw-info-label">Configured URL</span><span class="sw-info-value sw-mono">' + esc(db.url) + '</span></div>';
		if (db.inferred) {
			html += '<div class="sw-info-item"><span class="sw-info-label">Prisma uses</span><span class="sw-info-value sw-mono">' + esc(db.inferred) + '</span>' + badge(db.inferredInfo && db.inferredInfo.exists ? 'ok' : 'fail', db.inferredInfo && db.inferredInfo.exists ? '✓ Exists' : '✗ Missing') + '</div>';
		}
		if (db.expected) {
			html += '<div class="sw-info-item"><span class="sw-info-label">prisma/dev.db</span><span class="sw-info-value">' + (db.expected.exists ? '✓ ' + (db.expected.size || 0) + ' bytes' : '✗ Not found') + '</span>' + badge(db.expected.exists ? 'ok' : 'info', db.expected.exists ? '✓ OK' : 'N/A') + '</div>';
		}
		if (db.rootDevDb && db.rootDevDb.exists) {
			html += '<div class="sw-info-item"><span class="sw-info-label">Root ./dev.db</span><span class="sw-info-value">⚠ Found — may indicate a URL mismatch</span>' + badge('warn', '⚠ Inconsistent') + '</div>';
		}
		html += '</div>';

		if (db.rootDevDb && db.rootDevDb.exists && (!db.inferred || db.inferredInfo && !db.inferredInfo.exists)) {
			html += '<div class="sw-warning-box"><strong>⚠ Database path inconsistency.</strong> The <code>.env</code> file uses a different path than expected. The actual data may be in <code>./dev.db</code> instead of <code>prisma/dev.db</code>. Back up both files before reinstalling.</div>';
		}

		html += '<div class="sw-actions">';
		html += '<button type="button" class="btn btn-primary" onclick="window.openExportPicker()">📦 Download Backup Now</button>';
		html += '</div>';

		return html;
	}

	function renderOfflineStep() {
		var d = state.diagnostics;
		if (!d) return '<p class="sw-loading">Loading diagnostics…</p>';

		var html = '<h3 class="sw-step-title">🌐 Offline &amp; CDN Dependencies</h3>';
		html += '<p class="sw-step-desc">Frontend libraries are served locally from the vendor/ directory. External CDNs are only needed for Google Fonts (optional cosmetic dependency).</p>';

		if (!d.cdn || !d.cdn.length) {
			html += '<p class="sw-step-desc">No CDN probe data available.</p>';
			return html;
		}

		var vendoredCount = d.cdn.filter(function (c) { return c.vendored; }).length;
		var remoteCount = d.cdn.length - vendoredCount;
		var remoteOkCount = d.cdn.filter(function (c) { return !c.vendored && c.ok; }).length;

		if (vendoredCount > 0) {
			html += '<div class="sw-info-box">✅ ' + vendoredCount + ' libraries vendored locally — no internet required for core features.</div>';
		}

		html += '<table class="sw-cdn-table"><thead><tr><th>Host</th><th>Status</th><th>Time</th></tr></thead><tbody>';
		d.cdn.forEach(function (c) {
			html += '<tr>';
			html += '<td class="sw-mono">' + esc(c.host) + '</td>';
			if (c.vendored) {
				html += '<td>' + badge('ok', '✓ Vendored locally') + '</td>';
				html += '<td>—</td>';
			} else {
				html += '<td>' + badge(c.ok ? 'ok' : 'fail', c.ok ? '✓ Reachable' : '✗ Unreachable') + '</td>';
				html += '<td>' + (c.ms != null ? c.ms + 'ms' : '—') + '</td>';
			}
			html += '</tr>';
		});
		html += '</tbody></table>';

		if (remoteCount > 0 && remoteOkCount < remoteCount) {
			html += '<div class="sw-warning-box"><strong>⚠ Some remote CDNs are unreachable.</strong> Only Google Fonts is affected — the app will work fine with system fonts.</div>';
		} else {
			html += '<div class="sw-info-box">💡 All core dependencies are vendored. The app works fully offline. Google Fonts is the only optional external dependency.</div>';
		}

		return html;
	}

	function renderSummaryStep() {
		var checks = getChecks();
		var d = state.diagnostics;
		var html = '<h3 class="sw-step-title">✅ Summary</h3>';
		html += '<p class="sw-step-desc">Here is the status of all classroom deployment checks:</p>';

		html += '<div class="sw-summary-grid">';
		checks.forEach(function (c) {
			html += '<div class="sw-summary-item">';
			html += badge(c.status, c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✗');
			html += '<div class="sw-summary-text"><strong>' + esc(c.label) + '</strong><div class="sw-summary-detail">' + esc(c.detail) + '</div></div>';
			html += '</div>';
		});
		html += '</div>';

		// Firewall manual checks
		var fwChecks = ['swFwCheck1', 'swFwCheck2', 'swFwCheck3', 'swFwCheck4'];
		var fwDone = fwChecks.every(function (id) {
			var el = document.getElementById(id);
			return el && el.checked;
		});
		html += '<div class="sw-summary-item">';
		html += badge(fwDone ? 'ok' : 'warn', fwDone ? '✓' : '⚠');
		html += '<div class="sw-summary-text"><strong>Firewall &amp; router configured</strong><div class="sw-summary-detail">' + (fwDone ? 'All manual checks completed.' : 'Complete the checklist on the Firewall step.') + '</div></div>';
		html += '</div>';

		// Capacity note
		if (d && d.capacity) {
			html += '<div class="sw-info-box">📊 Configured capacity: ' + (d.capacity.maxUsers || 100) + ' users, ' + (d.capacity.maxGamePlayers || 30) + ' players per game. Your 20-student classroom fits comfortably.</div>';
		}

		html += '<div class="sw-actions">';
		html += '<button type="button" class="btn btn-primary" onclick="window.closeSetupWizard()">Done</button>';
		html += '</div>';

		return html;
	}

	var STEP_RENDERERS = [
		renderServerStep,
		renderAccessStep,
		renderFirewallStep,
		renderDatabaseStep,
		renderOfflineStep,
		renderSummaryStep,
	];

	// ─── Navigation ─────────────────────────────────────────────────────────

	function goToStep(index) {
		if (index < 0 || index >= STEP_DEFS.length) return;
		state.currentStep = index;
		renderWizard();
		// Generate QR after rendering (needs DOM)
		if (index === 1) generateQr();
	}

	function nextStep() {
		if (state.currentStep < STEP_DEFS.length - 1) goToStep(state.currentStep + 1);
	}

	function prevStep() {
		if (state.currentStep > 0) goToStep(state.currentStep - 1);
	}

	// ─── QR generation ─────────────────────────────────────────────────────

	function generateQr() {
		var container = document.getElementById('swQrContainer');
		if (!container) return;
		container.innerHTML = '';
		if (!state.diagnostics || !state.diagnostics.lan || !state.diagnostics.lan.length) return;
		if (typeof qrcode !== 'function') {
			container.innerHTML = '<p class="text-muted">QR library not loaded.</p>';
			return;
		}
		try {
			var recommended = state.diagnostics.lan.find(function (a) { return a.recommended; });
			var ip = recommended ? recommended.address : state.diagnostics.lan[0].address;
			var url = 'http://' + ip + ':' + (state.diagnostics.port || 3000);
			var qr = qrcode(0, 'M');
			qr.addData(url);
			qr.make();
			container.innerHTML = qr.createSvgTag(4, 8);
		} catch (e) {
			container.innerHTML = '<p class="text-muted">Could not generate QR code.</p>';
		}
	}

	// ─── Render wizard ──────────────────────────────────────────────────────

	function renderWizard() {
		var body = document.getElementById('swStepContent');
		var stepsEl = document.getElementById('swSteps');
		var backBtn = document.getElementById('swBackBtn');
		var nextBtn = document.getElementById('swNextBtn');

		if (!body || !stepsEl) return;

		// Loading / error states
		if (state.loading) {
			body.innerHTML = '<div class="sw-loading"><div class="sw-spinner"></div><p>Loading server diagnostics…</p></div>';
			if (backBtn) backBtn.style.visibility = 'hidden';
			if (nextBtn) nextBtn.disabled = true;
			return;
		}
		if (state.error) {
			body.innerHTML = '<div class="sw-error-box">⚠ ' + esc(state.error) + '</div><div class="sw-actions"><button type="button" class="btn btn-primary" onclick="window.openSetupWizard()">Retry</button></div>';
			if (backBtn) backBtn.style.visibility = 'hidden';
			if (nextBtn) nextBtn.disabled = true;
			return;
		}

		// Steps rail
		var stepsHtml = '';
		STEP_DEFS.forEach(function (step, i) {
			var cls = i === state.currentStep ? 'sw-step active' : i < state.currentStep ? 'sw-step visited' : 'sw-step';
			stepsHtml += '<div class="' + cls + '" onclick="window.setupWizardGoTo(' + i + ')">';
			stepsHtml += '<span class="sw-step-num">' + (i + 1) + '</span>';
			stepsHtml += '<span class="sw-step-icon">' + step.icon + '</span>';
			stepsHtml += '<span class="sw-step-label">' + esc(step.title) + '</span>';
			stepsHtml += '</div>';
		});
		stepsEl.innerHTML = stepsHtml;

		// Current step content
		var renderer = STEP_RENDERERS[state.currentStep];
		if (renderer) body.innerHTML = renderer();

		// Navigation buttons
		if (backBtn) backBtn.style.visibility = state.currentStep === 0 ? 'hidden' : 'visible';
		if (nextBtn) {
			nextBtn.textContent = state.currentStep === STEP_DEFS.length - 1 ? 'Close' : 'Next';
			nextBtn.disabled = false;
		}
	}

	// ─── Open / Close ───────────────────────────────────────────────────────

	function openSetupWizard() {
		var modal = document.getElementById('setupWizardModal');
		if (!modal) return;
		state.currentStep = 0;
		if (modal.parentElement && modal.parentElement !== document.body) {
			document.body.appendChild(modal);
		}
		modal.style.display = 'flex';
		fetchDiagnostics();
	}

	function closeSetupWizard() {
		var modal = document.getElementById('setupWizardModal');
		if (modal) modal.style.display = 'none';
	}

	// ─── Settings tab integration ───────────────────────────────────────────

	function onSettingsTabClick(e) {
		var btn = e.target.closest && e.target.closest('.settings-tab-btn[data-settings-tab="setup"]');
		if (!btn) return;
		// Load a light summary into the setup pane
		loadSetupSummary();
	}

	function loadSetupSummary() {
		var el = document.getElementById('swSetupSummary');
		if (!el) return;
		if (!(window.API && window.API.raw)) {
			el.innerHTML = '<p class="text-muted">API unavailable.</p>';
			return;
		}
		el.innerHTML = '<p class="text-muted">Checking…</p>';
		window.API.raw('GET', '/admin/setup/diagnostics')
			.then(function (resp) {
				var d = (resp && resp.data) || resp;
				var lanCount = d.lan ? d.lan.length : 0;
				var cdnVendored = d.cdn ? d.cdn.filter(function (c) { return c.vendored; }).length : 0;
				var cdnRemote = d.cdn ? d.cdn.filter(function (c) { return !c.vendored; }).length : 0;
				var cdnRemoteOk = d.cdn ? d.cdn.filter(function (c) { return !c.vendored && c.ok; }).length : 0;
				var dbOk = d.database && d.database.inferredInfo && d.database.inferredInfo.exists;
				var html = '<div class="sw-quick-status">';
				html += '<div class="sw-quick-item">' + badge(d.hostBinding === '0.0.0.0' ? 'ok' : 'warn', 'Server') + ' 0.0.0.0:' + esc(d.port) + '</div>';
				html += '<div class="sw-quick-item">' + badge(lanCount > 0 ? 'ok' : 'fail', 'LAN') + ' ' + lanCount + ' address(es)</div>';
				html += '<div class="sw-quick-item">' + badge(dbOk ? 'ok' : 'warn', 'Database') + ' ' + (dbOk ? 'OK' : 'Check needed') + '</div>';
				html += '<div class="sw-quick-item">' + badge(cdnVendored > 0 ? 'ok' : 'info', 'Vendor') + ' ' + cdnVendored + ' local' + (cdnRemote > 0 ? ', ' + cdnRemoteOk + '/' + cdnRemote + ' remote' : '') + '</div>';
				html += '</div>';
				el.innerHTML = html;
			})
			.catch(function () {
				el.innerHTML = '<p class="text-muted">Could not check status.</p>';
			});
	}

	// ─── Init ───────────────────────────────────────────────────────────────

	function init() {
		// Listen for Settings tab clicks to populate the Setup summary
		document.addEventListener('click', onSettingsTabClick);
	}

	// ─── Network profile change ──────────────────────────────────────────

	function setProfile(interfaceAlias, category) {
		if (!(window.API && window.API.raw)) return;
		var btn = document.getElementById('swProfileBtn_' + interfaceAlias);
		if (btn) { btn.disabled = true; btn.textContent = 'Changing…'; }
		var resultEl = document.getElementById('swProfileResult');
		window.API.raw('POST', '/admin/setup/network-profile', { interfaceAlias: interfaceAlias, category: category })
			.then(function (resp) {
				var msg = (resp && resp.data && resp.data.message) || 'Done';
				if (resultEl) resultEl.innerHTML = '<div class="sw-info-box" style="margin-top:0.75rem">✅ ' + esc(msg) + '</div>';
				// Refresh diagnostics to reflect the change
				return fetchDiagnostics();
			})
			.catch(function (err) {
				var msg = (err && err.message) || 'Failed';
				if (resultEl) resultEl.innerHTML = '<div class="sw-warning-box" style="margin-top:0.75rem">⚠ ' + esc(msg) + '<br><br><strong>Manual steps:</strong><br>1. Open PowerShell as Administrator<br>2. Run: <code>Set-NetConnectionProfile -InterfaceAlias \'' + esc(interfaceAlias) + '\' -NetworkCategory Private</code></div>';
				if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
			});
	}

	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		init();
	} else {
		document.addEventListener('DOMContentLoaded', init);
	}

	// ─── Exports ────────────────────────────────────────────────────────────

	window.openSetupWizard = openSetupWizard;
	window.closeSetupWizard = closeSetupWizard;
	window.setupWizardGoTo = goToStep;
	window.setupWizardNext = nextStep;
	window.setupWizardBack = prevStep;
	window.setupWizardCopy = copyText;
	window.setupWizardSetProfile = setProfile;
	window.setupWizardCheckUpdate = function () {
		// Re-render summary if on that step
		if (state.currentStep === STEP_DEFS.length - 1) renderWizard();
	};
})();
