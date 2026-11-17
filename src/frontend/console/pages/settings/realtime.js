/**
 * src/frontend/console/pages/settings/realtime.js
 *
 * Realtime — the live channel between the server and the classroom devices.
 *
 * ── The "LAN Realtime Server" question, answered ──────────────────────────
 *
 * There is NO separate realtime server. Socket.IO is attached to the same
 * HTTP server that serves the API and the pages (`src/backend/server.js` →
 * `initSocketServer`); there is no `realtime-server` process and no npm
 * script that starts one. On a LAN installation the one server you already
 * run IS the realtime server — it serves the pages, the API and the socket
 * from the same port.
 *
 * So the legacy "LAN Realtime Server" switch never started a server. What it
 * actually did was decide whether the administration panel USES the shared
 * socket: turning it off stopped the broadcasting and the device list, and
 * deliberately did NOT disconnect the socket (the comment in the legacy code
 * says so explicitly) because that socket is shared with the rest of the
 * application.
 *
 * This section keeps that meaning and names it honestly:
 *
 *   "Use this session for realtime broadcasts" — the same switch, described
 *   for what it does.
 *
 * The server host field is kept because the legacy classroom panel reads it,
 * but it is described accurately: the socket always connects to the page's
 * own origin, so this value is only a fallback for the classroom panel.
 */

import { api } from '../../core/api.js';
import { getSocket, waitForConnection } from '../../core/socket.js';
import { toast } from '../../components/ui.js';
import { renderTable } from '../../components/table.js';
import { panel, field, switchRow, escapeHtml, loadSettings, saveSetting } from './index.js';

const REALTIME_KEYS = [
	'realtimeEnabled',
	'autoSync',
	'broadcastUpdates',
	'autoSyncQuestions',
	'realtimeSyncInterval',
	'serverHost',
];

export async function realtimeSection(ctx) {
	const [settings, devicesPayload] = await Promise.all([
		loadSettings(),
		api.get('devices').catch(() => []),
	]);

	const value = (key) => {
		const raw = settings.get(key)?.value ?? '';
		return raw === 'false' ? false : raw === 'true' ? true : raw;
	};

	const devices = Array.isArray(devicesPayload) ? devicesPayload : [];

	const markup = [
		panel({
			title: 'How the realtime channel works here',
			subtitle: 'There is no second server to run.',
			body: `<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">One server, three jobs</p>
						<p class="ac-alert__text">The pages, the API and the realtime channel are all served by the same process. On a LAN installation the one server you already run IS the realtime server — there is nothing extra to install, start or configure, and no separate port to open. The channel authenticates with your signed-in session, exactly like the API.</p>
					</div>
				</div>
				<div class="ac-alert ac-alert--info" style="margin-top:12px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">What the switch really controls</p>
						<p class="ac-alert__text">The legacy "LAN Realtime Server" switch never started a server. It decided whether this administration session USES the shared socket — whether it broadcasts updates and lists the connected devices. Turning it off stops the broadcasting; it does not disconnect the socket the rest of the application is using.</p>
					</div>
				</div>`,
		}),
		panel({
			title: 'Realtime behaviour',
			subtitle: 'How much this installation pushes to the connected devices.',
			body: `${switchRow({
					id: 'set-realtime-enabled',
					label: 'Use this session for realtime broadcasts',
					hint: 'Whether this administration session broadcasts and lists the connected devices.',
					checked: value('realtimeEnabled') !== false,
				})}
				${switchRow({
					id: 'set-realtime-autosync',
					label: 'Auto-sync results',
					hint: 'Automatically push the quiz results to the connected devices.',
					checked: value('autoSync') !== false,
				})}
				${switchRow({
					id: 'set-realtime-broadcast',
					label: 'Broadcast updates',
					hint: 'Push question and exam updates to the connected devices.',
					checked: value('broadcastUpdates') !== false,
				})}
				${switchRow({
					id: 'set-realtime-autosync-questions',
					label: 'Auto-sync questions (training categories)',
					hint: 'Periodically push the questions of the training-enabled categories to the connected devices.',
					checked: value('autoSyncQuestions') !== false,
				})}
				<div class="ac-field-grid" style="margin-top:14px">
					${field({
						id: 'set-realtime-interval',
						label: 'Sync interval (seconds)',
						type: 'number',
						value: value('realtimeSyncInterval') || 5,
						hint: 'How often the data is synchronised between the devices.',
					})}
					${field({
						id: 'set-realtime-host',
						label: 'Server host (fallback for the classroom panel)',
						value: value('serverHost') || '',
						placeholder: 'http://192.168.1.5:3000',
						hint: 'The realtime channel itself always connects to the address this page was served from. This value is only the fallback the classroom panel reads.',
					})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-realtime>Save realtime settings</button>
						<span class="ac-table__muted" data-ac-realtime-status></span>
					</div>
				</div>`,
		}),
		panel({
			title: 'Recovery code',
			subtitle:
				'The code the "forgot password" panel on the sign-in page accepts. It is stored as a server-side hash.',
			body: `<div class="ac-field-grid">
					${field({
						id: 'set-recovery-code',
						label: 'New recovery code',
						type: 'password',
						full: true,
						hint: 'Leave it blank to keep the existing code. The code itself is never sent back to a browser.',
					})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-save-recovery>Save recovery code</button>
						<span class="ac-table__muted" data-ac-recovery-status></span>
					</div>
				</div>`,
		}),
		panel({
			title: 'Connected devices',
			subtitle: 'The machines currently connected to this installation.',
			actions:
				'<button type="button" class="ac-btn ac-btn--sm" data-ac-realtime-refresh>Refresh</button>',
			body: `<div class="ac-toolbar" style="margin-bottom:12px">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn" data-ac-realtime-test>Test connection</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-all>Sync all data</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-users>Sync user accounts</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-classroom>Sync classroom data</button>
						<button type="button" class="ac-btn" data-ac-realtime-sync-games>Sync regular + Kids games</button>
						<div class="ac-toolbar__push">
							<button type="button" class="ac-btn ac-btn--sm" data-ac-realtime-online-only>Show online only</button>
						</div>
					</div>
					<span class="ac-table__muted" data-ac-realtime-connection>Not connected.</span>
				</div>
				<div data-ac-realtime-devices>
					${
						devices.length
							? renderDeviceTable(devices)
							: '<p class="ac-empty__message">No device has registered with this installation yet.</p>'
					}
				</div>`,
		}),
	].join('');

	function bind(root) {
		const status = root.querySelector('[data-ac-realtime-status]');
		const connection = root.querySelector('[data-ac-realtime-connection]');
		const devicesHost = root.querySelector('[data-ac-realtime-devices]');

		// ── The switches ─────────────────────────────────────────────────
		root.querySelectorAll('.ac-switch').forEach((button) => {
			button.addEventListener('click', () => {
				const next = button.getAttribute('aria-checked') === 'true' ? 'false' : 'true';
				button.setAttribute('aria-checked', next);
			});
		});

		const switchValue = (id) =>
			root.querySelector(`#${id}`)?.getAttribute('aria-checked') === 'true';

		root.querySelector('[data-ac-save-realtime]')?.addEventListener('click', async () => {
			try {
				await saveSetting('realtimeEnabled', String(switchValue('set-realtime-enabled')));
				await saveSetting('autoSync', String(switchValue('set-realtime-autosync')));
				await saveSetting('broadcastUpdates', String(switchValue('set-realtime-broadcast')));
				await saveSetting('autoSyncQuestions', String(switchValue('set-realtime-autosync-questions')));
				const interval = root.querySelector('#set-realtime-interval')?.value ?? '5';
				await saveSetting('realtimeSyncInterval', String(Math.max(1, Number(interval) || 5)));
				await saveSetting('serverHost', root.querySelector('#set-realtime-host')?.value ?? '');
				if (status) status.textContent = 'Saved.';
				toast('Realtime settings saved.', 'success');
			} catch (err) {
				if (status) status.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		root.querySelector('[data-ac-save-recovery]')?.addEventListener('click', async () => {
			const el = root.querySelector('[data-ac-recovery-status]');
			const code = root.querySelector('#set-recovery-code')?.value?.trim() ?? '';
			if (!code) {
				toast('Type a new recovery code, or leave the field alone to keep the current one.', 'error');
				return;
			}
			try {
				await api.post('auth/recover/set', { code });
				root.querySelector('#set-recovery-code').value = '';
				if (el) el.textContent = 'Saved.';
				toast('Recovery code saved.', 'success');
			} catch (err) {
				if (el) el.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		// ── The socket ───────────────────────────────────────────────────
		let onlineOnly = false;

		const connect = async ({ force = false } = {}) => {
			if (connection) connection.textContent = 'Connecting…';
			const socket = await getSocket({ force });
			if (!socket) {
				if (connection) connection.textContent = 'The realtime client could not be loaded.';
				return null;
			}
			const connected = await waitForConnection(socket);
			if (!connected) {
				if (connection) connection.textContent = 'Could not connect to the realtime channel.';
				return null;
			}
			// Staff sockets receive the live device roster.
			socket.emit('identify', { role: 'admin' });
			if (connection) connection.textContent = 'Connected.';
			return socket;
		};

		const reloadDevices = async () => {
			try {
				const rows = await api.get('devices');
				const list = Array.isArray(rows) ? rows : [];
				const shown = onlineOnly
					? list.filter((row) => row.status === 'active' || row.online)
					: list;
				if (devicesHost) {
					devicesHost.innerHTML = shown.length
						? renderDeviceTable(shown)
						: '<p class="ac-empty__message">No device matches the current filter.</p>';
				}
			} catch (err) {
				if (devicesHost) {
					devicesHost.innerHTML = `<p class="ac-empty__message">${escapeHtml(err.message)}</p>`;
				}
			}
		};

		root.querySelector('[data-ac-realtime-refresh]')?.addEventListener('click', reloadDevices);

		root.querySelector('[data-ac-realtime-online-only]')?.addEventListener('click', async () => {
			onlineOnly = !onlineOnly;
			const button = root.querySelector('[data-ac-realtime-online-only]');
			if (button) {
				button.textContent = onlineOnly ? 'Show all devices' : 'Show online only';
			}
			await reloadDevices();
		});

		root.querySelector('[data-ac-realtime-test]')?.addEventListener('click', async () => {
			const socket = await connect({ force: true });
			if (socket) {
				toast('The realtime channel answered.', 'success');
				await reloadDevices();
			}
		});

		const broadcast = async (event, payload, label) => {
			const socket = await connect();
			if (!socket) {
				toast('The realtime channel is not connected.', 'error');
				return;
			}
			try {
				socket.emit(event, payload || {});
				toast(`${label} was sent to the connected devices.`, 'success');
			} catch (err) {
				toast(err.message, 'error');
			}
		};

		root.querySelector('[data-ac-realtime-sync-all]')?.addEventListener('click', async () => {
			await broadcast('admin:refreshStudentBootstrap', {}, 'The full synchronisation');
			await broadcast('admin:syncUsers', { quizUsers: [] }, 'The user accounts');
			await broadcast('admin:syncGamification', {}, 'The gamification');
		});

		root.querySelector('[data-ac-realtime-sync-users]')?.addEventListener('click', () =>
			broadcast('admin:syncUsers', { quizUsers: [] }, 'The user accounts'),
		);

		root.querySelector('[data-ac-realtime-sync-classroom]')?.addEventListener('click', () =>
			broadcast('admin:refreshStudentBootstrap', {}, 'The classroom data'),
		);

		root.querySelector('[data-ac-realtime-sync-games]')?.addEventListener('click', async () => {
			await broadcast('admin:syncGames', {}, 'The regular games');
			await broadcast('admin:syncKidsGames', {}, 'The Kids games');
		});

		// Connect once so the live roster arrives on its own.
		if (value('realtimeEnabled') !== false) {
			connect()
				.then(async (socket) => {
					if (!socket) return;
					socket.on('clients:update', () => {
						reloadDevices();
					});
				})
				.catch(() => {
					/* the section still works without the live roster */
				});
		}
	}

	return { markup, bind };
}

/** Render the device registry. */
function renderDeviceTable(devices) {
	return renderTable({
		columns: [
			{
				key: 'hostname',
				label: 'Device',
				render: (row) =>
					`<span class="ac-table__primary">${escapeHtml(
						row.hostname || row.name || '—',
					)}</span>`,
			},
			{
				key: 'device_type',
				label: 'Type',
				render: (row) => escapeHtml(row.device_type || row.platform || '—'),
			},
			{
				key: 'assignedUser',
				label: 'Assigned to',
				render: (row) =>
					escapeHtml(
						row.assignedUser?.name || row.assignedUser?.username || 'unassigned',
					),
			},
			{
				key: 'ip_address',
				label: 'Address',
				render: (row) => `<code>${escapeHtml(row.ip_address || row.ip || '—')}</code>`,
			},
			{
				key: 'status',
				label: 'Status',
				render: (row) =>
					`<span class="ac-badge ac-badge--${row.status === 'blocked' ? 'danger' : ''}">${escapeHtml(
						row.status || '—',
					)}</span>`,
			},
		],
		rows: devices,
		empty: 'No device matches the current filter.',
	});
}
