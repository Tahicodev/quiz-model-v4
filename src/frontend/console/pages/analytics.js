/**
 * src/frontend/console/pages/analytics.js
 *
 * Platform Analytics.
 *
 * The same educational records the teacher session reads, asked about from
 * the governance side: adoption and usage across organizations, not the
 * progress of one class. Student identities are not surfaced here — only
 * aggregates. Individual accounts are investigated on Users & Access.
 */

import { api } from '../core/api.js';
import { esc, stat, columnChart, barChart, groupedBarChart, legend, lineChart } from '../viz/charts.js';
import { loadingBlock, errorState, emptyState } from '../components/states.js';
import { periodToolbar, bindChipGroup } from '../components/filters.js';
import { formatNumber } from '../components/ui.js';

export const analyticsPage = {
	id: 'analytics',
	path: '/analytics',
	title: 'Platform Analytics',
	description:
		'Adoption, engagement and usage of the platform — aggregated across organizations, never per class.',
	permission: ['platform.analytics.read', 'school.analytics.read'],
	async render(host, ctx) {
		const state = ctx.getState();
		host.innerHTML = `<div class="ac-stack" data-ac-analytics>
			${periodToolbar({ value: state.period })}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${loadingBlock(1)}</div>
			<div data-ac-sections class="ac-stack"></div>
		</div>`;

		const params = { period: state.period === 'year' ? 'year' : state.period };
		if (state.period === 'custom' && state.customRange) {
			params.from = state.customRange.from;
			params.to = state.customRange.to;
		}

		let overview;
		let trends;
		let organizations;
		try {
			[overview, trends, organizations] = await Promise.all([
				api.get('console/overview', params),
				api.get('console/trends', params),
				api.get('console/organizations', { limit: 100, offset: 0 }),
			]);
		} catch (err) {
			host.querySelector('[data-ac-sections]').innerHTML = errorState({ message: err.message });
			return;
		}

		const data = overview.data;
		const glance = data.sections.glance;
		const activity = data.sections.activity;
		const content = data.sections.content;
		const definitions = data.meta.definitions;

		host.querySelector('[data-ac-kpis]').innerHTML = [
			stat({
				label: 'Organizations',
				value: formatNumber(glance.organizations.total),
				note: `${glance.organizations.active} active`,
				tooltip: 'Organizations in the current scope.',
			}),
			stat({
				label: 'Teacher adoption',
				value:
					glance.users.teachers > 0
						? `${Math.round((glance.users.activeTeachers / glance.users.teachers) * 100)}%`
						: '—',
				note: `${formatNumber(glance.users.activeTeachers)} of ${formatNumber(
					glance.users.teachers,
				)} teachers active`,
				tone: 'success',
				tooltip: definitions.activeTeacher,
			}),
			stat({
				label: 'Student participation',
				value:
					glance.users.students > 0
						? `${Math.round((activity.participatingStudents / glance.users.students) * 100)}%`
						: '—',
				note: `${formatNumber(activity.participatingStudents)} of ${formatNumber(
					glance.users.students,
				)} students took part`,
				tone: 'primary',
				tooltip:
					'Students with at least one completed attempt in the period, over the number of enrolled students. Attempts and unique students are reported separately and never conflated.',
			}),
			stat({
				label: 'Attempts per student',
				value:
					activity.participatingStudents > 0
						? (activity.attempts / activity.participatingStudents).toFixed(1)
						: '—',
				note: `${formatNumber(activity.attempts)} attempts`,
				tooltip:
					'Total completed attempts divided by the number of unique students who made at least one. A value above 1 means students attempted more than once on average.',
			}),
			stat({
				label: 'Average score',
				value:
					activity.averageScore20 == null ? '—' : activity.averageScore20.toFixed(2),
				note: `/20 per formal attempt · ${formatNumber(activity.averageScoreSample)} attempts`,
				tone: 'primary',
				tooltip: definitions.averageScore,
			}),
			stat({
				label: 'Content authored',
				value: formatNumber(content.questions + content.exams + content.courses),
				note: `${formatNumber(content.questions)} questions · ${formatNumber(
					content.exams,
				)} exams · ${formatNumber(content.courses)} courses`,
				tooltip:
					'Content created in the selected period. The question and course totals are all-time row counts; the exam and course counts respect the period.',
			}),
		].join('');

		const series = trends?.data?.series;
		const points = series
			? series.labels.map((label, index) => ({
					label,
					formalAttempts: series.formalAttempts[index] || 0,
					trainingAttempts: series.trainingAttempts[index] || 0,
					gameAttempts: series.gameAttempts[index] || 0,
					newTeachers: series.newTeachers[index] || 0,
					newStudents: series.newStudents[index] || 0,
				}))
			: [];

		const orgRows = (organizations?.data || []).slice(0, 10);

		host.querySelector('[data-ac-sections]').innerHTML = `
			<div class="ac-section">
				<h2 class="ac-section__title">Educational activity</h2>
				<p class="ac-section__hint">Completed attempts by mode, over ${esc(
					trends?.data?.meta?.periodLabel || 'the selected period',
				)}.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Attempts by mode</h3>
							<p class="ac-panel__subtitle">Training and game attempts are kept separate from formal exams.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${
							points.length
								? `${legend([
										{ label: 'Formal exams', tone: 'primary' },
										{ label: 'Training', tone: 'info' },
										{ label: 'Games', tone: 'violet' },
									])}${columnChart({
										points,
										series: [
											{ key: 'formalAttempts', label: 'Formal exams', tone: 'primary' },
											{ key: 'trainingAttempts', label: 'Training', tone: 'info' },
											{ key: 'gameAttempts', label: 'Games', tone: 'violet' },
										],
										labelKey: 'label',
										ariaLabel: 'Attempts by mode over time',
									})}`
								: emptyState({ title: 'No attempts recorded', message: 'No completed attempts fall inside the selected period.' })
						}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Account growth</h3>
							<p class="ac-panel__subtitle">New accounts, so the reader can separate growth from activity.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${
							points.length
								? `${legend([
										{ label: 'Teachers', tone: 'success' },
										{ label: 'Students', tone: 'warning' },
									])}${columnChart({
										points,
										series: [
											{ key: 'newTeachers', label: 'Teachers', tone: 'success' },
											{ key: 'newStudents', label: 'Students', tone: 'warning' },
										],
										labelKey: 'label',
										ariaLabel: 'New accounts over time',
									})}`
								: emptyState({ title: 'No accounts created', message: 'No accounts were created inside the selected period.' })
						}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Organizational comparison</h2>
				<p class="ac-section__hint">Which organizations are using the platform, and how much.</p>
			</div>
			<div class="ac-grid ac-grid--2">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Active students by organization</h3>
							<p class="ac-panel__subtitle">Last 30 days. Highest first.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${
							orgRows.length
								? barChart({
										rows: orgRows.map((row) => ({ label: row.name, value: row.activeStudents || 0 })),
										value: 'value',
										label: (row) => row.label,
										display: (value) => formatNumber(value),
										ariaLabel: 'Active students by organization',
									})
								: emptyState({
										title: 'No organizations to compare',
										message: 'The current scope contains no organization with recorded usage.',
									})
						}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Adoption by organization</h3>
							<p class="ac-panel__subtitle">Teachers and students per organization.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${
							orgRows.length
								? groupedBarChart({
										rows: orgRows.map((row) => ({
											label: row.name,
											teachers: row.teachers || 0,
											students: row.students || 0,
										})),
										series: [
											{ key: 'teachers', label: 'Teachers', tone: 'success' },
											{ key: 'students', label: 'Students', tone: 'primary' },
										],
										label: (row) => row.label,
										ariaLabel: 'Teachers and students by organization',
									})
								: emptyState({
										title: 'No organizations to compare',
										message: 'The current scope contains no organization with recorded accounts.',
									})
						}
					</div>
				</section>
			</div>

			<div class="ac-section">
				<h2 class="ac-section__title">Content & adoption</h2>
				<p class="ac-section__hint">What the platform is being used to create and to play.</p>
			</div>
			<div class="ac-grid ac-grid--3">
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Question bank</h3></div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Questions</p>
								<p class="ac-defs__desc">${formatNumber(content.questions)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Classes</p>
								<p class="ac-defs__desc">${formatNumber(content.classes)}</p>
							</div>
						</div>
						<p class="ac-empty__message" style="margin:12px 0 0;font-size:12px">${esc(
							content.note,
						)}</p>
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Assessments</h3></div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Exams created</p>
								<p class="ac-defs__desc">${formatNumber(content.exams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Published exams</p>
								<p class="ac-defs__desc">${formatNumber(content.activeExams)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Conducted in period</p>
								<p class="ac-defs__desc">${formatNumber(activity.examsConducted)}</p>
							</div>
						</div>
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles"><h3 class="ac-panel__title">Games & courses</h3></div>
					</div>
					<div class="ac-panel__body">
						<div class="ac-defs">
							<div class="ac-defs__item">
								<p class="ac-defs__term">Courses created</p>
								<p class="ac-defs__desc">${formatNumber(content.courses)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Games created</p>
								<p class="ac-defs__desc">${formatNumber(content.games)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Kids games created</p>
								<p class="ac-defs__desc">${formatNumber(content.kidsGames)}</p>
							</div>
							<div class="ac-defs__item">
								<p class="ac-defs__term">Game sessions played</p>
								<p class="ac-defs__desc">${formatNumber(
									activity.gameSessions + activity.kidsGameSessions,
								)}</p>
							</div>
						</div>
					</div>
				</section>
			</div>`;

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
