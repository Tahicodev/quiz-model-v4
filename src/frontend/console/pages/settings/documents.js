/**
 * src/frontend/console/pages/settings/documents.js
 *
 * Documents & data — what the platform has produced, and what can be done
 * with the organization's data.
 *
 * Ported from the legacy "Data" settings tab. Every action here is bound to
 * a real endpoint:
 *
 *   • the recent documents, with their FOLDER and their file, both
 *     clickable — a document is a file, and an administrator has to be able
 *     to open it and to see where it lives
 *   • export the organization's data as JSON, and as a ZIP that also carries
 *     the uploaded media
 *   • import a backup (JSON or ZIP); the ZIP restores the media files and
 *     the records are written through the bulk endpoints
 *   • the school-year archives
 *   • the factory reset
 *
 * One honest difference from the legacy panel: the export is taken from the
 * DATABASE, not from the browser cache. The legacy export captured the
 * localStorage of whichever computer the administrator happened to be at.
 */

import { api } from '../../core/api.js';
import { toast, confirmDialog } from '../../components/ui.js';
import { renderTable } from '../../components/table.js';
import { panel, escapeHtml } from './index.js';

export async function documentsSection(ctx) {
	const [documentsPayload, archivesPayload] = await Promise.all([
		api.get('generated-documents?limit=200').catch(() => null),
		api.get('archives').catch(() => null),
	]);

	const documents = Array.isArray(documentsPayload?.data)
		? documentsPayload.data
		: Array.isArray(documentsPayload)
			? documentsPayload
			: [];
	const archives = Array.isArray(archivesPayload?.items) ? archivesPayload.items : [];

	const markup = [
		panel({
			title: 'Recent documents',
			subtitle:
				'Every booklet, preparation sheet and exam paper the platform has generated. The title opens the file; the folder shows where it lives.',
			body: documents.length
				? renderTable({
						columns: [
							{
								key: 'title',
								label: 'Document',
								render: (row) => {
									const href = row.url || '';
									const label = escapeHtml(row.title || row.file_name || 'Document');
									return href
										? `<a class="ac-table__primary" href="${escapeHtml(
												href,
											)}" target="_blank" rel="noopener">${label}</a>`
										: `<span class="ac-table__primary">${label}</span>`;
								},
							},
							{
								key: 'kind',
								label: 'Kind',
								render: (row) => escapeHtml(row.kind || '—'),
							},
							{
								key: 'rel_path',
								label: 'Folder',
								render: (row) =>
									`<code class="ac-table__muted" title="${escapeHtml(
										row.rel_path || '',
									)}">${escapeHtml(folderOf(row.rel_path))}</code>`,
							},
							{
								key: 'size_bytes',
								label: 'Size',
								align: 'right',
								render: (row) => formatBytes(row.size_bytes),
							},
							{
								key: 'created_at',
								label: 'Created',
								render: (row) => escapeHtml(formatDate(row.created_at)),
							},
							{
								key: 'actions',
								label: '',
								align: 'right',
								render: (row) =>
									`<a class="ac-btn ac-btn--sm" href="${escapeHtml(
										`/api/v1/generated-documents/${encodeURIComponent(row.id)}/download`,
									)}">Download</a>`,
							},
						],
						rows: documents,
					})
				: `<p class="ac-empty__message">No document has been generated yet. The course booklets, the preparation sheets and the exam papers appear here once they are produced.</p>`,
		}),
		panel({
			title: 'Export',
			subtitle: 'A snapshot of this organization, taken from the database.',
			body: `<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">What the export contains — and what it does not</p>
						<p class="ac-alert__text">The accounts, the classes, the categories, the questions, the exams, the results, the games, the tournaments, the notifications and the settings of this organization. The passwords are <strong>not</strong> included: a backup file is not a credential store, and a restored account keeps the password it already has.</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin:14px 0 0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-export-json>Export as JSON</button>
						<button type="button" class="ac-btn" data-ac-export-zip>Export as ZIP (with the media)</button>
						<span class="ac-table__muted" data-ac-export-status></span>
					</div>
				</div>`,
		}),
		panel({
			title: 'Import',
			subtitle: 'Restore a backup exported from this application.',
			body: `<div class="ac-field-grid">
					${fieldFile('ac-import-file', 'Backup file', 'A .zip produced by "Export as ZIP", or a .json produced by "Export as JSON".')}
				</div>
				<div class="ac-toolbar" style="margin-bottom:0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-import-run>Import the backup</button>
						<span class="ac-table__muted" data-ac-import-status></span>
					</div>
				</div>`,
		}),
		panel({
			title: 'School-year archives',
			subtitle: 'A frozen snapshot of a school year, kept per year.',
			actions: '<button type="button" class="ac-btn ac-btn--sm ac-btn--primary" data-ac-archive-new>Create an archive</button>',
			body: archives.length
				? renderTable({
						columns: [
							{
								key: 'label',
								label: 'Archive',
								render: (row) =>
									`<span class="ac-table__primary">${escapeHtml(
										row.label || `Archive ${row.year}`,
									)}</span><br><span class="ac-table__muted">${escapeHtml(row.year)}</span>`,
							},
							{
								key: 'size_bytes',
								label: 'Size',
								align: 'right',
								render: (row) => formatBytes(row.size_bytes),
							},
							{
								key: 'created_at',
								label: 'Created',
								render: (row) => escapeHtml(formatDate(row.created_at)),
							},
							{
								key: 'actions',
								label: '',
								align: 'right',
								render: (row) =>
									`<button type="button" class="ac-btn ac-btn--sm" data-ac-archive-view="${escapeHtml(
										row.year,
									)}">Open</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-archive-delete="${escapeHtml(
										row.year,
									)}">Delete</button>`,
							},
						],
						rows: archives,
					})
				: '<p class="ac-empty__message">No archive yet.</p>',
		}),
		panel({
			title: 'Factory reset',
			subtitle: 'Erase this organization\'s content and keep only its administrators.',
			body: `<div class="ac-alert ac-alert--danger">
					<div class="ac-alert__body">
						<p class="ac-alert__title">This cannot be undone</p>
						<p class="ac-alert__text">The reset erases the questions, the exams, the classes, the results, the games, the generated documents and the archives of this organization. The administrator accounts are kept. Nothing outside this organization is touched.</p>
					</div>
				</div>
				<div class="ac-toolbar" style="margin:14px 0 0">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--danger" data-ac-reset-data>Reset the data</button>
						<span class="ac-table__muted" data-ac-reset-status></span>
					</div>
				</div>`,
		}),
	].join('');

	function bind(root) {
		const exportStatus = root.querySelector('[data-ac-export-status]');
		const importStatus = root.querySelector('[data-ac-import-status]');

		// ── Export ──────────────────────────────────────────────────────
		const fetchSnapshot = async () => {
			const payload = await api.get('console/export');
			if (!payload?.data) throw new Error('The export was empty.');
			return payload.data;
		};

		root.querySelector('[data-ac-export-json]')?.addEventListener('click', async () => {
			if (exportStatus) exportStatus.textContent = 'Collecting…';
			try {
				const snapshot = await fetchSnapshot();
				downloadBlob(
					new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
					`quiz-app-backup-${snapshot.timestamp.slice(0, 10)}.json`,
				);
				if (exportStatus) exportStatus.textContent = 'The backup was downloaded.';
				toast('Backup created.', 'success');
			} catch (err) {
				if (exportStatus) exportStatus.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		root.querySelector('[data-ac-export-zip]')?.addEventListener('click', async () => {
			if (exportStatus) exportStatus.textContent = 'Packaging…';
			try {
				const snapshot = await fetchSnapshot();
				const response = await fetch('/api/v1/exports/bundle', {
					method: 'POST',
					credentials: 'include',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${window.APP_CONFIG?.token || readToken()}`,
					},
					body: JSON.stringify({ data: snapshot.data }),
				});
				if (!response.ok) {
					throw new Error(`The server refused the export (${response.status}).`);
				}
				const blob = await response.blob();
				downloadBlob(blob, `quiz-app-backup-${snapshot.timestamp.slice(0, 10)}.zip`);
				if (exportStatus) exportStatus.textContent = 'The backup was downloaded.';
				toast('Backup created.', 'success');
			} catch (err) {
				if (exportStatus) exportStatus.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		// ── Import ──────────────────────────────────────────────────────
		// The picker shows the chosen file's name — the promise the "Choose
		// a file" button implies.
		root.querySelectorAll('[data-ac-file-input]').forEach((input) => {
			input.addEventListener('change', () => {
				const name = root.querySelector(`[data-ac-file-name="${input.dataset.acFileInput}"]`);
				if (!name) return;
				const file = input.files?.[0];
				name.textContent = file ? file.name : 'No file chosen yet';
				name.classList.toggle('is-set', Boolean(file));
			});
		});

		root.querySelector('[data-ac-import-run]')?.addEventListener('click', async () => {
			const input = root.querySelector('#ac-import-file');
			const file = input?.files?.[0];
			if (!file) {
				toast('Choose a backup file first.', 'error');
				return;
			}
			const confirmed = await confirmDialog({
				title: 'Import this backup?',
				message:
					'The records of the backup are written over the records of this organization. The accounts that already exist keep their password.',
				confirmLabel: 'Import the backup',
				danger: true,
			});
			if (!confirmed) return;

			if (importStatus) importStatus.textContent = 'Importing…';
			try {
				let data = null;
				let uploadToken = null;

				if (file.name.toLowerCase().endsWith('.zip')) {
					const response = await fetch('/api/v1/imports/bundle', {
						method: 'POST',
						credentials: 'include',
						headers: {
							'Content-Type': 'application/zip',
							Authorization: `Bearer ${readToken()}`,
						},
						body: file,
					});
					if (!response.ok) {
						throw new Error(`The server refused the backup (${response.status}).`);
					}
					const staged = await response.json();
					data = staged.data;
					uploadToken = staged.uploadToken;
				} else {
					const parsed = JSON.parse(await file.text());
					data = parsed?.data ? parsed.data : parsed;
				}

				if (!data || typeof data !== 'object') {
					throw new Error('The backup held no data.');
				}

				const counts = await applySnapshot(data);
				if (uploadToken) {
					await fetch(`/api/v1/imports/bundle/${encodeURIComponent(uploadToken)}/commit`, {
						method: 'POST',
						credentials: 'include',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${readToken()}`,
						},
						body: JSON.stringify({ uploadToken }),
					});
				}

				const summary = Object.entries(counts)
					.filter(([, count]) => count > 0)
					.map(([table, count]) => `${count} ${table}`)
					.join(', ');
				if (importStatus) {
					importStatus.textContent = summary ? `Imported: ${summary}.` : 'Nothing to import.';
				}
				toast('The backup was imported.', 'success');
				ctx.rerender();
			} catch (err) {
				if (importStatus) importStatus.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		// ── Archives ────────────────────────────────────────────────────
		root.querySelector('[data-ac-archive-new]')?.addEventListener('click', async () => {
			const year = prompt('Which school year? (YYYY-YYYY)', currentSchoolYear());
			if (!year) return;
			try {
				await api.post('archives', { year, label: `Archive ${year}`, data: {} });
				toast('The archive was created.', 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		});

		root.querySelectorAll('[data-ac-archive-view]').forEach((button) => {
			button.addEventListener('click', async () => {
				try {
					const archive = await api.get(`archives/${encodeURIComponent(button.dataset.acArchiveView)}`);
					const blob = new Blob([JSON.stringify(archive.data ?? {}, null, 2)], {
						type: 'application/json',
					});
					downloadBlob(blob, `archive-${button.dataset.acArchiveView}.json`);
					toast('The archive was downloaded.', 'success');
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});

		root.querySelectorAll('[data-ac-archive-delete]').forEach((button) => {
			button.addEventListener('click', async () => {
				const confirmed = await confirmDialog({
					title: 'Delete this archive?',
					message: 'The frozen snapshot of that year is removed. It cannot be recovered.',
					confirmLabel: 'Delete the archive',
					danger: true,
				});
				if (!confirmed) return;
				try {
					await api.del(`archives/${encodeURIComponent(button.dataset.acArchiveDelete)}`);
					toast('The archive was deleted.', 'success');
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});

		// ── Factory reset ───────────────────────────────────────────────
		root.querySelector('[data-ac-reset-data]')?.addEventListener('click', async () => {
			const status = root.querySelector('[data-ac-reset-status]');
			const confirmed = await confirmDialog({
				title: 'Reset every record of this organization?',
				message:
					'The questions, the exams, the classes, the results, the games, the documents and the archives are erased. The administrator accounts are kept. This cannot be undone.',
				detail: 'Take a backup first if there is anything here you want to keep.',
				confirmLabel: 'Reset the data',
				danger: true,
			});
			if (!confirmed) return;
			if (status) status.textContent = 'Resetting…';
			try {
				const result = await api.post('admin/reset-data', { confirm: 'RESET' });
				if (status) {
					status.textContent = 'The organization was reset.';
				}
				toast('The organization was reset.', 'success');
				ctx.rerender();
				return result;
			} catch (err) {
				if (status) status.textContent = err.message;
				toast(err.message, 'error');
			}
		});
	}

	return { markup, bind };
}

/**
 * Write a snapshot through the bulk endpoints.
 *
 * The bulk routes are administrator-only and tenant-scoped, so they enforce
 * the same boundary as the rest of the console. The order matters: the
 * children go before their parents, so a class exists before the student
 * that belongs to it.
 */
const IMPORT_ORDER = [
	'categories',
	'classes',
	'users',
	'questions',
	'exams',
	'results',
	'games',
	'tournaments',
	'notifications',
	'gamification',
	'settings',
	// Phase 1 learning taxonomy — parents before children, and the criteria
	// after `questions` because each criterion is an FK onto a question. The
	// global Bloom catalog is seeded at boot and is deliberately not restored.
	'learning_objectives',
	'competencies',
	'learning_objective_competencies',
	'learning_prerequisites',
	'question_assessment_criteria',
];

async function applySnapshot(data) {
	const counts = {};
	for (const table of IMPORT_ORDER) {
		const rows = Array.isArray(data[table]) ? data[table] : [];
		if (!rows.length) {
			counts[table] = 0;
			continue;
		}
		try {
			await api.post(`bulk/${table}`, { items: rows });
			counts[table] = rows.length;
		} catch {
			// One table failing must not abort the whole restore: the others
			// are still worth writing, and the summary says what landed.
			counts[table] = 0;
		}
	}
	return counts;
}

/**
 * A file input, styled like the other controls.
 *
 * A raw `<input type="file">` renders as the OS's own grey widget, which no
 * theme can touch. The picker hides the native input (it stays in the DOM,
 * focusable and labelled, so keyboard and screen readers keep working) and
 * offers the console's own button plus the chosen file's name instead.
 */
function fieldFile(id, label, hint) {
	return `<div class="ac-field ac-field--full">
		<label class="ac-field__label" for="${escapeHtml(id)}">${escapeHtml(label)}</label>
		<label class="ac-file" for="${escapeHtml(id)}">
			<input id="${escapeHtml(id)}" type="file" accept=".json,.zip" data-ac-file-input="${escapeHtml(id)}" />
			<span class="ac-btn ac-file__btn" aria-hidden="true">Choose a file</span>
			<span class="ac-file__name" data-ac-file-name="${escapeHtml(id)}">No file chosen yet</span>
		</label>
		<p class="ac-field__hint">${escapeHtml(hint)}</p>
	</div>`;
}

/** Trigger a browser download. */
function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The token the API client holds, for the raw fetch calls above. */
function readToken() {
	try {
		const raw =
			sessionStorage.getItem('quizSession') || localStorage.getItem('quizSession');
		const session = raw ? JSON.parse(raw) : null;
		if (session?.token) return session.token;
	} catch {
		/* fall through */
	}
	return localStorage.getItem('quizAuthToken') || '';
}

/** The folder part of a relative path. */
function folderOf(relPath) {
	const value = String(relPath || '');
	const index = value.lastIndexOf('/');
	return index === -1 ? '(root)' : value.slice(0, index);
}

function formatBytes(bytes) {
	const n = Number(bytes);
	if (!Number.isFinite(n) || n <= 0) return '—';
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
	return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
}

function formatDate(value) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleDateString();
}

function currentSchoolYear() {
	const now = new Date();
	const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
	return `${start}-${start + 1}`;
}
