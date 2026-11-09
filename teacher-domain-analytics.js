// ============================================================
// TEACHER DOMAIN ANALYTICS — PER-TAB KPIS AND INSIGHTS
// ============================================================
// Every teacher tab shows analytics about its own domain only:
// Questions, Courses (Subjects), Exams, Classes, Results and Games.
//
// Architectural rule: this module NEVER manages data and NEVER renders a
// second management table — except the intervention list, which exists only
// here now that the Overview is a pure analytics dashboard. Every action
// navigates to an existing module through TeacherOverview.open().
//
// Data comes from the same teacher-scoped analytics contract as the Overview
// (GET /api/v1/teacher-overview/overview) plus the live presence endpoint.
// Panels are rendered lazily the first time a tab is opened, then cached until
// the teacher asks for a refresh.

(function () {
	'use strict';

	if (window.TeacherDomainAnalytics) return;

	const HOSTS = {
		questions: 'questionsAnalytics',
		subjects: 'subjectsAnalytics',
		exams: 'examsAnalytics',
		classes: 'classesAnalytics',
		results: 'resultsAnalytics',
		games: 'gamesAnalytics',
	};

	const TITLES = {
		questions: {
			title: 'Questions analytics',
			subtitle: 'Bank size, coverage, composition and observed difficulty.',
		},
		subjects: {
			title: 'Courses analytics',
			subtitle: 'Practice coverage, course status and chapter difficulty.',
		},
		exams: {
			title: 'Exams analytics',
			subtitle: 'Formal assessment results, distribution and outstanding work.',
		},
		classes: {
			title: 'Classes analytics',
			subtitle: 'Live presence, class means, pass split and attention load.',
		},
		results: {
			title: 'Results analytics',
			subtitle: 'Certification, score distribution and the intervention list.',
		},
		games: {
			title: 'Games analytics',
			subtitle: 'Engagement and reinforcement only — never an academic measure.',
		},
	};

	const state = {
		data: null,
		presence: null,
		lastLoadAt: 0,
		loading: null,
		loadingSignature: '',
		signature: '',
		requestToken: 0,
		rendered: new Set(),
		views: Object.create(null),
	};

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

	function fmt20(value) {
		const n = Number(value);
		if (value == null || !Number.isFinite(n)) return '—';
		return `${Math.round(n * 10) / 10}/20`;
	}

	function fmtPct(value) {
		const n = Number(value);
		if (value == null || !Number.isFinite(n)) return '—';
		return `${Math.round(n * 10) / 10}%`;
	}

	function fmtCount(value) {
		return value == null || !Number.isFinite(Number(value)) ? '—' : String(value);
	}

	function fmtTime(iso) {
		if (!iso) return '—';
		const date = new Date(iso);
		if (!Number.isFinite(date.getTime())) return '—';
		return date.toLocaleString(undefined, {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function empty(title, message) {
		const kit = window.TeacherAnalytics;
		return kit
			? kit.empty(title, message)
			: `<p class="ta-empty"><strong>${esc(title)}</strong> ${esc(message || '')}</p>`;
	}

	function chartOrEmpty(markup, title, message) {
		return markup || empty(title, message);
	}

	function metric(label, value, note) {
		return `<div class="ta-metric">
			<span class="ta-metric__label">${esc(label)}</span>
			<strong class="ta-metric__value">${esc(value)}</strong>
			${note ? `<span class="ta-metric__note">${esc(note)}</span>` : ''}
		</div>`;
	}

	function linkFactory() {
		const links = [];
		return {
			links,
			btn(link, label, className) {
				const index = links.push(link) - 1;
				return `<button type="button" class="${className || 'teacher-overview__link'}" data-tda-link="${index}">${esc(
					label,
				)}</button>`;
			},
		};
	}

	function navigate(link) {
		if (!link) return;
		if (window.TeacherOverview && typeof window.TeacherOverview.open === 'function') {
			window.TeacherOverview.open(link);
			return;
		}
		if (link.tab && typeof window.openTab === 'function') window.openTab(null, link.tab);
	}

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

	function kpiGrid(cards) {
		return `<div class="kpi-grid ta-kpi-grid">${cards.join('')}</div>`;
	}

	function panel(title, subtitle, body) {
		const kit = window.TeacherAnalytics;
		return `<section class="dashboard-panel ta-panel">
			<div class="panel-header">
				<div>
					<h3>${esc(title)}</h3>
					${subtitle ? `<p class="ta-panel__sub">${esc(subtitle)}</p>` : ''}
				</div>
			</div>
			<div class="panel-body">${body}</div>
		</section>`;
	}

	function insights(list, domain) {
		const items = (Array.isArray(list) ? list : []).filter((item) => item.domain === domain);
		if (!items.length) {
			return empty(
				'No insight for this section',
				'No pedagogical observation about this domain is triggered in the period.',
			);
		}
		return `<div class="ta-insights">
			${items
				.map(
					(item) => `<article class="ta-insight ta-insight--${esc(item.severity || 'info')}">
						<div class="ta-insight__head">
							<span class="ta-insight__domain">${esc(domain)}</span>
							<span class="ta-insight__scope">${esc(item.scope || '')}</span>
						</div>
						<h4>${esc(item.observation)}</h4>
						<p class="ta-insight__metric">${esc(item.metric)}</p>
						<div class="ta-insight__foot">
							<span class="text-muted text-xs">${esc(item.target || '')}</span>
							${ui.btn(item.link, item.action || 'Open', 'btn btn-secondary btn-sm')}
						</div>
					</article>`,
				)
				.join('')}
		</div>`;
	}

	// Set by buildBody() for the current render so insight cards can register
	// links in the same per-host registry as the rest of the panel.
	let ui = linkFactory();

	// ── data ───────────────────────────────────────────────────────────────

	// The domain panels are a second view of the Overview contract, so they
	// must read the same class/subject/period scope. Reading it lazily keeps
	// them correct when the teacher changes the Overview filters and then
	// opens a domain tab.
	function currentFilters() {
		try {
			const filters = window.TeacherOverview && typeof window.TeacherOverview.getFilters === 'function'
				? window.TeacherOverview.getFilters()
				: null;
			if (filters) return filters;
		} catch (_) {
			/* fall through to the default scope */
		}
		return { classIds: [], subjectIds: [], period: 'month', from: '', to: '' };
	}

	function filterParams() {
		const filters = currentFilters();
		return {
			classIds: (filters.classIds || []).join(','),
			subjectIds: (filters.subjectIds || []).join(','),
			period: filters.period || 'month',
			from: filters.period === 'custom' ? filters.from || '' : '',
			to: filters.period === 'custom' ? filters.to || '' : '',
		};
	}

	function filterSignature(params) {
		return [params.classIds, params.subjectIds, params.period, params.from, params.to].join('|');
	}

	function isStale() {
		return !state.data || state.signature !== filterSignature(filterParams());
	}

	async function ensureData(force) {
		const params = filterParams();
		const signature = filterSignature(params);
		if (!force && !isStale() && Date.now() - state.lastLoadAt < 60000) return state.data;
		if (state.loading) {
			if (state.loadingSignature === signature) return state.loading;
			try {
				await state.loading;
			} catch (_) {
				/* the newer request below owns the outcome */
			}
			if (state.data && state.signature === signature) return state.data;
		}
		const token = ++state.requestToken;
		const loading = (async () => {
			if (!window.API || typeof window.API.list !== 'function') {
				throw new Error('The REST client is not available. Reload the page.');
			}
			const presencePromise = Promise.resolve()
				.then(() => window.API.list('teacher-overview/presence', params))
				.then((payload) => (payload && payload.data) || null)
				.catch(() => null);
			const payload = await window.API.list('teacher-overview/overview', params);
			const data = payload && payload.data;
			if (!data || !data.sections) throw new Error('Unexpected analytics response.');
			if (token !== state.requestToken) return data;
			state.data = data;
			state.presence = await presencePromise;
			state.lastLoadAt = Date.now();
			state.signature = signature;
			return data;
		})();
		state.loading = loading;
		state.loadingSignature = signature;
		try {
			return await loading;
		} finally {
			if (state.requestToken === token) {
				state.loading = null;
				state.loadingSignature = '';
			}
		}
	}

	// ── manage / analytics views ───────────────────────────────────────────
	// Every domain tab is split in two: the original management UI and the
	// read-only analytics presentation. Management stays the default so the
	// existing workflows never move; analytics loads only when requested.

	function activeView(tab) {
		return state.views[tab] === 'analytics' ? 'analytics' : 'manage';
	}

	function setupSection(tab) {
		const section = document.getElementById(tab);
		const host = document.getElementById(HOSTS[tab]);
		if (!section || !host || typeof section.appendChild !== 'function') return null;
		if (section.__tdaViews) return section.__tdaViews;
		if (!host.parentNode || !section.contains(host)) return null;

		const switcher = document.createElement('div');
		switcher.className = 'teacher-domain-switch';
		switcher.setAttribute('role', 'tablist');
		switcher.setAttribute('aria-label', `${TITLES[tab]?.title || tab} views`);
		switcher.innerHTML = `
			<button type="button" class="teacher-domain-switch__btn" id="tda-${tab}-manage" data-tda-view="manage" role="tab" aria-controls="tda-${tab}-manage-pane" aria-selected="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
				Manage
			</button>
			<button type="button" class="teacher-domain-switch__btn" id="tda-${tab}-analytics" data-tda-view="analytics" role="tab" aria-controls="tda-${tab}-analytics-pane" aria-selected="false">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>
				Analytics
			</button>`;

		const manage = document.createElement('div');
		manage.className = 'teacher-domain-view';
		manage.id = `tda-${tab}-manage-pane`;
		manage.setAttribute('role', 'tabpanel');
		manage.setAttribute('aria-labelledby', `tda-${tab}-manage`);
		manage.setAttribute('data-tda-pane', 'manage');
		const analytics = document.createElement('div');
		analytics.className = 'teacher-domain-view';
		analytics.id = `tda-${tab}-analytics-pane`;
		analytics.setAttribute('role', 'tabpanel');
		analytics.setAttribute('aria-labelledby', `tda-${tab}-analytics`);
		analytics.setAttribute('data-tda-pane', 'analytics');
		analytics.hidden = true;

		Array.prototype.slice.call(section.childNodes).forEach((node) => {
			if (node === host) analytics.appendChild(node);
			else manage.appendChild(node);
		});

		section.appendChild(switcher);
		section.appendChild(manage);
		section.appendChild(analytics);

		const views = { switcher, manage, analytics };
		section.__tdaViews = views;

		switcher.addEventListener('click', (event) => {
			const button = event.target && event.target.closest ? event.target.closest('[data-tda-view]') : null;
			if (!button) return;
			showView(tab, button.getAttribute('data-tda-view'));
		});

		applyView(tab, activeView(tab));
		return views;
	}

	function applyView(tab, view) {
		const section = document.getElementById(tab);
		const views = section && section.__tdaViews;
		if (!views) return;
		const next = view === 'analytics' ? 'analytics' : 'manage';
		state.views[tab] = next;
		Array.prototype.forEach.call(views.switcher.children, (button) => {
			const selected = button.getAttribute('data-tda-view') === next;
			button.classList.toggle('active', selected);
			button.setAttribute('aria-selected', selected ? 'true' : 'false');
		});
		views.manage.hidden = next !== 'manage';
		views.analytics.hidden = next !== 'analytics';
	}

	function showView(tab, view) {
		if (!isTeacherSession() || !HOSTS[tab]) return activeView(tab);
		setupSection(tab);
		const next = view === 'analytics' ? 'analytics' : 'manage';
		applyView(tab, next);
		if (next === 'analytics') {
			if (typeof window.closeStudentProfile === 'function') {
				try {
					window.closeStudentProfile();
				} catch (_) {
					/* optional */
				}
			}
			render(tab, false);
		}
		return next;
	}

	// ── render ─────────────────────────────────────────────────────────────

	async function render(tab, force) {
		const host = document.getElementById(HOSTS[tab]);
		if (!host || !isTeacherSession()) return;
		setupSection(tab);
		bind(host, tab);
		host.hidden = false;
		const stale = force || isStale();
		if (stale) {
			host.innerHTML = `<div class="teacher-domain-analytics__loading" aria-busy="true">
				<p class="text-muted">Loading ${esc(tab)} analytics…</p>
			</div>`;
		}
		try {
			const data = await ensureData(stale);
			if (!document.body.contains(host)) return;
			const scope = (data.meta && data.meta.scope) || {};
			if (scope.empty) {
				host.innerHTML = `<div class="dashboard-panel">
					<div class="panel-header"><h3>No classes to report on</h3></div>
					<div class="panel-body">
						<p class="text-muted">${esc(
							data.meta.emptyReason || 'No class is assigned to your account.',
						)}</p>
						<button type="button" class="btn btn-secondary" data-tda-tab="classes">Open classes</button>
					</div>
				</div>`;
				bind(host, tab);
				return;
			}
			ui = linkFactory();
			const built = buildBody(tab, data);
			host.innerHTML = shell(tab, data.meta, built.html);
			host.__tdaLinks = ui.links;
			state.rendered.add(tab);
		} catch (err) {
			host.innerHTML = `<div class="dashboard-panel">
				<div class="panel-header"><h3>${esc(TITLES[tab].title)} unavailable</h3></div>
				<div class="panel-body">
					<p class="text-muted">${esc(err && err.message ? err.message : 'The analytics could not be loaded.')}</p>
					<button type="button" class="btn btn-secondary" data-tda-refresh>Try again</button>
				</div>
			</div>`;
			bind(host, tab);
		}
	}

	function scopeChips(meta) {
		const scope = (meta && meta.scope) || {};
		const allClasses = Array.isArray(scope.allClasses) ? scope.allClasses : [];
		const selectedClasses = Array.isArray(scope.classes) ? scope.classes : [];
		const subjects = Array.isArray(scope.subjects) ? scope.subjects : [];
		const subjectIds = new Set((scope.subjectIds || []).map(String));
		const selectedSubjects = subjects
			.filter((subject) => subjectIds.has(String(subject.id)))
			.map((subject) => subject.name);

		const chips = [];
		const period = meta && meta.period && meta.period.label;
		if (period) chips.push(`<span class="ta-scope__chip ta-scope__chip--period">${esc(period)}</span>`);

		const allSelected =
			!allClasses.length ||
			(selectedClasses.length > 0 && selectedClasses.length >= allClasses.length);
		const classLabel = allSelected
			? 'All classes'
			: selectedClasses.map((klass) => klass.name).join(', ');
		chips.push(`<span class="ta-scope__chip">${esc(classLabel)}</span>`);

		if (selectedSubjects.length) {
			chips.push(`<span class="ta-scope__chip">${esc(selectedSubjects.join(', '))}</span>`);
		}
		chips.push(
			`<span class="ta-scope__chip ta-scope__chip--muted">${esc(
				fmtCount(scope.studentCount),
			)} students</span>`,
		);
		return `<div class="ta-scope" role="list" aria-label="Analytics scope">${chips.join('')}</div>
			<p class="ta-domain__hint">Uses the same filters as the Overview. Widen them there if a chart looks empty.</p>`;
	}

	function shell(tab, meta, body) {
		const titles = TITLES[tab] || { title: 'Analytics', subtitle: '' };
		return `<section class="ta-domain">
			<header class="ta-domain__head">
				<div>
					<h2 class="ta-domain__title">${esc(titles.title)}</h2>
					<p class="ta-domain__sub">${esc(titles.subtitle)}</p>
					${scopeChips(meta)}
				</div>
				<div class="ta-domain__actions">
					<span class="text-muted text-xs">Updated ${esc(fmtTime(meta && meta.generatedAt))}</span>
					<button type="button" class="btn btn-secondary btn-sm" data-tda-refresh>Refresh</button>
				</div>
			</header>
			<div class="ta-stack">${body}</div>
		</section>`;
	}

	function bind(host, tab) {
		if (host.__tdaBound) return;
		host.__tdaBound = true;
		host.addEventListener('click', (event) => {
			const target = event.target;
			if (!target || typeof target.closest !== 'function') return;
			const refresh = target.closest('[data-tda-refresh]');
			if (refresh) {
				render(tab, true);
				return;
			}
			const tabButton = target.closest('[data-tda-tab]');
			if (tabButton) {
				const name = tabButton.getAttribute('data-tda-tab');
				if (typeof window.openTab === 'function') window.openTab(null, name);
				return;
			}
			const linkButton = target.closest('[data-tda-link]');
			if (linkButton) {
				const index = Number(linkButton.getAttribute('data-tda-link'));
				navigate((host.__tdaLinks || [])[index]);
			}
		});
	}

	// ── domain bodies ──────────────────────────────────────────────────────

	function buildBody(tab, data) {
		const sections = data.sections || {};
		if (tab === 'questions') return questionsBody(sections);
		if (tab === 'subjects') return coursesBody(sections);
		if (tab === 'exams') return examsBody(sections);
		if (tab === 'classes') return classesBody(sections, data.meta);
		if (tab === 'results') return resultsBody(sections);
		if (tab === 'games') return gamesBody(sections);
		return { html: '', links: ui.links };
	}

	function questionsBody(sections) {
		const kit = window.TeacherAnalytics;
		const q = sections.questions || {};
		const coverage = q.coverage || {};
		const summary = q.summary || {};
		const thresholds = q.thresholds || {};
		const bySubject = Array.isArray(q.bySubject) ? q.bySubject : [];
		const hardest = Array.isArray(q.hardestQuestions) ? q.hardestQuestions : [];

		const cards = kpiGrid([
			kpiCard({
				label: 'Questions in the bank',
				value: fmtCount((summary.total || {}).value),
				note: `${fmtCount(coverage.categorised)} categorised`,
				tone: 'blue',
			}),
			kpiCard({
				label: 'Used in an exam',
				value: fmtCount(coverage.examAssigned),
				note: fmtPct(coverage.assignmentRate),
				tone: 'violet',
			}),
			kpiCard({
				label: 'Answered by students',
				value: fmtCount(coverage.practised),
				note: fmtPct(coverage.practiceRate),
				tone: 'cyan',
			}),
			kpiCard({
				label: 'Never used',
				value: fmtCount(coverage.untouched),
				note: `${fmtCount(coverage.uncategorised)} without a chapter`,
				tone: 'amber',
				foot: ui.btn({ tab: 'questions' }, 'Open questions'),
			}),
			kpiCard({
				label: 'Struggling questions',
				value: fmtCount((summary.struggling || {}).value),
				note: `below ${fmtPct(thresholds.passPercent)} correct`,
				tone: 'rose',
			}),
			kpiCard({
				label: 'Strong questions',
				value: fmtCount((summary.strong || {}).value),
				note: 'at least 75% correct',
				tone: 'green',
			}),
		]);

		const mixes = `<div class="dashboard-charts-grid ta-grid--2">
			${panel(
				'Question types',
				'Composition of the bank by type.',
				chartOrEmpty(
					mixDonut(kit, q.typeMix, 'Question types'),
					'No question type',
					'No question exists in the selected scope.',
				),
			)}
			${panel(
				'Author-declared difficulty',
				'How authors labelled the bank; observed difficulty is shown below.',
				chartOrEmpty(
					mixDonut(kit, q.difficultyMix, 'Author-declared difficulty'),
					'No declared difficulty',
					'Questions have no difficulty metadata.',
				),
			)}
		</div>`;

		const subjectChart = chartOrEmpty(
			kit.barChart({
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
			? `${kit.barChart({
					rows: hardest.slice(0, 5),
					value: (row) => row.correctRate,
					max: 100,
					threshold: 50,
					label: (row) => row.text || 'Question',
					display: (value) => fmtPct(value),
					tone: (row) => ((row.correctRate ?? 100) < 50 ? 'danger' : 'warning'),
					ariaLabel: 'Lowest observed correct rate per question',
				})}
				${kit.legend([
					{ label: 'Correct rate', tone: 'danger' },
					{ label: 'Pass line 50%', tone: 'muted' },
				])}`
			: empty(
					'Not enough answers to rank questions',
					`A question needs at least ${fmtCount(thresholds.minAttempts)} answers.`,
				);

		return {
			html: `${cards}${mixes}
				<div class="dashboard-charts-grid ta-grid--2">
					${panel('Questions per subject', 'Where the bank is concentrated.', subjectChart)}
					${panel('Hardest questions', 'Lowest observed correct rate — a review candidate.', hardestChart)}
				</div>
				${panel('Questions insights', `Observations limited to the question bank.`, insights(sections.insights, 'questions'))}`,
			links: ui.links,
		};
	}

	function mixDonut(kit, items, ariaLabel) {
		const list = (Array.isArray(items) ? items : []).filter((item) => Number(item.count) > 0);
		if (!list.length) return '';
		const tones = ['primary', 'info', 'violet', 'success', 'warning', 'danger', 'muted'];
		const segments = list.map((item, index) => ({
			label: item.key || 'Unspecified',
			value: Number(item.count) || 0,
			tone: tones[index % tones.length],
		}));
		const total = segments.reduce((sum, segment) => sum + segment.value, 0);
		return `${kit.donut({
			segments,
			centerValue: String(total),
			centerLabel: 'questions',
			ariaLabel,
		})}
		${kit.legend(
			segments.map((segment) => ({ label: `${segment.label} ${segment.value}`, tone: segment.tone })),
		)}`;
	}

	function coursesBody(sections) {
		const kit = window.TeacherAnalytics;
		const c = sections.content || {};
		const training = c.training || {};
		const published = Number((c.publishedCourses || {}).value) || 0;
		const draft = Number((c.draftCourses || {}).value) || 0;
		const chapters = Array.isArray(c.chapters) ? c.chapters : [];
		const most = Array.isArray(c.mostPracticed) ? c.mostPracticed : [];
		const least = Array.isArray(c.leastPracticed) ? c.leastPracticed : [];

		const cards = kpiGrid([
			kpiCard({ label: 'Published courses', value: fmtCount(published), note: 'visible to students', tone: 'green' }),
			kpiCard({ label: 'Draft courses', value: fmtCount(draft), note: 'not visible yet', tone: 'amber' }),
			kpiCard({
				label: 'Training attempts',
				value: fmtCount(training.attempts),
				note: `${fmtCount(training.attemptsPerStudent)} per active student`,
				tone: 'blue',
			}),
			kpiCard({
				label: 'Training participation',
				value: fmtPct(training.participationRate),
				note: `${fmtCount(training.students)} student(s) practised`,
				tone: 'cyan',
			}),
			kpiCard({
				label: 'Training average',
				value: fmt20(training.avg20),
				note: 'practice only — never an academic ranking',
				tone: 'indigo',
			}),
		]);

		const statusDonut =
			published + draft > 0
				? `${kit.donut({
						segments: [
							{ label: 'Published', value: published, tone: 'success' },
							{ label: 'Draft', value: draft, tone: 'warning' },
						],
						centerValue: String(published + draft),
						centerLabel: 'courses',
						ariaLabel: 'Published and draft courses',
					})}
					${kit.legend([
						{ label: `Published ${published}`, tone: 'success' },
						{ label: `Draft ${draft}`, tone: 'warning' },
					])}`
				: empty('No course', 'No course exists in the selected scope.');

		const practice = (rows, emptyTitle, emptyMessage) =>
			rows.length
				? kit.barChart({
						rows,
						value: (row) => row.practicingStudents,
						label: (row) => row.name,
						display: (value) => `${fmtCount(value)} student(s)`,
						tone: 'primary',
						ariaLabel: 'Practising students per course',
					})
				: empty(emptyTitle, emptyMessage);

		const chapterChart = chapters.length
			? `${kit.barChart({
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
				${kit.legend([
					{ label: 'High priority', tone: 'danger' },
					{ label: 'Watch', tone: 'warning' },
					{ label: 'Healthy', tone: 'success' },
				])}`
			: empty('No chapter data', 'No answered question in your courses during this period.');

		return {
			html: `${cards}
				<div class="dashboard-charts-grid ta-grid--2">
					${panel('Course status', 'Published courses are visible to students.', statusDonut)}
					${panel(
						'Practice coverage',
						'Share of your students who practised a course chapter.',
						`<div class="ta-metrics">
							${kit.ring({
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
							})}
							${metric('Training attempts', fmtCount(training.attempts), 'practice attempts')}
							${metric('Per active student', fmtCount(training.attemptsPerStudent), 'average')}
						</div>`,
					)}
				</div>
				<div class="dashboard-charts-grid ta-grid--2">
					${panel(
						'Most practised',
						'Courses whose chapters students actually worked on.',
						practice(most, 'No practice recorded', 'No course was practised in this period.'),
					)}
					${panel(
						'Least practised',
						'Published courses with the least practice — a candidate for a reminder.',
						practice(least, 'No published course', 'No published course in this scope.'),
					)}
				</div>
				${panel(
					'Chapter difficulty',
					'Observed error rate from real answers. The 50% line marks a priority chapter.',
					chapterChart,
				)}
				${panel('Courses insights', 'Observations limited to courses and training.', insights(sections.insights, 'subjects'))}`,
			links: ui.links,
		};
	}

	function examsBody(sections) {
		const kit = window.TeacherAnalytics;
		const e = sections.exams || {};
		const summary = e.summary || {};
		const distribution = Array.isArray(e.distribution) ? e.distribution : [];
		const classRows = Array.isArray(e.classComparison) ? e.classComparison : [];
		const awaiting = Array.isArray(e.awaiting) ? e.awaiting : [];

		const cards = kpiGrid([
			kpiCard({
				label: 'Completed exams',
				value: fmtCount((summary.completed || {}).value),
				note: 'with a valid attempt in the period',
				tone: 'blue',
			}),
			kpiCard({
				label: 'Average score',
				value: fmt20((summary.avg20 || {}).value),
				note: `${fmtCount((summary.avg20 || {}).sample)} valid attempt(s)`,
				tone: 'indigo',
			}),
			kpiCard({
				label: 'Success rate',
				value: fmtPct((summary.successRate || {}).value),
				note: `${fmtCount((summary.successRate || {}).passed)} of ${fmtCount(
					(summary.successRate || {}).total,
				)} at 10/20`,
				tone: 'green',
			}),
			kpiCard({
				label: 'Exams awaiting completion',
				value: fmtCount((summary.awaitingCount || {}).value),
				note: 'assigned and still active',
				tone: 'amber',
				foot: ui.btn({ tab: 'exams' }, 'Open exams'),
			}),
			kpiCard({
				label: 'Pending attempts',
				value: fmtCount((summary.pendingAttempts || {}).value),
				note: 'assigned, not completed',
				tone: 'rose',
			}),
		]);

		const histogram = chartOrEmpty(
			kit.histogram({ buckets: distribution, ariaLabel: 'Distribution of formal exam scores out of 20' }),
			'No score distribution',
			'No valid formal exam result in this period.',
		);

		const classChart = chartOrEmpty(
			kit.barChart({
				rows: classRows,
				value: (row) => row.avg20,
				max: 20,
				threshold: 10,
				label: (row) => row.className,
				display: (value) => fmt20(value),
				tone: (row) => (row.avg20 < 10 ? 'danger' : 'success'),
				ariaLabel: 'Average examination score by class',
			}),
			'No class comparison',
			'No formal exam result was recorded in this period.',
		);

		const pendingChart = awaiting.length
			? kit.barChart({
					rows: awaiting.slice(0, 6),
					value: (row) => row.pending,
					label: (row) => row.name,
					display: (value) => `${fmtCount(value)} pending`,
					tone: (row) => (row.pending > 0 ? 'warning' : 'success'),
					ariaLabel: 'Pending attempts per exam',
				})
			: empty('Nothing awaiting completion', 'No assigned active exam has pending attempts.');

		return {
			html: `${cards}
				<div class="dashboard-charts-grid ta-grid--2">
					${panel(
						'Score distribution',
						'Share of valid formal attempts by /20 band. Training and games are excluded.',
						`${histogram}${kit.legend([{ label: 'Valid exam attempts', tone: 'primary' }])}`,
					)}
					${panel('Class comparison', 'Average exam score by class against the 10/20 pass line.', classChart)}
				</div>
				${panel('Awaiting completion', 'Assigned active exams ordered by pending attempts.', pendingChart)}
				${panel('Exams insights', 'Observations limited to formal examinations.', insights(sections.insights, 'exams'))}`,
			links: ui.links,
		};
	}

	function classesBody(sections, meta) {
		const kit = window.TeacherAnalytics;
		const glance = sections.glance || {};
		const progress = sections.progress || {};
		const attention = sections.attention || {};
		const rows = Array.isArray(progress.classComparison) ? progress.classComparison : [];
		const byClass = Array.isArray(attention.byClass) ? attention.byClass : [];
		const presence = state.presence;
		const totalClasses = presence ? presence.totalClasses : (meta.scope && meta.scope.allClasses ? meta.scope.allClasses.length : 0);
		const best = progress.bestClass;
		const weakest = progress.weekComparison ? progress.weekComparison.weakest : null;

		const cards = kpiGrid([
			kpiCard({
				label: 'Classes online',
				value: presence ? `${fmtCount(presence.classesOnline)} / ${fmtCount(totalClasses)}` : '—',
				note: presence ? `${fmtCount(presence.studentsOnline)} student(s) online` : 'Live presence unavailable',
				tone: 'blue',
			}),
			kpiCard({
				label: 'Students',
				value: fmtCount((glance.totalStudents || {}).value),
				note: `${fmtCount((glance.activeStudents || {}).value)} active in the period`,
				tone: 'cyan',
			}),
			kpiCard({
				label: 'Best-ranked class',
				value: best ? best.className : '—',
				note: best ? `${fmt20(best.avg20)} · ${fmtCount(best.sample)} attempt(s)` : 'No exam result',
				tone: 'green',
				foot: best
					? ui.btn({ tab: 'results', action: 'class', id: best.classId, query: best.className }, 'Review results')
					: '',
			}),
			kpiCard({
				label: 'Weakest class this week',
				value: weakest ? weakest.className : '—',
				note: weakest ? `${fmt20(weakest.avg20)} · last 7 days` : 'No result in the last 7 days',
				tone: 'violet',
				foot: weakest
					? ui.btn({ tab: 'results', action: 'class', id: weakest.classId, query: weakest.className }, 'Review results')
					: '',
			}),
			kpiCard({
				label: 'Students needing attention',
				value: fmtCount((glance.needingAttention || {}).value),
				note: `${fmtCount((glance.needingAttention || {}).academic)} academic · ${fmtCount(
					(glance.needingAttention || {}).engagement,
				)} engagement`,
				tone: 'rose',
				foot: ui.btn({ tab: 'results', action: 'attention' }, 'Open intervention list'),
			}),
		]);

		const means = chartOrEmpty(
			kit.barChart({
				rows,
				value: (row) => row.avg20,
				max: 20,
				threshold: 10,
				label: (row) => row.className,
				display: (value) => fmt20(value),
				tone: (row) => (row.avg20 < 10 ? 'danger' : 'success'),
				ariaLabel: 'Average examination score by class',
			}),
			'No class comparison',
			'No formal exam result was recorded in this period.',
		);

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

		const attentionChart = attentionRows.length
			? `${kit.legend([
					{ label: 'Academic only', tone: 'warning' },
					{ label: 'Engagement only', tone: 'info' },
					{ label: 'Both', tone: 'danger' },
				])}
				${kit.stackedBarChart({
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
			: empty('No student requires attention', 'No academic or engagement threshold is crossed.');

		const passSplit =
			rows.length > 0
				? `${kit.legend([
						{ label: 'At or above 10/20', tone: 'success' },
						{ label: 'Below 10/20', tone: 'danger' },
					])}
					${kit.groupedBarChart({
						rows,
						series: [
							{ key: 'studentsAbove10', label: 'At or above 10/20', tone: 'success' },
							{ key: 'studentsBelow10', label: 'Below 10/20', tone: 'danger' },
						],
						label: (row) => row.className,
						ariaLabel: 'Students above and below 10 out of 20 by class',
					})}`
				: empty('No pass split', 'No tested student in this period.');

		return {
			html: `${cards}
				<div class="dashboard-charts-grid ta-grid--2">
					${panel('Class means', 'Average formal exam score (/20) against the pass line.', means)}
					${panel(
						'Students requiring attention',
						'Academic and engagement difficulties are counted separately.',
						attentionChart,
					)}
				</div>
				${panel('Students above / below 10 out of 20', 'Per-student average grouped by class.', passSplit)}
				${panel('Classes insights', 'Observations limited to your classes.', insights(sections.insights, 'classes'))}`,
			links: ui.links,
		};
	}

	function resultsBody(sections) {
		const kit = window.TeacherAnalytics;
		const glance = sections.glance || {};
		const attention = sections.attention || {};
		const progress = sections.progress || {};
		const exams = sections.exams || {};
		const summary = attention.summary || {};
		const rows = Array.isArray(attention.rows) ? attention.rows : [];
		const classRows = Array.isArray(progress.classComparison) ? progress.classComparison : [];
		const distribution = Array.isArray(exams.distribution) ? exams.distribution : [];

		const cards = kpiGrid([
			kpiCard({
				label: 'Students needing attention',
				value: fmtCount(summary.total),
				note: `${fmtCount(summary.academic)} academic · ${fmtCount(summary.engagement)} engagement`,
				tone: 'rose',
			}),
			kpiCard({
				label: 'Academic and engagement',
				value: fmtCount(summary.both),
				note: 'both difficulties at once',
				tone: 'amber',
			}),
			kpiCard({
				label: 'Assessed students',
				value: fmtCount((glance.assessedStudents || {}).value),
				note: `${fmtPct((glance.assessedStudents || {}).rate)} of your students`,
				tone: 'blue',
			}),
			kpiCard({
				label: 'Certified students',
				value: fmtCount((glance.certifiedStudents || {}).value),
				note: 'at or above 10/20',
				tone: 'green',
			}),
			kpiCard({
				label: 'Remaining not passing',
				value: fmtCount((glance.notCertifiedStudents || {}).value),
				note: `${fmtCount((glance.failedExamStudents || {}).value)} below · ${fmtCount(
					(glance.neverAssessedStudents || {}).value,
				)} never assessed`,
				tone: 'violet',
			}),
		]);

		const passSplit =
			classRows.length > 0
				? `${kit.legend([
						{ label: 'At or above 10/20', tone: 'success' },
						{ label: 'Below 10/20', tone: 'danger' },
					])}
					${kit.groupedBarChart({
						rows: classRows,
						series: [
							{ key: 'studentsAbove10', label: 'At or above 10/20', tone: 'success' },
							{ key: 'studentsBelow10', label: 'Below 10/20', tone: 'danger' },
						],
						label: (row) => row.className,
						ariaLabel: 'Students above and below 10 out of 20 by class',
					})}`
				: empty('No pass split', 'No tested student in this period.');

		const histogram = chartOrEmpty(
			kit.histogram({ buckets: distribution, ariaLabel: 'Distribution of formal exam scores out of 20' }),
			'No score distribution',
			'No valid formal exam result in this period.',
		);

		const table = interventionTable(rows);

		return {
			html: `${cards}
				<div class="dashboard-charts-grid ta-grid--2">
					${panel('Students above / below 10 out of 20', 'Per-student average grouped by class.', passSplit)}
					${panel(
						'Score distribution',
						'Share of valid formal attempts by /20 band.',
						`${histogram}${kit.legend([{ label: 'Valid exam attempts', tone: 'primary' }])}`,
					)}
				</div>
				${panel(
					'Intervention list',
					'Students flagged by the deterministic rules. Open a student record for the full history.',
					table,
				)}
				${panel('Results insights', 'Observations limited to results and certification.', insights(sections.insights, 'results'))}`,
			links: ui.links,
		};
	}

	function interventionTable(rows) {
		if (!rows.length) {
			return empty(
				'No student meets the intervention criteria',
				'Either results are above the thresholds or there is not enough data in this period.',
			);
		}
		return `<div class="table-container teacher-overview__table-wrap">
			<table class="data-table teacher-overview__table">
				<thead><tr>
					<th scope="col">Student</th><th scope="col">Class</th><th scope="col">Avg /20</th>
					<th scope="col">Detected difficulty</th><th scope="col">Evidence</th><th scope="col">Next action</th>
				</tr></thead>
				<tbody>
					${rows
						.map((row) => {
							const link = { tab: 'results', action: 'student', id: row.studentId, query: row.name };
							const weak =
								row.difficulty && Array.isArray(row.difficulty.weakChapters)
									? row.difficulty.weakChapters[0]
									: null;
							const weakHtml = weak
								? ui.btn(
										weak.courseId
											? { tab: 'subjects', action: 'course', id: weak.courseId }
											: { tab: 'questions', action: 'category', id: weak.categoryId, query: weak.name },
										`${weak.name} · ${fmtPct(weak.errorRate)} errors`,
										'badge badge-amber',
									)
								: '';
							return `<tr>
								<td data-label="Student">${ui.btn(link, row.name, 'teacher-overview__link')}${
									row.numero ? `<span class="teacher-overview__cell-meta">#${esc(row.numero)}</span>` : ''
								}</td>
								<td data-label="Class">${esc(row.className)}</td>
								<td data-label="Average /20"><span class="teacher-overview__score${
									row.avg20 != null && row.avg20 < 10 ? ' teacher-overview__score--low' : ''
								}">${fmt20(row.avg20)}</span></td>
								<td data-label="Detected difficulty">${esc(
									row.difficulty ? row.difficulty.label : row.reason || '',
								)}${weakHtml}</td>
								<td data-label="Evidence">${esc(row.reason || '')}<span class="teacher-overview__cell-meta">${
									row.lastActivity ? `Last activity ${esc(fmtTime(row.lastActivity))}` : 'No activity in period'
								}</span></td>
								<td data-label="Next action">${ui.btn(
									link,
									row.intervention?.label || 'Review student',
									'btn btn-secondary btn-sm',
								)}</td>
							</tr>`;
						})
						.join('')}
				</tbody>
			</table>
		</div>`;
	}

	function gamesBody(sections) {
		const kit = window.TeacherAnalytics;
		const en = sections.engagement || {};
		const games = en.games || {};
		const tournaments = en.tournaments || {};
		const trend = Array.isArray(en.trend) ? en.trend : [];
		const topActivities = Array.isArray(en.topActivities) ? en.topActivities : [];
		const activeClasses = Array.isArray(en.activeClasses) ? en.activeClasses : [];

		const cards = kpiGrid([
			kpiCard({
				label: 'Game sessions',
				value: fmtCount(games.sessions),
				note: `${fmtCount(games.students)} student(s) played`,
				tone: 'violet',
			}),
			kpiCard({
				label: 'Game participation',
				value: fmtPct(games.participationRate),
				note: `${fmtCount(games.completed)} session(s) completed`,
				tone: 'cyan',
			}),
			kpiCard({
				label: 'Tournament entries',
				value: fmtCount(tournaments.entries),
				note: `${fmtCount(tournaments.students)} student(s) entered`,
				tone: 'blue',
			}),
			kpiCard({
				label: 'Active tournaments',
				value: fmtCount(tournaments.active),
				note: 'open or running',
				tone: 'green',
			}),
			kpiCard({
				label: 'Tournament participation',
				value: fmtPct(tournaments.participationRate),
				note: 'of your students',
				tone: 'indigo',
			}),
		]);

		const trendChart = trend.some((point) => point.games || point.tournaments)
			? `${kit.legend([
					{ label: 'Game sessions', tone: 'violet' },
					{ label: 'Tournament entries', tone: 'info' },
				])}
				${kit.columnChart({
					points: trend,
					series: [
						{ key: 'games', label: 'Game sessions', tone: 'violet' },
						{ key: 'tournaments', label: 'Tournament entries', tone: 'info' },
					],
					labelKey: 'label',
					ariaLabel: 'Game sessions and tournament entries over time',
				})}`
			: empty('No game activity', 'No game session or tournament entry in this period.');

		const activitiesChart = topActivities.length
			? kit.barChart({
					rows: topActivities,
					value: (row) => row.participants,
					label: (row) => `${row.name} · ${row.type === 'game' ? 'Game' : 'Tournament'}`,
					display: (value) => `${fmtCount(value)} participant(s)`,
					tone: (row) => (row.type === 'game' ? 'violet' : 'info'),
					ariaLabel: 'Most engaging activities by participants',
				})
			: empty('No activity', 'No game or tournament activity in this period.');

		const classesChart = activeClasses.length
			? kit.barChart({
					rows: activeClasses,
					value: (row) => row.students,
					label: (row) => row.className,
					display: (value) => `${fmtCount(value)} student(s)`,
					tone: 'info',
					ariaLabel: 'Participating students per class',
				})
			: empty('No participating class', 'No class recorded engagement in this period.');

		return {
			html: `${cards}
				<div class="dashboard-charts-grid ta-grid--2">
					${panel('Engagement trend', 'Game sessions and tournament entries per period.', trendChart)}
					${panel('Top activities', 'Ranked by participants — engagement, never academic ranking.', activitiesChart)}
				</div>
				${panel('Participation by class', 'Students who played at least one game or tournament.', classesChart)}
				${panel(
					'Games insights',
					'Observations limited to educational engagement.',
					insights(sections.insights, 'games'),
				)}
				${
					en.unavailable && en.unavailable.ranking
						? `<p class="ta-note text-muted">${esc(en.unavailable.ranking)}</p>`
						: ''
				}`,
			links: ui.links,
		};
	}

	// ── hooks ──────────────────────────────────────────────────────────────

	function installHook() {
		const original = window.openTab;
		if (typeof original !== 'function' || original.__teacherDomainWrapped) return;
		const wrapped = function (event, tabName) {
			// Programmatic navigation (links, search, dashboard actions) always
			// targets the management UI: filters and detail views live there and
			// must not be applied to a hidden pane.
			if (isTeacherSession() && HOSTS[tabName]) {
				setupSection(tabName);
				if (!event && activeView(tabName) === 'analytics') applyView(tabName, 'manage');
			}
			const result = original.apply(this, arguments);
			if (isTeacherSession() && HOSTS[tabName] && activeView(tabName) === 'analytics') {
				render(tabName, false);
			}
			return result;
		};
		wrapped.__teacherDomainWrapped = true;
		window.openTab = wrapped;
	}

	function renderActiveDomain() {
		if (!isTeacherSession()) return;
		Object.keys(HOSTS).forEach((tab) => {
			const section = document.getElementById(tab);
			if (!section || !section.classList.contains('active')) return;
			setupSection(tab);
			if (activeView(tab) === 'analytics') render(tab, false);
		});
	}

	function boot() {
		installHook();
		renderActiveDomain();
	}

	document.addEventListener('DOMContentLoaded', boot);
	window.addEventListener('quiz:bootstrap-ready', boot);

	window.TeacherDomainAnalytics = {
		render,
		refresh: (tab) => render(tab, true),
		showView,
	};
})();
