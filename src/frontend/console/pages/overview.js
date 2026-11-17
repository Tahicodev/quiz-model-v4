/**
 * src/frontend/console/pages/overview.js
 *
 * Overview — the administrator's workbench.
 *
 * The shape of this page follows what an administrator actually does during
 * a day, not what the database happens to contain:
 *
 *   CONTROL      what does this installation look like right now
 *   ACCESS       who is waiting for access to be granted
 *   CREDENTIALS  which accounts have never been used
 *   MAINTENANCE  is it healthy, and what has been done lately
 *   ACTIVITY     are the teachers and the students actually working
 *   ANALYTICS    how is usage moving
 *   DOCUMENTS    what has been produced
 *   NOTES        what has been said to the teachers
 *   PLANNING     what is coming up
 *
 * Every number comes from the server read model. Nothing is computed in the
 * browser from a row dump.
 */

import { api } from '../core/api.js';
import { esc, stat, columnChart, legend, trend } from '../viz/charts.js';
import { renderTable } from '../components/table.js';
import { loadingBlock, errorState, emptyState } from '../components/states.js';
import { periodToolbar, bindChipGroup } from '../components/filters.js';
import {
	formatNumber,
	formatDate,
	formatRelative,
	openModal,
	toast,
} from '../components/ui.js';

const ICON = {
	control:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
	access:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
	credentials:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
	maintenance:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.8z"/></svg>',
	activity:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
	analytics:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>',
	documents:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
	notes:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
	planning:
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
};

export const overviewPage = {
	id: 'overview',
	path: '/',
	title: 'Overview',
	description:
		'Control, access, activity, documents and planning — the administrator\'s working view.',
	permission: ['platform.console', 'school.console'],
	async render(host, ctx) {
		const state = ctx.getState();
		host.innerHTML = `<div class="ac-stack" data-ac-overview>
			${periodToolbar({ value: state.period })}
			<div data-ac-kpis class="ac-grid ac-grid--kpi">${loadingBlock(1)}</div>
			<div data-ac-alerts class="ac-stack"></div>
			<div class="ac-workbench" data-ac-workbench></div>
			<div data-ac-trends class="ac-grid ac-grid--2"></div>
			<div data-ac-detail class="ac-grid ac-grid--3" style="margin-top:16px"></div>
		</div>`;

		const params = { period: state.period === 'year' ? 'year' : state.period };
		if (state.period === 'custom' && state.customRange) {
			params.from = state.customRange.from;
			params.to = state.customRange.to;
		}

		let overview;
		let trends;
		let workbench;
		try {
			[overview, trends, workbench] = await Promise.all([
				api.get('console/overview', params),
				api.get('console/trends', params),
				api.get('console/workbench'),
			]);
		} catch (err) {
			host.innerHTML = errorState({
				title: 'The overview could not be loaded',
				message: err.message,
			});
			return;
		}

		const data = overview.data;
		const glance = data.sections.glance;
		const activity = data.sections.activity;
		const operations = data.sections.operations;
		const content = data.sections.content;
		const definitions = data.meta.definitions;
		const wb = workbench.data.sections;

		// ── CONTROL ────────────────────────────────────────────────────────
		host.querySelector('[data-ac-kpis]').innerHTML = [
			stat({
				label: ctx.isPlatform
					? ctx.isOffline
						? 'Organizations here'
						: 'Organizations'
					: 'Organization',
				value: ctx.isPlatform ? formatNumber(glance.organizations.total) : ctx.organization?.name || '—',
				note: ctx.isPlatform
					? `${glance.organizations.active} active · ${glance.organizations.pending} pending`
					: `Plan ${ctx.organization?.plan || '—'}`,
				tone: 'primary',
				tooltip: 'The tenants of this installation.',
				href: ctx.isPlatform ? '#/organizations' : null,
			}),
			stat({
				label: 'Accounts',
				value: formatNumber(glance.users.teachers + glance.users.students + glance.users.administrators),
				note: `${formatNumber(glance.users.teachers)} teachers · ${formatNumber(
					glance.users.students,
				)} students`,
				tooltip: 'Every account in the current scope.',
				href: '#/users',
			}),
			stat({
				label: 'Live sessions',
				value: formatNumber(wb.maintenance.liveSessions),
				note: 'refresh tokens still valid',
				tooltip:
					'Accounts with a refresh token that has not expired or been revoked. An administrator can revoke them from the account page.',
			}),
			stat({
				label: 'Availability',
				value:
					operations.availabilityPercent == null
						? '—'
						: `${operations.availabilityPercent.toFixed(1)}%`,
				note: 'last 60 minutes',
				tone:
					operations.availabilityPercent == null
						? ''
						: operations.availabilityPercent >= 99
							? 'success'
							: 'warning',
				tooltip: operations.note,
				href: '#/health',
			}),
			stat({
				label: 'Failed sign-ins',
				value: formatNumber(operations.failedAuthentications),
				note: data.meta.scope.periodLabel,
				tone: operations.failedAuthentications > 0 ? 'warning' : '',
				tooltip:
					'Failed authentication attempts recorded in the durable security trail.',
				href: '#/audit?stream=security',
			}),
			stat({
				label: 'Waiting for access',
				value: formatNumber(
					wb.access.pendingAccountRequests + wb.access.pendingProfileRequests,
				),
				note: `${formatNumber(wb.access.pendingAccountRequests)} requests · ${formatNumber(
					wb.access.pendingProfileRequests,
				)} profile changes`,
				tone:
					wb.access.pendingAccountRequests + wb.access.pendingProfileRequests > 0
						? 'warning'
						: '',
				tooltip:
					'Account requests and profile change requests that are waiting for a decision.',
			}),
		].join('');

		// ── ALERTS ─────────────────────────────────────────────────────────
		host.querySelector('[data-ac-alerts]').innerHTML = renderAlerts({
			glance,
			operations,
			activity,
			access: wb.access,
			maintenance: wb.maintenance,
		});

		// ── THE WORKBENCH ──────────────────────────────────────────────────
		host.querySelector('[data-ac-workbench]').innerHTML = [
			panel({
				icon: ICON.access,
				title: 'Access to grant',
				subtitle: 'What is waiting for an administrator.',
				body: `
					<div class="ac-workbench__list">
						${workbenchRow({
							title: 'Account requests',
							sub: 'New students waiting to be created',
							value: wb.access.pendingAccountRequests,
							href: '#/users/students?status=pending',
						})}
						${workbenchRow({
							title: 'Profile change requests',
							sub: 'Students asking for a correction',
							value: wb.access.pendingProfileRequests,
							href: '#/audit',
						})}
						${workbenchRow({
							title: 'Suspended accounts',
							sub: 'No access until restored',
							value: wb.access.suspendedAccounts,
							href: '#/users?status=suspended',
						})}
						${workbenchRow({
							title: 'Permission overrides',
							sub: 'Individual grants and denies',
							value: wb.access.permissionOverrides,
							href: '#/settings?section=roles',
						})}
						${workbenchRow({
							title: 'Teachers without a class',
							sub: 'They can author, but reach nobody',
							value: wb.access.teachersWithoutClasses.length,
							href: '#/users/teachers',
						})}
					</div>`,
			}),
			panel({
				icon: ICON.credentials,
				title: 'Credentials to check',
				subtitle: 'Accounts that were provisioned but never used.',
				body:
					wb.access.unusedCredentials.length
						? `<div class="ac-workbench__list">${wb.access.unusedCredentials
								.map(
									(row) => `
						<a class="ac-workbench__row" href="#/users/${row.id}" style="text-decoration:none;color:inherit">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${esc(row.name || row.username)}</p>
								<p class="ac-workbench__row-sub">${esc(row.role)} · ${
									row.last_login
										? `last seen ${esc(formatRelative(row.last_login))}`
										: 'never signed in'
								}</p>
							</div>
							<span class="ac-workbench__row-value">${esc(row.status)}</span>
						</a>`,
								)
								.join('')}</div>`
						: emptyState({
								title: 'Every account has been used',
								message: 'No account in scope is waiting for its first sign-in.',
							}),
			}),
			panel({
				icon: ICON.maintenance,
				title: 'Maintenance & recent actions',
				subtitle: 'The last administrative operations.',
				body:
					wb.maintenance.recentAudit.length
						? `<div class="ac-workbench__list">${wb.maintenance.recentAudit
								.map(
									(row) => `
						<div class="ac-workbench__row">
							<div class="ac-workbench__row-main">
								<p class="ac-workbench__row-title">${esc(row.action)}</p>
								<p class="ac-workbench__row-sub">${esc(
									row.actorName || 'system',
								)} · ${esc(row.entityType)} · ${esc(formatRelative(row.occurredAt))}</p>
							</div>
							<span class="ac-badge ac-badge--${
								row.severity === 'critical'
									? 'danger'
									: row.severity === 'warning'
										? 'warning'
										: 'success'
							}">${esc(row.severity)}</span>
						</div>`,
								)
								.join('')}</div>`
						: emptyState({
								title: 'No administrative action recorded yet',
								message: 'Actions appear here as soon as an administrator changes something.',
							}),
			}),
			panel({
				icon: ICON.activity,
				title: 'Teacher activity',
				subtitle: 'Are the teachers working?',
				body: `<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${esc(
					definitions.activeTeacher,
				)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${formatNumber(glance.users.activeTeachers)} of ${formatNumber(
							glance.users.teachers,
						)}</p>
					</div>
					<div class="ac-defs__term" style="margin-top:10px"><p class="ac-defs__term">Exams authored</p></div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">&nbsp;</p>
						<p class="ac-defs__desc">${formatNumber(content.exams)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Questions</p>
						<p class="ac-defs__desc">${formatNumber(content.questions)}</p>
					</div>
				</div>`,
			}),
			panel({
				icon: ICON.activity,
				title: 'Student participation',
				subtitle: 'Are the students taking part?',
				body: `<p class="ac-empty__message" style="margin:0 0 12px;font-size:12px">${esc(
					definitions.activeStudent,
				)}</p>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Active</p>
						<p class="ac-defs__desc">${formatNumber(glance.users.activeStudents)} of ${formatNumber(
							glance.users.students,
						)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Attempts</p>
						<p class="ac-defs__desc">${formatNumber(activity.attempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Participating</p>
						<p class="ac-defs__desc">${formatNumber(activity.participatingStudents)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Average score</p>
						<p class="ac-defs__desc">${
							activity.averageScore20 == null
								? '—'
								: `${activity.averageScore20.toFixed(2)} /20`
						}</p>
					</div>
				</div>`,
			}),
			panel({
				icon: ICON.analytics,
				title: 'Assessment activity',
				subtitle: 'What the platform is being used for.',
				body: `<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Exams conducted</p>
						<p class="ac-defs__desc">${formatNumber(activity.examsConducted)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Formal attempts</p>
						<p class="ac-defs__desc">${formatNumber(activity.formalAttempts)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Courses</p>
						<p class="ac-defs__desc">${formatNumber(content.courses)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Game sessions</p>
						<p class="ac-defs__desc">${formatNumber(
							activity.gameSessions + activity.kidsGameSessions,
						)}</p>
					</div>
				</div>`,
			}),
		].join('');

		// ── ANALYTICS ──────────────────────────────────────────────────────
		const trendsHost = host.querySelector('[data-ac-trends]');
		if (trends) {
			const series = trends.data.series;
			const points = series.labels.map((label, index) => ({
				label,
				formalAttempts: series.formalAttempts[index] || 0,
				trainingAttempts: series.trainingAttempts[index] || 0,
				gameAttempts: series.gameAttempts[index] || 0,
				newTeachers: series.newTeachers[index] || 0,
				newStudents: series.newStudents[index] || 0,
			}));
			const attemptsSeries = [
				{ key: 'formalAttempts', label: 'Formal exams', tone: 'primary' },
				{ key: 'trainingAttempts', label: 'Training', tone: 'info' },
				{ key: 'gameAttempts', label: 'Games', tone: 'violet' },
			];
			const growthSeries = [
				{ key: 'newTeachers', label: 'Teachers', tone: 'success' },
				{ key: 'newStudents', label: 'Students', tone: 'warning' },
			];

			trendsHost.innerHTML = `
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Educational activity</h3>
							<p class="ac-panel__subtitle">Completed attempts by mode. ${
								trends.data.meta.granularity === 'week' ? 'Weekly' : 'Daily'
							} buckets over ${esc(trends.data.meta.periodLabel)}.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${legend(attemptsSeries)}
						${columnChart({
							points,
							series: attemptsSeries,
							labelKey: 'label',
							ariaLabel: 'Completed attempts over time by mode',
						})}
					</div>
				</section>
				<section class="ac-panel">
					<div class="ac-panel__header">
						<div class="ac-panel__titles">
							<h3 class="ac-panel__title">Account growth</h3>
							<p class="ac-panel__subtitle">New teacher and student accounts created inside the period.</p>
						</div>
					</div>
					<div class="ac-panel__body">
						${legend(growthSeries)}
						${columnChart({
							points,
							series: growthSeries,
							labelKey: 'label',
							ariaLabel: 'New accounts over time',
						})}
					</div>
				</section>`;
		}

		// ── DOCUMENTS, NOTES, PLANNING ─────────────────────────────────────
		host.querySelector('[data-ac-detail]').innerHTML = [
			panel({
				icon: ICON.documents,
				title: 'Documents',
				subtitle: 'What has been produced.',
				flush: true,
				body: wb.documents.recent.length
					? `<div class="ac-workbench__list">${wb.documents.recent
							.map(
								(doc) => `
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${esc(doc.title || doc.fileName)}</p>
							<p class="ac-workbench__row-sub">${esc(doc.kind)} · ${esc(
								doc.format || '',
							).toUpperCase()} · ${esc(formatRelative(doc.createdAt))}</p>
						</div>
						<span class="ac-workbench__row-value">${formatBytes(doc.sizeBytes)}</span>
					</div>`,
							)
							.join('')}</div>`
					: emptyState({
							title: 'No documents yet',
							message: 'Course booklets, preparation sheets and exam papers appear here.',
						}),
			}),
			panel({
				icon: ICON.notes,
				title: 'Notes to teachers',
				subtitle: 'What has been said, and a way to say more.',
				actions: '<button type="button" class="ac-btn ac-btn--sm" data-ac-compose-note>Write a note</button>',
				flush: true,
				body: wb.notes.recent.length
					? `<div class="ac-workbench__list">${wb.notes.recent
							.map(
								(note) => `
					<div class="ac-workbench__row">
						<div class="ac-workbench__row-main">
							<p class="ac-workbench__row-title">${esc(note.title)}</p>
							<p class="ac-workbench__row-sub">${esc(
								note.teacherName || 'An administrator',
							)}${note.className ? ` · ${esc(note.className)}` : ''} · ${esc(
								formatRelative(note.date),
							)}</p>
						</div>
					</div>`,
							)
							.join('')}</div>`
					: emptyState({
							title: 'No note sent yet',
							message: 'A note reaches a teacher and their class.',
						}),
			}),
			panel({
				icon: ICON.planning,
				title: 'Planning',
				subtitle: 'What is coming up.',
				flush: true,
				body: `
					<div class="ac-workbench__list">
						${
							wb.planning.upcomingAssignments.length
								? wb.planning.upcomingAssignments
										.map(
											(assignment) => `
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${esc(assignment.title)}</p>
									<p class="ac-workbench__row-sub">Due ${esc(
										formatDate(assignment.dueDate, { withTime: false }),
									)}</p>
								</div>
								<span class="ac-workbench__row-value">${
									assignment.dueDate && new Date(assignment.dueDate) < new Date()
										? '<span class="ac-badge ac-badge--danger">overdue</span>'
										: '<span class="ac-badge">scheduled</span>'
								}</span>
							</div>`,
										)
										.join('')
								: ''
						}
						${
							wb.planning.recentExams.length
								? wb.planning.recentExams
										.map(
											(exam) => `
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${esc(exam.name)}</p>
									<p class="ac-workbench__row-sub">${
										exam.isTraining ? 'Training' : 'Formal exam'
									} · created ${esc(formatRelative(exam.createdAt))}</p>
								</div>
								<span class="ac-badge ac-badge--${
									exam.status === 'active' ? 'success' : ''
								}">${esc(exam.status)}</span>
							</div>`,
										)
										.join('')
								: ''
						}
						${
							wb.planning.archives.length
								? wb.planning.archives
										.map(
											(archive) => `
							<div class="ac-workbench__row">
								<div class="ac-workbench__row-main">
									<p class="ac-workbench__row-title">${esc(
										archive.label || `Archive ${archive.year}`,
									)}</p>
									<p class="ac-workbench__row-sub">School year ${esc(archive.year)}</p>
								</div>
								<span class="ac-workbench__row-value">${formatBytes(
									archive.sizeBytes,
								)}</span>
							</div>`,
										)
										.join('')
								: ''
						}
					</div>
					${
						!wb.planning.upcomingAssignments.length &&
						!wb.planning.recentExams.length &&
						!wb.planning.archives.length
							? emptyState({
									title: 'Nothing planned yet',
									message: 'Exams, assignments and year archives appear here.',
								})
							: ''
					}`,
			}),
		].join('');

		// ── COMPOSE A NOTE ─────────────────────────────────────────────────
		const compose = host.querySelector('[data-ac-compose-note]');
		if (compose) {
			compose.addEventListener('click', async () => {
				let teachers = [];
				try {
					const payload = await api.get('console/users?role=teacher&limit=200');
					teachers = payload?.data || [];
				} catch {
					teachers = [];
				}
				if (!teachers.length) {
					toast('No teacher account is available to write to.', 'error');
					return;
				}
				const modal = openModal({
					title: 'Write a note to a teacher',
					subtitle: 'The note reaches the teacher and, when a class is chosen, that class.',
					body: `<div class="ac-field">
							<label class="ac-field__label" for="ac-note-teacher">Teacher</label>
							<select class="ac-select ac-input--full" id="ac-note-teacher">
								${teachers
									.map(
										(teacher) =>
											`<option value="${esc(teacher.id)}">${esc(
												teacher.name || teacher.username,
											)}</option>`,
									)
									.join('')}
							</select>
						</div>
						<div class="ac-field" style="margin-top:12px">
							<label class="ac-field__label" for="ac-note-title">Title</label>
							<input class="ac-input ac-input--full" id="ac-note-title" type="text" placeholder="What is this about?" />
						</div>
						<div class="ac-field" style="margin-top:12px">
							<label class="ac-field__label" for="ac-note-body">Message</label>
							<textarea class="ac-input ac-input--full" id="ac-note-body" rows="4" placeholder="Write the note"></textarea>
						</div>`,
					footer: `
						<button type="button" class="ac-btn" data-ac-cancel>Cancel</button>
						<button type="button" class="ac-btn ac-btn--primary" data-ac-confirm>Send note</button>
					`,
				});
				modal.root.querySelector('[data-ac-cancel]').addEventListener('click', modal.close);
				modal.root.querySelector('[data-ac-confirm]').addEventListener('click', async () => {
					const teacherId = modal.root.querySelector('#ac-note-teacher').value;
					const title = modal.root.querySelector('#ac-note-title').value.trim();
					const body = modal.root.querySelector('#ac-note-body').value.trim();
					if (!title || !body) {
						toast('A title and a message are required.', 'error');
						return;
					}
					try {
						await api.post('console/notes', { teacherId, title, body });
						modal.close();
						toast('Note sent.', 'success');
						ctx.rerender();
					} catch (err) {
						toast(err.message, 'error');
					}
				});
			});
		}

		// ── PERIOD ────────────────────────────────────────────────────────
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

// ── Helpers ────────────────────────────────────────────────────────────────

function panel({ icon, title, subtitle, body, actions = '', flush = false }) {
	return `<section class="ac-workbench__panel">
		<div class="ac-workbench__head">
			<div>
				<h3 class="ac-workbench__title">${icon || ''}${esc(title)}</h3>
				${subtitle ? `<p class="ac-workbench__subtitle">${esc(subtitle)}</p>` : ''}
			</div>
			${actions ? `<div class="ac-panel__actions">${actions}</div>` : ''}
		</div>
		<div class="ac-workbench__body${flush ? ' ac-workbench__body--flush' : ''}">${body}</div>
	</section>`;
}

function workbenchRow({ title, sub, value, href }) {
	const tag = href ? 'a' : 'div';
	const attrs = href ? ` href="${esc(href)}" style="text-decoration:none;color:inherit"` : '';
	return `<${tag} class="ac-workbench__row"${attrs}>
		<div class="ac-workbench__row-main">
			<p class="ac-workbench__row-title">${esc(title)}</p>
			<p class="ac-workbench__row-sub">${esc(sub)}</p>
		</div>
		<span class="ac-workbench__row-value">${formatNumber(value)}</span>
	</${tag}>`;
}

function formatBytes(bytes) {
	const n = Number(bytes);
	if (!Number.isFinite(n) || n <= 0) return '—';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
}

/**
 * The alerts band. Every alert is derived from a real record and an explicit
 * threshold — never from a guess.
 */
function renderAlerts({ glance, operations, activity, access, maintenance }) {
	const alerts = [];

	if (access.pendingAccountRequests > 0) {
		alerts.push({
			kind: 'warning',
			title: `${access.pendingAccountRequests} account request(s) waiting for a decision`,
			text: 'A student or a teacher cannot sign in until an administrator approves the request.',
			action: { label: 'Review accounts', href: '#/users/students' },
		});
	}
	if (access.pendingProfileRequests > 0) {
		alerts.push({
			kind: 'info',
			title: `${access.pendingProfileRequests} profile change request(s) waiting`,
			text: 'A student is asking for a correction to their record.',
			action: { label: 'Review the trail', href: '#/audit' },
		});
	}
	if (access.teachersWithoutClasses.length > 0) {
		alerts.push({
			kind: 'warning',
			title: `${access.teachersWithoutClasses.length} teacher(s) manage no class`,
			text: 'They can author content but reach no student. Assign them a class, or deactivate the account.',
			action: { label: 'Open teachers', href: '#/users/teachers' },
		});
	}
	if (operations.failedAuthentications > 0) {
		alerts.push({
			kind: 'warning',
			title: `${operations.failedAuthentications} failed sign-in attempt(s) in this period`,
			text: 'Grouped by source address and attempted username on the Audit page — a concentration may indicate credential stuffing.',
			action: { label: 'Inspect security events', href: '#/audit?stream=security' },
		});
	}
	if (
		operations.serverErrorRatePercent != null &&
		operations.serverErrorRatePercent >= 1
	) {
		alerts.push({
			kind: 'danger',
			title: `Server error rate at ${operations.serverErrorRatePercent}%`,
			text: 'More than one request in a hundred failed with a server error in the last hour.',
			action: { label: 'Open system health', href: '#/health' },
		});
	}
	if (
		activity.attemptsPrevious != null &&
		activity.attempts > 0 &&
		activity.attemptsPrevious > 0
	) {
		const delta = Math.round(
			((activity.attempts - activity.attemptsPrevious) / activity.attemptsPrevious) * 1000,
		) / 10;
		if (delta <= -30) {
			alerts.push({
				kind: 'warning',
				title: `Attempts fell ${Math.abs(delta)}% versus the previous period`,
				text: 'A sharp drop usually means an organization stopped using the platform, or a term boundary was crossed.',
				action: { label: 'Compare organizations', href: '#/analytics' },
			});
		}
	}

	if (!alerts.length) {
		return `<div class="ac-alert ac-alert--info">
			<div class="ac-alert__body">
				<p class="ac-alert__title">Nothing needs your attention</p>
				<p class="ac-alert__text">Every monitored threshold is inside its normal range.</p>
			</div>
		</div>`;
	}

	return `<div class="ac-alert-list">${alerts
		.map(
			(alert) => `
		<div class="ac-alert-item">
			<div class="ac-alert-item__body">
				<p class="ac-alert-item__title">${esc(alert.title)}</p>
				<p class="ac-alert-item__text">${esc(alert.text)}</p>
			</div>
			<div class="ac-alert-item__action">
				<a class="ac-btn ac-btn--sm" href="${esc(alert.action.href)}">${esc(alert.action.label)}</a>
			</div>
		</div>`,
		)
		.join('')}</div>`;
}
