/**
 * src/frontend/console/pages/teaching.js
 *
 * Teaching & learning analytics.
 *
 * The teacher session shows each teacher the analytics of their own classes.
 * This page asks the same educational questions from the governance side:
 * every teacher, every class, every student, across every organization the
 * session can reach. A school administrator always reads their own
 * organization (the server enforces it); a platform operator reads all
 * organizations, or one of them with the organization selector.
 *
 * Numbers come only from `GET /console/teaching`, which runs ONE set of
 * database aggregates over the union of the organizations. Nothing is summed
 * from per-school averages and nothing is invented: a metric the schema
 * cannot support is shown as unavailable, never as a zero.
 */

import { api } from '../core/api.js';
import { setTargetSchool } from '../core/store.js';
import {
	esc,
	stat,
	panel,
	barChart,
	columnChart,
	histogram,
	donut,
	legend,
} from '../viz/charts.js';
import { loadingBlock, errorState, emptyState } from '../components/states.js';
import { toolbar, chipGroup, PERIODS, bindChipGroup, selectField } from '../components/filters.js';
import { renderTable } from '../components/table.js';
import { formatNumber } from '../components/ui.js';

export const teachingPage = {
	id: 'teaching',
	path: '/teaching',
	title: 'Teaching & Learning',
	description:
		'Teacher activity, class performance and student outcomes across every organization in scope.',
	permission: ['platform.analytics.read', 'school.analytics.read'],
	async render(host, ctx) {
		const state = ctx.getState();
		const schoolFilter = state.targetSchoolId || '';

		// The organization selector cannot be drawn before we know which
		// organizations this session can reach, so the page shows a skeleton
		// until the first response arrives.
		host.innerHTML = `<div class="ac-stack">${loadingBlock(4)}</div>`;

		const params = { period: state.period };
		if (state.period === 'custom' && state.customRange) {
			params.from = state.customRange.from;
			params.to = state.customRange.to;
		}
		if (schoolFilter) params.school_id = schoolFilter;

		let data;
		try {
			const response = await api.get('console/teaching', params);
			data = response.data;
		} catch (err) {
			// A remembered organization can disappear (or belong to a session
			// that has ended). Fall back to the whole scope instead of trapping
			// the operator on an error screen.
			if ((err.status === 403 || err.status === 404) && schoolFilter) {
				setTargetSchool(null);
				ctx.rerender();
				return;
			}
			host.innerHTML = errorState({ message: err.message });
			host.querySelector('[data-ac-retry]')?.addEventListener('click', () => ctx.rerender());
			return;
		}

		const sections = data.sections;
		const meta = data.meta;
		const organizations = Array.isArray(meta.scope.organizations) ? meta.scope.organizations : [];
		const orgName = new Map(organizations.map((org) => [org.id, org.name]));
		const multiOrg = organizations.length > 1;

		// ── Shell (toolbar + empty hosts) ────────────────────────────────────
		const orgField =
			organizations.length > 1
				? selectField({
						id: 'ac-teaching-org',
						label: 'Organization',
						options: organizations.map((org) => ({ value: org.id, label: org.name })),
						value: schoolFilter,
						includeAll: true,
						allLabel: 'All organizations',
					})
				: '';

		host.innerHTML = `<div class="ac-stack">
			${toolbar({
				chips: chipGroup({ options: PERIODS, value: state.period, name: 'period' }),
				fields: orgField,
				actions: '<button type="button" class="ac-btn" data-ac-refresh>Refresh</button>',
			})}
			<div data-ac-kpis class="ac-grid ac-grid--kpi"></div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`;

		host.querySelector('#ac-teaching-org')?.addEventListener('change', (event) => {
			setTargetSchool(event.target.value || null);
			ctx.rerender();
		});
		host.querySelector('[data-ac-refresh]')?.addEventListener('click', () => ctx.rerender());

		// ── KPIs ─────────────────────────────────────────────────────────────
		const glance = sections.glance;
		const achievement = sections.achievement;
		const content = sections.content;

		const participation = glance.participationRate;
		const avg = achievement.avgExamScore;
		const pass = achievement.passRate;

		host.querySelector('[data-ac-kpis]').innerHTML = [
			stat({
				label: 'Students',
				value: formatNumber(glance.totalStudents.value),
				note: 'enrolled now',
				tooltip: 'Student accounts in the current scope. A current-state total: it is not narrowed by the reporting period.',
			}),
			stat({
				label: 'Teachers',
				value: formatNumber(glance.totalTeachers.value),
				note: 'accounts in scope',
				tooltip: 'Teacher accounts in the current scope (current-state).',
			}),
			stat({
				label: 'Classes',
				value: formatNumber(glance.totalClasses.value),
				note: 'classes in scope',
				tooltip: 'Classes in the current scope (current-state).',
			}),
			stat({
				label: 'Participation',
				value: participation.value == null ? '—' : `${participation.value}%`,
				note: `${formatNumber(participation.numerator)} of ${formatNumber(
					participation.denominator,
				)} students active`,
				tone: participation.value == null ? '' : 'primary',
				tooltip:
					'Unique students with at least one completed attempt (exam, training, game or tournament) in the period, over the enrolled population.',
			}),
			stat({
				label: 'Active students',
				value: formatNumber(glance.activeStudents.value),
				note: 'took part in the period',
				tooltip: 'Distinct students with at least one qualifying attempt in the reporting window.',
			}),
			stat({
				label: 'Average score',
				value: avg.value == null ? '—' : avg.value.toFixed(2),
				note: avg.sample > 0 ? `/20 over ${formatNumber(avg.sample)} attempts` : 'no formal attempts',
				tone: avg.value == null ? '' : 'primary',
				tooltip:
					'Mean final score of formal exam attempts in the period, rescaled from the stored 0–100 to the familiar /20. Training, games and tournaments are excluded.',
			}),
			stat({
				label: 'Pass rate',
				value: pass.value == null ? '—' : `${pass.value}%`,
				note: `${formatNumber(pass.passed)} of ${formatNumber(pass.total)} attempts passed`,
				tone: pass.value == null ? '' : pass.value >= 50 ? 'success' : 'warning',
				tooltip:
					'Formal exam attempts that passed over all formal attempts. Passing uses the exam-configured threshold (default 10/20).',
			}),
			stat({
				label: 'Assessments conducted',
				value: formatNumber(achievement.examsConducted.value),
				note: 'distinct exams sat',
				tooltip: 'Distinct formal exams with at least one finalized result in the period.',
			}),
		].join('');

		// ── Teacher activity table ───────────────────────────────────────────
		const teacherRows = [...(sections.teacherInsights.teacherActivity || [])].sort(
			(a, b) =>
				b.assessmentActivity - a.assessmentActivity ||
				b.questionsCreated - a.questionsCreated ||
				a.name.localeCompare(b.name),
		);

		const teacherColumns = [
			{
				key: 'name',
				label: 'Teacher',
				render: (row) => `<span class="ac-table__primary">${esc(row.name)}</span>${
					row.status && row.status !== 'active'
						? ` <span class="ac-table__muted">(${esc(row.status)})</span>`
						: ''
				}`,
			},
			...(multiOrg
				? [
						{
							key: 'schoolName',
							label: 'Organization',
							render: (row) =>
								`<span class="ac-table__muted">${esc(
									row.schoolName || orgName.get(row.schoolId) || '—',
								)}</span>`,
						},
					]
				: []),
			{
				key: 'questionsCreated',
				label: 'Questions',
				align: 'right',
				render: (row) => formatNumber(row.questionsCreated),
			},
			{
				key: 'examsCreated',
				label: 'Exams',
				align: 'right',
				render: (row) => formatNumber(row.examsCreated),
			},
			{
				key: 'classesManaged',
				label: 'Classes',
				align: 'right',
				render: (row) =>
					row.classesManaged
						? `<span title="${esc(row.classNames.join(', '))}">${formatNumber(
								row.classesManaged,
							)}</span>`
						: '0',
			},
			{
				key: 'assessmentActivity',
				label: 'Assessments',
				align: 'right',
				render: (row) => formatNumber(row.assessmentActivity),
			},
			{
				key: 'avgScore20',
				label: 'Avg /20',
				align: 'right',
				render: (row) => (row.avgScore20 == null ? '—' : row.avgScore20.toFixed(2)),
			},
			{
				key: 'passRate',
				label: 'Pass rate',
				align: 'right',
				render: (row) => (row.passRate == null ? '—' : `${row.passRate}%`),
			},
		];

		// ── Class performance ────────────────────────────────────────────────
		const classRows = (achievement.classComparison || []).filter((row) => row.avgScore20 != null);
		const classLabel = (row) =>
			multiOrg
				? `${row.className} · ${orgName.get(row.schoolId) || 'Organization'}`
				: row.className;
		const classChart = classRows.length
			? `${legend([{ label: 'Class mean /20', tone: 'primary' }])}${barChart({
					rows: classRows.map((row) => ({ ...row, chartLabel: classLabel(row) })),
					value: 'avgScore20',
					max: 20,
					threshold: 10,
					label: (row) => `${row.chartLabel} (n=${row.sample})`,
					display: (value) => `${Number(value).toFixed(1)}/20`,
					ariaLabel: 'Average formal exam score by class',
				})}`
			: emptyState({
					title: 'No formal results yet',
					message: 'No class has a finalized formal exam result in the selected period.',
				});

		const attention = sections.teacherInsights.classesNeedingAttention || [];
		const attentionBody = attention.length
			? `<div class="ac-defs">${attention
					.map(
						(row) => `<div class="ac-defs__item">
							<p class="ac-defs__term">${esc(row.className)}${
								multiOrg
									? ` <span class="ac-table__muted">· ${esc(
											row.schoolName || orgName.get(row.schoolId) || '',
										)}</span>`
									: ''
							}</p>
							<p class="ac-defs__desc">${esc(row.reasons.join(' · '))} · mean ${
								row.avgScore20 == null ? '—' : row.avgScore20
							}/20 over ${formatNumber(row.sample)} attempts</p>
						</div>`,
					)
					.join('')}</div>`
			: emptyState({
					title: 'No class is below the attention thresholds',
					message:
						'Attention is raised when a class has enough results to trust and either a mean below 8/20 or a pass rate below 40%.',
				});

		// ── Score distribution ───────────────────────────────────────────────
		const distribution = achievement.scoreDistribution || [];
		const distributionSample = avg.sample;
		const distributionBody =
			distributionSample > 0
				? `${histogram({
						buckets: distribution.map((band) => ({ label: band.label, count: band.count })),
						ariaLabel: 'Formal exam score distribution',
					})}
					<div class="ac-defs" style="margin-top:10px">${distribution
						.map(
							(band) => `<div class="ac-defs__item">
								<p class="ac-defs__term">${esc(band.label)}</p>
								<p class="ac-defs__desc">${formatNumber(band.count)} attempts${
									band.pct == null ? '' : ` · ${band.pct}%`
								}</p>
							</div>`,
						)
						.join('')}</div>`
				: emptyState({
						title: 'No formal attempts to distribute',
						message: 'Score bands need at least one finalized formal exam attempt in the period.',
					});

		// ── Certification split ──────────────────────────────────────────────
		const certified = achievement.certifiedStudents.value || 0;
		const pending = achievement.pendingSuccess.value || 0;
		const certificationBody =
			certified + pending > 0
				? `${donut({
						segments: [
							{ label: 'Passed at least one exam', value: certified, tone: 'success' },
							{ label: 'Still pending success', value: pending, tone: 'warning' },
						],
						centerValue: String(certified + pending),
						centerLabel: 'students assessed',
						ariaLabel: 'Certified and pending students',
					})}
					${legend([
						{ label: `Certified (${certified})`, tone: 'success' },
						{ label: `Pending (${pending})`, tone: 'warning' },
					])}`
				: emptyState({
						title: 'No student sat a formal exam',
						message: 'Certification compares students who passed an exam with those who sat one but did not.',
					});

		// ── Activity trend ───────────────────────────────────────────────────
		const trend = sections.engagement.activityTrend || { points: [] };
		const trendPoints = (trend.points || []).map((point) => ({
			label: point.period,
			exam: point.exam || 0,
			training: point.training || 0,
			game: point.game || 0,
			tournament: point.tournament || 0,
		}));
		const trendBody = trendPoints.length
			? `${legend([
					{ label: 'Formal exams', tone: 'primary' },
					{ label: 'Training', tone: 'info' },
					{ label: 'Games', tone: 'violet' },
					{ label: 'Tournaments', tone: 'warning' },
				])}${columnChart({
					points: trendPoints,
					series: [
						{ key: 'exam', label: 'Formal exams', tone: 'primary' },
						{ key: 'training', label: 'Training', tone: 'info' },
						{ key: 'game', label: 'Games', tone: 'violet' },
						{ key: 'tournament', label: 'Tournaments', tone: 'warning' },
					],
					labelKey: 'label',
					ariaLabel: 'Learning activity by mode over time',
				})}`
			: emptyState({
					title: 'No activity in the period',
					message: 'No completed attempt falls inside the selected reporting window.',
				});

		const engagement = sections.engagement;
		const coverage = content.contentCoverage || {};

		// ── Definitions ──────────────────────────────────────────────────────
		const unavailable = Object.values(meta.unavailable || {});
		const definitionsBody = `<div class="ac-defs">
			<div class="ac-defs__item">
				<p class="ac-defs__term">Average score</p>
				<p class="ac-defs__desc">Formal exam attempts only, stored 0–100 rescaled to /20. Training, games and tournaments are separate.</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Pass rate</p>
				<p class="ac-defs__desc">Formal attempts marked passed over all formal attempts in the period. Threshold is the exam's own pass mark (default 10/20).</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Teacher activity</p>
				<p class="ac-defs__desc">Questions and exams the teacher authored (all time), the classes assigned to them, and the formal results of exams they created inside the period.</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Class attribution</p>
				<p class="ac-defs__desc">Results carry no class column, so a result belongs to the class of the student account that sat it. Students without a class are grouped as “Unassigned”.</p>
			</div>
			<div class="ac-defs__item">
				<p class="ac-defs__term">Reliable ranking</p>
				<p class="ac-defs__desc">A class needs at least ${formatNumber(
					achievement.minSampleForRank,
				)} finalized attempts before it is ranked or flagged; smaller samples are still shown, never ranked confidently.</p>
			</div>
			${
				unavailable.length
					? `<div class="ac-defs__item">
							<p class="ac-defs__term">Not measurable</p>
							<p class="ac-defs__desc">${unavailable.map((reason) => esc(reason)).join(' ')}</p>
						</div>`
					: ''
			}
		</div>`;

		// ── Render ───────────────────────────────────────────────────────────
		host.querySelector('[data-ac-sections]').innerHTML = `
			<div class="ac-section">
				<h2 class="ac-section__title">Teachers & classrooms</h2>
				<p class="ac-section__hint">Who teaches, what they author, and how their classes perform in ${esc(
					meta.scope.periodLabel || 'the selected period',
				)}${
					multiOrg
						? ` · ${esc(
								schoolFilter
									? orgName.get(schoolFilter) || 'the selected organization'
									: 'all organizations',
							)}`
						: ''
				}.</p>
			</div>
			<section class="ac-panel">
				<div class="ac-panel__header">
					<div class="ac-panel__titles">
						<h3 class="ac-panel__title">Teacher activity</h3>
						<p class="ac-panel__subtitle">Active teachers first. “Assessments” counts formal results for exams the teacher created.</p>
					</div>
				</div>
				<div class="ac-panel__body ac-panel__body--flush">
					${renderTable({
						columns: teacherColumns,
						rows: teacherRows,
						empty: 'No teacher account exists in the current scope.',
					})}
				</div>
			</section>

			${panel({
				title: 'Class performance',
				subtitle: `Mean formal score per class. The dashed line is the 10/20 pass mark; n is the number of attempts.`,
				body: classChart,
			})}

			<div class="ac-grid ac-grid--2">
				${panel({
					title: 'Classes needing attention',
					subtitle: `Classes with at least ${formatNumber(
						achievement.minSampleForRank,
					)} attempts and a low mean or low pass rate.`,
					body: attentionBody,
				})}
				${panel({
					title: 'Score distribution',
					subtitle: 'Formal exam attempts per score band, /20.',
					body: distributionBody,
				})}
			</div>

			<div class="ac-grid ac-grid--2">
				${panel({
					title: 'Certification',
					subtitle: 'Students who passed at least one formal exam vs. those who sat one and have not.',
					body: certificationBody,
				})}
				${panel({
					title: 'Learning activity',
					subtitle: `Completed attempts by mode, ${
						trend.granularity === 'week' ? 'weekly' : 'daily'
					} over the period.`,
					body: trendBody,
				})}
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Content & participation</h2>
				<p class="ac-section__hint">The material behind the activity, and the live game surface.</p>
			</div>
			<div class="ac-grid ac-grid--3">
				${panel({
					title: 'Question bank',
					subtitle: 'Authored content in the current scope.',
					body: `<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Questions</p>
							<p class="ac-defs__desc">${formatNumber(content.totalQuestions.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active exams</p>
							<p class="ac-defs__desc">${formatNumber(content.activeExams.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Categories used</p>
							<p class="ac-defs__desc">${formatNumber(
								coverage.categoriesWithQuestions,
							)} of ${formatNumber(coverage.totalCategories)}</p>
						</div>
					</div>`,
				})}
				${panel({
					title: 'Participation',
					subtitle: 'Students, not attempt counts.',
					body: `<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Active students</p>
							<p class="ac-defs__desc">${formatNumber(glance.activeStudents.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Participation rate</p>
							<p class="ac-defs__desc">${
								participation.value == null ? '—' : `${participation.value}%`
							}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Needing attention</p>
							<p class="ac-defs__desc">${formatNumber(
								glance.studentsNeedingAttention.value,
							)}</p>
						</div>
						<p class="ac-empty__message" style="margin:8px 0 0;font-size:12px">${esc(
							glance.studentsNeedingAttention.rule,
						)}</p>
					</div>`,
				})}
				${panel({
					title: 'Games & tournaments',
					subtitle: 'Live snapshots — never date-filtered.',
					body: `<div class="ac-defs">
						<div class="ac-defs__item">
							<p class="ac-defs__term">Game lobbies waiting</p>
							<p class="ac-defs__desc">${formatNumber(engagement.gameLobbies.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Live games</p>
							<p class="ac-defs__desc">${formatNumber(engagement.liveGames.value)}</p>
						</div>
						<div class="ac-defs__item">
							<p class="ac-defs__term">Tournaments</p>
							<p class="ac-defs__desc">${formatNumber(
								engagement.activeTournaments.value,
							)} active of ${formatNumber(engagement.totalTournaments.value)}</p>
						</div>
					</div>`,
				})}
			</div>

			${panel({
				title: 'How these numbers are computed',
				subtitle: 'The console never guesses. Every metric names its population and its window.',
				body: definitionsBody,
			})}`;

		bindChipGroup(host, 'period', (key) => {
			if (key === 'custom') {
				const from = prompt(
					'From (YYYY-MM-DD)',
					new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
				);
				if (!from) return;
				const to = prompt('To (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
				if (!to) return;
				ctx.setPeriod('custom', { from, to });
				return;
			}
			ctx.setPeriod(key);
		});
	},
};
