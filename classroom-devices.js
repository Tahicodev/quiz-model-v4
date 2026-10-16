/**
 * classroom-devices.js
 *
 * Admin "Classroom Devices" tab. Lists every machine that connected to the
 * school (persisted server-side), lets staff:
 *   - block / allow  → hard block: the student is disconnected immediately and
 *                      refused on reconnect until allowed again.
 *   - assign         → link a machine to a student.
 *   - rename         → teacher label (e.g. "Lab A - PC 12").
 *   - forget         → delete the row.
 *
 * Presence (green "online" dot) comes from the shared `clients:update` socket
 * broadcast; the authoritative list/status always comes from /api/v1/devices.
 */
(function () {
	'use strict';

	var API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '/api/v1';
	var devices = [];
	var students = [];
	var onlineIds = new Set();
	var socketAttached = false;
	var loading = false;

	function token() {
		if (window.__authToken) return window.__authToken;
		try {
			var s = JSON.parse(localStorage.getItem('quizSession') || 'null');
			if (s && s.token) return s.token;
		} catch (e) {}
		try {
			return localStorage.getItem('quizAuthToken') || '';
		} catch (e) {
			return '';
		}
	}

	async function api(path, options) {
		var opts = options || {};
		var headers = Object.assign({}, opts.headers || {});
		var t = token();
		if (t) headers.Authorization = 'Bearer ' + t;
		if (opts.body && !headers['Content-Type']) {
			headers['Content-Type'] = 'application/json';
		}
		var res = await fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }));
		if (res.status === 204) return null;
		var body = null;
		try {
			body = await res.json();
		} catch (e) {}
		if (!res.ok) {
			throw new Error(
				(body && (body.message || body.error)) || res.status + ' ' + res.statusText,
			);
		}
		return body;
	}

	function toast(message, type) {
		if (typeof window.showToast === 'function') {
			window.showToast(message, type || 'info');
		} else {
			console.log('[ClassroomDevices]', message);
		}
	}

	function esc(value) {
		return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
			return {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			}[ch];
		});
	}

	function relativeTime(iso) {
		if (!iso) return '—';
		var then = new Date(iso).getTime();
		if (!then) return '—';
		var seconds = Math.floor((Date.now() - then) / 1000);
		if (seconds < 60) return "à l'instant";
		var minutes = Math.floor(seconds / 60);
		if (minutes < 60) return 'il y a ' + minutes + ' min';
		var hours = Math.floor(minutes / 60);
		if (hours < 24) return 'il y a ' + hours + ' h';
		var days = Math.floor(hours / 24);
		return 'il y a ' + days + ' j';
	}

	function typeLabel(type) {
		switch (String(type || '').toLowerCase()) {
			case 'mobile':
				return '📱 Mobile';
			case 'tablet':
				return '📟 Tablette';
			case 'desktop':
				return '🖥️ PC';
			default:
				return '❔ Inconnu';
		}
	}

	function studentName(userId) {
		if (!userId) return '';
		var found = students.find(function (s) {
			return String(s.id) === String(userId);
		});
		return found ? found.name || found.username || '' : '';
	}

	var STAFF_DEVICE_ROLES = ['admin', 'teacher', 'super_admin'];

	function isAdminSession() {
		try {
			if (window.TeacherFilter && typeof window.TeacherFilter.isAdminSession === 'function') {
				return window.TeacherFilter.isAdminSession();
			}
			return !!(window.Auth && window.Auth.isAdmin && window.Auth.isAdmin());
		} catch (e) {
			return false;
		}
	}

	// Assigned user, preferring the embedded server row (which now carries
	// the role) over the students-only local list — staff machines resolve
	// to their teacher/admin here.
	function deviceUser(d) {
		if (d && d.assignedUser && (d.assignedUser.name || d.assignedUser.username)) {
			return {
				id: d.assigned_user_id || d.assignedUser.id,
				name: d.assignedUser.name || d.assignedUser.username || '',
				role: String(d.assignedUser.role || '').toLowerCase(),
			};
		}
		if (d && d.assigned_user_id) {
			var found = students.find(function (s) {
				return String(s.id) === String(d.assigned_user_id);
			});
			if (found) {
				return {
					id: found.id,
					name: found.name || found.username || '',
					role: 'student',
				};
			}
			return { id: d.assigned_user_id, name: '', role: '' };
		}
		return null;
	}

	function isStaffRow(d) {
		var u = deviceUser(d);
		return !!u && STAFF_DEVICE_ROLES.indexOf(u.role) !== -1;
	}

	function staffRoleLabel(role) {
		return role === 'admin' || role === 'super_admin' ? 'Admin' : 'Teacher';
	}

	async function loadStudents() {
		// /users caps `limit` at 200 and paginates with `offset` — page through
		// the whole roster (teachers are server-scoped to their own students).
		try {
			var all = [];
			var offset = 0;
			var pageSize = 200;
			var guard = 0;
			for (;;) {
				var res = await api(
					'/users?role=student&limit=' + pageSize + '&offset=' + offset,
				);
				var page = (res && res.data) || (Array.isArray(res) ? res : []);
				all = all.concat(page);
				var total = (res && typeof res.total === 'number') ? res.total : page.length;
				offset += pageSize;
				guard += 1;
				if (page.length < pageSize || offset >= total || guard > 50) break;
			}
			students = all;
			students.sort(function (a, b) {
				return String(a.name || a.username || '').localeCompare(
					String(b.name || b.username || ''),
					'fr',
				);
			});
		} catch (e) {
			students = [];
			console.error('[ClassroomDevices] loadStudents failed:', e);
		}
	}

	function attachSocket() {
		if (socketAttached) return;
		var socket = null;
		try {
			socket = window.getSocket ? window.getSocket() : window.clientSocket;
		} catch (e) {}
		if (!socket) return;
		socketAttached = true;
		try {
			socket.on('clients:update', function (list) {
				onlineIds = new Set(
					(list || []).map(function (c) {
						return String(c.deviceId || '');
					}),
				);
				render();
			});
		} catch (e) {}
	}

	async function refresh() {
		if (loading) return;
		loading = true;
		var body = document.getElementById('devicesTableBody');
		if (body) {
			body.innerHTML =
				'<tr><td colspan="7" class="text-muted device-empty">Chargement…</td></tr>';
		}
		try {
			attachSocket();
			attachSheetListener();
			await loadStudents();
			devices = (await api('/devices')) || [];
			render();
		} catch (err) {
			if (body) {
				body.innerHTML =
					'<tr><td colspan="7" class="text-muted device-empty">Échec du chargement: ' +
					esc(err.message) +
					'</td></tr>';
			}
		} finally {
			loading = false;
		}
	}

	function filterValue(id) {
		var el = document.getElementById(id);
		return el ? String(el.value || '') : '';
	}

	function visibleDevices() {
		var q = (document.getElementById('devicesSearch') || {}).value || '';
		q = q.trim().toLowerCase();
		var status = filterValue('deviceFilterStatus');
		var type = filterValue('deviceFilterType');
		var presence = filterValue('deviceFilterPresence');
		var student = filterValue('deviceFilterStudent');
		return devices.filter(function (d) {
			if (status && String(d.status || '') !== status) return false;
			if (type && String(d.device_type || 'desktop') !== type) return false;
			if (presence) {
				var online = onlineIds.has(String(d.device_key));
				if (presence === 'online' && !online) return false;
				if (presence === 'offline' && online) return false;
			}
		if (student === 'assigned' && !d.assigned_user_id) return false;
		if (student === 'unassigned' && d.assigned_user_id) return false;
		if (student === 'staff' && !isStaffRow(d)) return false;
		if (!q) return true;
		var linkedName = (deviceUser(d) || {}).name || '';
		return (
			String(d.hostname || '').toLowerCase().indexOf(q) !== -1 ||
			String(d.last_ip || '').toLowerCase().indexOf(q) !== -1 ||
			String(d.platform || '').toLowerCase().indexOf(q) !== -1 ||
			String(d.note || '').toLowerCase().indexOf(q) !== -1 ||
			linkedName.toLowerCase().indexOf(q) !== -1
		);
	});
}

	function clearFilters() {
		['deviceFilterStatus', 'deviceFilterType', 'deviceFilterPresence', 'deviceFilterStudent'].forEach(function (id) {
			var el = document.getElementById(id);
			if (el) el.value = '';
		});
		var search = document.getElementById('devicesSearch');
		if (search) search.value = '';
		render();
	}

	/**
	 * Local show/hide toggle for the filter container — same classes and
	 * badge behavior as the shared toggleMobileFilters(), but owned by this
	 * tab so it can never silently no-op.
	 */
	function activeFilterCount() {
		var count = 0;
		['deviceFilterStatus', 'deviceFilterType', 'deviceFilterPresence', 'deviceFilterStudent'].forEach(function (id) {
			var el = document.getElementById(id);
			if (el && String(el.value || '') !== '') count++;
		});
		var search = document.getElementById('devicesSearch');
		if (search && String(search.value || '').trim() !== '') count++;
		return count;
	}

	function updateFiltersBadge() {
		var btn = document.querySelector('#devices .mobile-filters-toggle');
		if (!btn) return;
		var total = activeFilterCount();
		var badge = btn.querySelector('.mobile-filters-count');
		if (badge) {
			badge.textContent = String(total);
			badge.classList.toggle('hidden', total === 0);
		}
		btn.classList.toggle('has-active', total > 0);
	}

	function toggleFilters(btn) {
		var panel = document.getElementById('devicesFilters');
		if (!panel) return;
		var willOpen = !panel.classList.contains('filters-open');
		panel.classList.toggle('filters-open', willOpen);
		var toggleBtn = btn || document.querySelector('#devices .mobile-filters-toggle');
		if (toggleBtn) {
			toggleBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
			toggleBtn.classList.toggle('is-open', willOpen);
			var label = toggleBtn.querySelector('.mobile-filters-toggle-label');
			if (label) label.textContent = willOpen ? 'Hide filters' : 'Filters';
		}
		updateFiltersBadge();
	}

	var ICONS = {
		block: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>',
		allow: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
		rename: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
		forget: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
		sessions: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>',
	};

	function sheetIcon(svg16) {
		return String(svg16).replace('width="16" height="16"', 'width="20" height="20"');
	}

	function renderKpis() {
		var blockedCount = devices.filter(function (d) {
			return d.status === 'blocked';
		}).length;
		var onlineCount = devices.filter(function (d) {
			return onlineIds.has(String(d.device_key));
		}).length;
		var elTotal = document.getElementById('kpi-devices-total');
		var elOnline = document.getElementById('kpi-devices-online');
		var elBlocked = document.getElementById('kpi-devices-blocked');
		if (elTotal) elTotal.textContent = String(devices.length);
		if (elOnline) elOnline.textContent = String(onlineCount);
		if (elBlocked) elBlocked.textContent = String(blockedCount);
	}

	/**
	 * Mobile action sheet for a device — same idiom as the Classes, Exams
	 * and Results tabs (row tap opens it, inline buttons stay for desktop).
	 */
	function openDeviceSheet(d) {
		if (!window.MobileActionSheet || !d) return;
		var blocked = d.status === 'blocked';
		var hostname = d.hostname || d.note || '(sans nom)';
		var linked = deviceUser(d);
		var statusAction = blocked
			? {
					label: 'Autoriser',
					icon: sheetIcon(ICONS.allow),
					variant: 'primary',
					onClick: function () { setStatus(d.id, 'allowed'); },
				}
			: {
					label: 'Bloquer',
					icon: sheetIcon(ICONS.block),
					variant: 'danger',
					onClick: function () { setStatus(d.id, 'blocked'); },
				};
		window.MobileActionSheet.open('Appareil : ' + hostname, [
			// Blocking is a student-exam control — never offered on staff rows.
			...(isStaffRow(d) ? [] : [statusAction]),
			...(isAdminSession() && linked && linked.id
				? [
						{
							label: 'End sessions (' + (linked.name || 'user') + ')',
							icon: sheetIcon(ICONS.sessions),
							onClick: function () {
								endSessions(d.id);
							},
						},
					]
				: []),
			{
				label: 'Renommer',
				icon: sheetIcon(ICONS.rename),
				onClick: function () { rename(d.id); },
			},
			{
				label: 'Oublier',
				icon: sheetIcon(ICONS.forget),
				variant: 'danger',
				onClick: function () { forget(d.id); },
			},
		]);
	}

	var sheetListenerAttached = false;

	function attachSheetListener() {
		if (sheetListenerAttached) return;
		var tbody = document.getElementById('devicesTableBody');
		if (!tbody) return;
		sheetListenerAttached = true;
		// Delegated: survives every re-render. Mirrors the other tabs — only
		// on mobile, and never when the tap lands on a control.
		tbody.addEventListener('click', function (e) {
			if (window.innerWidth > 768) return;
			if (e.target.closest('button, select, input, a, textarea, label')) return;
			var row = e.target.closest('tr.device-card');
			if (!row) return;
			e.stopPropagation();
			var id = row.getAttribute('data-device-id');
			var d = devices.find(function (dev) { return String(dev.id) === String(id); });
			if (d) openDeviceSheet(d);
		});
	}

	function render() {
		var body = document.getElementById('devicesTableBody');
		if (!body) return;
		var rows = visibleDevices();

		renderKpis();
		updateFiltersBadge();

		if (!rows.length) {
			body.innerHTML =
				'<tr><td colspan="7" class="text-muted device-empty">' +
				(devices.length
					? 'Aucun appareil ne correspond à la recherche.'
					: "Aucun appareil pour l'instant — ils apparaissent dès qu'un élève se connecte.") +
				'</td></tr>';
			return;
		}

		var html = rows
			.map(function (d) {
				var id = esc(d.id);
				var online = onlineIds.has(String(d.device_key));
				var blocked = d.status === 'blocked';
				var hostname = d.hostname || d.note || '(sans nom)';
				var linkedUser = deviceUser(d);
				var staffRow = isStaffRow(d);

				var userCellHtml;
				if (staffRow) {
					userCellHtml =
						'<span class="device-staff-badge" title="Staff machine">' +
						esc(staffRoleLabel(linkedUser.role)) +
						'</span> ' +
						'<span class="device-user-name">' +
						esc(linkedUser.name || linkedUser.id) +
						'</span>';
				} else {
					var options =
						'<option value="">— Non assigné —</option>' +
						students
							.map(function (s) {
								return (
									'<option value="' +
									esc(s.id) +
									'"' +
									(String(s.id) === String(d.assigned_user_id) ? ' selected' : '') +
									'>' +
									esc(s.name || s.username) +
									'</option>'
								);
							})
							.join('');
					userCellHtml =
						'<select class="form-control device-assign" onchange="window.ClassroomDevices.assign(\'' +
						id +
						'\', this.value)">' +
						options +
						'</select>';
				}

				var endSessionsBtnHtml =
					isAdminSession() && linkedUser && linkedUser.id
						? '<button type="button" class="exam-action-btn exam-copy-btn" title="End all sign-in sessions for ' +
							esc(linkedUser.name || linkedUser.id) +
							'" onclick="window.ClassroomDevices.endSessions(\'' +
							id +
							'\')">' + ICONS.sessions + '</button>'
						: '';

				return (
					'<tr class="device-card' + (blocked ? ' is-blocked' : '') + (staffRow ? ' is-staff' : '') + '" data-device-id="' + id + '">' +
					'<td class="device-cell-machine">' +
					'<span class="device-dot ' + (online ? 'is-online' : 'is-offline') + '" title="' + (online ? 'En ligne' : 'Hors ligne') + '"></span>' +
					'<div class="device-id-block"><div class="device-name">' + esc(hostname) + '</div>' +
					(d.platform ? '<div class="device-platform text-muted">' + esc(d.platform) + '</div>' : '') +
					'</div></td>' +
					'<td data-label="Type">' + typeLabel(d.device_type) + '</td>' +
					'<td data-label="IP">' + esc(d.last_ip || '—') + '</td>' +
					'<td data-label="Élève">' + userCellHtml + '</td>' +
					'<td data-label="Statut"><span class="badge ' +
					(blocked ? 'device-badge-blocked' : 'device-badge-allowed') +
					'">' +
					(blocked ? 'Bloqué' : 'Autorisé') +
					'</span></td>' +
					'<td data-label="Vu">' + relativeTime(d.last_seen) + '</td>' +
					'<td class="actions-cell device-cell-actions" data-label="Actions"><div class="exam-actions">' +
					(staffRow
						? ''
						: (blocked
							? '<button type="button" class="exam-action-btn exam-copy-btn" title="Autoriser" onclick="window.ClassroomDevices.setStatus(\'' + id + '\',\'allowed\')">' + ICONS.allow + '</button>'
							: '<button type="button" class="exam-action-btn exam-delete-btn" title="Bloquer" onclick="window.ClassroomDevices.setStatus(\'' + id + '\',\'blocked\')">' + ICONS.block + '</button>')) +
					endSessionsBtnHtml +
					'<button type="button" class="exam-action-btn exam-edit-btn" title="Renommer" onclick="window.ClassroomDevices.rename(\'' +
					id +
					'\')">' + ICONS.rename + '</button>' +
					'<button type="button" class="exam-action-btn exam-delete-btn" title="Oublier" onclick="window.ClassroomDevices.forget(\'' +
					id +
					'\')">' + ICONS.forget + '</button>' +
					'</div></td>' +
					'</tr>'
				);
			})
			.join('');
		body.innerHTML = html;
	}

	async function setStatus(id, status) {
		if (status === 'blocked' && !window.confirm('Bloquer cet appareil ? L’élève sera déconnecté.')) {
			return;
		}
		try {
			var updated = await api('/devices/' + encodeURIComponent(id), {
				method: 'PATCH',
				body: JSON.stringify({ status: status }),
			});
			var idx = devices.findIndex(function (d) {
				return d.id === id;
			});
			if (idx !== -1 && updated) devices[idx] = updated;
			render();
			toast(status === 'blocked' ? 'Appareil bloqué' : 'Appareil autorisé', 'success');
		} catch (err) {
			toast('Échec: ' + err.message, 'error');
		}
	}

	async function assign(id, userId) {
		try {
			var updated = await api('/devices/' + encodeURIComponent(id), {
				method: 'PATCH',
				body: JSON.stringify({ assigned_user_id: userId || null }),
			});
			var idx = devices.findIndex(function (d) {
				return d.id === id;
			});
			if (idx !== -1 && updated) devices[idx] = updated;
			render();
		} catch (err) {
			toast('Échec de l’assignation: ' + err.message, 'error');
		}
	}

	async function rename(id) {
		var device = devices.find(function (d) {
			return d.id === id;
		});
		var current = device ? device.hostname || '' : '';
		var value = window.prompt('Nom de la machine (ex: Lab A - PC 12)', current);
		if (value === null) return;
		try {
			var updated = await api('/devices/' + encodeURIComponent(id), {
				method: 'PATCH',
				body: JSON.stringify({ hostname: value }),
			});
			var idx = devices.findIndex(function (d) {
				return d.id === id;
			});
			if (idx !== -1 && updated) devices[idx] = updated;
			render();
		} catch (err) {
			toast('Échec du renommage: ' + err.message, 'error');
		}
	}

	async function forget(id) {
		if (!window.confirm('Oublier cet appareil ? (ne bloque pas)')) return;
		try {
			await api('/devices/' + encodeURIComponent(id), { method: 'DELETE' });
			devices = devices.filter(function (d) {
				return d.id !== id;
			});
			render();
			toast('Appareil oublié', 'success');
		} catch (err) {
			toast('Échec: ' + err.message, 'error');
		}
	}

	// End every sign-in session of the user linked to this machine (stuck
	// "already signed in" accounts). Admin-only; the server enforces it too.
	async function endSessions(id) {
		if (!isAdminSession()) {
			toast('Only admins can end sessions', 'error');
			return;
		}
		var device = devices.find(function (d) {
			return String(d.id) === String(id);
		});
		if (!device) {
			toast('Appareil introuvable', 'error');
			return;
		}
		var linked = deviceUser(device);
		if (!linked || !linked.id) {
			toast('No user linked to this machine', 'error');
			return;
		}
		var label = linked.name || linked.id;
		if (
			!window.confirm(
				'End all sign-in sessions for "' +
					label +
					'"?\n\nThey will be signed out immediately and can sign in again.',
			)
		) {
			return;
		}
		try {
			var res = await api('/users/' + encodeURIComponent(linked.id) + '/sessions', {
				method: 'DELETE',
			});
			var count = res && res.revoked != null ? res.revoked : '?';
			toast('Ended ' + count + ' session(s) for "' + label + '"', 'success');
		} catch (err) {
			toast('Échec: ' + err.message, 'error');
		}
	}

	window.ClassroomDevices = {
		refresh: refresh,
		filter: render,
		clearFilters: clearFilters,
		toggleFilters: toggleFilters,
		setStatus: setStatus,
		assign: assign,
		rename: rename,
		forget: forget,
		endSessions: endSessions,
	};
})();
