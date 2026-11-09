// ============================================================
// TEACHER OVERVIEW — EDUCATIONAL ANALYTICS DASHBOARD
// ============================================================
// Teacher Overview only. Admins keep the school-wide Overview (server
// /admin/overview) untouched.
//
// Architectural rule: this module NEVER manages data. It renders a
// server-aggregated analytics bundle as charts and every action navigates to
// the existing module (Courses, Questions, Exams, Classes, Results, Games).
// No CRUD, no duplicate forms, no alternate management workflow lives here.
//
// Design rule: every figure is a chart or a KPI card built from the shared
// chart kit (teacher-analytics.js) and the application design system
// (.stat-card, .dashboard-panel, .btn), so the Overview follows the shared
// light/dark theme tokens.
//
// Data comes from GET /api/v1/teacher-overview/overview (teacher JWT scope)
// plus GET /api/v1/teacher-overview/presence for the live classroom pulse.
// Nothing is fabricated: unavailable metrics render an explicit explanation.

(function () {
	'use strict';

	const T = window.TeacherAnalytics || null;

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
		presence: null,
		lastLoadAt: 0,
		requestToken: 0,
		options: { classes: [], subjects: [] },
		filters: { classIds: [], subjectIds: [], period: 'month', from: '', to: '' },
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
		return String(Math.round(n * 10) / 10);
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

	function registerLink(link, label, className, title) {
		const index = linkRegistry.push(link) - 1;
		return `<button type="button" class="${className || 'teacher-overview__link'}" data-tov-link="${index}"${
			title ? ` title="${esc(title)}"` : ''
		}>${esc(label)}</button>`;
	}

	function emptyState(title, message) {
		return T
			? T.empty(title, message)
			: `<p class="empty-state-small teacher-overview__empty"><strong>${esc(title)}</strong> ${esc(
					message || '',
				)}</p>`;
	}

	function chartOrEmpty(markup, title, message) {
		return markup || emptyState(title, message);
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

		// Presence is fetched in parallel and is never allowed to break the
		// dashboard: a disabled socket registry simply yields null.
		const presencePromise = Promise.resolve()
			.then(() => window.API.list('teacher-overview/presence', params()))
			.then((payload) => (payload && payload.data) || null)
			.catch(() => null);

		try {
			if (!window.API || typeof window.API.list !== 'function') {
				throw new Error('The REST client is not available. Reload the page.');
			}
			const payload = await window.API.list('teacher-overview/overview', params());
			if (token !== state.requestToken) return;
			const data = payload && payload.data;
			if (!data || !data.sections) throw new Error('Unexpected analytics response.');
			state.data = data;
			state.presence = await presencePromise;
			if (token !== state.requestToken) return;
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
			if (typeof window.openTab === 'function') window.openTab(null, 'results');
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
		host.innerHTML = `${headerHtml(meta)}${filtersShellHtml(meta)}<div id="tovBody">${skeletonHtml()}</div>`;
		bindHost();
	}

	function render() {
		const host = document.getElementById('teacherOverview');
		if (!host) return;
		const data = state.data;
		const meta = (data && data.meta) || {};
		linkRegistry = [];
		host.hidden = false;
		host.innerHTML = `${headerHtml(meta)}${filtersShellHtml(meta)}<div id="tovBody">${bodyHtml()}</div>`;
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

	function activeFilterChips(meta) {
		const f = state.filters;
		const chips = [];
		if (f.classIds.length) {
			const names = f.classIds
				.map(
					(id) =>
						(state.options.classes.find((c) => String(c.id) === String(id)) || {}).name ||
						id,
				)
				.filter(Boolean);
			if (names.length) chips.push({ key: 'class', label: 'Class', value: names.join(', ') });
		}
		if (f.subjectIds.length) {
			const names = f.subjectIds
				.map(
					(id) =>
						(state.options.subjects.find((s) => String(s.id) === String(id)) || {}).name ||
						id,
				)
				.filter(Boolean);
			if (names.length) chips.push({ key: 'subject', label: 'Subject', value: names.join(', ') });
		}
		// The default view is This month; only show a period chip when the
		// teacher deliberately narrowed or changed the window.
		if (f.period !== 'month') {
			chips.push({ key: 'period', label: 'Period', value: periodScopeText(meta) });
		}
		return chips;
	}

	function filterSummaryHtml(meta) {
		const chips = activeFilterChips(meta);
		return `<div class="teacher-overview__filter-summary${
			chips.length ? '' : ' hidden'
		}" id="tovFilterSummary">
			<span class="teacher-overview__filter-summary-label">Filtered by</span>
			<div class="teacher-overview__filter-chips" id="tovFilterChips">${chips
				.map(
					(chip) =>
						`<button type="button" class="teacher-overview__filter-chip" data-tov-clear-filter="${chip.key}" title="Remove this filter">${esc(
							chip.label,
						)}: ${esc(chip.value)} <span aria-hidden="true">×</span></button>`,
				)
				.join('')}</div>
			<button type="button" class="teacher-overview__filter-clear" data-tov-clear>Clear all</button>
		</div>`;
	}

	function filtersShellHtml(meta) {
		return `<div class="teacher-overview__filter-shell">
			${filtersHtml()}
			${filterSummaryHtml(meta)}
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
		if (!T) {
			return `<div class="dashboard-panel">
				<div class="panel-header"><h3>Chart kit unavailable</h3></div>
				<div class="panel-body">
					<p class="teacher-overview__note text-muted">teacher-analytics.js did not load. Reload the page.</p>
					<button type="button" class="btn btn-primary" data-tov-retry>Try again</button>
				</div>
			</div>`;
		}
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
			</div>`;
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

	function kpiCard({ label, value, note, foot, tone, tooltip }) {
		return `<article class="stat-card ${tone || 'blue'} ta-stat"${
			tooltip ? ` data-tooltip="${esc(tooltip)}"` : ''
		}>
			<div class="stat-bar"></div>
			<div class="stat-info">
				<h3>${esc(value)}</h3>
				<p>${esc(label)}</p>
				${note ? `<span class="ta-stat__note">${esc(note)}</span>` : ''}
				${foot ? `<span class="ta-stat__foot">${foot}</span>` : ''}
			</div>
		</article>`;
	}

	function metric(label, value, note) {
		return `<div class="ta-metric">
			<span class="ta-metric__label">${esc(label)}</span>
			<strong class="ta-metric__value">${esc(value)}</strong>
			${note ? `<span class="ta-metric__note">${esc(note)}</span>` : ''}
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

	function chartPanel(title, subtitle, body, action) {
		return T.panel({ title, subtitle, body, action: action || '' });
	}

	function panelAction(link, label) {
		return registerLink(link, label, 'btn btn-secondary btn-sm');
	}

	function sectionsHtml(s) {
		return [
			section(
				'pulse',
				'Live classroom pulse',
				'Who is here now, who needs help, and which class leads or trails the ranking.',
				pulseHtml(s),
			),
			section(
				'decisions',
				'Emergency decisions',
				'Teaching decisions that cannot wait. Each observation carries its evidence and a direct next step.',
				emergencyHtml(s.insights),
				{ link: { tab: 'results' }, label: 'Open intervention list' },
			),
			section(
				'progress',
				'Class comparison',
				'Average score, pass split, attention load, learning progression and activity — compared by class.',
				progressHtml(s.progress, s.attention),
				{ link: { tab: 'results' }, label: 'Open results' },
			),
			section(
				'learning',
				'Learning insights',
				'Where the learning is going, which subject leads, and how practice differs from assessment.',
				learningHtml(s.progress),
				{ link: { tab: 'results' }, label: 'Open results' },
			),
			section(
				'subjects',
				'Courses & subjects insights',
				'Is the learning material being practised, and which chapters generate the most errors?',
				coursesHtml(s.content),
				{ link: { tab: 'subjects' }, label: 'Open courses' },
			),
			section(
				'questions',
				'Questions insights',
				'Bank coverage, composition and observed difficulty — never author-declared difficulty.',
				questionsHtml(s.questions),
				{ link: { tab: 'questions' }, label: 'Open questions' },
			),
			section(
				'distribution',
				'Score distribution',
				'How formal assessment results are spread across the /20 scale, with assessment health.',
				distributionHtml(s.exams, s.glance),
				{ link: { tab: 'exams' }, label: 'Open exams' },
			),
			section(
				'engagement',
				'Educational engagement',
				'Games and tournaments reinforce learning. Engagement only — never an academic measure.',
				engagementHtml(s.engagement),
				{ link: { tab: 'games' }, label: 'Open games' },
			),
			section(
				'insights',
				'Educational insights',
				'Positive signals and context to keep teaching decisions balanced.',
				educationalInsightsHtml(s.insights),
			),
		].join('');
	}

	// ── 01 live classroom pulse (KPIs) ─────────────────────────────────────

	function pulseHtml(sections) {
		const glance = (sections && sections.glance) || {};
		const progress = (sections && sections.progress) || {};
		const attention = glance.needingAttention || {};
		const notCertified = glance.notCertifiedStudents || {};
		const presence = state.presence;
		const totalClasses = presence
			? presence.totalClasses
			: (state.options.classes || []).length;
		const best = progress.bestClass;
		const weakest = progress.weekComparison ? progress.weekComparison.weakest : null;

		return `<div class="kpi-grid ta-kpi-grid">
			${kpiCard({
				label: 'Classes online',
				value: presence ? `${fmtCount(presence.classesOnline)} / ${fmtCount(totalClasses)}` : '—',
				note: presence
					? `${fmtCount(presence.studentsOnline)} student(s) connected live`
					: 'Live presence is unavailable',
				tone: 'blue',
				foot: registerLink({ tab: 'classes' }, 'Open classes'),
				tooltip: 'Classes with at least one student connected right now.',
			})}
			${kpiCard({
				label: 'Students online',
				value: presence ? fmtCount(presence.studentsOnline) : '—',
				note: presence
					? `${fmtPct(presence.onlineRate)} of ${fmtCount(presence.totalStudents)} students`
					: 'Live presence is unavailable',
				tone: 'cyan',
				foot: registerLink({ tab: 'results' }, 'Open students'),
				tooltip: 'Distinct student accounts connected right now.',
			})}
			${kpiCard({
				label: 'Students needing attention',
				value: fmtCount(attention.value),
				note: `${fmtCount(attention.academic)} academic · ${fmtCount(attention.engagement)} engagement`,
				tone: 'rose',
				foot: registerLink({ tab: 'results', action: 'attention' }, 'Open intervention list'),
				tooltip:
					'Academic difficulty and inactivity are counted separately so inactivity never implies weakness.',
			})}
			${kpiCard({
				label: 'Remaining students not passing',
				value: fmtCount(notCertified.value),
				note: `${fmtCount(notCertified.failed)} below 10/20 · ${fmtCount(
					notCertified.neverAssessed,
				)} never assessed`,
				tone: 'amber',
				foot: registerLink({ tab: 'results' }, 'Open results'),
				tooltip: 'Students who are assessed below the certification line, or not assessed at all.',
			})}
			${kpiCard({
				label: 'Best-ranked class',
				value: best ? best.className : '—',
				note: best
					? `${fmt20(best.avg20)} · ${fmtCount(best.sample)} attempt(s)${
							best.reliable ? '' : ' · small sample'
						}`
					: 'No formal exam result in this period',
				tone: 'green',
				foot: best
					? registerLink(
							{ tab: 'results', action: 'class', id: best.classId, query: best.className },
							'Review class results',
						)
					: '',
				tooltip: 'Highest average on formal examinations in the selected scope and period.',
			})}
			${kpiCard({
				label: 'Weakest class this week',
				value: weakest ? weakest.className : '—',
				note: weakest
					? `${fmt20(weakest.avg20)} · ${fmtCount(weakest.sample)} attempt(s) · last 7 days${
							weakest.reliable ? '' : ' · small sample'
						}`
					: 'No formal exam result in the last 7 days',
				tone: 'violet',
				foot: weakest
					? registerLink(
							{ tab: 'results', action: 'class', id: weakest.classId, query: weakest.className },
							'Review class results',
						)
					: '',
				tooltip:
					'Trailing seven days, independent of the reporting period: a live teaching decision.',
			})}
		</div>`;
	}

	// ── insight cards ──────────────────────────────────────────────────────

	function insightCards(list, emergency) {
		const items = Array.isArray(list) ? list : [];
		if (!items.length) {
			return emptyState(
				emergency ? 'No urgent decision required' : 'No additional insight',
				emergency
					? 'No pedagogical alert crosses a threshold in the selected period.'
					: 'Positive or contextual insights appear here once enough activity is recorded.',
			);
		}
		return `<div class="ta-insights${emergency ? ' ta-insights--emergency' : ''}">
			${items
				.map(
					(insight) => `<article class="ta-insight ta-insight--${esc(insight.severity || 'info')}">
						<div class="ta-insight__head">
							<span class="ta-insight__domain">${esc(insight.domain || 'overview')}</span>
							<span class="ta-insight__scope">${esc(insight.scope || '')}</span>
						</div>
						<h4>${esc(insight.observation)}</h4>
						<p class="ta-insight__metric">${esc(insight.metric)}</p>
						<div class="ta-insight__foot">
							<span class="text-muted text-xs">${esc(insight.target || '')}</span>
							${registerLink(insight.link, insight.action || 'Open', 'btn btn-secondary btn-sm')}
						</div>
					</article>`,
				)
				.join('')}
		</div>`;
	}

	function emergencyHtml(insights) {
		const list = (Array.isArray(insights) ? insights : []).filter(
			(item) => item.severity === 'high' || item.severity === 'medium',
		);
		return insightCards(list, true);
	}

	function educationalInsightsHtml(insights) {
		const list = (Array.isArray(insights) ? insights : []).filter(
			(item) => item.severity === 'positive' || item.severity === 'info',
		);
		return insightCards(list, false);
	}

	// ── 02 class comparison ────────────────────────────────────────────────

	function progressHtml(progress, attention) {
		const p = progress || {};
		const rows = Array.isArray(p.classComparison) ? p.classComparison : [];
		const byClass = Array.isArray(p.attentionByClass)
			? p.attentionByClass
			: Array.isArray(attention && attention.byClass)
				? attention.byClass
				: [];
		const evolution = p.performanceEvolution || {};
		const participation = p.participationEvolution || {};

		const means = chartOrEmpty(
			T.barChart({
				rows,
				value: (row) => row.avg20,
				max: 20,
				threshold: 10,
				label: (row) => row.className,
				display: (value) => fmt20(value),
				tone: (row) => (row.avg20 == null ? 'muted' : row.avg20 < 10 ? 'danger' : 'success'),
				ariaLabel: 'Average examination score by class',
			}),
			'No class comparison',
			'No formal exam result was recorded in this period.',
		);
		const meansLegend = T.legend([
			{ label: 'Class average /20', tone: 'primary' },
			{ label: 'Pass line 10/20', tone: 'danger' },
		]);

		const passSplit =
			rows.length > 0
				? `${T.legend([
						{ label: 'At or above 10/20', tone: 'success' },
						{ label: 'Below 10/20', tone: 'danger' },
					])}
					${T.groupedBarChart({
						rows,
						series: [
							{ key: 'studentsAbove10', label: 'At or above 10/20', tone: 'success' },
							{ key: 'studentsBelow10', label: 'Below 10/20', tone: 'danger' },
						],
						label: (row) => row.className,
						ariaLabel: 'Students above and below 10 out of 20 by class',
					})}`
				: emptyState('No pass split', 'No tested student in this period.');

		const attentionRows = byClass
			.map((row) => {
				const both = Number(row.both) || 0;
				return {
					classId: row.classId,
					className: row.className,
					academicOnly: Math.max(0, (Number(row.academic) || 0) - both),
					engagementOnly: Math.max(0, (Number(row.engagement) || 0) - both),
					both,
					total: Number(row.total) || 0,
				};
			})
			.filter((row) => row.total > 0);
		const attentionChart =
			attentionRows.length > 0
				? `${T.legend([
						{ label: 'Academic only', tone: 'warning' },
						{ label: 'Engagement only', tone: 'info' },
						{ label: 'Both', tone: 'danger' },
					])}
					${T.stackedBarChart({
						rows: attentionRows,
						segments: [
							{ key: 'academicOnly', label: 'Academic only', tone: 'warning' },
							{ key: 'engagementOnly', label: 'Engagement only', tone: 'info' },
							{ key: 'both', label: 'Academic and engagement', tone: 'danger' },
						],
						label: (row) => row.className,
						valueText: (row) => `${row.total} student(s)`,
						ariaLabel: 'Students requiring attention by class and reason',
					})}`
				: emptyState(
						'No student requires attention',
						'No academic or engagement threshold is crossed in this period.',
					);

		const evolutionPoints = Array.isArray(evolution.points) ? evolution.points : [];
		const validEvolution = evolutionPoints.filter((point) => point.avg20 != null).length;
		const progression =
			validEvolution >= 2
				? `${T.legend([
						{ label: 'Selected period', tone: 'primary' },
						...(evolution.comparable ? [{ label: 'Previous period', tone: 'muted' }] : []),
					])}
					${T.lineChart({
						points: evolutionPoints,
						previousPoints: evolution.previousPoints || [],
						valueKey: 'avg20',
						max: 20,
						threshold: 10,
						ariaLabel: 'Average examination score progression',
					})}
					${T.note
						? T.note(
								`Average per ${evolution.granularity || 'period'}. ${
									evolution.direction
										? `Direction: ${evolution.direction}.`
										: 'Direction needs more valid periods.'
								}`,
							)
						: ''}`
				: emptyState(
						'Not enough examination results to chart progression',
						'A progression needs at least two periods with valid formal exam attempts.',
					);

		const participationPoints = Array.isArray(participation.points)
			? participation.points
			: [];
		const activityChart = participationPoints.some(
			(point) => point.examAttempts || point.trainingAttempts,
		)
			? `${T.legend([
					{ label: 'Exam attempts', tone: 'primary' },
					{ label: 'Training attempts', tone: 'info' },
				])}
				${T.columnChart({
					points: participationPoints,
					series: [
						{ key: 'examAttempts', label: 'Exam attempts', tone: 'primary' },
						{ key: 'trainingAttempts', label: 'Training attempts', tone: 'info' },
					],
					labelKey: 'label',
					ariaLabel: 'Exam and training activity per period',
				})}`
			: emptyState('No learning activity', 'No exam or training attempt was recorded in this period.');

		return `<div class="ta-stack">
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel('Class means', 'Average formal exam score (/20). The pass line is 10/20.', `${means}${meansLegend}`)}
				${chartPanel(
					'Students above / below 10 out of 20',
					'Per-student average across the period, grouped by class.',
					passSplit,
				)}
			</div>
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel(
					'Students requiring attention',
					'Academic and engagement difficulties are counted separately.',
					attentionChart,
				)}
				${chartPanel(
					'Learning progression',
					'Average exam score per period against the previous equivalent period.',
					progression,
				)}
			</div>
			${chartPanel(
				'Activity engagement',
				`Attempts per ${participation.granularity || 'period'} — practice volume, not achievement.`,
				activityChart,
			)}
		</div>`;
	}

	// ── 03 learning insights ───────────────────────────────────────────────

	function learningHtml(progress) {
		const p = progress || {};
		const subjectRows = Array.isArray(p.subjectPerformance) ? p.subjectPerformance : [];
		const evolution = p.performanceEvolution || {};
		const tve = p.trainingVsExam || {};
		const training = tve.training || {};
		const exam = tve.exam || {};
		const classes = Array.isArray(p.classComparison) ? p.classComparison : [];

		const subjects = chartOrEmpty(
			T.barChart({
				rows: subjectRows,
				value: (row) => row.avg20,
				max: 20,
				threshold: 10,
				label: (row) => row.subjectName,
				display: (value) => fmt20(value),
				tone: (row) => (row.avg20 == null ? 'muted' : row.avg20 < 10 ? 'danger' : 'success'),
				ariaLabel: 'Average examination score by subject',
			}),
			'No subject comparison',
			'Exam results could not be attributed to a subject in this period.',
		);

		const contextRows = [
			{ label: 'Training', avg20: training.avg20, sample: training.sample, students: training.students },
			{
				label: 'Formal examinations',
				avg20: exam.avg20,
				sample: exam.sample,
				students: exam.students,
			},
		];
		const context = T.barChart({
			rows: contextRows,
			value: (row) => row.avg20,
			max: 20,
			threshold: 10,
			label: (row) => row.label,
			display: (value) => fmt20(value),
			tone: (row) => (row.label === 'Training' ? 'info' : 'primary'),
			ariaLabel: 'Training average compared with formal examination average',
		});

		const reliable = classes.filter((row) => row.reliable);
		const spread =
			reliable.length >= 2
				? Math.round((reliable[0].avg20 - reliable[reliable.length - 1].avg20) * 10) / 10
				: null;
		const strongestSubject = subjectRows.length
			? subjectRows.slice().sort((a, b) => b.avg20 - a.avg20)[0]
			: null;
		const weakestSubject = subjectRows.length ? subjectRows[0] : null;

		const direction =
			evolution.direction === 'improving'
				? 'Improving'
				: evolution.direction === 'declining'
					? 'Declining'
					: evolution.direction === 'stable'
						? 'Stable'
						: 'Not comparable';

		const metrics = `<div class="ta-metrics">
			${metric('Learning direction', direction, evolution.granularity ? `per ${evolution.granularity}` : '')}
			${metric(
				'Change across period',
				evolution.change == null
					? '—'
					: `${evolution.change > 0 ? '+' : ''}${trimNumber(evolution.change)} pts`,
				'first vs last valid period',
			)}
			${metric(
				'Class spread',
				spread == null ? '—' : `${trimNumber(spread)} pts`,
				reliable.length ? `${reliable.length} reliable class(es)` : 'not enough reliable classes',
			)}
			${metric(
				'Strongest subject',
				strongestSubject ? strongestSubject.subjectName : '—',
				strongestSubject ? fmt20(strongestSubject.avg20) : 'no subject result',
			)}
			${metric(
				'Weakest subject',
				weakestSubject ? weakestSubject.subjectName : '—',
				weakestSubject ? fmt20(weakestSubject.avg20) : 'no subject result',
			)}
		</div>`;

		return `<div class="ta-stack">
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel(
					'Subject performance',
					'Average formal exam score by subject — lowest first.',
					subjects,
				)}
				${chartPanel(
					'Training vs examination',
					'Two different assessment contexts; a gap is a cue to investigate, never proof of mastery.',
					context,
				)}
			</div>
			${chartPanel('Learning direction', 'A summary of the evidence behind the charts above.', metrics)}
			${tve.note ? `<p class="ta-note text-muted">${esc(tve.note)}</p>` : ''}
		</div>`;
	}

	// ── 04 courses & subjects insights ─────────────────────────────────────

	function coursesHtml(content) {
		const c = content || {};
		const training = c.training || {};
		const published = Number((c.publishedCourses || {}).value) || 0;
		const draft = Number((c.draftCourses || {}).value) || 0;
		const chapters = Array.isArray(c.chapters) ? c.chapters : [];
		const most = Array.isArray(c.mostPracticed) ? c.mostPracticed : [];
		const least = Array.isArray(c.leastPracticed) ? c.leastPracticed : [];

		const statusDonut =
			published + draft > 0
				? `${T.donut({
						segments: [
							{ label: 'Published', value: published, tone: 'success' },
							{ label: 'Draft', value: draft, tone: 'warning' },
						],
						centerValue: String(published + draft),
						centerLabel: 'courses',
						ariaLabel: 'Published and draft courses',
					})}
					${T.legend([
						{ label: `Published ${published}`, tone: 'success' },
						{ label: `Draft ${draft}`, tone: 'warning' },
					])}`
				: emptyState('No course', 'No course exists in the selected scope.');

		const participationRing = T.ring({
			value: training.participationRate,
			max: 100,
			label: 'Training participation',
			sublabel: `${fmtCount(training.students)} student(s)`,
			tone:
				training.participationRate == null
					? 'muted'
					: training.participationRate >= 60
						? 'success'
						: training.participationRate >= 30
							? 'warning'
							: 'danger',
		});

		const practiceChart = (rows, emptyTitle, emptyMessage) => {
			if (!rows.length) return emptyState(emptyTitle, emptyMessage);
			return `${T.barChart({
				rows,
				value: (row) => row.practicingStudents,
				label: (row) => row.name,
				display: (value) => `${fmtCount(value)} student(s)`,
				tone: 'primary',
				ariaLabel: 'Practising students per course',
			})}
			${T.legend([{ label: 'Students who practised a chapter', tone: 'primary' }])}`;
		};

		const chapterChart =
			chapters.length > 0
				? `${T.barChart({
						rows: chapters.slice(0, 6),
						value: (row) => row.errorRate,
						max: 100,
						threshold: 50,
						label: (row) => row.name,
						display: (value) => fmtPct(value),
						tone: (row) =>
							row.severity === 'high' ? 'danger' : row.severity === 'medium' ? 'warning' : 'success',
						ariaLabel: 'Error rate per chapter',
					})}
					${T.legend([
						{ label: 'High priority', tone: 'danger' },
						{ label: 'Watch', tone: 'warning' },
						{ label: 'Healthy', tone: 'success' },
					])}`
				: emptyState('No chapter data', 'No answered question in your courses during this period.');

		const metrics = `<div class="ta-metrics">
			${metric('Training attempts', fmtCount(training.attempts), `${fmtCount(training.attemptsPerStudent)} per active student`)}
			${metric('Training average', fmt20(training.avg20), 'practice only — never academic ranking')}
			${metric('Participating students', fmtCount(training.students), `${fmtPct(training.participationRate)} of your students`)}
		</div>`;

		return `<div class="ta-stack">
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel('Course status', 'Published courses are visible to students.', statusDonut)}
				${chartPanel('Practice coverage', 'Share of your students who practised a course chapter.', `${participationRing}${metrics}`)}
			</div>
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel(
					'Most practised',
					'Courses whose chapters students actually worked on.',
					practiceChart(most, 'No practice recorded', 'No course was practised in this period.'),
				)}
				${chartPanel(
					'Least practised',
					'Published courses with the least practice — a candidate for a reminder.',
					practiceChart(least, 'No published course', 'No published course in this scope.'),
				)}
			</div>
			${chartPanel(
				'Chapter difficulty',
				'Observed error rate from real training and exam answers. The 50% line marks a priority chapter.',
				chapterChart,
			)}
			${c.unavailable && c.unavailable.completion ? `<p class="ta-note text-muted">${esc(c.unavailable.completion)}</p>` : ''}
		</div>`;
	}

	// ── 05 questions insights ──────────────────────────────────────────────

	function mixDonut(items, ariaLabel) {
		const list = (Array.isArray(items) ? items : []).filter((item) => Number(item.count) > 0);
		if (!list.length) return '';
		const tones = ['primary', 'info', 'violet', 'success', 'warning', 'danger', 'muted'];
		const segments = list.map((item, index) => ({
			label: item.key || 'Unspecified',
			value: Number(item.count) || 0,
			tone: tones[index % tones.length],
		}));
		const total = segments.reduce((sum, segment) => sum + segment.value, 0);
		return `${T.donut({
			segments,
			centerValue: String(total),
			centerLabel: 'questions',
			ariaLabel,
		})}
		${T.legend(
			segments.map((segment) => ({
				label: `${segment.label} ${segment.value}`,
				tone: segment.tone,
			})),
		)}`;
	}

	function questionsHtml(questions) {
		const q = questions || {};
		const coverage = q.coverage || {};
		const summary = q.summary || {};
		const hardest = Array.isArray(q.hardestQuestions) ? q.hardestQuestions : [];
		const bySubject = Array.isArray(q.bySubject) ? q.bySubject : [];

		const assignmentRing = T.ring({
			value: coverage.assignmentRate,
			max: 100,
			label: 'Used in an exam',
			sublabel: `${fmtCount(coverage.examAssigned)} / ${fmtCount(coverage.total)}`,
			tone: (coverage.assignmentRate || 0) >= 60 ? 'success' : 'warning',
		});
		const practiceRing = T.ring({
			value: coverage.practiceRate,
			max: 100,
			label: 'Answered by students',
			sublabel: `${fmtCount(coverage.practised)} / ${fmtCount(coverage.total)}`,
			tone: (coverage.practiceRate || 0) >= 60 ? 'success' : 'warning',
		});

		const coverageMetrics = `<div class="ta-metrics">
			${metric('Question bank', fmtCount(coverage.total), `${fmtCount(coverage.uncategorised)} without a chapter`)}
			${metric('Never used', fmtCount(coverage.untouched), 'neither exam-assigned nor practised')}
			${metric('Struggling questions', fmtCount((summary.struggling || {}).value), `below ${fmtPct((q.thresholds || {}).passPercent)} correct`)}
			${metric('Strong questions', fmtCount((summary.strong || {}).value), 'at least 75% correct')}
		</div>`;

		const typeMix = chartOrEmpty(
			mixDonut(q.typeMix, 'Question types'),
			'No question type',
			'No question exists in the selected scope.',
		);
		const difficultyMix = chartOrEmpty(
			mixDonut(q.difficultyMix, 'Author-declared difficulty'),
			'No declared difficulty',
			'Questions have no difficulty metadata.',
		);

		const subjectChart = chartOrEmpty(
			T.barChart({
				rows: bySubject,
				value: (row) => row.count,
				label: (row) => row.subjectName,
				display: (value) => `${fmtCount(value)} q.`,
				tone: 'violet',
				ariaLabel: 'Questions per subject',
			}),
			'No subject distribution',
			'No question is attached to a subject.',
		);

		const hardestChart = hardest.length
			? `${T.barChart({
					rows: hardest.slice(0, 5),
					value: (row) => row.correctRate,
					max: 100,
					threshold: 50,
					label: (row) => row.text || 'Question',
					display: (value) => fmtPct(value),
					tone: (row) => ((row.correctRate ?? 100) < 50 ? 'danger' : 'warning'),
					ariaLabel: 'Lowest observed correct rate per question',
				})}
				${T.legend([
					{ label: 'Correct rate', tone: 'danger' },
					{ label: 'Pass line 50%', tone: 'muted' },
				])}
				<p class="ta-note text-muted">${esc(
					`Observed over at least ${fmtCount((q.thresholds || {}).minAttempts)} answers. Author difficulty is never substituted.`,
				)}</p>`
			: emptyState(
					'Not enough answers to rank questions',
					'A question needs several real answers before it appears here.',
				);

		return `<div class="ta-stack">
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel(
					'Bank coverage',
					'Assignment and practice coverage of the question bank.',
					`<div class="ta-metrics">${assignmentRing}${practiceRing}</div>${coverageMetrics}`,
				)}
				${chartPanel('Question types', 'Composition of the bank by question type.', typeMix)}
			</div>
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel(
					'Author-declared difficulty',
					'How authors labelled the bank. Observed performance is shown separately.',
					difficultyMix,
				)}
				${chartPanel('Questions per subject', 'Where the bank is concentrated.', subjectChart)}
			</div>
			${chartPanel(
				'Hardest questions',
				'Lowest observed correct rate — a review candidate, not a judgement on the author.',
				hardestChart,
			)}
			${q.unavailable && q.unavailable.difficulty ? `<p class="ta-note text-muted">${esc(q.unavailable.difficulty)}</p>` : ''}
		</div>`;
	}

	// ── 06 score distribution ──────────────────────────────────────────────

	function distributionHtml(exams, glance) {
		const e = exams || {};
		const g = glance || {};
		const distribution = Array.isArray(e.distribution) ? e.distribution : [];
		const summary = e.summary || {};
		const avg = summary.avg20 || {};
		const success = summary.successRate || {};
		const certification = g.certificationRate || {};

		const histogram = chartOrEmpty(
			T.histogram({ buckets: distribution, ariaLabel: 'Distribution of formal exam scores out of 20' }),
			'No score distribution',
			'No valid formal exam result in this period.',
		);
		const histogramLegend = T.legend([{ label: 'Valid exam attempts', tone: 'primary' }]);

		const rings = `<div class="ta-metrics">
			${T.ring({
				value: success.value,
				max: 100,
				label: 'Exam success',
				sublabel: `${fmtCount(success.passed)} / ${fmtCount(success.total)} attempts`,
				tone: (success.value || 0) >= 50 ? 'success' : 'danger',
			})}
			${T.ring({
				value: certification.value,
				max: 100,
				label: 'Certification',
				sublabel: 'students at or above 10/20',
				tone: (certification.value || 0) >= 50 ? 'success' : 'warning',
			})}
			${T.ring({
				value: avg.value,
				max: 20,
				label: 'Average score',
				sublabel: `${fmtCount(avg.sample)} attempt(s)`,
				tone: (avg.value || 0) >= 10 ? 'success' : 'danger',
			})}
		</div>`;

		const metrics = `<div class="ta-metrics">
			${metric('Completed exams', fmtCount((summary.completed || {}).value), 'in the selected period')}
			${metric('Assessed students', fmtCount((g.assessedStudents || {}).value), `${fmtPct((g.assessedStudents || {}).rate)} of your students`)}
			${metric('Certified students', fmtCount((g.certifiedStudents || {}).value), 'at or above 10/20')}
			${metric('Below 10/20', fmtCount((g.failedExamStudents || {}).value), 'assessed students')}
		</div>`;

		return `<div class="ta-stack">
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel(
					'Score distribution',
					'Share of valid formal attempts by /20 band. Training and games are excluded.',
					`${histogram}${histogramLegend}`,
				)}
				${chartPanel('Assessment health', 'Success, certification and average score.', rings)}
			</div>
			${chartPanel('Assessment totals', 'Evidence behind the distribution and health rings.', metrics)}
			${(e.unavailable && e.unavailable.schedule) ? `<p class="ta-note text-muted">${esc(e.unavailable.schedule)}</p>` : ''}
		</div>`;
	}

	// ── 07 educational engagement ──────────────────────────────────────────

	function engagementHtml(engagement) {
		const en = engagement || {};
		const games = en.games || {};
		const tournaments = en.tournaments || {};
		const trend = Array.isArray(en.trend) ? en.trend : [];
		const topActivities = Array.isArray(en.topActivities) ? en.topActivities : [];
		const activeClasses = Array.isArray(en.activeClasses) ? en.activeClasses : [];

		const trendChart = trend.some((point) => point.games || point.tournaments)
			? `${T.legend([
					{ label: 'Game sessions', tone: 'violet' },
					{ label: 'Tournament entries', tone: 'info' },
				])}
				${T.columnChart({
					points: trend,
					series: [
						{ key: 'games', label: 'Game sessions', tone: 'violet' },
						{ key: 'tournaments', label: 'Tournament entries', tone: 'info' },
					],
					labelKey: 'label',
					ariaLabel: 'Game sessions and tournament entries over time',
				})}`
			: emptyState('No game activity', 'No game session or tournament entry in this period.');

		const activitiesChart = topActivities.length
			? T.barChart({
					rows: topActivities,
					value: (row) => row.participants,
					label: (row) => `${row.name} · ${row.type === 'game' ? 'Game' : 'Tournament'}`,
					display: (value) => `${fmtCount(value)} participant(s)`,
					tone: (row) => (row.type === 'game' ? 'violet' : 'info'),
					ariaLabel: 'Most engaging activities by participants',
				})
			: emptyState('No activity', 'No game or tournament activity in this period.');

		const classesChart = activeClasses.length
			? T.barChart({
					rows: activeClasses,
					value: (row) => row.students,
					label: (row) => row.className,
					display: (value) => `${fmtCount(value)} student(s)`,
					tone: 'info',
					ariaLabel: 'Participating students per class',
				})
			: emptyState('No participating class', 'No class recorded engagement in this period.');

		const metrics = `<div class="ta-metrics">
			${metric('Game sessions', fmtCount(games.sessions), `${fmtCount(games.students)} student(s)`)}
			${metric('Game participation', fmtPct(games.participationRate), `${fmtCount(games.completed)} completed`)}
			${metric('Tournament entries', fmtCount(tournaments.entries), `${fmtCount(tournaments.students)} student(s)`)}
			${metric('Active tournaments', fmtCount(tournaments.active), 'open or running')}
		</div>`;

		return `<div class="ta-stack">
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel('Engagement trend', 'Game sessions and tournament entries per period.', trendChart)}
				${chartPanel('Top activities', 'Ranked by participants — engagement, never academic ranking.', activitiesChart)}
			</div>
			<div class="dashboard-charts-grid ta-grid--2">
				${chartPanel('Participation by class', 'Students who played at least one game or tournament.', classesChart)}
				${chartPanel('Engagement totals', 'Evidence behind the engagement charts.', metrics)}
			</div>
			${en.unavailable && en.unavailable.ranking ? `<p class="ta-note text-muted">${esc(en.unavailable.ranking)}</p>` : ''}
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
		const clearChip = target.closest('[data-tov-clear-filter]');
		if (clearChip) {
			const key = clearChip.getAttribute('data-tov-clear-filter');
			if (key === 'class') state.filters.classIds = [];
			if (key === 'subject') state.filters.subjectIds = [];
			if (key === 'period') {
				state.filters.period = 'month';
				state.filters.from = '';
				state.filters.to = '';
			}
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
		}
	}

	// ── public API + boot ──────────────────────────────────────────────────

	window.TeacherOverview = {
		load,
		refresh: () => load({ force: true }),
		clearFilters,
		// Read-only snapshot so the per-tab analytics panels read the same
		// class/subject/period scope as the Overview dashboard.
		getFilters: () => ({
			classIds: [...state.filters.classIds],
			subjectIds: [...state.filters.subjectIds],
			period: state.filters.period || 'month',
			from: state.filters.period === 'custom' ? state.filters.from : '',
			to: state.filters.period === 'custom' ? state.filters.to : '',
		}),
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
