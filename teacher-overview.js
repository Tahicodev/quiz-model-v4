// ============================================================
// TEACHER OVERVIEW — MONITORING DASHBOARD
// ============================================================
// Teacher Overview only. Admins keep the school-wide Overview (server
// /admin/overview) and the legacy blocks as their fallback, untouched.
//
// Architectural rule: this module NEVER manages data. It displays a
// server-aggregated monitoring bundle and every action navigates to the
// existing module (Courses, Questions, Exams, Classes, Results, Games).
// No CRUD, no duplicate forms, no alternate management workflow lives here.
//
// Design rule: reuse the application design system (.toolbar, .stat-card,
// .dashboard-panel, .data-table, .btn) instead of a private dashboard skin,
// so the Overview reads like every other module and follows the shared
// light/dark theme tokens.
//
// Data comes from GET /api/v1/teacher-overview/overview (teacher JWT scope).
// Nothing is fabricated: unavailable metrics render an explicit explanation.

(function () {
	'use strict';

	const PERIODS = [
		{ key: 'week', label: 'This week' },
		{ key: 'month', label: 'This month' },
		{ key: 'term', label: 'This term' },
		{ key: 'custom', label: 'Custom range' },
	];

	const state = {
		loading: false,
		error: null,
		data: null,
		lastLoadAt: 0,
		requestToken: 0,
		options: { classes: [], subjects: [] },
		filters: { classIds: [], subjectIds: [], period: 'month', from: '', to: '' },
		attentionFilter: 'all',
		attentionSort: 'priority',
	};

	let linkRegistry = [];

	// ── helpers ────────────────────────────────────────────────────────────

	function isTeacherSession() {
		try {
			if (window.Auth?.isAdmin && window.Auth.isAdmin()) return false;
			const user = window.Auth?.getCurrentUser?.() || window.currentUser || null;
			return String(user?.role || '').toLowerCase() === 'teacher';
		} catch (_) {
			return false;
		}
	}

	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function trimNumber(value) {
		const n = Number(value);
		if (!Number.isFinite(n)) return '—';
		const rounded = Math.round(n * 10) / 10;
		return String(rounded);
	}

	function fmt20(value) {
		if (value == null || !Number.isFinite(Number(value))) return '—';
		return `${trimNumber(value)}/20`;
	}

	function fmtPct(value) {
		if (value == null || !Number.isFinite(Number(value))) return '—';
		return `${trimNumber(value)}%`;
	}

	function fmtCount(value) {
		return value == null || !Number.isFinite(Number(value)) ? '—' : String(value);
	}

	function dateText(iso) {
		if (!iso) return '—';
		const d = new Date(iso);
		if (!Number.isFinite(d.getTime())) return '—';
		return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
	}

	function dateTimeText(iso) {
		if (!iso) return '—';
		const d = new Date(iso);
		if (!Number.isFinite(d.getTime())) return '—';
		return d.toLocaleString(undefined, {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function greetingWord() {
		const h = new Date().getHours();
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	}

	function severityBadge(severity) {
		const map = {
			high: { cls: 'badge-rose', label: 'Priority' },
			medium: { cls: 'badge-amber', label: 'Watch' },
			info: { cls: 'badge-blue', label: 'Info' },
			positive: { cls: 'badge-green', label: 'Positive' },
		};
		const tone = map[severity] || map.info;
		return `<span class="badge ${tone.cls}">${esc(tone.label)}</span>`;
	}

	function trendBadge(trend, delta, suffix = ' pts') {
		if (trend == null) return '';
		const cls =
			trend === 'up'
				? 'teacher-overview__trend--up'
				: trend === 'down'
					? 'teacher-overview__trend--down'
					: 'teacher-overview__trend--muted';
		const glyph = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '•';
		const text = delta == null ? 'stable' : `${delta > 0 ? '+' : ''}${trimNumber(delta)}${suffix}`;
		return `<span class="teacher-overview__trend ${cls}">${glyph} ${esc(text)}</span>`;
	}

	function registerLink(link, label, className, title) {
		const index = linkRegistry.push(link) - 1;
		return `<button type="button" class="${className || 'teacher-overview__link'}" data-tov-link="${index}"${
			title ? ` title="${esc(title)}"` : ''
		}>${esc(label)}</button>`;
	}

	function emptyState(title, message) {
		return `<p class="empty-state-small teacher-overview__empty"><strong>${esc(title)}</strong> ${esc(
			message,
		)}</p>`;
	}

	function unavailableNote(text) {
		if (!text) return '';
		return `<p class="teacher-overview__note text-muted">${esc(text)}</p>`;
	}

	// ── data ───────────────────────────────────────────────────────────────

	function params() {
		const f = state.filters;
		return {
			classIds: f.classIds.join(','),
			subjectIds: f.subjectIds.join(','),
			period: f.period,
			from: f.period === 'custom' ? f.from : '',
			to: f.period === 'custom' ? f.to : '',
		};
	}

	async function load(opts = {}) {
		const host = document.getElementById('teacherOverview');
		if (!host || !isTeacherSession()) return;
		if (state.loading && !opts.force) return;
		const now = Date.now();
		if (!opts.force && state.data && now - state.lastLoadAt < 1200) return;

		const token = ++state.requestToken;
		state.loading = true;
		state.error = null;
		if (!state.data) renderShell();

		try {
			if (!window.API || typeof window.API.list !== 'function') {
				throw new Error('The REST client is not available. Reload the page.');
			}
			const payload = await window.API.list('teacher-overview/overview', params());
			if (token !== state.requestToken) return;
			const data = payload && payload.data;
			if (!data || !data.sections) throw new Error('Unexpected analytics response.');
			state.data = data;
			state.lastLoadAt = Date.now();
			cacheOptions(data.meta);
			// Clear the loading flag BEFORE rendering: filtersHtml() and the
			// Refresh button read it, and rendering while it is still true
			// stamped every filter with `disabled` until the next reload.
			state.loading = false;
			render();
		} catch (err) {
			if (token !== state.requestToken) return;
			state.error = err && err.message ? err.message : 'The dashboard could not be loaded.';
			state.loading = false;
			render();
		} finally {
			if (token === state.requestToken) state.loading = false;
		}
	}

	function cacheOptions(meta) {
		const scope = (meta && meta.scope) || {};
		const classes = Array.isArray(scope.allClasses) ? scope.allClasses : [];
		const subjects = Array.isArray(scope.subjects) ? scope.subjects : [];
		state.options = { classes, subjects };
		// Drop selections that no longer exist after a scope change.
		state.filters.classIds = state.filters.classIds.filter((id) =>
			classes.some((c) => String(c.id) === String(id)),
		);
		state.filters.subjectIds = state.filters.subjectIds.filter((id) =>
			subjects.some((s) => String(s.id) === String(id)),
		);
	}

	function clearFilters() {
		state.filters = { classIds: [], subjectIds: [], period: 'month', from: '', to: '' };
		state.attentionFilter = 'all';
		state.attentionSort = 'priority';
		load({ force: true });
	}

	// ── navigation (existing modules only) ─────────────────────────────────

	function focusResultSearch(query) {
		if (!query) return;
		const input = document.getElementById('resultSearch');
		if (!input) return;
		input.value = query;
		try {
			window.filterResults?.();
		} catch (_) {
			/* filter helper is optional */
		}
	}

	function openLink(link) {
		if (!link) return;
		const action = String(link.action || '');
		if (action === 'attention') {
			document.getElementById('tov-attention')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			return;
		}
		if (action === 'progress') {
			document.getElementById('tov-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			return;
		}
		if (action === 'exam-analysis' && link.id && typeof window.openExamAnalysis === 'function') {
			if (typeof window.openTab === 'function') window.openTab(null, 'exams');
			setTimeout(() => {
				try {
					window.openExamAnalysis(link.id);
				} catch (_) {
					/* exam module unavailable — tab is still open */
				}
			}, 60);
			return;
		}
		if (action === 'exam-results') {
			if (typeof window.openTab === 'function') window.openTab(null, 'results');
			const examFilter = document.getElementById('resultFilterExam');
			if (examFilter && link.id) {
				examFilter.value = link.id;
				if (examFilter.value === String(link.id)) {
					try {
						window.filterResults?.();
					} catch (_) {
						/* results module unavailable — tab is still open */
					}
					return;
				}
				examFilter.value = '';
			}
			focusResultSearch(link.query);
			try {
				window.filterResults?.();
			} catch (_) {
				/* results module unavailable — tab is still open */
			}
			return;
		}
		if (action === 'course' && link.id && typeof window.openCourseDetail === 'function') {
			if (typeof window.openTab === 'function') window.openTab(null, 'subjects');
			setTimeout(() => {
				try {
					window.openCourseDetail(link.id);
				} catch (_) {
					/* course detail unavailable — tab is still open */
				}
			}, 60);
			return;
		}
		if (action === 'category') {
			if (typeof window.openTab === 'function') window.openTab(null, 'questions');
			const input = document.getElementById('searchQuestions');
			if (input && link.query) {
				input.value = link.query;
				try {
					window.filterQuestions?.();
				} catch (_) {
					/* filter helper is optional */
				}
			}
			return;
		}
		if (action === 'student') {
			if (typeof window.openTab === 'function') window.openTab(null, 'results');
			focusResultSearch(link.query);
			return;
		}
		if (action === 'class') {
			if (typeof window.openTab === 'function') window.openTab(null, 'results');
			const classFilter = document.getElementById('resultFilterClass');
			if (classFilter && link.id) {
				classFilter.value = link.id;
				if (classFilter.value === String(link.id)) {
					try {
						window.filterResults?.();
					} catch (_) {
						/* results module unavailable — tab is still open */
					}
					return;
				}
				classFilter.value = '';
			}
			focusResultSearch(link.query);
			return;
		}
		if (action === 'subject') {
			if (typeof window.openTab === 'function') window.openTab(null, 'subjects');
			return;
		}
		if (link.tab && typeof window.openTab === 'function') window.openTab(null, link.tab);
	}

	// ── shell (header + filters) ───────────────────────────────────────────

	function renderShell() {
		const host = document.getElementById('teacherOverview');
		if (!host) return;
		const data = state.data;
		const meta = (data && data.meta) || {};
		host.hidden = false;
		host.innerHTML = `${headerHtml(meta)}${filtersHtml()}${scopeBarHtml(meta)}<div id="tovBody">${skeletonHtml()}</div>`;
		bindHost();
	}

	function render() {
		const host = document.getElementById('teacherOverview');
		if (!host) return;
		const data = state.data;
		const meta = (data && data.meta) || {};
		linkRegistry = [];
		host.hidden = false;
		host.innerHTML = `${headerHtml(meta)}${filtersHtml()}${scopeBarHtml(meta)}<div id="tovBody">${bodyHtml()}</div>`;
		bindHost();
	}

	let hostBound = false;
	function bindHost() {
		const host = document.getElementById('teacherOverview');
		if (!host || hostBound) return;
		hostBound = true;
		host.addEventListener('click', onHostClick);
		host.addEventListener('change', onHostChange);
	}

	function headerHtml(meta) {
		const teacher = meta.teacher || {};
		const name = [teacher.title, teacher.name].filter(Boolean).join(' ') || 'Teacher';
		const classes = (meta.scope && meta.scope.allClasses ? meta.scope.allClasses : []).length;
		const subjects = (meta.scope && meta.scope.subjects ? meta.scope.subjects : []).length;
		const scopeText = `Your assignment: ${classes} class${classes === 1 ? '' : 'es'} · ${subjects} subject${
			subjects === 1 ? '' : 's'
		}${meta.academicYear && meta.academicYear.label ? ` · Academic year ${meta.academicYear.label}` : ''}`;
		return `<header class="toolbar teacher-overview__head">
			<div class="toolbar-header-group teacher-overview__head-main">
				<div>
					<h2 class="teacher-overview__title">${esc(greetingWord())}, ${esc(name)}</h2>
					<p class="teacher-overview__sub">${esc(scopeText)}</p>
				</div>
			</div>
			<div class="toolbar-controls">
				<span class="teacher-overview__meta text-muted">Updated ${esc(
					meta.generatedAt ? dateTimeText(meta.generatedAt) : '—',
				)}</span>
				<button type="button" class="btn btn-secondary" data-tov-refresh ${
					state.loading ? 'disabled' : ''
				}>Refresh</button>
			</div>
		</header>`;
	}

	function periodScopeText(meta) {
		const key = state.filters.period;
		if (key === 'custom') {
			const from = state.filters.from ? dateText(state.filters.from) : '';
			const to = state.filters.to ? dateText(state.filters.to) : '';
			if (from || to) return `Custom range (${from || '…'} – ${to || '…'})`;
			return 'Custom range';
		}
		const label =
			(meta && meta.period && meta.period.label) ||
			(PERIODS.find((period) => period.key === key) || {}).label ||
			'This month';
		const range =
			meta && meta.period && meta.period.start
				? `${dateText(meta.period.start)} – ${dateText(meta.period.end)}`
				: '';
		return range ? `${label} (${range})` : label;
	}

	function scopeBarHtml(meta) {
		const f = state.filters;
		const classNames = f.classIds
			.map((id) => (state.options.classes.find((c) => String(c.id) === String(id)) || {}).name)
			.filter(Boolean);
		const subjectNames = f.subjectIds
			.map((id) => (state.options.subjects.find((s) => String(s.id) === String(id)) || {}).name)
			.filter(Boolean);
		const classText = classNames.length ? classNames.join(', ') : 'All classes';
		const subjectText = subjectNames.length ? subjectNames.join(', ') : 'All subjects';
		const periodText = periodScopeText(meta);
		return `<div class="overview-scope-bar teacher-overview__scope-bar">
			<span class="overview-scope-label">Showing ${esc(classText)} · ${esc(subjectText)} · ${esc(
				periodText,
			)}</span>
			<button type="button" class="overview-scope-clear" data-tov-clear>Clear filters</button>
		</div>`;
	}

	function filtersHtml() {
		const f = state.filters;
		const disabled = state.loading ? 'disabled' : '';
		const classOptions = state.options.classes
			.map(
				(c) =>
					`<option value="${esc(c.id)}" ${
						String(f.classIds[0] || '') === String(c.id) ? 'selected' : ''
					}>${esc(c.name)}</option>`,
			)
			.join('');
		const subjectOptions = state.options.subjects
			.map(
				(s) =>
					`<option value="${esc(s.id)}" ${
						String(f.subjectIds[0] || '') === String(s.id) ? 'selected' : ''
					}>${esc(s.name)}</option>`,
			)
			.join('');
		const periodOptions = PERIODS.map(
			(p) => `<option value="${p.key}" ${f.period === p.key ? 'selected' : ''}>${p.label}</option>`,
		).join('');
		return `<div class="sort-wrapper overview-filters teacher-overview__filters">
			<div class="overview-filter">
				<label for="tovClassFilter">Class</label>
				<select id="tovClassFilter" ${disabled}>
					<option value="">All classes</option>
					${classOptions}
				</select>
			</div>
			<div class="overview-filter">
				<label for="tovSubjectFilter">Subject</label>
				<select id="tovSubjectFilter" ${disabled}>
					<option value="">All subjects</option>
					${subjectOptions}
				</select>
			</div>
			<div class="overview-filter">
				<label for="tovPeriod">Period</label>
				<select id="tovPeriod" ${disabled}>${periodOptions}</select>
			</div>
			${
				f.period === 'custom'
					? `<div class="overview-filter teacher-overview__range">
						<label for="tovFrom">Custom range</label>
						<div class="teacher-overview__range-inputs">
							<input type="date" id="tovFrom" class="form-control" value="${esc(f.from)}" aria-label="From date">
							<span aria-hidden="true">→</span>
							<input type="date" id="tovTo" class="form-control" value="${esc(f.to)}" aria-label="To date">
							<button type="button" class="btn btn-secondary" data-tov-apply-range ${disabled}>Apply</button>
						</div>
					</div>`
					: ''
			}
		</div>`;
	}

	function bodyHtml() {
		if (state.error) {
			return `<div class="dashboard-panel">
				<div class="panel-header"><h3>Dashboard unavailable</h3></div>
				<div class="panel-body">
					<p class="teacher-overview__note text-muted">${esc(state.error)}</p>
					<button type="button" class="btn btn-primary" data-tov-retry>Try again</button>
				</div>
			</div>`;
		}
		if (!state.data) return skeletonHtml();
		const data = state.data;
		const meta = data.meta || {};
		if (meta.scope && meta.scope.empty) {
			return `<div class="dashboard-panel">
				<div class="panel-header"><h3>No classes to report on</h3></div>
				<div class="panel-body">
					<p class="teacher-overview__note text-muted">${esc(
						meta.emptyReason || 'No class is assigned to your account.',
					)}</p>
					${registerLink({ tab: 'classes' }, 'Open classes', 'btn btn-secondary')}
				</div>
			</div>${insightsSection(data.sections.insights)}`;
		}
		return `${statusHtml(meta)}${sectionsHtml(data.sections)}`;
	}

	function statusHtml(meta) {
		const notes = [];
		if (meta.sample && meta.sample.answerRowsCapped) {
			notes.push(
				`Question and chapter analysis uses the ${meta.sample.answerRowsUsed} most recent attempts to keep the dashboard fast.`,
			);
		}
		if (meta.sample && meta.sample.resultRowsCapped) {
			notes.push('Some metrics use the most recent results within the selected period.');
		}
		if (!notes.length) return '';
		return `<div class="teacher-overview__status">${notes
			.map((n) => `<p class="text-muted text-xs">${esc(n)}</p>`)
			.join('')}</div>`;
	}

	function skeletonHtml() {
		return `<div class="teacher-overview__skeleton" aria-busy="true" aria-label="Loading dashboard">
			<div class="kpi-grid">${'<div class="teacher-overview__sk"></div>'.repeat(6)}</div>
			<div class="teacher-overview__sk teacher-overview__sk--panel"></div>
		</div>`;
	}

	// ── shared building blocks ─────────────────────────────────────────────

	function statCard({ label, value, note, tone, trend, tooltip }) {
		return `<article class="stat-card ${tone || 'blue'} teacher-overview__stat"${
			tooltip ? ` data-tooltip="${esc(tooltip)}"` : ''
		}>
			<div class="stat-bar"></div>
			<div class="stat-info">
				<h3>${esc(value)}</h3>
				<p>${esc(label)}</p>
				${note ? `<span class="teacher-overview__stat-note">${esc(note)}</span>` : ''}
				${trend || ''}
			</div>
		</article>`;
	}

	function summaryItem(label, value, note) {
		return `<div class="teacher-overview__summary-item">
			<span class="teacher-overview__summary-label">${esc(label)}</span>
			<strong class="teacher-overview__summary-value">${esc(value)}</strong>
			${note ? `<span class="teacher-overview__summary-note">${esc(note)}</span>` : ''}
		</div>`;
	}

	function panel(title, subtitle, body, action) {
		return `<div class="dashboard-panel">
			<div class="panel-header">
				<div>
					<h3>${esc(title)}</h3>
					${subtitle ? `<p class="teacher-overview__panel-sub">${esc(subtitle)}</p>` : ''}
				</div>
				${action || ''}
			</div>
			<div class="panel-body">${body}</div>
		</div>`;
	}

	function section(id, title, purpose, inner, action) {
		return `<section class="teacher-overview__section" id="tov-${id}" aria-labelledby="tov-${id}-title">
			<div class="teacher-overview__section-head">
				<div>
					<h3 id="tov-${id}-title">${esc(title)}</h3>
					<p class="teacher-overview__section-sub">${esc(purpose)}</p>
				</div>
				${action ? registerLink(action.link, action.label, 'btn btn-secondary btn-sm') : ''}
			</div>
			${inner}
		</section>`;
	}

	function sectionsHtml(s) {
		return [
			section(
				'glance',
				'Classroom at a glance',
				'The six numbers that frame the period. Each card explains the evidence behind its value.',
				glanceHtml(s.glance),
			),
			section(
				'progress',
				'Learning progress & performance',
				'Are results improving, which class needs help, and where does practice differ from assessment?',
				progressHtml(s.progress),
				{ link: { tab: 'results' }, label: 'Open results' },
			),
			section(
				'attention',
				'Students needing attention',
				'Academic and engagement difficulties are listed separately, each with a next action that opens the student record.',
				attentionHtml(s.attention),
				{ link: { tab: 'results' }, label: 'Open students' },
			),
			section(
				'exams',
				'Examinations',
				'Formal assessment only. Training and game scores never enter these metrics; open an exam for question-level analysis.',
				examsHtml(s.exams),
				{ link: { tab: 'exams' }, label: 'Open exams' },
			),
			section(
				'courses',
				'Courses & training',
				'Is the learning material being practised, and which chapters generate the most errors?',
				contentHtml(s.content),
				{ link: { tab: 'subjects' }, label: 'Open courses' },
			),
			section(
				'games',
				'Games & tournaments',
				'Engagement and reinforcement only — never an academic measure.',
				gamesHtml(s.engagement),
				{ link: { tab: 'games' }, label: 'Open games' },
			),
			section(
				'insights',
				'Teaching insights',
				'Deterministic observations computed from the data above, each with its evidence and next step.',
				insightsSection(s.insights),
			),
		].join('');
	}

	// ── 01 glance ──────────────────────────────────────────────────────────

	function glanceHtml(glance) {
		const g = glance || {};
		const avg = g.avgExamScore || {};
		const rate = g.successRate || {};
		const attention = g.needingAttention || {};
		const active = g.activeStudents || {};
		const avgFoot = [];
		if (avg.sample) avgFoot.push(`${avg.sample} valid attempt${avg.sample === 1 ? '' : 's'}`);
		if (avg.comparable && avg.previous != null) avgFoot.push(`previous ${fmt20(avg.previous)}`);
		return `<div class="kpi-grid">
			${statCard({
				label: 'Total students',
				value: fmtCount((g.totalStudents || {}).value),
				note: (g.totalStudents || {}).explanation || 'Unique students in your assigned classes.',
				tone: 'blue',
				tooltip: (g.totalStudents || {}).explanation,
			})}
			${statCard({
				label: 'Active students',
				value: fmtCount(active.value),
				note: active.rate == null ? active.explanation : `${fmtPct(active.rate)} of your students`,
				tone: 'cyan',
				tooltip: active.explanation,
			})}
			${statCard({
				label: 'Average exam score',
				value: fmt20(avg.value),
				note: avgFoot.join(' · '),
				tone: 'indigo',
				trend: trendBadge(avg.trend, avg.delta),
				tooltip: avg.explanation,
			})}
			${statCard({
				label: 'Exam success rate',
				value: fmtPct(rate.value),
				note: rate.total ? `${rate.passed} of ${rate.total} attempts at or above 10/20` : rate.explanation,
				tone: 'green',
				tooltip: rate.explanation,
			})}
			${statCard({
				label: 'Students needing attention',
				value: fmtCount(attention.value),
				note: `${fmtCount(attention.academic)} academic · ${fmtCount(attention.engagement)} engagement`,
				tone: 'rose',
				tooltip: 'Academic difficulty and inactivity are counted separately so inactivity never implies weakness.',
			})}
			${statCard({
				label: 'Completed exams',
				value: fmtCount((g.completedExams || {}).value),
				note: (g.completedExams || {}).explanation || 'Exams with at least one valid attempt in the period.',
				tone: 'amber',
				tooltip: (g.completedExams || {}).explanation,
			})}
		</div>`;
	}

	// ── 02 progress ────────────────────────────────────────────────────────

	function lineChart(current, previous) {
		const pts = Array.isArray(current) ? current : [];
		if (!pts.length) return '';
		const width = 640;
		const height = 220;
		const padL = 36;
		const padR = 16;
		const padT = 16;
		const padB = 30;
		const n = Math.max(pts.length, (previous || []).length, 2);
		const x = (i) => padL + (i / (n - 1)) * (width - padL - padR);
		const y = (v) => padT + (1 - Math.max(0, Math.min(20, v)) / 20) * (height - padT - padB);
		const grid = [0, 5, 10, 15, 20]
			.map(
				(v) =>
					`<line x1="${padL}" y1="${y(v)}" x2="${width - padR}" y2="${y(v)}" class="teacher-overview__chart-grid"/>` +
					`<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" class="teacher-overview__chart-axis">${v}</text>`,
			)
			.join('');
		const path = (list, cls) => {
			let d = '';
			list.forEach((point, index) => {
				if (point.avg20 == null) return;
				d += `${d ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.avg20).toFixed(1)} `;
			});
			return d ? `<path d="${d}" class="${cls}"/>` : '';
		};
		const dots = pts
			.map((point, index) =>
				point.avg20 == null
					? ''
					: `<circle cx="${x(index).toFixed(1)}" cy="${y(point.avg20).toFixed(1)}" r="3.5" class="teacher-overview__chart-dot">
						<title>${esc(point.label)}: ${fmt20(point.avg20)} · ${point.attempts} attempt${point.attempts === 1 ? '' : 's'}</title>
					</circle>`,
			)
			.join('');
		const labelEvery = Math.max(1, Math.ceil(pts.length / 6));
		const labels = pts
			.map((point, index) =>
				index % labelEvery === 0
					? `<text x="${x(index).toFixed(1)}" y="${height - 8}" text-anchor="middle" class="teacher-overview__chart-axis">${esc(point.label)}</text>`
					: '',
			)
			.join('');
		return `<svg viewBox="0 0 ${width} ${height}" class="teacher-overview__chart" role="img" aria-label="Average exam score over time">
			${grid}
			${path(previous || [], 'teacher-overview__chart-line teacher-overview__chart-line--prev')}
			${path(pts, 'teacher-overview__chart-line')}
			${dots}${labels}
		</svg>`;
	}

	function groupedBars(points) {
		if (!Array.isArray(points) || !points.length) return '';
		const width = 640;
		const height = 200;
		const padL = 32;
		const padR = 12;
		const padT = 12;
		const padB = 26;
		const max = Math.max(1, ...points.map((p) => (p.examAttempts || 0) + (p.trainingAttempts || 0)));
		const slot = (width - padL - padR) / points.length;
		const barW = Math.min(26, Math.max(6, slot / 3));
		const y = (v) => padT + (1 - v / max) * (height - padT - padB);
		const labelEvery = Math.max(1, Math.ceil(points.length / 6));
		return `<svg viewBox="0 0 ${width} ${height}" class="teacher-overview__chart" role="img" aria-label="Exam and training attempts over time">
			<line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" class="teacher-overview__chart-grid"/>
			${points
				.map((point, index) => {
					const cx = padL + index * slot + slot / 2;
					const examH = height - padB - y(point.examAttempts || 0);
					const trainH = height - padB - y(point.trainingAttempts || 0);
					const label =
						index % labelEvery === 0
							? `<text x="${cx}" y="${height - 8}" text-anchor="middle" class="teacher-overview__chart-axis">${esc(point.label)}</text>`
							: '';
					return `${label}
						<rect x="${cx - barW - 1}" y="${y(point.examAttempts || 0)}" width="${barW}" height="${Math.max(0, examH)}" rx="2" class="teacher-overview__chart-bar teacher-overview__chart-bar--exam">
							<title>${esc(point.label)}: ${point.examAttempts || 0} exam attempt(s)</title>
						</rect>
						<rect x="${cx + 1}" y="${y(point.trainingAttempts || 0)}" width="${barW}" height="${Math.max(0, trainH)}" rx="2" class="teacher-overview__chart-bar teacher-overview__chart-bar--training">
							<title>${esc(point.label)}: ${point.trainingAttempts || 0} training attempt(s)</title>
						</rect>`;
				})
				.join('')}
		</svg>`;
	}

	function chartLegend(items) {
		return `<div class="teacher-overview__legend">${items
			.map(
				(item) =>
					`<span><i class="teacher-overview__legend-key teacher-overview__legend-key--${item.tone}"></i>${esc(
						item.label,
					)}</span>`,
			)
			.join('')}</div>`;
	}

	function barList(rows, opts) {
		const list = Array.isArray(rows) ? rows : [];
		if (!list.length) return emptyState(opts.emptyTitle || 'No data', opts.empty || 'Nothing to compare in this scope.');
		const values = list.map((row) => Number(opts.value(row)) || 0);
		const max = Math.max(opts.max || 0, ...values, 1);
		return `<div class="teacher-overview__bars">
			${list
				.map((row) => {
					const value = Number(opts.value(row)) || 0;
					const width = Math.max(2, Math.round((value / max) * 100));
					const label = opts.label(row);
					const meta = opts.meta ? opts.meta(row) : '';
					const link = opts.link ? opts.link(row) : null;
					const labelHtml = link
						? registerLink(link, label, 'teacher-overview__bar-label teacher-overview__link')
						: `<span class="teacher-overview__bar-label">${esc(label)}</span>`;
					return `<div class="teacher-overview__bar-row">
						<div class="teacher-overview__bar-head">${labelHtml}<span class="teacher-overview__bar-value">${esc(
							opts.display ? opts.display(value, row) : value,
						)}</span></div>
						<div class="teacher-overview__bar-track" role="img" aria-label="${esc(label)}: ${esc(
							opts.display ? opts.display(value, row) : value,
						)}"><span class="teacher-overview__bar-fill ${
							opts.tone ? `teacher-overview__bar-fill--${opts.tone(row)}` : ''
						}" style="width:${width}%"></span></div>
						${meta ? `<p class="teacher-overview__bar-meta">${esc(meta)}</p>` : ''}
					</div>`;
				})
				.join('')}
		</div>`;
	}

	function progressHtml(progress) {
		const p = progress || {};
		const evolution = p.performanceEvolution || { points: [] };
		const participation = p.participationEvolution || { points: [] };
		const classRows = p.classComparison || [];
		const subjectRows = p.subjectPerformance || [];
		const tve = p.trainingVsExam || {};

		const evolutionValid = (evolution.points || []).filter((pt) => pt.avg20 != null).length;
		const evolutionCard =
			evolution.points && evolutionValid >= 2
				? `${chartLegend(
						[
							{ label: 'Selected period', tone: 'line' },
							...(evolution.comparable ? [{ label: 'Previous period', tone: 'prev' }] : []),
						],
					)}
					${lineChart(evolution.points, evolution.previousPoints)}
					${
						evolution.direction
							? `<p class="teacher-overview__note text-muted">Trend: ${esc(
									evolution.direction === 'improving'
										? 'improving'
										: evolution.direction === 'declining'
											? 'declining'
											: 'stable',
								)}</p>`
							: ''
					}`
				: emptyState(
						'Not enough examination results to chart a trend',
						'A trend needs at least two periods with valid formal exam attempts in the selected window.',
					);

		const comparisonCard = barList(classRows, {
			value: (row) => row.avg20,
			max: 20,
			label: (row) => row.className,
			display: (value, row) => `${fmt20(value)}${row.reliable ? '' : ' · small sample'}`,
			meta: (row) =>
				`${row.sample} attempt${row.sample === 1 ? '' : 's'} · ${fmtPct(row.successRate)} success · ${row.students} student${
					row.students === 1 ? '' : 's'
				}`,
			link: (row) => ({ tab: 'results', action: 'class', id: row.classId, query: row.className }),
			tone: (row) => (row.avg20 < 10 ? 'warn' : 'ok'),
			emptyTitle: 'No class comparison',
			empty: 'No formal exam results in the selected period.',
		});

		const subjectCard = barList(subjectRows, {
			value: (row) => row.avg20,
			max: 20,
			label: (row) => row.subjectName,
			display: (value, row) => `${fmt20(value)}${row.mixedExams ? ' · mixed' : ''}`,
			meta: (row) =>
				`${row.sample} attempt${row.sample === 1 ? '' : 's'} · ${fmtPct(row.successRate)} success${
					row.reliable ? '' : ' · small sample'
				}`,
			link: (row) => ({ tab: 'subjects', action: 'subject', id: row.subjectId }),
			tone: (row) => (row.avg20 < 10 ? 'warn' : 'ok'),
			emptyTitle: 'No subject comparison',
			empty: 'Exam results could not be attributed to a subject in this period.',
		});

		const participationCard =
			participation.points && participation.points.some((pt) => pt.examAttempts || pt.trainingAttempts)
				? `${groupedBars(participation.points)}
					${chartLegend([
						{ label: 'Exam attempts', tone: 'exam' },
						{ label: 'Training attempts', tone: 'training' },
					])}`
				: emptyState('No learning activity', 'No exam or training attempt was recorded in this period.');

		return `<div class="teacher-overview__panel-stack">
			${panel(
				'Performance evolution',
				`Average formal exam score (/20) per ${evolution.granularity || 'period'}.`,
				evolutionCard,
			)}
			<div class="dashboard-charts-grid">
				${panel(
					'Class comparison',
					'Average exam score by class. Small samples are labelled.',
					comparisonCard,
				)}
				${panel(
					'Subject performance',
					'Lowest first. An exam spanning subjects is attributed to its dominant subject.',
					subjectCard,
				)}
			</div>
			${panel(
				'Participation evolution',
				`Attempts per ${participation.granularity || 'period'}. Distinct active students: ${fmtCount(
					(participation.points || []).reduce((max, pt) => Math.max(max, pt.activeStudents || 0), 0),
				)} at peak.`,
				participationCard,
			)}
			${panel(
				'Training vs examination',
				'Two different assessment contexts — a gap is a cue to investigate, not proof of mastery.',
				`<div class="teacher-overview__compare">
					<div class="teacher-overview__compare-item">
						<span class="teacher-overview__compare-label">Training</span>
						<strong>${fmt20((tve.training || {}).avg20)}</strong>
						<span class="teacher-overview__note text-muted">${fmtCount((tve.training || {}).sample)} attempt(s) · ${fmtCount(
							(tve.training || {}).students,
						)} student(s)</span>
					</div>
					<div class="teacher-overview__compare-item">
						<span class="teacher-overview__compare-label">Formal examinations</span>
						<strong>${fmt20((tve.exam || {}).avg20)}</strong>
						<span class="teacher-overview__note text-muted">${fmtCount((tve.exam || {}).sample)} attempt(s) · ${fmtCount(
							(tve.exam || {}).students,
						)} student(s)</span>
					</div>
				</div>
				${tve.note ? `<p class="teacher-overview__note text-muted">${esc(tve.note)}</p>` : ''}`,
			)}
		</div>`;
	}

	// ── 03 attention ───────────────────────────────────────────────────────

	function attentionRows(attention) {
		const rows = Array.isArray(attention.rows) ? attention.rows.slice() : [];
		const filter = state.attentionFilter;
		const filtered = rows.filter((row) => {
			if (filter === 'all') return true;
			return row.kind === filter || row.kind === 'both';
		});
		if (state.attentionSort === 'average') {
			filtered.sort((a, b) => (a.avg20 ?? 99) - (b.avg20 ?? 99));
		} else if (state.attentionSort === 'inactive') {
			filtered.sort((a, b) => (b.daysInactive ?? -1) - (a.daysInactive ?? -1));
		}
		return filtered;
	}

	function attentionHtml(attention) {
		const a = attention || {};
		const summary = a.summary || {};
		const rows = attentionRows(a);
		const chip = (key, label, count) =>
			`<button type="button" class="btn btn-sm ${
				state.attentionFilter === key ? 'btn-primary is-active' : 'btn-secondary'
			}" data-tov-attention-filter="${key}" aria-pressed="${state.attentionFilter === key}">${esc(
				label,
			)} <span>${fmtCount(count)}</span></button>`;

		const table = rows.length
			? `<div class="table-container teacher-overview__table-wrap">
				<table class="data-table teacher-overview__table">
					<thead><tr>
						<th scope="col">Student</th><th scope="col">Class</th><th scope="col">Avg /20</th>
						<th scope="col">Recent trend</th><th scope="col">Detected difficulty</th><th scope="col">Next action</th>
					</tr></thead>
					<tbody>
						${rows
							.map((row) => {
								const link = { tab: 'results', action: 'student', id: row.studentId, query: row.name };
								const weak = (row.difficulty && row.difficulty.weakChapters ? row.difficulty.weakChapters : [])[0];
								const weakHtml = weak
									? registerLink(
											weak.courseId
												? { tab: 'subjects', action: 'course', id: weak.courseId }
												: { tab: 'questions', action: 'category', id: weak.categoryId, query: weak.name },
											`${weak.name} · ${fmtPct(weak.errorRate)} errors`,
											'badge badge-amber',
											'Open the chapter content',
										)
									: '';
								const difficultyLabel = row.difficulty ? row.difficulty.label : row.reason;
								const activity = row.lastActivity
									? `Last activity ${dateText(row.lastActivity)}`
									: 'No activity in period';
								const activityHtml =
									activity && activity !== difficultyLabel
										? `<span class="teacher-overview__cell-meta">${esc(activity)}</span>`
										: '';
								return `<tr>
									<td data-label="Student">${registerLink(link, row.name, 'teacher-overview__link')}${
										row.numero ? `<span class="teacher-overview__cell-meta">#${esc(row.numero)}</span>` : ''
									}</td>
									<td data-label="Class">${esc(row.className)}</td>
									<td data-label="Average /20"><span class="teacher-overview__score${
										row.avg20 != null && row.avg20 < 10 ? ' teacher-overview__score--low' : ''
									}">${fmt20(row.avg20)}</span></td>
									<td data-label="Recent trend">${trendBadge(row.trend, row.trendDelta) || '—'}</td>
									<td data-label="Detected difficulty"><span class="teacher-overview__difficulty">${esc(
										difficultyLabel,
									)}</span>${activityHtml}${weakHtml}</td>
									<td data-label="Next action">${registerLink(
										link,
										row.intervention?.label || 'Review student',
										'btn btn-secondary btn-sm',
									)}</td>
								</tr>`;
							})
							.join('')}
					</tbody>
				</table>
			</div>`
			: emptyState(
					'No student meets the intervention criteria',
					'Either results are above the thresholds or there is not enough data in this period.',
				);

		return `<div class="dashboard-panel">
			<div class="panel-header">
				<div>
					<h3>Intervention list</h3>
					<p class="teacher-overview__panel-sub">Filter by difficulty, then open the student record for the full history.</p>
				</div>
				<div class="teacher-overview__toolbar">
					<div class="teacher-overview__chips">
						${chip('all', 'All', summary.total || 0)}
						${chip('academic', 'Academic', summary.academic || 0)}
						${chip('engagement', 'Engagement', summary.engagement || 0)}
					</div>
					<label class="sort-wrapper teacher-overview__sort">
						<span class="text-muted text-xs">Sort</span>
						<select id="tovAttentionSort">
							<option value="priority" ${state.attentionSort === 'priority' ? 'selected' : ''}>Priority</option>
							<option value="average" ${state.attentionSort === 'average' ? 'selected' : ''}>Lowest average</option>
							<option value="inactive" ${state.attentionSort === 'inactive' ? 'selected' : ''}>Most inactive</option>
						</select>
					</label>
				</div>
			</div>
			<div class="panel-body">
				${table}
				<details class="teacher-overview__rules">
					<summary>How students are flagged</summary>
					<ul>${(a.rules || []).map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul>
				</details>
			</div>
		</div>`;
	}

	// ── 04 examinations ────────────────────────────────────────────────────

	function examDistributionHtml(distribution) {
		const rows = Array.isArray(distribution) ? distribution : [];
		if (!rows.length) return emptyState('No score distribution', 'No valid exam result in this period.');
		const max = Math.max(1, ...rows.map((r) => r.count || 0));
		return `<div class="teacher-overview__bars">
			${rows
				.map((row) => {
					const bucketStart = Number(String(row.bucket || '').split('-')[0]);
					return `<div class="teacher-overview__bar-row">
						<div class="teacher-overview__bar-head"><span class="teacher-overview__bar-label">${esc(
							row.label,
						)}/20</span><span class="teacher-overview__bar-value">${fmtCount(row.count)}</span></div>
						<div class="teacher-overview__bar-track"><span class="teacher-overview__bar-fill ${
							bucketStart >= 10 ? 'teacher-overview__bar-fill--ok' : 'teacher-overview__bar-fill--warn'
						}" style="width:${Math.max(2, Math.round(((row.count || 0) / max) * 100))}%"></span></div>
						<p class="teacher-overview__bar-meta">${fmtPct(row.pct)} of valid attempts</p>
					</div>`;
				})
				.join('')}
		</div>`;
	}

	function examsHtml(exams) {
		const e = exams || {};
		const summary = e.summary || {};
		const awaiting = Array.isArray(e.awaiting) ? e.awaiting : [];
		const recent = Array.isArray(e.recent) ? e.recent : [];

		const awaitingHtml = awaiting.length
			? `<ul class="teacher-overview__list">
					${awaiting
						.map(
							(exam) => `<li>
								<div class="teacher-overview__list-main">
									${registerLink(
										{ tab: 'exams', action: 'exam-analysis', id: exam.examId },
										exam.name,
										'teacher-overview__link',
									)}
									<span class="teacher-overview__list-meta">${fmtCount(exam.completed)} completed · ${fmtCount(
										exam.pending,
									)} pending of ${fmtCount(exam.assigned)}</span>
								</div>
								<div class="teacher-overview__list-side">
									<span class="status-badge ${
										exam.pending > 0 ? 'status-warning' : 'status-success'
									}">${exam.pending > 0 ? 'Awaiting' : 'Complete'}</span>
								</div>
							</li>`,
						)
						.join('')}
				</ul>`
			: emptyState('No active exam awaiting completion', 'Assigned active exams will appear here with their pending attempts.');

		const recentHtml = recent.length
			? `<div class="table-container teacher-overview__table-wrap">
					<table class="data-table teacher-overview__table">
						<thead><tr><th scope="col">Student</th><th scope="col">Exam</th><th scope="col">Score</th><th scope="col">Date</th></tr></thead>
						<tbody>${recent
							.slice(0, 6)
							.map(
								(row) => `<tr>
									<td data-label="Student">${registerLink(
										{ tab: 'results', action: 'student', id: row.studentId, query: row.studentName },
										row.studentName,
										'teacher-overview__link',
									)}<span class="teacher-overview__cell-meta">${esc(row.className)}</span></td>
									<td data-label="Exam">${registerLink(
										{ tab: 'exams', action: 'exam-analysis', id: row.examId },
										row.examName,
										'teacher-overview__link',
									)}</td>
									<td data-label="Score"><span class="teacher-overview__score${
										row.passed ? '' : ' teacher-overview__score--low'
									}">${fmt20(row.score20)}</span></td>
									<td data-label="Date">${esc(dateText(row.date))}</td>
								</tr>`,
							)
							.join('')}</tbody>
					</table>
				</div>`
			: emptyState('No recent results', 'No formal exam result was recorded in this period.');

		return `<div class="teacher-overview__panel-stack">
			<div class="teacher-overview__summary">
				${summaryItem('Average (/20)', fmt20((summary.avg20 || {}).value), `${fmtCount(
					(summary.avg20 || {}).sample,
				)} attempts`)}
				${summaryItem('Success rate', fmtPct((summary.successRate || {}).value), 'at 10/20')}
				${summaryItem('Completed exams', fmtCount((summary.completed || {}).value), 'in period')}
				${summaryItem('Pending attempts', fmtCount((summary.pendingAttempts || {}).value), 'assigned, not completed')}
			</div>
			<div class="dashboard-charts-grid">
				${panel('Score distribution', 'Share of valid formal attempts by /20 band.', examDistributionHtml(e.distribution))}
				${panel(
					'Awaiting completion',
					'Exams have no scheduled date; this is the assigned work still outstanding.',
					awaitingHtml,
				)}
			</div>
			${panel(
				'Recent results',
				'Six most recent formal exam attempts in the period. Open an exam for question-level analysis.',
				recentHtml,
			)}
			${unavailableNote((e.unavailable || {}).schedule)}
		</div>`;
	}

	// ── 05 courses & training ──────────────────────────────────────────────

	function courseListHtml(rows, emptyTitle) {
		const list = Array.isArray(rows) ? rows : [];
		if (!list.length) return emptyState(emptyTitle, 'No published course in this scope.');
		return `<ul class="teacher-overview__list">
			${list
				.map(
					(course) => `<li>
						<div class="teacher-overview__list-main">
							${registerLink(
								{ tab: 'subjects', action: 'course', id: course.courseId },
								course.name,
								'teacher-overview__link',
							)}
							<span class="teacher-overview__list-meta">${esc(
								course.subjectName || 'No subject',
							)} · ${fmtCount(course.lessonCount)} lesson(s)</span>
						</div>
						<div class="teacher-overview__list-side">
							${fmtCount(course.practicingStudents)} student(s)<br>
							${fmtCount(course.trainingAttempts)} training · ${fmt20(course.avgTraining20)}
						</div>
					</li>`,
				)
				.join('')}
		</ul>`;
	}

	function contentHtml(content) {
		const c = content || {};
		const chapters = Array.isArray(c.chapters) ? c.chapters : [];
		const training = c.training || {};
		const visibleChapters = chapters.slice(0, 5);
		const chapterRows = visibleChapters.length
			? `<div class="table-container teacher-overview__table-wrap">
					<table class="data-table teacher-overview__table">
						<thead><tr>
							<th scope="col">Chapter</th><th scope="col">Answers</th><th scope="col">Students</th>
							<th scope="col">Correct</th><th scope="col">Errors</th><th scope="col">Context</th><th scope="col"></th>
						</tr></thead>
						<tbody>${visibleChapters
							.map(
								(chapter) => `<tr>
									<td data-label="Chapter"><span class="teacher-overview__cell-strong">${esc(
										chapter.name,
									)}</span><span class="teacher-overview__cell-meta">${esc(chapter.path || '')}</span></td>
									<td data-label="Answers">${fmtCount(chapter.attempts)}</td>
									<td data-label="Students">${fmtCount(chapter.students)}</td>
									<td data-label="Correct">${fmtPct(chapter.correctRate)}</td>
									<td data-label="Errors"><span class="teacher-overview__score${
										chapter.errorRate >= 50 ? ' teacher-overview__score--low' : ''
									}">${fmtPct(chapter.errorRate)}</span></td>
									<td data-label="Context"><span class="badge ${
										chapter.severity === 'high'
											? 'badge-rose'
											: chapter.severity === 'medium'
												? 'badge-amber'
												: 'badge-green'
									}">${chapter.severity === 'high' ? 'Priority' : chapter.severity === 'medium' ? 'Watch' : 'OK'}</span>
									<span class="teacher-overview__cell-meta">${fmtCount(chapter.trainingAttempts)} training · ${fmtCount(
										chapter.examAttempts,
									)} exam</span></td>
									<td data-label="Action">${
										chapter.courseId
											? registerLink(
													{ tab: 'subjects', action: 'course', id: chapter.courseId },
													'Open course',
													'teacher-overview__link',
												)
											: registerLink(
													{ tab: 'questions', action: 'category', id: chapter.categoryId, query: chapter.name },
													'Review questions',
													'teacher-overview__link',
												)
									}</td>
								</tr>`,
							)
							.join('')}</tbody>
					</table>
				</div>
				${
					chapters.length > visibleChapters.length
						? `<p class="teacher-overview__note text-muted">Showing the ${visibleChapters.length} highest-priority chapters. Open Courses for the full outline.</p>`
						: ''
				}`
			: emptyState('No chapter data', 'No answered question in your courses during this period.');

		return `<div class="teacher-overview__panel-stack">
			<div class="teacher-overview__summary">
				${summaryItem(
					'Published courses',
					fmtCount((c.publishedCourses || {}).value),
					`${fmtCount((c.draftCourses || {}).value)} draft`,
				)}
				${summaryItem(
					'Training attempts',
					fmtCount(training.attempts),
					`${fmtCount(training.attemptsPerStudent)} per active student`,
				)}
				${summaryItem('Training average', fmt20(training.avg20), 'practice only')}
				${summaryItem(
					'Training participation',
					fmtPct(training.participationRate),
					`${fmtCount(training.students)} student(s)`,
				)}
			</div>
			<div class="dashboard-charts-grid">
				${panel(
					'Most practised',
					'Courses whose chapters students actually worked on.',
					courseListHtml(c.mostPracticed, 'No practice recorded'),
				)}
				${panel(
					'Least practised',
					'Published courses with the least practice — a candidate for a reminder.',
					courseListHtml(c.leastPracticed, 'No published course'),
				)}
			</div>
			${panel(
				'Chapter difficulty',
				'Computed from real training and exam answers. High error rate with enough volume and breadth.',
				chapterRows,
			)}
			${unavailableNote((c.unavailable || {}).completion)}
			${unavailableNote((c.unavailable || {}).participation)}
		</div>`;
	}

	// ── 06 games & tournaments ─────────────────────────────────────────────

	function gamesHtml(engagement) {
		const en = engagement || {};
		const games = en.games || {};
		const tournaments = en.tournaments || {};
		const trend = Array.isArray(en.trend) ? en.trend : [];
		const topActivities = Array.isArray(en.topActivities) ? en.topActivities : [];
		const hasTrend = trend.some((pt) => pt.games || pt.tournaments);
		const trendMax = Math.max(1, ...trend.map((pt) => Math.max(pt.games || 0, pt.tournaments || 0)));
		const trendGranularity = trend[0] && String(trend[0].period || '').length === 7 ? 'month' : 'week';

		const trendHtml = hasTrend
			? `<div class="teacher-overview__trend-bars">${trend
					.map(
						(point) =>
							`<div class="teacher-overview__trend-col" title="${esc(point.label)} — ${point.games} game session(s), ${point.tournaments} tournament entry(ies)">
								<span class="teacher-overview__trend-fill teacher-overview__trend-fill--game" style="height:${Math.max(
									2,
									Math.round(((point.games || 0) / trendMax) * 100),
								)}%"></span>
								<span class="teacher-overview__trend-fill teacher-overview__trend-fill--tour" style="height:${Math.max(
									2,
									Math.round(((point.tournaments || 0) / trendMax) * 100),
								)}%"></span>
								<span class="teacher-overview__trend-label">${esc(point.label)}</span>
							</div>`,
					)
					.join('')}</div>
				${chartLegend([
					{ label: 'Games', tone: 'exam' },
					{ label: 'Tournaments', tone: 'training' },
				])}`
			: emptyState('No game activity', 'No game session or tournament entry in this period.');

		const activitiesHtml = topActivities.length
			? `<ul class="teacher-overview__list">${topActivities
					.slice(0, 5)
					.map(
						(activity) => `<li>
							<div class="teacher-overview__list-main">
								${esc(activity.name)}
								<span class="badge badge-blue">${activity.type === 'game' ? 'Game' : 'Tournament'}</span>
							</div>
							<div class="teacher-overview__list-side">${fmtCount(activity.participants)} participant(s)<br>${fmtCount(
								activity.completions,
							)} completed</div>
						</li>`,
					)
					.join('')}</ul>`
			: emptyState('No activity', 'No game or tournament activity in this period.');

		return `<div class="teacher-overview__panel-stack">
			<div class="teacher-overview__summary">
				${summaryItem('Game sessions', fmtCount(games.sessions), `${fmtCount(games.students)} student(s)`)}
				${summaryItem('Game participation', fmtPct(games.participationRate), 'engagement only')}
				${summaryItem('Tournament entries', fmtCount(tournaments.entries), `${fmtCount(tournaments.students)} student(s)`)}
				${summaryItem('Active tournaments', fmtCount(tournaments.active), 'open or running')}
			</div>
			${panel(
				'Engagement trend',
				`Game sessions and tournament entries per ${trendGranularity}.`,
				trendHtml,
			)}
			${panel(
				'Most engaging activities',
				'Ranked by participants — engagement, never academic ranking.',
				activitiesHtml,
			)}
			${unavailableNote((en.unavailable || {}).ranking)}
		</div>`;
	}

	// ── 07 insights ────────────────────────────────────────────────────────

	function insightsSection(insights) {
		const list = Array.isArray(insights) ? insights : [];
		if (!list.length) {
			return emptyState('No insight yet', 'Insights appear once enough activity is recorded in the period.');
		}
		return `<div class="teacher-overview__insights">
			${list
				.map(
					(insight) => `<article class="teacher-overview__insight teacher-overview__insight--${esc(
						insight.severity || 'info',
					)}">
						<div class="teacher-overview__insight-head">
							${severityBadge(insight.severity)}
							<span class="text-muted text-xs">${esc(insight.scope || '')}</span>
						</div>
						<h4>${esc(insight.observation)}</h4>
						<p class="teacher-overview__insight-metric">${esc(insight.metric)}</p>
						<div class="teacher-overview__insight-foot">
							<span class="text-muted text-xs">${esc(insight.target || '')}</span>
							${registerLink(insight.link, insight.action || 'Open', 'btn btn-secondary btn-sm')}
						</div>
					</article>`,
				)
				.join('')}
		</div>`;
	}

	// ── events ─────────────────────────────────────────────────────────────

	function onHostClick(event) {
		const target = event.target;
		if (!target || typeof target.closest !== 'function') return;

		const linkButton = target.closest('[data-tov-link]');
		if (linkButton) {
			const index = Number(linkButton.getAttribute('data-tov-link'));
			openLink(linkRegistry[index]);
			return;
		}
		if (target.closest('[data-tov-refresh]')) {
			load({ force: true });
			return;
		}
		if (target.closest('[data-tov-retry]')) {
			load({ force: true });
			return;
		}
		if (target.closest('[data-tov-clear]')) {
			clearFilters();
			return;
		}
		if (target.closest('[data-tov-apply-range]')) {
			const from = document.getElementById('tovFrom');
			const to = document.getElementById('tovTo');
			state.filters.from = from ? from.value : '';
			state.filters.to = to ? to.value : '';
			if (!state.filters.from || !state.filters.to) return;
			load({ force: true });
			return;
		}
		const attentionFilter = target.closest('[data-tov-attention-filter]');
		if (attentionFilter) {
			state.attentionFilter = attentionFilter.getAttribute('data-tov-attention-filter');
			render();
		}
	}

	function onHostChange(event) {
		const target = event.target;
		if (!target || typeof target.closest !== 'function') return;
		if (target.id === 'tovClassFilter') {
			state.filters.classIds = target.value ? [target.value] : [];
			load({ force: true });
			return;
		}
		if (target.id === 'tovSubjectFilter') {
			state.filters.subjectIds = target.value ? [target.value] : [];
			load({ force: true });
			return;
		}
		if (target.id === 'tovPeriod') {
			const key = target.value;
			state.filters.period = key;
			if (key === 'custom') {
				if (!state.filters.from || !state.filters.to) {
					const today = new Date();
					const from = new Date(today.getTime() - 30 * 86400000);
					state.filters.from = from.toISOString().slice(0, 10);
					state.filters.to = today.toISOString().slice(0, 10);
				}
				render();
				return;
			}
			load({ force: true });
			return;
		}
		if (target.id === 'tovAttentionSort') {
			state.attentionSort = target.value;
			render();
		}
	}

	// ── public API + boot ──────────────────────────────────────────────────

	window.TeacherOverview = {
		load,
		refresh: () => load({ force: true }),
		clearFilters,
		open: (link) => openLink(link),
	};

	document.addEventListener('DOMContentLoaded', () => {
		bindHost();
		if (!isTeacherSession()) return;
		const overview = document.getElementById('overview');
		if (overview && overview.classList.contains('active')) load();
	});

	window.addEventListener('quiz:bootstrap-ready', () => {
		if (!isTeacherSession()) return;
		const overview = document.getElementById('overview');
		if (overview && overview.classList.contains('active')) load({ force: true });
	});
})();
