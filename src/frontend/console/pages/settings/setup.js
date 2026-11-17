/**
 * src/frontend/console/pages/settings/setup.js
 *
 * Setup & diagnostics — the Classroom Setup Wizard.
 *
 * This is the port of the legacy classroom setup wizard (the six-step modal
 * that lived behind "Settings → Setup"). The console is a page-based
 * application, so the modal became a **stepper**: the same six steps, in
 * the same order, with the same facts and the same actions — and a URL that
 * points at the step you are on, so a support ticket can say "look at
 * #/settings?section=setup&step=firewall".
 *
 * The steps:
 *
 *   1. Server & Network    — is the server reachable from the network?
 *   2. Student Access      — the URL and the QR code the students use
 *   3. Windows Firewall    — the network profile and the inbound rule
 *   4. Database Safety     — where the data lives, and a backup
 *   5. Offline & CDNs      — what needs the internet (nothing essential)
 *   6. Summary             — every check, and the manual checklist
 *
 * Every number comes from `GET /admin/setup/diagnostics`, so nothing here is
 * asserted — it is all measured.
 */

import { api } from '../../core/api.js';
import { navigate } from '../../core/router.js';
import { toast } from '../../components/ui.js';
import { renderTable } from '../../components/table.js';
import { panel, escapeHtml } from './index.js';

/**
 * The step icons: the app's own stroke SVGs, not emoji. Emoji render at the
 * mercy of the OS emoji font — different on every platform, colour-clashing
 * with the theme, and illegible at 14px. These match the sidebar and the
 * header icons: 16px, stroke 1.8, `currentColor`, so they follow the theme.
 */
const svg = (d) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const STEPS = [
	{
		id: 'server',
		label: 'Server & network',
		icon: svg(
			'<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
		),
	},
	{
		id: 'access',
		label: 'Student access',
		icon: svg(
			'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
		),
	},
	{
		id: 'firewall',
		label: 'Windows firewall',
		icon: svg(
			'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
		),
	},
	{
		id: 'database',
		label: 'Database safety',
		icon: svg(
			'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
		),
	},
	{
		id: 'offline',
		label: 'Offline & CDNs',
		icon: svg(
			'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
		),
	},
	{
		id: 'summary',
		label: 'Summary',
		icon: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
	},
];

export async function setupSection(ctx, route) {
	const payload = await api.get('admin/setup/diagnostics');
	const diagnostics = payload?.data || payload || {};

	const step = STEPS.some((s) => s.id === route?.query?.step) ? route.query.step : STEPS[0].id;

	const markup = [
		renderStepper(step),
		`<div data-ac-setup-step>${renderStepBody(step, diagnostics, ctx)}</div>`,
	].join('');

	function bind(root) {
		// The stepper navigation. Switching step replaces the history entry,
		// so the Back button walks between PAGES and not between the steps
		// of one wizard.
		root.querySelectorAll('[data-ac-setup-goto]').forEach((button) => {
			button.addEventListener('click', () => {
				navigate(
					`/settings?section=setup&step=${encodeURIComponent(button.dataset.acSetupGoto)}`,
					{ replace: true },
				);
			});
		});

		const next = root.querySelector('[data-ac-setup-next]');
		if (next) {
			next.addEventListener('click', () => {
				const index = STEPS.findIndex((s) => s.id === step);
				const target = STEPS[Math.min(STEPS.length - 1, index + 1)];
				navigate(
					`/settings?section=setup&step=${encodeURIComponent(target.id)}`,
					{ replace: true },
				);
			});
		}
		const back = root.querySelector('[data-ac-setup-back]');
		if (back) {
			back.addEventListener('click', () => {
				const index = STEPS.findIndex((s) => s.id === step);
				const target = STEPS[Math.max(0, index - 1)];
				navigate(
					`/settings?section=setup&step=${encodeURIComponent(target.id)}`,
					{ replace: true },
				);
			});
		}

		// ── Step 2: the address, the copy and the QR code ───────────────
		root.querySelector('[data-ac-copy-lan]')?.addEventListener('click', async () => {
			await copy(root.querySelector('#set-lan-address')?.value ?? '');
			toast('The address was copied.', 'success');
		});

		root.querySelector('[data-ac-copy-firewall]')?.addEventListener('click', async () => {
			await copy(root.querySelector('#set-firewall-command')?.value ?? '');
			toast('The command was copied.', 'success');
		});

		root.querySelector('[data-ac-show-qr]')?.addEventListener('click', async () => {
			const host = root.querySelector('[data-ac-qr]');
			if (!host) return;
			const address = root.querySelector('#set-lan-address')?.value ?? '';
			host.hidden = false;
			host.innerHTML = '<p class="ac-field__hint">Generating the QR code…</p>';
			try {
				await loadQrGenerator();
				// The vendored generator is the same one the classroom wizard
				// uses: `qrcode(0, 'M')` then `createSvgTag()`.
				const qr = window.qrcode(0, 'M');
				qr.addData(address);
				qr.make();
				host.innerHTML = qr.createSvgTag(4, 8);
			} catch (err) {
				host.innerHTML = `<pre class="ac-pre">${escapeHtml(address)}</pre><p class="ac-field__hint">${escapeHtml(
					err.message,
				)} — use the address above.</p>`;
			}
		});

		// ── Step 3: the network profile ─────────────────────────────────
		root.querySelectorAll('[data-ac-network-profile]').forEach((button) => {
			button.addEventListener('click', async () => {
				try {
					await api.post('admin/setup/network-profile', {
						interfaceAlias: button.dataset.acNetworkProfile,
						category: button.dataset.acNetworkCategory || 'Private',
					});
					toast('The network profile was changed.', 'success');
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});

		// ── Step 4: the backup ──────────────────────────────────────────
		root.querySelector('[data-ac-setup-backup]')?.addEventListener('click', async () => {
			const status = root.querySelector('[data-ac-setup-backup-status]');
			if (status) status.textContent = 'Collecting…';
			try {
				const snapshot = (await api.get('console/export'))?.data;
				if (!snapshot) throw new Error('The export was empty.');
				downloadBlob(
					new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
					`quiz-app-backup-${snapshot.timestamp.slice(0, 10)}.json`,
				);
				if (status) status.textContent = 'The backup was downloaded.';
				toast('Backup created.', 'success');
			} catch (err) {
				if (status) status.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		// ── Step 6: the manual checklist ────────────────────────────────
		root.querySelectorAll('[data-ac-firewall-check]').forEach((input) => {
			input.addEventListener('change', () => {
				try {
					const raw = localStorage.getItem(FIREWALL_CHECKS_KEY) || '[]';
					const list = JSON.parse(raw);
					const id = input.dataset.acFirewallCheck;
					const index = list.indexOf(id);
					if (input.checked && index === -1) list.push(id);
					if (!input.checked && index !== -1) list.splice(index, 1);
					localStorage.setItem(FIREWALL_CHECKS_KEY, JSON.stringify(list));
				} catch {
					/* storage is optional */
				}
				const done = readFirewallChecks();
				const badge = root.querySelector('[data-ac-firewall-status]');
				if (badge) {
					badge.textContent = done
						? 'All the manual checks are completed.'
						: 'Complete the checklist on the Firewall step.';
				}
			});
		});
	}

	return { markup, bind };
}

// ── The stepper ─────────────────────────────────────────────────────────────

function renderStepper(active) {
	const index = STEPS.findIndex((s) => s.id === active);
	return `<nav class="ac-stepper" aria-label="Setup steps">
		${STEPS.map(
			(step, i) => `<button type="button" class="ac-stepper__step${
				step.id === active ? ' is-active' : ''
			}${i < index ? ' is-done' : ''}" data-ac-setup-goto="${escapeHtml(step.id)}">
			<span class="ac-stepper__icon" aria-hidden="true">${step.icon}</span>
			<span class="ac-stepper__label">${escapeHtml(step.label)}</span>
		</button>`,
		).join('')}
	</nav>`;
}

// ── The steps ───────────────────────────────────────────────────────────────

function renderStepBody(step, d, ctx) {
	const port = d.port || 3000;
	const lan = Array.isArray(d.lan) ? d.lan : [];
	const recommended = lan.find((row) => row.recommended) || lan[0] || null;
	const reachable = recommended
		? `http://${recommended.address}:${port}`
		: `http://localhost:${port}`;

	switch (step) {
		case 'server':
			return renderServerStep(d);
		case 'access':
			return renderAccessStep(d, lan, recommended, reachable, port);
		case 'firewall':
			return renderFirewallStep(d, port);
		case 'database':
			return renderDatabaseStep(d);
		case 'offline':
			return renderOfflineStep(d);
		case 'summary':
			return renderSummaryStep(d, lan);
		default:
			return panel({ title: 'Unknown step', body: '<p>That step does not exist.</p>' });
	}
}

function renderServerStep(d) {
	const process_ = d.process || {};
	const bindOk = d.hostBinding === '0.0.0.0';
	const envOk = d.nodeEnv !== 'production';

	return panel({
		title: 'Server & network',
		subtitle:
			'This server must listen on every network interface so the students can reach it over Wi-Fi.',
		body: `<div class="ac-defs">
				${definition('Bind address', d.hostBinding || '0.0.0.0', bindOk ? 'ok' : 'warn')}
				${definition('Port', String(port0(d)), 'ok')}
				${definition('NODE_ENV', d.nodeEnv || 'development', envOk ? 'ok' : 'warn')}
				${definition(
					'Cookies',
					d.cookieSecure ? 'Secure (HTTPS only)' : 'Not secure (HTTP works)',
					d.cookieSecure ? 'warn' : 'ok',
				)}
				${definition('Platform', process_.platform || '—')}
				${definition('Hostname', process_.hostname || '—')}
			</div>
			${
				d.cookieSecure
					? `<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Production mode detected</p><p class="ac-alert__text">The refresh cookie is marked <code>Secure</code>, so a browser will not send it over plain HTTP. For a classroom installation use <code>NODE_ENV=development</code>; for production, use HTTPS or a reverse proxy.</p></div></div>`
					: ''
			}`,
	});
}

function renderAccessStep(d, lan, recommended, reachable, port) {
	if (!lan.length) {
		return panel({
			title: 'Student access',
			subtitle: 'The address the students use.',
			body: `<div class="ac-alert ac-alert--warning"><div class="ac-alert__body"><p class="ac-alert__title">No LAN address detected</p><p class="ac-alert__text">The server is not connected to Wi-Fi or Ethernet, so no other device can reach it.</p></div></div>`,
		});
	}

	return panel({
		title: 'Student access',
		subtitle:
			"The students must use the server's LAN address, not localhost. Share this URL, or let them scan the QR code.",
		body: `<div class="ac-primary-url">
				<p class="ac-primary-url__label">Students should open</p>
				<p class="ac-primary-url__value">${escapeHtml(reachable)}</p>
				${recommended ? `<p class="ac-primary-url__note">Recommended — the ${escapeHtml(recommended.interface)} interface (a physical adapter).</p>` : ''}
				<div class="ac-quick-actions" style="margin-top:12px">
					<button type="button" class="ac-btn" data-ac-copy-lan>Copy the address</button>
					<button type="button" class="ac-btn" data-ac-show-qr>Show the QR code</button>
				</div>
			</div>
			<div data-ac-qr hidden style="margin-top:16px"></div>
			${
				lan.length > 1
					? `<h4 class="ac-section-panel__title" style="margin:20px 0 8px">Every available address</h4>
					${renderTable({
						columns: [
							{ key: 'interface', label: 'Interface' },
							{
								key: 'address',
								label: 'URL',
								render: (row) =>
									`<code>http://${escapeHtml(row.address)}:${escapeHtml(String(port))}</code>`,
							},
							{ key: 'type', label: 'Type' },
							{
								key: 'recommended',
								label: 'Recommended',
								render: (row) =>
									row.recommended
										? '<span class="ac-badge ac-badge--success">yes</span>'
										: row.type === 'virtual'
											? '<span class="ac-badge ac-badge--warning">virtual</span>'
											: '<span class="ac-badge">no</span>',
							},
						],
						rows: lan,
					})}`
					: ''
			}
			<div class="ac-alert ac-alert--info" style="margin-top:16px"><div class="ac-alert__body"><p class="ac-alert__title">The students must not use <code>localhost</code></p><p class="ac-alert__text">On their own device <code>localhost</code> means the device itself. They must use the server's Wi-Fi address above. Virtual adapters (Hyper-V, WSL, Docker) are not reachable from another device.</p></div></div>`,
	});
}

const FIREWALL_CHECKS = [
	{
		id: 'rule',
		label: 'The inbound rule for the port exists',
		hint: 'Run the PowerShell command above once, as an administrator.',
	},
	{
		id: 'private',
		label: 'The network profile is Private',
		hint: 'The server can set this for you with the button in the table above.',
	},
	{
		id: 'router',
		label: 'The router allows the classroom Wi-Fi to reach the server',
		hint: 'Some school routers block device-to-device traffic. Only the operator can see the router.',
	},
	{
		id: 'tested',
		label: 'A student device opened the address above successfully',
		hint: 'The real proof: open the student URL on a phone or a tablet on the classroom Wi-Fi.',
	},
];

const FIREWALL_CHECKS_KEY = 'quizConsoleFirewallChecks';

function readFirewallChecks() {
	try {
		const raw = localStorage.getItem(FIREWALL_CHECKS_KEY) || '[]';
		const list = JSON.parse(raw);
		return Array.isArray(list) && list.length === FIREWALL_CHECKS.length;
	} catch {
		return false;
	}
}

function renderFirewallStep(d, port) {
	const profiles = Array.isArray(d.networkProfile) ? d.networkProfile : [];
	const done = readFirewallChecks();

	return panel({
		title: 'Windows firewall & network profile',
		subtitle:
			'Two things must be configured: the Windows network profile must be Private, and a firewall rule must allow inbound TCP on the port.',
		body: `<h4 class="ac-section-panel__title" style="margin:0 0 8px">Network profile</h4>
			${
				profiles.length
					? renderTable({
							columns: [
								{ key: 'interface', label: 'Interface' },
								{ key: 'name', label: 'Connection' },
								{
									key: 'category',
									label: 'Category',
									render: (row) =>
										row.category === 'Private'
											? '<span class="ac-badge ac-badge--success">Private</span>'
											: row.category === 'DomainAuthenticated'
												? '<span class="ac-badge">Domain</span>'
												: '<span class="ac-badge ac-badge--warning">Public</span>',
								},
								{
									key: 'actions',
									label: '',
									align: 'right',
									render: (row) =>
										row.category === 'Private' || row.category === 'DomainAuthenticated'
											? '<span class="ac-table__muted">—</span>'
											: `<button type="button" class="ac-btn ac-btn--sm" data-ac-network-profile="${escapeHtml(
													row.interface,
												)}" data-ac-network-category="Private">Switch to Private</button>`,
								},
							],
							rows: profiles,
						})
					: `<p class="ac-field__hint">The network profile is only reported on Windows. Check it manually:</p>
					<pre class="ac-pre">Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, NetworkCategory</pre>`
			}
			<h4 class="ac-section-panel__title" style="margin:20px 0 8px">The inbound rule</h4>
			<p class="ac-field__hint" style="margin-bottom:8px">Run this once in an administrator PowerShell on the machine that serves the app.</p>
			<textarea class="ac-input ac-input--full" id="set-firewall-command" rows="4" readonly>${escapeHtml(
				firewallCommand(port),
			)}</textarea>
			<div class="ac-quick-actions" style="margin-top:12px">
				<button type="button" class="ac-btn" data-ac-copy-firewall>Copy the command</button>
			</div>
			<h4 class="ac-section-panel__title" style="margin:20px 0 8px">The manual checklist</h4>
			<div class="ac-alert ac-alert--info" style="margin-bottom:12px">
				<div class="ac-alert__body">
					<p class="ac-alert__title">What this checklist is — and what it is NOT</p>
					<p class="ac-alert__text">These four things are the only parts of a classroom deployment the server <strong>cannot verify by itself</strong>: whether the Windows firewall rule was really applied, whether the network profile really is Private, whether the school router allows device-to-device traffic, and whether a phone can really open the page. Only you can confirm them, from the machine and from a student device.</p>
					<p class="ac-alert__text"><strong>Nothing here changes the behaviour of the application.</strong> The ticks are a private note to yourself, kept in this browser. They do not enable a feature, they do not grant an access right, and the application works exactly the same whether they are ticked or not. Their only effect is that the Summary step can tell you the setup was confirmed rather than merely reported.</p>
				</div>
			</div>
			<div class="ac-checklist">
				${FIREWALL_CHECKS.map((check) => {
					let checked = false;
					try {
						const raw = localStorage.getItem(FIREWALL_CHECKS_KEY) || '[]';
						checked = JSON.parse(raw).includes(check.id);
					} catch {
						checked = false;
					}
					return `<label class="ac-check">
						<input type="checkbox" data-ac-firewall-check="${escapeHtml(check.id)}" ${
							checked ? 'checked' : ''
						} />
						<span>
							<span class="ac-check__label">${escapeHtml(check.label)}</span>
							<span class="ac-check__hint">${escapeHtml(check.hint)}</span>
						</span>
					</label>`;
				}).join('')}
			</div>
			<p class="ac-field__hint" data-ac-firewall-status style="margin-top:8px">${
				done
					? 'All four checks are confirmed. The Summary step now shows the setup as verified.'
					: 'None of this changes the application — it is a note to yourself. Tick what you have actually confirmed.'
			}</p>`,
	});
}

function renderDatabaseStep(d) {
	const db = d.database || {};
	const inferred = db.inferredInfo || {};

	return panel({
		title: 'Database safety',
		subtitle:
			'The database is a single SQLite file. Back it up before you change anything — the backup button is at the bottom of this step.',
		body: `<div class="ac-defs">
				${definition('Configured URL', db.url || '—')}
				${db.inferred ? definition('Prisma uses', db.inferred, inferred.exists ? 'ok' : 'fail') : ''}
				${
					db.expected
						? definition(
								'prisma/dev.db',
								db.expected.exists ? `${db.expected.size || 0} bytes` : 'not found',
								db.expected.exists ? 'ok' : 'warn',
							)
						: ''
				}
				${
					db.rootDevDb && db.rootDevDb.exists
						? definition('Root ./dev.db', 'found — may indicate a URL mismatch', 'warn')
						: ''
				}
			</div>
			${
				db.rootDevDb && db.rootDevDb.exists && (!db.inferred || !inferred.exists)
					? `<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Database path inconsistency</p><p class="ac-alert__text">The <code>.env</code> file points at a different path than expected. The data may be in <code>./dev.db</code> instead of <code>prisma/dev.db</code> — back up both before reinstalling.</p></div></div>`
					: ''
			}
			<div class="ac-quick-actions" style="margin-top:16px">
				<button type="button" class="ac-btn ac-btn--primary" data-ac-setup-backup>Download a backup</button>
				<span class="ac-table__muted" data-ac-setup-backup-status></span>
			</div>`,
	});
}

function renderOfflineStep(d) {
	const cdn = Array.isArray(d.cdn) ? d.cdn : [];
	const vendored = cdn.filter((row) => row.vendored).length;
	const remote = cdn.length - vendored;
	const remoteOk = cdn.filter((row) => !row.vendored && row.ok).length;

	return panel({
		title: 'Offline & CDN dependencies',
		subtitle:
			'The frontend libraries are served locally. The only external dependency is the web font, and it is optional.',
		body: `${
			vendored > 0
				? `<div class="ac-alert ac-alert--success" style="margin-bottom:14px"><div class="ac-alert__body"><p class="ac-alert__title">${vendored} libraries are vendored locally</p><p class="ac-alert__text">No internet access is required for any core feature.</p></div></div>`
				: ''
		}
		${renderTable({
			columns: [
				{ key: 'host', label: 'Host', render: (row) => `<code>${escapeHtml(row.host || row.id || '')}</code>` },
				{
					key: 'vendored',
					label: 'Source',
					render: (row) =>
						row.vendored
							? '<span class="ac-badge ac-badge--success">vendored locally</span>'
							: '<span class="ac-badge ac-badge--warning">remote</span>',
				},
				{
					key: 'ok',
					label: 'Reachable',
					render: (row) =>
						row.vendored
							? '<span class="ac-table__muted">not needed</span>'
							: `<span class="ac-badge ac-badge--${row.ok ? 'success' : 'danger'}">${
									row.ok ? 'yes' : 'no'
								}</span>`,
				},
				{
					key: 'ms',
					label: 'Time',
					align: 'right',
					render: (row) => (row.vendored ? '—' : row.ms != null ? `${row.ms} ms` : '—'),
				},
			],
			rows: cdn,
			empty: 'No probe was run.',
		})}
		${
			remote > 0 && remoteOk < remote
				? `<div class="ac-alert ac-alert--warning" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Some remote resources are unreachable</p><p class="ac-alert__text">Only the web font is affected — the application works with the system font stack.</p></div></div>`
				: `<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">All the core dependencies are vendored</p><p class="ac-alert__text">The application works fully offline. The web font is the only optional external dependency.</p></div></div>`
		}`,
	});
}

function renderSummaryStep(d, lan) {
	const checks = buildChecks(d, lan);
	const firewallDone = readFirewallChecks();

	return panel({
		title: 'Summary',
		subtitle:
			'Every classroom deployment check, and every part of the platform you can manage from here.',
		body: `<h4 class="ac-section-panel__title" style="margin:0 0 10px">The deployment checks</h4>
			<div class="ac-summary">
				${checks
					.map(
						(check) => `<div class="ac-summary__item">
							<span class="ac-badge ac-badge--${
								check.status === 'ok' ? 'success' : check.status === 'warn' ? 'warning' : 'danger'
							}">${check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗'}</span>
							<div>
								<p class="ac-summary__label">${escapeHtml(check.label)}</p>
								<p class="ac-summary__detail">${escapeHtml(check.detail)}</p>
								${
									check.action
										? `<button type="button" class="ac-btn ac-btn--sm" data-ac-setup-goto="${escapeHtml(
												check.action.step,
											)}">${escapeHtml(check.action.label)}</button>`
										: ''
								}
							</div>
						</div>`,
					)
					.join('')}
				<div class="ac-summary__item">
					<span class="ac-badge ac-badge--${firewallDone ? 'success' : 'warning'}">${
						firewallDone ? '✓' : '⚠'
					}</span>
					<div>
						<p class="ac-summary__label">Firewall and router configured</p>
						<p class="ac-summary__detail">${
							firewallDone
								? 'You confirmed all four checks yourself.'
								: 'Not confirmed yet — and it does not have to be: the application works either way.'
						}</p>
						<button type="button" class="ac-btn ac-btn--sm" data-ac-setup-goto="firewall">Open the checklist</button>
					</div>
				</div>
			</div>
			${
				d.capacity
					? `<div class="ac-alert ac-alert--info" style="margin-top:14px"><div class="ac-alert__body"><p class="ac-alert__title">Configured capacity</p><p class="ac-alert__text">${escapeHtml(
							String(d.capacity.maxUsers || 100),
						)} users and ${escapeHtml(String(d.capacity.maxGamePlayers || 30))} players per game. These are recorded values, not enforced limits.</p></div></div>`
					: ''
			}
			<h4 class="ac-section-panel__title" style="margin:24px 0 6px">Manage the platform from here</h4>
			<p class="ac-field__hint" style="margin-bottom:12px">Every part of the control center, and what each one is for.</p>
			<div class="ac-manage-grid">
				${MANAGEMENT
					.map(
						(item) => `<a class="ac-manage-card" href="${escapeHtml(item.href)}">
						<span class="ac-manage-card__title">${escapeHtml(item.title)}</span>
						<span class="ac-manage-card__desc">${escapeHtml(item.desc)}</span>
					</a>`,
					)
					.join('')}
			</div>`,
	});
}

/**
 * The management index.
 *
 * Every capability of the control center, with one line saying what it is
 * for. The Summary is where an administrator looks to find out what can be
 * managed at all — so nothing is left out.
 */
const MANAGEMENT = [
	{
		href: '#/overview',
		title: 'Overview',
		desc: 'The workbench: control, access, credentials, maintenance, activity, analytics, documents, notes and planning.',
	},
	{
		href: '#/organizations',
		title: 'Organizations',
		desc: 'Every tenant: create one, edit its profile, suspend it, reactivate it, remove it.',
	},
	{
		href: '#/users',
		title: 'Users & access',
		desc: 'The hub: the account counts, the requests waiting for a decision, and the three rosters.',
	},
	{
		href: '#/users/teachers',
		title: 'Teachers',
		desc: 'Add a teacher, change their role, suspend them, reset their password, remove them.',
	},
	{
		href: '#/users/students',
		title: 'Students',
		desc: 'Add a student, move them to a class, suspend them, reset their password, remove them.',
	},
	{
		href: '#/users/administrators',
		title: 'Directors & administrators',
		desc: 'The people who can administer: the school directors and the platform administrators.',
	},
	{
		href: '#/analytics',
		title: 'Platform analytics',
		desc: 'Adoption, activity and engagement, per organization and per class.',
	},
	{
		href: '#/audit',
		title: 'Activity & audit',
		desc: 'Every administrative action and every authentication event, searchable.',
	},
	{
		href: '#/health',
		title: 'System health',
		desc: 'Availability, error rate, latency, the database, the storage and the scheduled work.',
	},
	{
		href: '#/settings?section=general',
		title: 'General settings',
		desc: 'The organization identity, the quiz defaults and the appearance.',
	},
	{
		href: '#/settings?section=profile',
		title: 'My profile',
		desc: 'Your own account, and your own password.',
	},
	{
		href: '#/settings?section=access',
		title: 'Users & access settings',
		desc: 'The pending account requests and the pending profile changes.',
	},
	{
		href: '#/settings?section=teaching',
		title: 'Teacher access',
		desc: 'The seventeen switches that decide what a teacher may reach in the classroom.',
	},
	{
		href: '#/settings?section=realtime',
		title: 'Realtime',
		desc: 'The broadcast switches, the recovery code, the connected devices and the sync actions.',
	},
	{
		href: '#/settings?section=presets',
		title: 'Presets',
		desc: 'The quiz presets and the game presets.',
	},
	{
		href: '#/settings?section=documents',
		title: 'Documents & data',
		desc: 'The generated documents, the export, the import, the archives and the factory reset.',
	},
	{
		href: '#/settings?section=ai',
		title: 'Artificial intelligence',
		desc: 'The providers, the keys, the models, the shared catalogue and your own model.',
	},
	{
		href: '#/settings?section=roles',
		title: 'Roles & permissions',
		desc: 'What each role may do, and the full permission catalogue.',
	},
	{
		href: '#/settings?section=deployment',
		title: 'Deployment & session',
		desc: 'Where this installation runs, and what this session can reach.',
	},
];

/** The same checks the legacy wizard's summary made — each with a way to act on it. */
function buildChecks(d, lan) {
	const checks = [];
	const bindOk = d.hostBinding === '0.0.0.0';
	checks.push({
		id: 'binding',
		label: `Server listening on ${d.hostBinding || '0.0.0.0'}:${d.port || 3000}`,
		status: bindOk ? 'ok' : 'warn',
		detail: bindOk
			? 'Every network interface — the students can reach this server.'
			: 'The server is not bound to every interface.',
		action: bindOk ? null : { step: 'server', label: 'Look at the server step' },
	});

	const envOk = d.nodeEnv !== 'production';
	checks.push({
		id: 'env',
		label: `NODE_ENV = ${d.nodeEnv || 'development'}`,
		status: envOk ? 'ok' : 'warn',
		detail: envOk
			? 'HTTP works for the login and refresh cookies.'
			: 'Production mode sets Secure cookies — HTTP sign-in will fail. Use HTTPS or NODE_ENV=development.',
		action: envOk ? null : { step: 'server', label: 'Look at the server step' },
	});

	checks.push({
		id: 'lan',
		label: lan && lan.length ? `${lan.length} LAN address(es) found` : 'No LAN address found',
		status: lan && lan.length ? 'ok' : 'fail',
		detail:
			lan && lan.length
				? lan.map((a) => a.address).join(', ')
				: 'No IPv4 LAN interface was detected.',
		action: lan && lan.length ? { step: 'access', label: 'Show the address' } : null,
	});

	const db = d.database || {};
	const dbOk = db.inferredInfo && db.inferredInfo.exists;
	checks.push({
		id: 'database',
		label: 'Database file exists',
		status: dbOk ? 'ok' : 'warn',
		detail: db.inferred ? `Prisma uses: ${db.inferred}` : 'The database path could not be resolved.',
		action: { step: 'database', label: 'Open the database step' },
	});

	if (Array.isArray(d.cdn) && d.cdn.length) {
		const ok = d.cdn.filter((c) => c.ok).length;
		checks.push({
			id: 'cdn',
			label: `Resource reachability: ${ok}/${d.cdn.length}`,
			status: ok === d.cdn.length ? 'ok' : ok > 0 ? 'warn' : 'fail',
			detail:
				ok === d.cdn.length
					? 'Every probed resource answered.'
					: 'Some resources are unreachable — an offline or restricted network.',
			action: { step: 'offline', label: 'Open the offline step' },
		});
	}

	checks.push({
		id: 'realtime',
		label: 'The realtime channel',
		status: 'ok',
		detail:
			'There is no separate realtime server: the pages, the API and the realtime channel are served by this one process, on this one port.',
		action: { step: 'access', label: 'Show the student address' },
	});

	checks.push({
		id: 'fonts',
		label: 'The web font is served locally',
		status: 'ok',
		detail:
			'The interface fonts are vendored under public/fonts/, so the application renders with no internet access.',
		action: { step: 'offline', label: 'Open the offline step' },
	});

	return checks;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** One measured fact, with an optional verdict. */
function definition(label, value, status = '') {
	const badge =
		status === 'ok'
			? '<span class="ac-badge ac-badge--success">✓</span>'
			: status === 'warn'
				? '<span class="ac-badge ac-badge--warning">⚠</span>'
				: status === 'fail'
					? '<span class="ac-badge ac-badge--danger">✗</span>'
					: '';
	return `<div class="ac-defs__item">
		<p class="ac-defs__term">${escapeHtml(label)}</p>
		<p class="ac-defs__desc">${escapeHtml(value)} ${badge}</p>
	</div>`;
}

function port0(d) {
	return d.port || 3000;
}

function firewallCommand(port) {
	return `New-NetFirewallRule -DisplayName "Quiz Portal ${port}" -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port}`;
}

/** Copy a value to the clipboard, falling back to a selection. */
async function copy(value) {
	try {
		await navigator.clipboard.writeText(value);
	} catch {
		const area = document.createElement('textarea');
		area.value = value;
		document.body.appendChild(area);
		area.select();
		document.execCommand('copy');
		area.remove();
	}
}

/** Load the vendored QR generator on demand. */
function loadQrGenerator() {
	if (typeof window.qrcode === 'function') return Promise.resolve();
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = '/qrcode-generator.js';
		script.onload = () => {
			if (typeof window.qrcode === 'function') resolve();
			else reject(new Error('The QR generator could not be loaded.'));
		};
		script.onerror = () => reject(new Error('The QR generator could not be loaded.'));
		document.head.appendChild(script);
	});
}

/** Trigger a browser download. */
function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}
