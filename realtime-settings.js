/**
 * Realtime Settings UI Handler
 * Manages LAN Realtime Server configuration and device management in admin panel
 */

(function () {
	let realtimeSocket = null;
	let connectedDevices = [];
	let connectionCheckInterval = null;
	let userSyncInProgress = false;
	let lastUsersSyncFingerprint = '';
	let lastUsersSyncAt = 0;
	const USERS_SYNC_COOLDOWN_MS = 5000;

	// Initialize realtime settings UI on document load
	document.addEventListener('DOMContentLoaded', () => {
		setupRealtimeUI();
	});

	/**
	 * Setup initial UI event listeners
	 */
	function setupRealtimeUI() {
		const realtimeEnabledCheckbox = document.getElementById(
			'setting-realtimeEnabled',
		);
		const serverHostInput = document.getElementById('setting-serverHost');

		if (realtimeEnabledCheckbox) {
			realtimeEnabledCheckbox.addEventListener('change', (e) => {
				if (e.target.checked) {
					connectToRealtimeServer();
					startConnectionMonitor();
				} else {
					disconnectFromRealtimeServer();
					stopConnectionMonitor();
				}
			});
		}

		// Load and initialize realtime state from settings
		const settings = window.getAppSettings ? window.getAppSettings() : {};
		if (settings.realtimeEnabled && serverHostInput) {
			realtimeEnabledCheckbox.checked = true;
			connectToRealtimeServer();
			startConnectionMonitor();
		}
	}

	/**
	 * Get the server host from settings or input
	 */
	function getServerHost() {
		const hostInput = document.getElementById('setting-serverHost');
		if (hostInput && hostInput.value.trim()) {
			return hostInput.value.trim().replace(/\/$/, '');
		}

		// Use current origin or localStorage value
		return (
			localStorage.getItem('quizServerHost') ||
			window.QUIZ_SERVER_HOST ||
			location.origin
		).replace(/\/$/, '');
	}

	function publishRealtimeState(partial = {}) {
		const current =
			window.__quizRealtimeState &&
			typeof window.__quizRealtimeState === 'object'
				? window.__quizRealtimeState
				: {};
		const next = {
			...current,
			...partial,
			onlineDevices: Number(partial.onlineDevices ?? current.onlineDevices) || 0,
			deviceCount: Number(partial.deviceCount ?? current.deviceCount) || 0,
			connected: partial.connected === true,
			updatedAt: new Date().toISOString(),
		};
		window.__quizRealtimeState = next;
		window.dispatchEvent(
			new CustomEvent('quiz:realtime-status', {
				detail: next,
			}),
		);
	}

	/**
	 * Connect to realtime server
	 */
	let _reconnectBlockedUntil = 0;

	function connectToRealtimeServer() {
		const serverHost = getServerHost();

		// Check if Socket.IO is loaded
		if (typeof io === 'undefined') {
			console.warn('Socket.IO library not loaded');
			showRealtimeStatus('Socket.IO not loaded', 'error');
			return;
		}

		// Back off from reconnecting after repeated auth failures
		if (_reconnectBlockedUntil > Date.now()) {
			console.warn(`[Realtime] Skipping reconnect — blocked until ${new Date(_reconnectBlockedUntil).toLocaleTimeString()}`);
			return;
		}

		try {
			// Disconnect previous connection if exists
			if (realtimeSocket) {
				realtimeSocket.disconnect();
			}

			realtimeSocket = window.getSocket();

			// Connection events
			realtimeSocket.on('connect', () => {
				console.log('Connected to realtime server:', serverHost);
				realtimeSocket.emit(
					'identify',
					window.buildAdminIdentifyPayload
						? window.buildAdminIdentifyPayload()
						: { role: 'admin' },
				);
				updateRealtimeStatus('connected');
				const canSyncUsers =
					typeof window.Auth?.isAdmin === 'function' &&
					window.Auth.isAdmin();
				if (canSyncUsers) {
					if (typeof window.syncUsersToClients === 'function') {
						setTimeout(() => window.syncUsersToClients(), 500);
					}
					if (typeof window.syncGamesToClients === 'function') {
						setTimeout(() => window.syncGamesToClients(), 800);
					}
					if (typeof window.syncGamificationSettings === 'function') {
						setTimeout(() => window.syncGamificationSettings(), 1100);
					}
				}
			});

			realtimeSocket.on('clients:update', (clients) => {
				console.log('Received clients update:', clients);
				// Use history update logic
				updateDeviceHistory(clients);
			});

			realtimeSocket.on('disconnect', () => {
				console.log('Disconnected from realtime server');
				updateRealtimeStatus('disconnected');
				// Mark all as offline
				updateDeviceHistory([]);
			});

			realtimeSocket.on('connect_error', (error) => {
				const msg = (error && error.message) || 'Unknown error';
				// Auth failures are expected when the server is unreachable or token expired — log once, then back off
				if (/unauthorized|invalid.*token|expired.*token/i.test(msg)) {
					console.warn('[Realtime] Connection auth error (server may be offline):', msg);
					_reconnectBlockedUntil = Date.now() + 30_000; // back off 30s
				} else {
					console.warn('[Realtime] Connection error:', msg);
				}
				updateRealtimeStatus('error', msg);
			});

			realtimeSocket.on('admin:auth:error', (payload = {}) => {
				const message =
					payload.message ||
					'Admin Secret rejected. Check Settings > LAN Realtime.';
				console.warn('[Realtime] Admin auth failed:', message);
				updateRealtimeStatus('error', message);
				showRealtimeStatus(message, 'error');
			});

			realtimeSocket.on('admin:syncUsers', (payload = {}) => {
				if (!Array.isArray(payload.quizUsers)) return;
				window.__DI_CONTAINER__.repo.setAll_sync('users', payload.quizUsers);
				if (payload.syncedAt) {
					localStorage.setItem('quizUsersSyncedAt', payload.syncedAt);
				}
				window.dispatchEvent(new Event('storage'));
			});

			realtimeSocket.on('admin:syncGames', (payload = {}) => {
				if (!Array.isArray(payload.quizGames)) return;
				window.__DI_CONTAINER__.repo.setAll_sync('games', payload.quizGames);
				if (payload.syncedAt) {
					localStorage.setItem('quizGamesSyncedAt', payload.syncedAt);
				}
				window.dispatchEvent(new Event('storage'));
			});

			realtimeSocket.on('admin:syncGamification', (payload = {}) => {
				try {
					if (payload.quizGamification) {
						localStorage.setItem(
							'quizGamification',
							JSON.stringify(payload.quizGamification),
						);
					}
					if (Object.prototype.hasOwnProperty.call(payload, 'quizTournamentActive')) {
						if (payload.quizTournamentActive) {
							localStorage.setItem(
								'quizTournamentActive',
								JSON.stringify(payload.quizTournamentActive),
							);
						} else {
							localStorage.removeItem('quizTournamentActive');
						}
					}
					if (Array.isArray(payload.quizTournamentsHistory)) {
						localStorage.setItem(
							'quizTournamentsHistory',
							JSON.stringify(payload.quizTournamentsHistory),
						);
					}
					if (payload.syncedAt) {
						localStorage.setItem('quizGamificationSyncedAt', payload.syncedAt);
					}
					window.dispatchEvent(new CustomEvent('quiz:gamification-updated'));
					window.dispatchEvent(new Event('storage'));
				} catch (error) {
					console.error('Failed to apply incoming gamification sync:', error);
				}
			});

			// Store host in localStorage
			const hostInput = document.getElementById('setting-serverHost');
			if (hostInput && hostInput.value.trim()) {
				localStorage.setItem('quizServerHost', hostInput.value.trim());
			}
		} catch (error) {
			console.error('Failed to connect to realtime server:', error);
			updateRealtimeStatus('error', error.message);
		}
	}

	/**
	 * Disconnect from realtime server
	 */
	function disconnectFromRealtimeServer() {
		if (realtimeSocket) {
			realtimeSocket.disconnect();
			realtimeSocket = null;
		}
		updateRealtimeStatus('disconnected');
		// Mark all as offline
		updateDeviceHistory([]);
	}

	/**
	 * Update realtime connection status UI
	 */
	function updateRealtimeStatus(status, message = '') {
		const statusDiv = document.getElementById('realtime-connection-status');
		const statusDot = document.getElementById('realtime-status-dot');
		const statusText = document.getElementById('realtime-status-text');
		const safeStatus =
			status === 'connected' || status === 'error' ? status : 'disconnected';

		const statusConfig = {
			connected: {
				color: '#10b981',
				text: 'Connected to realtime server',
				background: '#ecfdf5',
			},
			disconnected: {
				color: '#ef4444',
				text: 'Disconnected from server',
				background: '#fef2f2',
			},
			error: {
				color: '#f97316',
				text: `Error: ${message || 'Connection failed'}`,
				background: '#fff7ed',
			},
		};

		const config = statusConfig[safeStatus] || statusConfig.disconnected;
		if (statusDiv && statusDot && statusText) {
			statusDiv.style.display = 'block';
			statusDot.style.backgroundColor = config.color;
			statusText.textContent = config.text;
			statusDiv.parentElement.style.backgroundColor = config.background;
		}
		publishRealtimeState({
			status: safeStatus,
			message: message || '',
			connected: safeStatus === 'connected',
			onlineDevices: connectedDevices.length,
			deviceCount: connectedDevices.length,
		});
	}

	/**
	 * Render connected devices list
	 */
	function renderConnectedDevices(devices) {
		const container = document.getElementById('realtime-devices-list');
		if (!container) return;

		if (!devices || devices.length === 0) {
			container.innerHTML = `
				<div style="padding: 20px; text-align: center; color: #9ca3af;">
					No devices connected yet
				</div>
			`;
			return;
		}

		container.innerHTML = '';

		devices.forEach((device) => {
			const deviceEl = document.createElement('div');
			deviceEl.style.cssText = `
				padding: 12px;
				border-bottom: 1px solid #e5e7eb;
				display: flex;
				justify-content: space-between;
				align-items: center;
				transition: background 0.2s;
			`;

			deviceEl.onmouseover = () => {
				deviceEl.style.backgroundColor = '#f3f4f6';
			};
			deviceEl.onmouseout = () => {
				deviceEl.style.backgroundColor = 'transparent';
			};

			const isOnline = device.status === 'online';
			const statusColor = isOnline ? '#10b981' : '#6b7280';
			const statusBg = isOnline ? '#ecfdf5' : '#f3f4f6';

			deviceEl.innerHTML = `
				<div style="flex: 1;">
					<div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">
						${escapeHtml(device.deviceId || device.name || 'Unknown Device')}
					</div>
					<div style="font-size: 0.85em; color: #6b7280;">
						${escapeHtml(device.ip || 'Unknown IP')} • 
						<span style="
							display: inline-block;
							width: 8px;
							height: 8px;
							border-radius: 50%;
							background: ${statusColor};
							margin: 0 4px;
							vertical-align: middle;
						"></span>
						${device.status || 'unknown'}
					</div>
					<div style="font-size: 0.8em; color: #9ca3af; margin-top: 4px;">
						Last seen: ${
							device.lastSeen
								? new Date(device.lastSeen).toLocaleTimeString()
								: '-'
						}
					</div>
				</div>
				<div style="display: flex; gap: 8px; margin-left: 12px;">
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						onclick="window.requestDeviceData('${device.socketId}')"
						title="Request data from this device"
						style="white-space: nowrap;"
					>
						Request
					</button>
					<button
						type="button"
						class="btn btn-secondary btn-sm"
						onclick="window.downloadDeviceData('${device.socketId}')"
						title="Download device data"
						style="white-space: nowrap;"
					>
						Download
					</button>
				</div>
			`;

			container.appendChild(deviceEl);
		});
	}

	/**
	 * Update device count in header
	 */
	function updateDeviceCount(count) {
		const countElement = document.getElementById('devices-count');
		if (countElement) {
			countElement.textContent = `(${count})`;
		}
	}

	/**
	 * Show realtime status message (toast-like)
	 */
	function showRealtimeStatus(message, type = 'info') {
		console.log(`[Realtime] ${type.toUpperCase()}: ${message}`);
		if (window.showToast) {
			window.showToast(message, type);
		}
	}

	function getAdminIdentifyPayload() {
		return window.buildAdminIdentifyPayload
			? window.buildAdminIdentifyPayload()
			: { role: 'admin' };
	}

	/**
	 * Start monitoring connection status
	 */
	function startConnectionMonitor() {
		stopConnectionMonitor(); // Clear previous interval

		connectionCheckInterval = setInterval(() => {
			if (realtimeSocket && realtimeSocket.connected) {
				// Request fresh device list
				realtimeSocket.emit('identify', getAdminIdentifyPayload());
			}
		}, 10000); // Check every 10 seconds
	}

	/**
	 * Stop monitoring connection status
	 */
	function stopConnectionMonitor() {
		if (connectionCheckInterval) {
			clearInterval(connectionCheckInterval);
			connectionCheckInterval = null;
		}
	}

	// ========================================
	// Global Functions (exposed to window)
	// ========================================

	/**
	 * Test connection to realtime server
	 */
	window.testRealtimeConnection = function () {
		const serverHost = getServerHost();
		showRealtimeStatus(`Testing connection to ${serverHost}...`);

		if (typeof io === 'undefined') {
			showRealtimeStatus(
				'Socket.IO library not loaded. Add <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>',
				'error',
			);
			return;
		}

		const testSocket = window.getSocket();

		const timeoutId = setTimeout(() => {
			testSocket.disconnect();
			showRealtimeStatus('Connection test timed out', 'error');
		}, 5000);

		testSocket.on('connect', () => {
			clearTimeout(timeoutId);
			testSocket.emit('identify', getAdminIdentifyPayload());
			showRealtimeStatus(`Successfully connected to ${serverHost}`, 'success');
			testSocket.disconnect();
		});

		testSocket.on('admin:auth:error', (payload = {}) => {
			clearTimeout(timeoutId);
			showRealtimeStatus(
				payload.message || 'Connected, but Admin Secret was rejected',
				'error',
			);
			testSocket.disconnect();
		});

		testSocket.on('connect_error', (error) => {
			clearTimeout(timeoutId);
			showRealtimeStatus(
				`Failed to connect: ${error.message || 'Unknown error'}`,
				'error',
			);
		});
	};

	/**
	 * Refresh connected devices list
	 */
	window.refreshRealtimeDevices = function () {
		if (realtimeSocket && realtimeSocket.connected) {
			realtimeSocket.emit('identify', getAdminIdentifyPayload());
			showRealtimeStatus('Requesting device list...', 'info');
		} else {
			showRealtimeStatus('Not connected to realtime server', 'error');
		}
	};

	/**
	 * Request data from a specific device
	 */
	window.requestDeviceData = function (socketId) {
		if (!realtimeSocket || !realtimeSocket.connected) {
			showRealtimeStatus('Not connected to realtime server', 'error');
			return;
		}

		realtimeSocket.emit('admin:requestClientData', { socketId });
		showRealtimeStatus('Requesting data from device...', 'info');

		// Listen for response
		realtimeSocket.once('deviceData:' + socketId, (data) => {
			console.log('Received device data:', data);
			handleDeviceData(socketId, data);
		});
	};

	/**
	 * Download data from a specific device
	 */
	window.downloadDeviceData = function (socketId) {
		const device = connectedDevices.find((d) => d.socketId === socketId);
		if (!device) return;

		const timestamp = new Date().toISOString().slice(0, 10);
		const filename = `device-data-${
			device.deviceId || socketId
		}-${timestamp}.json`;

		const deviceData = {
			timestamp: new Date().toISOString(),
			deviceId: device.deviceId,
			deviceName: device.name,
			ip: device.ip,
			data: device.data || {},
		};

		const dataStr = JSON.stringify(deviceData, null, 2);
		const dataUri =
			'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

		const link = document.createElement('a');
		link.setAttribute('href', dataUri);
		link.setAttribute('download', filename);
		link.click();

		showRealtimeStatus(`Downloaded data from ${device.name}`, 'success');
	};

	/**
	 * Merge all devices data
	 */
	window.mergeAllDevices = function () {
		if (!realtimeSocket || !realtimeSocket.connected) {
			showRealtimeStatus('Not connected to realtime server', 'error');
			return;
		}

		if (connectedDevices.length === 0) {
			showRealtimeStatus('No devices connected', 'error');
			return;
		}

		const confirmed = confirm(
			`Sync data from ${connectedDevices.length} connected device(s)? This will merge all quiz results and settings.`,
		);

		if (!confirmed) return;

		showRealtimeStatus('Syncing with all devices...', 'info');

		// Collect data from all devices
		const allDeviceData = {
			timestamp: new Date().toISOString(),
			devices: connectedDevices.length,
			data: {},
		};

		connectedDevices.forEach((device) => {
			if (device.data) {
				// Extract results from examActiveSession if present
				if (
					device.data.examActiveSession &&
					device.data.examActiveSession.results
				) {
					const sessionInfo = device.data.examActiveSession;
					const studentInfo = sessionInfo.studentInfo || {};
					const completedAt = sessionInfo.completedAt || new Date().toISOString();
					const resultId = `${sessionInfo.examId}-${
						studentInfo.numero || device.data.deviceId || device.deviceId || 'unknown'
					}-${completedAt}`;

					const sessionResult = {
						id: resultId,
						examId: sessionInfo.examId,
						examName: sessionInfo.examName,
						examTitle: sessionInfo.examName,
						mode: sessionInfo.mode,
						numero: studentInfo.numero || '',
						name: studentInfo.name || 'Unknown',
						class: studentInfo.class || '',
						classId: studentInfo.classId || '',
						studentName: studentInfo.name || 'Unknown',
						studentNumber: studentInfo.numero || '',
						className: studentInfo.class || '',
						score: sessionInfo.results.score || 0,
						totalQuestions: sessionInfo.results.totalQuestions || 0,
						totalPoints: sessionInfo.results.totalPoints || 0,
						answers: sessionInfo.results.answers || [],
						timeSpent: sessionInfo.results.timeSpent || 0,
						date: completedAt,
						dateTaken: completedAt,
						deviceId: device.data.deviceId || device.deviceId || 'unknown',
						deviceName: device.deviceId || device.name || 'Unknown',
						deviceIp: device.ip || '',
					};

					if (!allDeviceData.data.quizResults)
						allDeviceData.data.quizResults = [];
					// Avoid duplicates
					if (
						!allDeviceData.data.quizResults.some(
							(r) => r.id === sessionResult.id,
						)
					) {
						allDeviceData.data.quizResults.push(sessionResult);
					}
				}

				// Also merge regular quizResults if present
				if (device.data.quizResults && Array.isArray(device.data.quizResults)) {
					if (!allDeviceData.data.quizResults)
						allDeviceData.data.quizResults = [];
					// Avoid duplicates by checking existing results
					device.data.quizResults.forEach((result) => {
						if (
							!allDeviceData.data.quizResults.some(
								(r) => r.id === result.id && r.dateTaken === result.dateTaken,
							)
						) {
							allDeviceData.data.quizResults.push(result);
						}
					});
				}
			}
		});

		// Update localStorage with merged data
		if (allDeviceData.data.quizResults) {
			const existingResults = JSON.parse(
				JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('results')) || '[]',
			);
			const mergedResults = [
				...existingResults,
				...allDeviceData.data.quizResults,
			].filter(
				(r, i, arr) =>
					arr.findIndex((x) => x.id === r.id && x.dateTaken === r.dateTaken) ===
					i,
			);
			window.__DI_CONTAINER__.repo.setAll_sync('results', mergedResults);
		}

		// Save merged data backup
		const timestamp = new Date().toISOString().slice(0, 10);
		const filename = `merged-device-data-${timestamp}.json`;
		const dataStr = JSON.stringify(allDeviceData, null, 2);
		const dataUri =
			'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

		const link = document.createElement('a');
		link.setAttribute('href', dataUri);
		link.setAttribute('download', filename);
		link.click();

		showRealtimeStatus(
			`Synced data from ${connectedDevices.length} device(s)`,
			'success',
		);
	};

	/**
	 * Handle received device data - auto-load to admin localStorage
	 */
	function handleDeviceData(socketId, data, silent = false) {
		console.log('Processing device data:', data);

		// Find device metadata for logging and IP tracking
		const device = connectedDevices.find((d) => d.socketId === socketId);
		// Prioritize deviceId over name (which is current UserAgent) to keep it clean
		const deviceName = device?.deviceId || device?.name || socketId;
		const deviceIp = device?.ip || '';

		const existingResults = JSON.parse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('results')) || '[]',
		);
		let resultsChanged = false;
		let totalAdded = 0;

		// 1. Handle cumulative results from shared devices (multi-student)
		if (
			data?.examActiveSession?.completedResults &&
			Array.isArray(data.examActiveSession.completedResults)
		) {
			data.examActiveSession.completedResults.forEach((res) => {
				const completedAt =
					res.completedAt || res.date || res.dateTaken || new Date().toISOString();
				const studentInfo = res.studentInfo || {};
				const resultId =
					res.id || `${res.examId}-${studentInfo.numero || 'anon'}-${completedAt}`;

				if (!existingResults.some((r) => r.id === resultId)) {
					const normalized = {
						id: resultId,
						examId: res.examId,
						examName: res.examName || res.examTitle,
						examTitle: res.examTitle || res.examName,
						mode: res.mode || 'exam',
						numero: studentInfo.numero || res.studentNumber || '',
						name: studentInfo.name || res.studentName || 'Unknown',
						class: studentInfo.class || res.className || '',
						classId: studentInfo.classId || res.classId || '',
						studentName: studentInfo.name || res.studentName || 'Unknown',
						studentNumber: studentInfo.numero || res.studentNumber || '',
						className: studentInfo.class || res.className || '',
						score: res.results?.score ?? res.score ?? 0,
						totalPoints: res.results?.totalPoints ?? res.totalPoints ?? 0,
						totalQuestions: res.results?.totalQuestions ?? res.totalQuestions ?? 0,
						answers: res.results?.answers ?? res.answers ?? [],
						timeSpent: res.results?.timeSpent ?? res.timeSpent ?? 0,
						date: completedAt,
						dateTaken: completedAt,
						results: res.results,
						deviceId: data.deviceId || socketId,
						deviceName: deviceName,
						deviceIp: deviceIp, // Capture IP
					};
					existingResults.push(normalized);
					totalAdded++;
					resultsChanged = true;
					logDeviceActivity(
						'receive_data',
						`Received result from ${deviceName}`,
						`Student: ${normalized.studentName}, IP: ${deviceIp}`,
						deviceName,
					);
				}
			});
		}

		// 2. Handle single active session result (backward compatibility)
		if (
			data?.examActiveSession?.results &&
			!data.examActiveSession.completedResults
		) {
			const session = data.examActiveSession;
			const completedAt = session.completedAt || new Date().toISOString();
			const studentInfo = session.studentInfo || {};
			const resId = `${session.examId}-${
				studentInfo.numero || 'anon'
			}-${data.deviceId || socketId}-${completedAt}`;

			if (!existingResults.some((r) => r.id === resId)) {
				const sessionResult = {
					id: resId,
					examId: session.examId,
					examName: session.examName,
					examTitle: session.examName,
					mode: session.mode || 'exam',
					numero: studentInfo.numero || '',
					name: studentInfo.name || 'Unknown',
					class: studentInfo.class || '',
					classId: studentInfo.classId || '',
					studentName: studentInfo.name || 'Unknown',
					studentNumber: studentInfo.numero || '',
					className: studentInfo.class || '',
					score: session.results.score || 0,
					totalPoints: session.results.totalPoints || 0,
					totalQuestions: session.results.totalQuestions || 0,
					answers: session.results.answers || [],
					timeSpent: session.results.timeSpent || 0,
					date: completedAt,
					dateTaken: completedAt,
					results: session.results,
					deviceId: data.deviceId || socketId,
					deviceName: deviceName,
					deviceIp: deviceIp, // Capture IP
				};
				existingResults.push(sessionResult);
				totalAdded++;
				resultsChanged = true;
				logDeviceActivity(
					'receive_data',
					`Received result from ${deviceName}`,
					`Student: ${sessionResult.studentName}, IP: ${deviceIp}`,
					deviceName,
				);
			}
		}

		// 3. Also handle training quizResults array
		if (data && data.quizResults && Array.isArray(data.quizResults)) {
			data.quizResults.forEach((result) => {
				const normalized = { ...result };
				const fallbackDate =
					normalized.date ||
					normalized.dateTaken ||
					normalized.completedAt ||
					new Date().toISOString();
				normalized.date = fallbackDate;
				normalized.dateTaken = normalized.dateTaken || fallbackDate;
				normalized.name = normalized.name || normalized.studentName || 'Unknown';
				normalized.studentName =
					normalized.studentName || normalized.name || 'Unknown';
				normalized.numero = normalized.numero || normalized.studentNumber || '';
				normalized.studentNumber =
					normalized.studentNumber || normalized.numero || '';
				normalized.class = normalized.class || normalized.className || '';
				normalized.className =
					normalized.className || normalized.class || '';
				normalized.examTitle =
					normalized.examTitle || normalized.examName || normalized.exam;

				const uniqueId =
					normalized.id ||
					`${normalized.numero || normalized.studentNumber}-${normalized.date}`;
				if (
					!existingResults.some(
						(r) =>
							r.id === uniqueId ||
							(r.studentNumber === normalized.studentNumber &&
								r.dateTaken === normalized.dateTaken),
					)
				) {
					// Add device name and IP to result
					normalized.deviceName = deviceName;
					normalized.deviceIp = deviceIp;
					existingResults.push(normalized);
					totalAdded++;
					resultsChanged = true;
				}
			});
		}

		if (resultsChanged) {
			window.__DI_CONTAINER__.repo.setAll_sync('results', existingResults);
			if (!silent) showRealtimeStatus(`Loaded ${totalAdded} results from ${deviceName}`, 'success');
			// Update UI if on results tab
			if (window.loadResults) window.loadResults();
		}

		// 4. Merge quizActivity from device
		if (data && data.quizActivity && Array.isArray(data.quizActivity)) {
			try {
				const existingActivity = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
				let activityAdded = 0;
				
				data.quizActivity.forEach(activity => {
					// Filter out 'noisy' or redundant activities
					// 'result' is now dynamically merged from quizResults in the UI
					if (activity.type === 'quiz_started' || activity.type === 'answer_submitted' || activity.type === 'result') return;

					// Handle different date field names and ensure string format for comparison
					const activityDate = activity.date || activity.timestamp || '';
					
					// De-duplicate by type, date, and studentNumber
					const isDuplicate = existingActivity.some(a => 
						a.type === activity.type && 
						(a.date || a.timestamp || '') === activityDate &&
						a.studentNumber === activity.studentNumber &&
						a.name === activity.name
					);

					if (!isDuplicate) {
						// Add device context if missing
						if (!activity.deviceName && deviceName) activity.deviceName = deviceName;
						if (!activity.deviceIp && deviceIp) activity.deviceIp = deviceIp;
						existingActivity.unshift(activity);
						activityAdded++;
					}
				});

				if (activityAdded > 0) {
					// Sort by date descending (newest first)
					existingActivity.sort((a, b) => {
						const dateA = new Date(a.date || a.timestamp || 0);
						const dateB = new Date(b.date || b.timestamp || 0);
						return dateB - dateA;
					});
					
					// Limit to 1000 entries
					const finalActivity = existingActivity.slice(0, 1000);
					window.__DI_CONTAINER__.repo.setAll_sync('audit_logs', finalActivity);
					console.log(`Merged ${activityAdded} activities from ${deviceName}`);
					
					// Refresh activity UI if available
					if (typeof window.renderRecentActivity === 'function') window.renderRecentActivity();
					if (typeof window.filterActivityTable === 'function') window.filterActivityTable();
				}
			} catch (e) {
				console.warn('Error merging quizActivity:', e);
			}
		}
	}

	/**
	 * Log device activity to quizActivity
	 */
	function logDeviceActivity(action, name, details, deviceName = null, meta = {}) {
		try {
			const activities = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
			const nameText = typeof name === 'string' ? name.trim() : '';
			const detailsText = typeof details === 'string' ? details.trim() : '';
			const deviceLabel = typeof deviceName === 'string' ? deviceName.trim() : '';

			if (!nameText && !detailsText) {
				return;
			}

			const dedupeActions = new Set([
				'sync_users',
				'sync_games',
				'sync_gamification',
				'push_settings',
				'clear_session',
				'push_exam',
				'stop_exam',
			]);

			if (dedupeActions.has(action)) {
				const isDuplicate = activities.some((a) => {
					if (!a || a.type !== 'device') return false;
					return (
						(a.action || '') === action &&
						(a.name || '') === nameText &&
						(a.details || '') === detailsText &&
						(a.deviceName || '') === deviceLabel
					);
				});
				if (isDuplicate) return;
			}

			const activityId =
				meta?.id ||
				(typeof generateUUID === 'function'
					? generateUUID()
					: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
			const activity = {
				id: activityId,
				type: 'device',
				action: action,
				name: nameText || name,
				details: detailsText || details,
				deviceName: deviceLabel || deviceName,
				meta: meta || {},
				date: new Date().toISOString(),
				author: 'Admin',
				isValid: true,
				icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
				color: 'icon-cyan'
			};
			activities.unshift(activity);
			window.__DI_CONTAINER__.repo.setAll_sync('audit_logs', activities);
		} catch (e) {
			console.warn('Could not log device activity:', e);
		}
	}
	window.logDeviceActivity = logDeviceActivity;

	/**
	 * Push DEFAULT Settings to all connected devices
	 */
	window.pushDefaultSettings = function () {
		if (!realtimeSocket || !realtimeSocket.connected) {
			showRealtimeStatus('Not connected to realtime server', 'error');
			return;
		}

		// Get base settings
		const appSettings = window.getAppSettings ? window.getAppSettings() : {};

		// Check if a preset is selected and apply its values
		const selectedPresetId = document.getElementById('setting-trainingPreset')?.value;
		let presetOverrides = {};
		let presetName = null;
		if (selectedPresetId && window.getPresetById) {
			const preset = window.getPresetById(selectedPresetId);
			if (preset) {
				presetName = preset.name;
				presetOverrides = {
					timeLimit: preset.timeLimit,
					penalty: preset.penalty,
					welcomeTitle: preset.welcomeTitle || '',
					welcomeMessage: preset.welcomeMessage || '',
					primaryColor: preset.primaryColor,
					shuffleQuestions: preset.shuffleQuestions,
					showExplanations: preset.showExplanations,
					passingScore: preset.passingScore,
				};
				console.log('Applying preset overrides:', presetName, presetOverrides);
			}
		}

		// Build settings - preset values take priority if set
		const settings = {
			...appSettings,
			...presetOverrides, // Apply preset values
			totalQuestions:
				parseInt(document.getElementById('setting-totalQuestions')?.value) ||
				presetOverrides.totalQuestions ||
				appSettings.totalQuestions ||
				5,
			timeLimit:
				presetOverrides.timeLimit ||
				parseInt(document.getElementById('setting-timeLimit')?.value) ||
				appSettings.timeLimit ||
				300,
			penalty:
				presetOverrides.penalty !== undefined ? presetOverrides.penalty :
				(parseInt(document.getElementById('setting-penalty')?.value) ||
				appSettings.penalty ||
				0),
			welcomeTitle:
				presetOverrides.welcomeTitle ||
				document.getElementById('setting-welcomeTitle')?.value ||
				appSettings.welcomeTitle ||
				'Quiz Portal',
			welcomeMessage:
				presetOverrides.welcomeMessage ||
				document.getElementById('setting-welcomeMessage')?.value ||
				appSettings.welcomeMessage ||
				'',
		};

		// Get uncategorized questions for training mode
		const allQuestions = JSON.parse(
			JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('questions')) || '[]',
		);

		// Filter for uncategorized questions (use 'category' field, not 'categoryId')
		// Questions are saved with 'category' field from questions-management.js
		let trainingQuestions = allQuestions.filter(
			(q) => !q.category || q.category === '' || q.category === 'uncategorized',
		);

		// Fallback: If no uncategorized, use the first 50 questions
		if (trainingQuestions.length === 0 && allQuestions.length > 0) {
			console.log('No uncategorized questions found, sending first 50.');
			trainingQuestions = allQuestions.slice(0, 50);
		}

		const payload = {
			quizSettings: settings,
			quizQuestions: trainingQuestions,
		};

		console.log('Pushing default settings:', {
			presetApplied: presetName || 'None',
			totalQuestionsInAdmin: allQuestions.length,
			uncategorizedQuestionsPushed: trainingQuestions.length,
			settingKeys: Object.keys(settings),
			settings: settings,
		});
		realtimeSocket.emit('admin:pushSettings', payload);
		
		const message = presetName 
			? `Pushed preset "${presetName}" + ${trainingQuestions.length} questions to devices`
			: `Pushed settings + ${trainingQuestions.length} questions to devices`;
		showRealtimeStatus(message, 'success');
		
		// Log activity
		logDeviceActivity('push_settings', message, `Time: ${settings.timeLimit}s, Penalty: ${settings.penalty}pts`);
	};

	/**
	 * Sync user accounts (students/teachers) to all connected clients
	 */
	window.syncUsersToClients = function () {
		const isAdmin =
			typeof window.Auth?.isAdmin === 'function' && window.Auth.isAdmin();
		if (!isAdmin) {
			showRealtimeStatus('Only admins can sync user accounts', 'error');
			return;
		}

		let users = [];
		try {
			const parsed = window.__DI_CONTAINER__.repo.getAll_sync('users');
			users = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			users = [];
		}
		users = users
			.filter(
				(user) => String(user?.role || '').toLowerCase() !== 'admin',
			)
			.map((user) => ({ ...user }));
		const scopeLabel = 'all students and teachers';
		const usersFingerprint = users
			.map((user) =>
				[
					String(user?.id || '').trim(),
					String(user?.updatedAt || '').trim(),
					String(user?.status || '').trim(),
					String(user?.role || '').trim(),
				].join(':'),
			)
			.filter(Boolean)
			.sort()
			.join('|');
		const now = Date.now();
		if (
			usersFingerprint &&
			usersFingerprint === lastUsersSyncFingerprint &&
			now - lastUsersSyncAt < USERS_SYNC_COOLDOWN_MS
		) {
			return;
		}
		if (userSyncInProgress) {
			return;
		}

		if (!users.length) {
			showRealtimeStatus('No users to sync', 'error');
			return;
		}

		const payload = {
			quizUsers: users,
			syncedAt: new Date().toISOString(),
			cache: true,
		};

		const emitSync = (socketInstance, isTemp = false) => {
			socketInstance.emit('admin:syncUsers', payload);
			lastUsersSyncFingerprint = usersFingerprint;
			lastUsersSyncAt = Date.now();
			showRealtimeStatus(
				`Synced ${users.length} user accounts (${scopeLabel})`,
				'success',
			);
			logDeviceActivity(
				'sync_users',
				`Synced ${users.length} user accounts (${scopeLabel})`,
				isTemp ? 'Temp connection used (realtime toggle off)' : 'Admins excluded from sync',
			);
		};

		if (realtimeSocket && realtimeSocket.connected) {
			userSyncInProgress = true;
			try {
				emitSync(realtimeSocket, false);
			} finally {
				userSyncInProgress = false;
			}
			return;
		}

		// Fallback: create a temporary socket just to push users
		const serverHost = getServerHost();
		if (typeof io === 'undefined') {
			showRealtimeStatus('Socket.IO not loaded', 'error');
			return;
		}

		showRealtimeStatus('Connecting to sync users...', 'info');
		const tempSocket = window.getSocket();
		let done = false;
		userSyncInProgress = true;

		const finishTempSync = () => {
			if (!done) done = true;
			userSyncInProgress = false;
			tempSocket.disconnect();
		};

		tempSocket.on('connect', () => {
			tempSocket.emit('identify', getAdminIdentifyPayload());
			emitSync(tempSocket, true);
			setTimeout(() => finishTempSync(), 500);
		});

		tempSocket.on('connect_error', (error) => {
			if (done) return;
			console.warn('[Realtime] Temp sync connection failed (server may be offline):', error && error.message);
			finishTempSync();
		});

		tempSocket.on('disconnect', () => {
			if (!done) {
				userSyncInProgress = false;
			}
		});
		};

		/**
		 * Sync games to all connected clients
		 */
		window.syncGamesToClients = function () {
			const isAdmin =
			typeof window.Auth?.isAdmin === 'function' && window.Auth.isAdmin();
		const isTeacher =
			typeof window.Auth?.isTeacher === 'function' && window.Auth.isTeacher();
		if (!isAdmin && !isTeacher) {
			showRealtimeStatus('Only admins or teachers can sync games', 'error');
			return;
		}

		const buildScopedGamesPayload = (sourceGames = []) => {
			let games = Array.isArray(sourceGames) ? sourceGames : [];
			let teacherScope = null;
			if (isTeacher && !isAdmin) {
				const currentUser =
					typeof window.Auth?.getCurrentUser === 'function'
						? window.Auth.getCurrentUser()
						: null;
				const classIds =
					typeof window.Auth?.getTeacherClassIds === 'function'
						? window.Auth.getTeacherClassIds()
						: [];
				const gameClassIds = Array.from(
					new Set(
						games
							.flatMap((game) =>
								Array.isArray(game?.classIds) ? game.classIds : [],
							)
							.filter(Boolean),
					),
				);
				const scopeClassIds = classIds.length ? classIds : gameClassIds;
				teacherScope = {
					type: 'teacher',
					teacherId: currentUser?.id || '',
					classIds: scopeClassIds,
					allowAll: !scopeClassIds.length,
				};
				games = games.filter((game) => {
					if (!game) return false;
					if (game.ownerId && currentUser && game.ownerId === currentUser.id) {
						return true;
					}
					const gameClasses = Array.isArray(game.classIds) ? game.classIds : [];
					if (!classIds.length) return false;
					return gameClasses.some((id) => classIds.includes(id));
				});
			}
			return { games, teacherScope };
		};

		const emitSync = (socketInstance, sourceGames, isTemp = false) => {
			const scoped = buildScopedGamesPayload(sourceGames);
			const games = scoped.games;
			if (!games.length) {
				showRealtimeStatus('No games to sync', 'error');
				return;
			}
			const payload = {
				quizGames: games,
				syncedAt: new Date().toISOString(),
				cache: true,
			};
			if (scoped.teacherScope) payload.scope = scoped.teacherScope;
			socketInstance.emit('admin:syncGames', payload);
			showRealtimeStatus(`Synced ${games.length} games`, 'success');
			logDeviceActivity(
				'sync_games',
				`Synced ${games.length} games`,
				isTemp ? 'Temp connection used (realtime toggle off)' : 'Admin sync',
			);
		};

		const localGames = window.GameCore?.getQuizGames
			? window.GameCore.getQuizGames()
			: window.__DI_CONTAINER__.repo.getAll_sync('games');

		const syncWithAuthoritativeList = (socketInstance, isTemp = false) => {
			if (typeof window.requestAuthoritativeGameList === 'function') {
				window.requestAuthoritativeGameList((serverGames) => {
					const sourceGames =
						Array.isArray(serverGames) && serverGames.length
							? serverGames
							: localGames;
					emitSync(socketInstance, sourceGames, isTemp);
				}, socketInstance);
				return true;
			}
			return false;
		};

		if (realtimeSocket && realtimeSocket.connected) {
			if (!syncWithAuthoritativeList(realtimeSocket, false)) {
				emitSync(realtimeSocket, localGames, false);
			}
			return;
		}

		const serverHost = getServerHost();
		if (typeof io === 'undefined') {
			showRealtimeStatus('Socket.IO not loaded', 'error');
			return;
		}

		showRealtimeStatus('Connecting to sync games...', 'info');
		const tempSocket = window.getSocket();
		let done = false;

		tempSocket.on('connect', () => {
			tempSocket.emit('identify', getAdminIdentifyPayload());
			if (!syncWithAuthoritativeList(tempSocket, true)) {
				emitSync(tempSocket, localGames, true);
			}
			done = true;
			setTimeout(() => tempSocket.disconnect(), 500);
		});

		tempSocket.on('connect_error', (error) => {
			if (done) return;
			console.warn('[Realtime] Temp sync games connection failed (server may be offline):', error && error.message);
			tempSocket.disconnect();
		});
	};

	function buildGamificationSyncPayload(configOverride = null) {
		let storedConfig = {};
		try {
			storedConfig = JSON.parse(localStorage.getItem('quizGamification') || '{}');
		} catch (e) {
			storedConfig = {};
		}

		const override =
			configOverride && typeof configOverride === 'object'
				? configOverride
				: {};
		const config = {
			expPerCorrect: Number.isFinite(Number(override.expPerCorrect))
				? Number(override.expPerCorrect)
				: Number(storedConfig.expPerCorrect) || 10,
			expPerWin: Number.isFinite(Number(override.expPerWin))
				? Number(override.expPerWin)
				: Number(storedConfig.expPerWin) || 100,
			autoAwardBadges:
				override.autoAwardBadges !== undefined
					? Boolean(override.autoAwardBadges)
					: storedConfig.autoAwardBadges !== false,
		};

		let activeTournament = null;
		try {
			const parsed = JSON.parse(
				localStorage.getItem('quizTournamentActive') || 'null',
			);
			activeTournament =
				parsed && typeof parsed === 'object' ? parsed : null;
		} catch (e) {
			activeTournament = null;
		}

		let tournamentsHistory = [];
		try {
			const parsed = JSON.parse(
				localStorage.getItem('quizTournamentsHistory') || '[]',
			);
			tournamentsHistory = Array.isArray(parsed) ? parsed : [];
		} catch (e) {
			tournamentsHistory = [];
		}

		return {
			quizGamification: config,
			quizTournamentActive: activeTournament,
			quizTournamentsHistory: tournamentsHistory,
			syncedAt: new Date().toISOString(),
			cache: true,
		};
	}

	window.syncGamificationSettings = function (configOverride = null) {
		const isAdmin =
			typeof window.Auth?.isAdmin === 'function' && window.Auth.isAdmin();
		if (!isAdmin) {
			showRealtimeStatus('Only admins can sync gamification settings', 'error');
			return;
		}

		const payload = buildGamificationSyncPayload(configOverride);
		const activeLabel = payload.quizTournamentActive?.name
			? `"${payload.quizTournamentActive.name}"`
			: 'No active tournament';
		const historyCount = Array.isArray(payload.quizTournamentsHistory)
			? payload.quizTournamentsHistory.length
			: 0;

		const emitSync = (socketInstance, isTemp = false) => {
			socketInstance.emit('admin:syncGamification', payload);
			localStorage.setItem('quizGamificationSyncedAt', payload.syncedAt);
			window.dispatchEvent(new CustomEvent('quiz:gamification-updated'));
			showRealtimeStatus('Synced gamification and tournament settings', 'success');
			logDeviceActivity(
				'sync_gamification',
				'Synced gamification settings',
				`${activeLabel} - history entries: ${historyCount}`,
				null,
				{
					source: isTemp ? 'temp_socket' : 'realtime',
					activeTournamentId: payload.quizTournamentActive?.id || '',
					historyCount,
				},
			);
		};

		if (realtimeSocket && realtimeSocket.connected) {
			emitSync(realtimeSocket, false);
			return;
		}

		const serverHost = getServerHost();
		if (typeof io === 'undefined') {
			showRealtimeStatus('Socket.IO not loaded', 'error');
			return;
		}

		showRealtimeStatus('Connecting to sync gamification settings...', 'info');
		const tempSocket = window.getSocket();
		let done = false;

		tempSocket.on('connect', () => {
			tempSocket.emit('identify', getAdminIdentifyPayload());
			emitSync(tempSocket, true);
			done = true;
			setTimeout(() => tempSocket.disconnect(), 500);
		});

		tempSocket.on('connect_error', (error) => {
			if (done) return;
			console.warn('[Realtime] Temp sync gamification connection failed (server may be offline):', error && error.message);
			tempSocket.disconnect();
		});
	};

	/**
	 * Clear remote keys from all connected devices
	 */
	window.clearRemoteKeys = function () {
		if (!realtimeSocket || !realtimeSocket.connected) {
			showRealtimeStatus('Not connected to realtime server', 'error');
			return;
		}

		const confirmed = confirm(
			'This will clear quizSettings, quizQuestions, and examActiveSession from all connected devices. Continue?',
		);
		if (!confirmed) return;

		realtimeSocket.emit('admin:clearSession');
		showRealtimeStatus('Sent clear command to all devices', 'success');
		
		// Log activity
		logDeviceActivity('clear_session', 'Cleared all remote device data', 'Removed quizSettings, quizQuestions, and examActiveSession');
	};

		// Sync Debounce Timer
		let syncDebounceTimer = null;

		/**
		 * Sync training questions and active exam to all connected clients
		 */
		let _lastSyncWarningAt = 0;
		window.syncQuestionsToClients = function () {
			// Check if Realtime is actually enabled
			const realtimeEnabled = document.getElementById('setting-realtimeEnabled')?.checked;
			
			// Basic Connection check
			if (!realtimeSocket || !realtimeSocket.connected) {
				// Throttle warning to once per 30s to avoid spam on every settings change
				const now = Date.now();
				if (realtimeEnabled && (now - _lastSyncWarningAt > 30_000)) {
					_lastSyncWarningAt = now;
					console.warn('Cannot sync: Realtime enabled but not connected to server');
					showRealtimeStatus('Sync failed: Not connected', 'error');
				}
				return;
			}

		// Use debounce to prevent spamming during bulk updates
		if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
		
		syncDebounceTimer = setTimeout(() => {
			console.log('Running Refined Broadcast Updates...');

			// 1. TRAINING SYNC: Settings + ONLY Uncategorized Questions
			const settings = window.getAppSettings ? window.getAppSettings() : (window.__DI_CONTAINER__.repo.getAll_sync('settings')[0] || {});
			const allQuestions = window.__DI_CONTAINER__.repo.getAll_sync('questions');
			const trainingQuestions = allQuestions.filter(
				(q) => !q.category && !q.categoryId
			);
			
			const trainingPayload = {
				quizSettings: settings,
				quizQuestions: trainingQuestions,
			};
			
			console.log('Syncing training data (Uncategorized only):', trainingQuestions.length);
			realtimeSocket.emit('admin:pushSettings', trainingPayload);

			// 2. ACTIVE EXAM SYNC: If an exam ID is tracked as active
			const activeExamId = localStorage.getItem('lastPushedExamId');
			if (activeExamId && window.createExamPackage) {
				const sessionPackage = window.createExamPackage(activeExamId);
				if (sessionPackage) {
					// Ensure it has a fresh timestamp so client processes it
					sessionPackage.pushedAt = Date.now();
					console.log('Syncing active exam changes:', sessionPackage.examName);
					realtimeSocket.emit('admin:pushSession', sessionPackage);
				}
			}

			showRealtimeStatus('Broadcast updates completed', 'success');
		}, 1000); // 1-second debounce
	};

	// State
	let filterOnlineOnly = false;
	let deviceHistory = [];

	// Load history on init
	try {
		deviceHistory = JSON.parse(localStorage.getItem('deviceHistory') || '[]');
	} catch (e) {
		console.error('Error loading device history:', e);
		deviceHistory = [];
	}

	/**
	 * Toggle Show Online Only filter
	 */
	window.toggleDeviceFilter = function () {
		filterOnlineOnly = !filterOnlineOnly;
		const btn = document.getElementById('btn-filter-online');
		if (btn) {
			if (filterOnlineOnly) {
				btn.classList.remove('btn-secondary');
				btn.classList.add('btn-primary'); // Highlight when active
				btn.innerHTML = `
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
					Showing Online Only
				`;
			} else {
				btn.classList.remove('btn-primary');
				btn.classList.add('btn-secondary');
				btn.innerHTML = `
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
					Show Online Only
				`;
			}
		}
		renderDevices();
	};

	/**
	 * Update device history with fresh online clients
	 */
	function updateDeviceHistory(onlineClients) {
		const allClients = Array.isArray(onlineClients) ? onlineClients : [];
		connectedDevices = allClients.filter((client) => client.status === 'online');
		const now = new Date().toISOString();

		// 1. Mark all existing devices as offline initially (unless we want to preserve 'offline' status)
		// Actually, simpler: iterate all history. If not in connectedDevices, mark offline.
		deviceHistory.forEach((d) => {
			if (!connectedDevices.some((c) => c.deviceId === d.deviceId)) {
				d.status = 'offline';
			}
		});

		// 2. Update or add connected devices
		connectedDevices.forEach((client) => {
			const existingIndex = deviceHistory.findIndex(
				(d) => d.deviceId === client.deviceId,
			);
			if (existingIndex >= 0) {
				// Update existing
				deviceHistory[existingIndex] = {
					...deviceHistory[existingIndex],
					...client,
					status: 'online',
					lastSeen: now,
				};
			} else {
				// Add new
				deviceHistory.push({
					...client,
					status: 'online',
					lastSeen: now,
					firstSeen: now,
				});
			}
		});

		// Save to storage
		localStorage.setItem('deviceHistory', JSON.stringify(deviceHistory));

		// Update header count (online devices)
		updateDeviceCount(connectedDevices.length);
		publishRealtimeState({
			connected: Boolean(realtimeSocket && realtimeSocket.connected),
			onlineDevices: connectedDevices.length,
			deviceCount: connectedDevices.length,
		});

		// Auto-sync logic
		const autoSyncEnabled = document.getElementById('setting-autoSync')?.checked;
		if (autoSyncEnabled) {
			connectedDevices.forEach((client) => {
				if (client.data) {
					handleDeviceData(client.socketId, client.data, true); // silent sync
				}
			});
		}

		// Render
		renderDevices();
	}

	/**
	 * Render devices list based on filter
	 */
	function renderDevices() {
		const container = document.getElementById('realtime-devices-list');
		if (!container) return;

		let devicesToShow = deviceHistory;

		if (filterOnlineOnly) {
			devicesToShow = deviceHistory.filter((d) => d.status === 'online');
		}

		// Sort: Online first, then by last seen
		devicesToShow.sort((a, b) => {
			if (a.status === 'online' && b.status !== 'online') return -1;
			if (a.status !== 'online' && b.status === 'online') return 1;
			return new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0);
		});

		if (devicesToShow.length === 0) {
			container.innerHTML = `
				<div style="padding: 30px; text-align: center; color: #9ca3af;">
					${filterOnlineOnly ? 'No online devices' : 'No devices found'}
				</div>
			`;
			return;
		}

		container.innerHTML = '';

		devicesToShow.forEach((device) => {
			const isOnline = device.status === 'online';
			const statusColor = isOnline ? '#10b981' : '#9ca3af';
			const statusBg = isOnline ? '#ecfdf5' : '#f3f4f6';
			const opacity = isOnline ? '1' : '0.7';

			const deviceEl = document.createElement('div');
			deviceEl.style.cssText = `
				padding: 12px;
				border-bottom: 1px solid #e5e7eb;
				display: flex;
				justify-content: space-between;
				align-items: center;
				transition: background 0.2s;
				opacity: ${opacity};
			`;

			deviceEl.onmouseover = () => {
				deviceEl.style.backgroundColor = '#f8fafc';
			};
			deviceEl.onmouseout = () => {
				deviceEl.style.backgroundColor = 'transparent';
			};

			deviceEl.innerHTML = `
				<div style="flex: 1;">
					<div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
						${escapeHtml(device.deviceId || device.name || 'Unknown Device')}
						<span style="font-size: 0.7em; padding: 2px 6px; border-radius: 99px; background: ${statusBg}; color: ${statusColor}; border: 1px solid ${statusColor}40;">
							${device.status}
						</span>
					</div>
					<div style="font-size: 0.85em; color: #6b7280;">
						${escapeHtml(device.ip || 'Unknown IP')}
					</div>
					<div style="font-size: 0.8em; color: #9ca3af; margin-top: 2px;">
						Last seen: ${device.lastSeen ? new Date(device.lastSeen).toLocaleTimeString() : 'Never'}
					</div>
				</div>
				<div style="display: flex; gap: 8px; margin-left: 12px;">
					${
						isOnline
							? `
					<button type="button" class="btn btn-secondary btn-sm" onclick="window.requestDeviceData('${device.socketId}')" title="Request data">
						Request
					</button>
					`
							: ''
					}
					<button type="button" class="btn btn-secondary btn-sm" onclick="window.downloadDeviceData('${device.socketId}')" title="Download data" ${!isOnline ? 'disabled' : ''}>
						Download
					</button>
				</div>
			`;
			container.appendChild(deviceEl);
		});
	}

	/**
	 * Escape HTML to prevent XSS
	 */
	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
})();
