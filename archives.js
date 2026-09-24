/**
 * archives.js — School Year Archives (admin Settings → Data)
 *
 * Groups the whole school year into one "folder": classes, students, teachers,
 * categories, questions, exams, games, tournaments and results. A folder is a
 * snapshot stored server-side (one per school + year); archiving again
 * overwrites it, live data is never touched.
 *
 *   Archive this year  → collect all stores → POST /api/v1/archives
 *   Import file        → parse an archive JSON → POST (adds/replaces the folder)
 *   View               → GET /api/v1/archives/:year → read-only preview modal
 *   Download file      → GET payload → local JSON download
 *   Delete             → DELETE /api/v1/archives/:year
 *
 * Load AFTER settings.js (reuses collectAllStores / showToast / API client).
 */
(function () {
	'use strict';

	if (window.Archives) return;

	var STORE_LABELS = {
		classes: 'Classes',
		users: 'Students & teachers',
		categories: 'Categories',
		questions: 'Questions',
		exams: 'Exams',
		exam_questions: 'Exam questions',
		exam_classes: 'Exam classes',
		games: 'Games',
		game_presets: 'Game presets',
		tournaments: 'Tournaments',
		tournament_entries: 'Tournament entries',
		tournament_history: 'Tournament history',
		game_sessions: 'Game sessions',
		exam_sessions: 'Exam sessions',
		results: 'Results',
		activity: 'Activity log',
		profile_requests: 'Profile requests',
		account_requests: 'Account requests',
		notifications: 'Notifications',
		teacher_messages: 'Teacher messages',
		teacher_assignments: 'Teacher assignments',
		settings: 'Settings',
		gamification: 'Gamification',
	};

	// Priority order when showing a compact summary on list rows.
	var SUMMARY_ORDER = ['users', 'classes', 'questions', 'exams', 'games', 'tournaments', 'results'];

	var currentPreview = null; // { year, archive }

	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function toast(message, type) {
		if (typeof showToast === 'function') showToast(message, type);
		else if (window.showToast) window.showToast(message, type);
	}

	function countValue(value) {
		if (Array.isArray(value)) return value.length;
		if (value && typeof value === 'object') return Object.keys(value).length;
		return value == null ? 0 : 1;
	}

	function formatBytes(bytes) {
		if (!bytes && bytes !== 0) return '';
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	function formatDate(iso) {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString();
		} catch (e) {
			return String(iso);
		}
	}

	function summarize(stats) {
		if (!stats) return 'No summary';
		var parts = SUMMARY_ORDER.map(function (key) {
			var count = countValue(stats[key]);
			return count > 0 ? count + ' ' + (key === 'users' ? 'people' : STORE_LABELS[key].toLowerCase()) : null;
		}).filter(Boolean);
		return parts.length ? parts.join(' · ') : 'Empty snapshot';
	}

	function storeItemCount(data, key) {
		return data[key] ? countValue(data[key]) : 0;
	}

	// ── School profile (for the current-year badge) ─────────────────────────
	function fetchSchoolProfile() {
		if (window.API && window.API.raw) {
			return window.API
				.raw('GET', '/school/profile/full')
				.then(function (profile) {
					var badge = document.getElementById('archivesCurrentYearBadge');
					if (badge) {
						badge.textContent = profile && profile.school_year ? '📅 ' + profile.school_year : 'Add a school year (School info)';
						badge.title = (profile && profile.school_year)
							? 'Current school year: ' + profile.school_year
							: 'Set the School Year in the School Information panel (Quick Start).';
					}
					return profile;
				})
				.catch(function () {
					return null;
				});
		}
		return Promise.resolve(null);
	}

	function exportFile(data, fileName) {
		var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		setTimeout(function () {
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}, 200);
	}

	function safeName(s) {
		return String(s || 'archive').replace(/[^A-Za-z0-9\-_.]+/g, '-');
	}

	// ── List ─────────────────────────────────────────────────────────────────
	function archivesRefresh() {
		var listEl = document.getElementById('archivesList');
		if (!listEl) return Promise.resolve();
		listEl.innerHTML = '<p class="text-muted">Loading archives…</p>';

		return Promise.all([fetchSchoolProfile(), window.API.raw('GET', '/archives')])
			.then(function (results) {
				var items = (results[1] && results[1].items) || [];
				renderList(items);
			})
			.catch(function (err) {
				listEl.innerHTML =
					'<p class="text-muted">Failed to load archives: ' +
					esc(err && err.message ? err.message : 'network error') +
					'</p>';
			});
	}

	function renderList(items) {
		var listEl = document.getElementById('archivesList');
		if (!listEl) return;
		if (!items.length) {
			listEl.innerHTML =
				'<p class="text-muted" style="margin:0;">No archives yet. Click <strong>Archive this year</strong> to save the current school year.</p>';
			return;
		}
		listEl.innerHTML =
			'<div class="archives-items">' +
			items
				.map(function (item) {
					var meta = [];
					if (item.year) meta.push('📅 ' + esc(item.year));
					if (item.created_at) meta.push(formatDate(item.created_at));
					var size = formatBytes(item.size_bytes);
					if (size) meta.push(size);
					return (
						'<div class="archives-item" data-archive-year="' + esc(item.year) + '">' +
						'<div class="archives-item-main">' +
						'<div class="archives-item-title">📁 ' + esc(item.label || item.year || 'Archive') + '</div>' +
						'<div class="archives-item-meta">' + (meta.length ? meta.join(' · ') : '') + '</div>' +
						'<div class="archives-item-summary">' + esc(summarize(item.stats)) + '</div>' +
						'</div>' +
						'<div class="archives-item-actions">' +
						'<button type="button" class="btn btn-sm btn-secondary" onclick="window.archivesOpenPreview(' + JSON.stringify(item.year) + ')">View</button>' +
						'<button type="button" class="btn btn-sm btn-secondary" onclick="window.archivesExportByYear(' + JSON.stringify(item.year) + ')">Download</button>' +
						'<button type="button" class="btn btn-sm btn-danger-ghost" onclick="window.archivesDeleteByYear(' + JSON.stringify(item.year) + ')">Delete</button>' +
						'</div>' +
						'</div>'
					);
				})
				.join('') +
			'</div>';
	}

	// ── Create (snapshot current data) ──────────────────────────────────────
	function resolveYearFromProfile(profile) {
		if (profile && profile.school_year) return profile.school_year;
		var now = new Date();
		var y = now.getFullYear();
		var suggested = now.getMonth() + 1 >= 9 ? y + '-' + (y + 1) : y - 1 + '-' + y;
		return suggested;
	}

	function archivesCreate() {
		if (typeof collectAllStores !== 'function') {
			toast('Archive engine not ready (settings.js missing)', 'error');
			return;
		}
		var btn = document.querySelector('#archivesSettingsGroup [onclick="window.archivesCreate()"]');
		var btnHtml = btn ? btn.innerHTML : '';
		if (btn) {
			btn.disabled = true;
			btn.textContent = 'Saving…';
		}

		fetchSchoolProfile()
			.then(function (profile) {
				var suggested = resolveYearFromProfile(profile);
				var year = window.prompt(
					'Archive this school year.\n\nFolder label (e.g. "2025-2026"):',
					suggested,
				);
				if (year === null || !String(year).trim()) return null;
				year = String(year).trim();

				var data = collectAllStores() || {};
				var stats = {};
				Object.keys(data).forEach(function (key) {
					stats[key] = countValue(data[key]);
				});

				var snapshot = {
					format: 'quiz-year-archive',
					formatVersion: 1,
					archivedAt: new Date().toISOString(),
					school: {
						name: profile && profile.name ? profile.name : '',
						school_year: profile && profile.school_year ? profile.school_year : year,
					},
					year: year,
					data: data,
				};

				return window.API
					.raw('POST', '/archives', {
						year: year,
						label: '',
						data: snapshot,
						stats: stats,
					})
					.then(function () {
						toast('Archived school year ' + year + ' — live data untouched', 'success');
						archivesRefresh();
					});
			})
			.catch(function (err) {
				toast('Failed to archive: ' + (err && err.message ? err.message : 'network error'), 'error');
			})
			.finally(function () {
				if (btn) {
					btn.disabled = false;
					btn.innerHTML = btnHtml;
				}
			});
	}

	// ── Import from file ────────────────────────────────────────────────────
	function normalizeImported(json) {
		if (!json || typeof json !== 'object') return null;
		// Full re-export/newer archive: { format, year, data }
		if (json.format === 'quiz-year-archive' && json.data && typeof json.data === 'object') {
			return { year: json.year || null, label: json.label || json.year || null, data: json.data };
		}
		// Plain year envelope: { year, data }
		if (json.year && json.data && typeof json.data === 'object') {
			return { year: json.year, label: json.label || null, data: json.data };
		}
		// Existing app backup: { type:'quiz-app-backup', data: {...stores} }
		if (json.data && typeof json.data === 'object') {
			var stores = json.data;
			var hasStore = Object.keys(STORE_LABELS).some(function (k) {
				return Object.prototype.hasOwnProperty.call(stores, k);
			});
			if (hasStore) return { year: json.year || null, label: null, data: stores };
		}
		// Bare store map at the top level.
		var bare = {};
		var found = false;
		Object.keys(STORE_LABELS).forEach(function (k) {
			if (Object.prototype.hasOwnProperty.call(json, k)) {
				bare[k] = json[k];
				found = true;
			}
		});
		if (found) return { year: json.year || null, label: null, data: bare };
		return null;
	}

	function archivesImportFile(input) {
		if (!input || !input.files || !input.files[0]) return;
		var file = input.files[0];
		var reader = new FileReader();
		reader.onload = function () {
			var parsed;
			try {
				parsed = JSON.parse(String(reader.result || ''));
			} catch (e) {
				toast('The file is not valid JSON.', 'error');
				input.value = '';
				return;
			}
			var normalized = normalizeImported(parsed);
			if (!normalized) {
				toast('This file does not look like an archive or backup.', 'error');
				input.value = '';
				return;
			}

			var finish = function (year) {
				if (!year || !String(year).trim()) {
					toast('A school-year label is required.', 'error');
					input.value = '';
					return;
				}
				year = String(year).trim();
				var stats = {};
				Object.keys(normalized.data || {}).forEach(function (key) {
					stats[key] = countValue(normalized.data[key]);
				});
				var snapshot = {
					format: 'quiz-year-archive',
					formatVersion: 1,
					archivedAt: new Date().toISOString(),
					importedFrom: file.name,
					school: parsed && parsed.school ? parsed.school : null,
					year: year,
					data: normalized.data,
				};
				window.API
					.raw('POST', '/archives', {
						year: year,
						label: normalized.label || '',
						data: snapshot,
						stats: stats,
					})
					.then(function () {
						toast('Archive folder for ' + year + ' imported', 'success');
						input.value = '';
						archivesRefresh();
					})
					.catch(function (err) {
						toast('Failed to import: ' + (err && err.message ? err.message : 'network error'), 'error');
						input.value = '';
					});
			};

			if (normalized.year && String(normalized.year).trim()) {
				finish(normalized.year);
			} else {
				var suggested = resolveYearFromProfile({});
				var year = window.prompt('This file has no school-year label.\n\nUse folder label:' , suggested);
				finish(year == null ? '' : year);
			}
		};
		reader.readAsText(file);
	}

	// ── Preview modal ───────────────────────────────────────────────────────
	function archivesOpenPreview(year) {
		var modal = document.getElementById('archivePreviewModal');
		if (!modal) return;
		// Modal is authored inside a hidden ancestor (#aiGeneratorModal), so pull
		// it up to <body> first or it can never render (same pattern as
		// openResetDataModal/openQuickStart).
		if (modal.parentElement && modal.parentElement !== document.body) {
			document.body.appendChild(modal);
		}
		modal.style.display = 'flex';
		var body = document.getElementById('archivePreviewBody');
		if (body) body.innerHTML = '<p class="text-muted">Loading…</p>';
		window.API
			.raw('GET', '/archives/' + encodeURIComponent(year))
			.then(function (archive) {
				currentPreview = { year: year, archive: archive };
				renderPreview(archive);
			})
			.catch(function (err) {
				if (body) body.innerHTML = '<p class="text-muted">Failed to load: ' + esc(err && err.message ? err.message : 'error') + '</p>';
			});
	}

	function renderPreview(archive) {
		var body = document.getElementById('archivePreviewBody');
		if (!body) return;

		var data = archive.data || {};
		var stats = archive.stats || {};
		Object.keys(data).forEach(function (k) {
			if (!(k in stats)) stats[k] = countValue(data[k]);
		});

		var ordered = SUMMARY_ORDER.slice();
		Object.keys(stats).forEach(function (k) {
			if (ordered.indexOf(k) === -1) ordered.push(k);
		});

		var statsHtml = ordered
			.filter(function (k) {
				return countValue(stats[k]) > 0 || data[k] !== undefined;
			})
			.map(function (k) {
				var label = STORE_LABELS[k] || k;
				var count = data[k] !== undefined ? countValue(data[k]) : countValue(stats[k]);
				return (
					'<div class="archive-stat">' +
					'<div class="archive-stat-count">' + count + '</div>' +
					'<div class="archive-stat-label">' + esc(label) + '</div>' +
					'</div>'
				);
			})
			.join('');

		body.innerHTML =
			'<div class="archive-preview-meta">' +
			'<span>📅 ' + esc(archive.year) + '</span>' +
			(archive.label ? '<span class="archive-preview-label">' + esc(archive.label) + '</span>' : '') +
			(archive.created_at ? '<span>Saved ' + esc(formatDate(archive.created_at)) + '</span>' : '') +
			(formatBytes(archive.size_bytes) ? '<span>' + esc(formatBytes(archive.size_bytes)) + '</span>' : '') +
			'</div>' +
			'<h4 style="margin:16px 0 8px;">Contents</h4>' +
			'<div class="archive-stats">' + (statsHtml || '<p class="text-muted">Empty snapshot</p>') + '</div>' +
			'<h4 style="margin:20px 0 8px;">Browse a section</h4>' +
			'<select id="archivePreviewStore" class="form-control archive-store-select" onchange="window.archivesPreviewStoreChanged()">' +
			'<option value="">— select a section —</option>' +
			ordered.filter(function (k) { return data[k] !== undefined; }).map(function (k) {
				return '<option value="' + esc(k) + '">' + esc(STORE_LABELS[k] || k) + ' (' + countValue(data[k]) + ')</option>';
			}).join('') +
			'</select>' +
			'<div id="archivePreviewStoreTable" class="archive-store-table-wrap"><p class="text-muted">Select a section above to preview its rows.</p></div>' +
			'<h4 style="margin:20px 0 8px;">Raw JSON</h4>' +
			'<textarea class="archive-json-view" id="archivePreviewJson" readonly spellcheck="false"></textarea>';
		document.getElementById('archivePreviewJson').value = JSON.stringify(archive, null, 2);
	}

	function archivesPreviewStoreChanged() {
		var body = document.getElementById('archivePreviewBody');
		var wrap = document.getElementById('archivePreviewStoreTable');
		if (!body || !wrap || !currentPreview) return;
		var select = document.getElementById('archivePreviewStore');
		var key = select.value;
		if (!key) {
			wrap.innerHTML = '<p class="text-muted">Select a section above to preview its rows.</p>';
			return;
		}
		var data = (currentPreview.archive && currentPreview.archive.data) || {};
		var rows = data[key];
		if (!Array.isArray(rows) || !rows.length) {
			wrap.innerHTML = '<p class="text-muted">This section is empty or uses a different shape.</p>';
			return;
		}
		var preview = rows.slice(0, 50);
		var tableHtml =
			'<div class="archive-table-head">' +
			esc(STORE_LABELS[key] || key) +
			' — showing ' + preview.length + ' of ' + rows.length + ' rows</div>' +
			'<table class="archive-table"><thead><tr><th>#</th><th>Row</th></tr></thead><tbody>';
		preview.forEach(function (row, i) {
			var text = JSON.stringify(row);
			tableHtml += '<tr><td>' + (i + 1) + '</td><td class="archive-table-row"><code>' + esc(text && text.length > 300 ? text.slice(0, 300) + '…' : text) + '</code></td></tr>';
		});
		tableHtml += '</tbody></table>';
		wrap.innerHTML = tableHtml;
	}

	function archivesClosePreview() {
		currentPreview = null;
		var modal = document.getElementById('archivePreviewModal');
		if (modal) modal.style.display = 'none';
	}

	// ── Export / delete ─────────────────────────────────────────────────────
	function archiveFilePayload(archive) {
		var data = archive && archive.data ? archive.data : null;
		return data || null;
	}

	function archivesExportByYear(year) {
		window.API
			.raw('GET', '/archives/' + encodeURIComponent(year))
			.then(function (archive) {
				var payload = archiveFilePayload(archive) || archive;
				var fileName = 'school-year-' + safeName(year) + '-archive.json';
				exportFile(payload, fileName);
				toast('Downloaded ' + fileName, 'success');
			})
			.catch(function (err) {
				toast('Failed to download: ' + (err && err.message ? err.message : 'network error'), 'error');
			});
	}

	function archivesExportCurrent() {
		if (!currentPreview) return;
		archivesExportByYear(currentPreview.year);
	}

	/**
	 * Export the archive folder for the current school year, falling back to
	 * the most recently saved archive. Used by the "Export year snapshot"
	 * button in Settings → Data.
	 */
	function archivesExportLatest() {
		if (!window.API || !window.API.raw) {
			toast('Server API unavailable', 'error');
			return;
		}
		Promise.all([fetchSchoolProfile(), window.API.raw('GET', '/archives')])
			.then(function (results) {
				var profile = results[0] || null;
				var items = (results[1] && results[1].items) || [];
				if (!items.length) {
					toast(
						'No shelf year archive yet — click "Archive this year" first.',
						'error',
					);
					return;
				}
				var currentYear =
					profile && profile.school_year
						? String(profile.school_year).trim()
						: '';
				var target = null;
				if (currentYear) {
					target =
						items.find(
							(it) => String(it.year || '').trim() === currentYear,
						) || null;
				}
				if (!target) {
					target = items.slice().sort(function (a, b) {
						return String(b.created_at || '').localeCompare(
							String(a.created_at || ''),
						);
					})[0];
				}
				if (!target) {
					toast('No shelf year archive found.', 'error');
					return;
				}
				archivesExportByYear(target.year);
			})
			.catch(function (err) {
				toast(
					'Failed to export: ' +
						(err && err.message ? err.message : 'network error'),
					'error',
				);
			});
	}

	function deleteArchiveByYear(year, silent) {
		window.API
			.raw('DELETE', '/archives/' + encodeURIComponent(year))
			.then(function () {
				if (!silent) toast('Archive folder ' + year + ' deleted', 'success');
				archivesClosePreview();
				archivesRefresh();
			})
			.catch(function (err) {
				toast('Failed to delete: ' + (err && err.message ? err.message : 'network error'), 'error');
			});
	}

	function archivesDeleteByYear(year) {
		if (!window.confirm('Delete the archive folder for ' + year + '?\n\nThe saved snapshot will be removed. Your live data is not affected.')) return;
		deleteArchiveByYear(year, true);
	}

	function archivesDeleteCurrent() {
		if (!currentPreview) return;
		if (!window.confirm('Delete the archive folder for ' + currentPreview.year + '?\n\nThe saved snapshot will be removed. Your live data is not affected.')) return;
		deleteArchiveByYear(currentPreview.year, true);
	}

	// ── Exports ─────────────────────────────────────────────────────────────
	window.Archives = {
		refresh: archivesRefresh,
		create: archivesCreate,
		importFile: archivesImportFile,
		openPreview: archivesOpenPreview,
		closePreview: archivesClosePreview,
		exportByYear: archivesExportByYear,
		exportCurrent: archivesExportCurrent,
		exportLatest: archivesExportLatest,
		deleteByYear: archivesDeleteByYear,
		deleteCurrent: archivesDeleteCurrent,
	};
	window.archivesRefresh = archivesRefresh;
	window.archivesCreate = archivesCreate;
	window.archivesImportFile = archivesImportFile;
	window.archivesOpenPreview = archivesOpenPreview;
	window.archivesClosePreview = archivesClosePreview;
	window.archivesExportByYear = archivesExportByYear;
	window.archivesExportCurrent = archivesExportCurrent;
	window.archivesExportLatest = archivesExportLatest;
	window.archivesDeleteByYear = archivesDeleteByYear;
	window.archivesDeleteCurrent = archivesDeleteCurrent;
	window.archivesPreviewStoreChanged = archivesPreviewStoreChanged;

	// ── Init ────────────────────────────────────────────────────────────────
	function hasSessionToken() {
		try {
			if (window.__authToken) return true;
			var s = JSON.parse(localStorage.getItem('quizSession') || sessionStorage.getItem('quizSession') || 'null');
			return !!(s && s.token);
		} catch (e) {
			return false;
		}
	}

	function init() {
		var listEl = document.getElementById('archivesList');
		if (!listEl) return;
		// Only fetch once signed in; the Settings → Data tab switch also
		// triggers a refresh when opened, so nothing is missed after login.
		if (hasSessionToken() && window.API && window.API.raw) {
			archivesRefresh();
		} else {
			listEl.innerHTML = '<p class="text-muted">Open this tab after signing in to load archives.</p>';
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();