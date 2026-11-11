/**
 * src/backend/services/GeneratedDocumentService.js
 *
 * Persists the documents the app renders for teachers (course booklets, lesson
 * prep sheets, exercises with solutions, exam papers) and keeps a registry so
 * they can be browsed, re-downloaded and deleted later.
 *
 * Layout on disk — inside the existing uploads/ folder so express.static and
 * the backup ZIP/import pick it up with no extra mounting:
 *
 *   uploads/generated/<kind>/<courseId|examId|general>/<timestamp>-<slug>.<ext>
 *   → served at /uploads/generated/<kind>/<scope>/<file>
 *
 * The registry row stores both rel_path (relative to uploadsDir) and url (the
 * public /uploads/... path) so the UI can show the document's path in the app.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

export const DOCUMENT_KINDS = Object.freeze(['course', 'prep-sheet', 'exercise', 'exam']);
const KIND_SET = new Set(DOCUMENT_KINDS);
const EXT_RE = /^[a-z0-9]{2,6}$/;

const slugify = (value) =>
	String(value == null ? '' : value)
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.toLowerCase()
		.slice(0, 60) || 'document';

export class GeneratedDocumentService {
	#repo;
	#uploadsDir;
	#rootDir;
	#logger;

	constructor(repo, options = {}) {
		this.#repo = repo;
		this.#uploadsDir = options.uploadsDir || config.uploadsDir;
		this.#rootDir = join(this.#uploadsDir, 'generated');
		this.#logger = options.logger || logger;
	}

	get rootDir() {
		return this.#rootDir;
	}

	/**
	 * Write a rendered buffer to disk and register it. Returns the registry row.
	 * `kind` must be one of DOCUMENT_KINDS; `extension` defaults to the format.
	 */
	async saveDocument({
		schoolId,
		userId,
		kind,
		title,
		courseId = null,
		lessonId = null,
		examId = null,
		format = 'pdf',
		extension = null,
		buffer,
		meta = null,
	}) {
		if (!KIND_SET.has(kind)) throw new Error(`Unknown generated document kind: ${kind}`);
		if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Empty generated document buffer');

		const ext = String(extension || format || 'pdf').toLowerCase().replace(/^\./, '');
		if (!EXT_RE.test(ext)) throw new Error(`Invalid document extension: ${ext}`);

		const scope = String(courseId || examId || 'general')
			.replace(/[^a-zA-Z0-9_-]/g, '')
			.slice(0, 80) || 'general';
		const dir = join(this.#rootDir, kind, scope);
		mkdirSync(dir, { recursive: true });

		const fileName = `${Date.now()}-${randomBytes(4).toString('hex')}-${slugify(title)}.${ext}`;
		const absPath = join(dir, fileName);
		writeFileSync(absPath, buffer);

		const relPath = this.#relPath(absPath);
		const url = `/uploads/${relPath}`;
		const row = await this.#repo.create('generated_documents', {
			school_id: String(schoolId),
			created_by: String(userId),
			kind,
			title: String(title || 'Document').slice(0, 300),
			course_id: courseId || null,
			lesson_id: lessonId || null,
			exam_id: examId || null,
			format: ext,
			file_name: fileName,
			rel_path: relPath,
			url,
			size_bytes: buffer.length,
			meta_json: meta ? JSON.stringify(meta) : null,
		});
		this.#logger?.info?.({ id: row.id, kind, relPath, size: buffer.length }, 'generated document saved');
		return this.#hydrate(row);
	}

	/**
	 * List the registry. Teachers only ever see their own documents; the route
	 * enforces that by passing `mineUserId` for the teacher role.
	 */
	async list({
		schoolId,
		kind = null,
		courseId = null,
		lessonId = null,
		examId = null,
		search = '',
		limit = 100,
		offset = 0,
		mineUserId = null,
	} = {}) {
		const filters = { school_id: String(schoolId) };
		if (kind && KIND_SET.has(kind)) filters.kind = kind;
		if (courseId) filters.course_id = String(courseId);
		if (lessonId) filters.lesson_id = String(lessonId);
		if (examId) filters.exam_id = String(examId);
		if (mineUserId) filters.created_by = String(mineUserId);

		const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
		const safeOffset = Math.max(Number(offset) || 0, 0);
		const { data, total } = await this.#repo.getAll('generated_documents', {
			filters,
			limit: safeLimit,
			offset: safeOffset,
			orderBy: 'created_at',
			direction: 'desc',
			search: String(search || '').trim() || undefined,
		});
		return { data: (data || []).map((row) => this.#hydrate(row)), total };
	}

	/** Fetch one row, scoped to the tenant. */
	async get(id, schoolId) {
		const row = await this.#repo.getById('generated_documents', id);
		if (!row || String(row.school_id) !== String(schoolId)) {
			throw new NotFoundError('Generated document');
		}
		return this.#hydrate(row);
	}

	/** Absolute path + bytes for the download endpoint. */
	async readFile(id, { schoolId, userId = null, role = null }) {
		const row = await this.#assertAccessible(id, schoolId, userId, role);
		const absPath = this.#absPath(row.rel_path);
		if (!existsSync(absPath)) throw new NotFoundError('Generated document file');
		return { row, absPath, buffer: readFileSync(absPath) };
	}

	/** Delete the registry row and its file (teacher: own documents only). */
	async remove(id, { schoolId, userId = null, role = null }) {
		const row = await this.#assertAccessible(id, schoolId, userId, role);
		this.#removeFile(row.rel_path);
		await this.#repo.delete('generated_documents', id);
		return row;
	}

	/**
	 * Admin data reset: drop every document row of one school and its files.
	 * Other tenants' documents live in the same uploads folder, so files are
	 * removed individually from the rows instead of clearing the directory.
	 */
	async purgeSchool(schoolId) {
		const { data } = await this.#repo.getAll('generated_documents', {
			filters: { school_id: String(schoolId) },
			limit: 100000,
		});
		const rows = data || [];
		for (const row of rows) this.#removeFile(row.rel_path);
		const model = typeof this.#repo.modelFor === 'function' ? this.#repo.modelFor('generated_documents') : null;
		if (model && typeof model.deleteMany === 'function') {
			await model.deleteMany({ where: { school_id: String(schoolId) } });
		} else {
			for (const row of rows) await this.#repo.delete('generated_documents', row.id);
		}
		return rows.length;
	}

	async #assertAccessible(id, schoolId, userId, role) {
		const row = await this.get(id, schoolId);
		if (role === ROLES.TEACHER && String(row.created_by) !== String(userId)) {
			throw new ForbiddenError('Not your document');
		}
		return row;
	}

	// ── Path safety ───────────────────────────────────────────────────────────

	/** Resolve a relative-to-uploads path, refusing anything outside uploads/. */
	#absPath(relPath) {
		const root = resolve(this.#uploadsDir);
		const abs = resolve(root, String(relPath || ''));
		if (abs !== root && !abs.startsWith(root + sep)) {
			throw new ForbiddenError('Invalid document path');
		}
		return abs;
	}

	#relPath(absPath) {
		const root = resolve(this.#uploadsDir);
		const abs = resolve(absPath);
		if (!abs.startsWith(root + sep)) throw new Error('Generated document escaped the uploads folder');
		return abs.slice(root.length + 1).split(sep).join('/');
	}

	#removeFile(relPath) {
		try {
			const abs = this.#absPath(relPath);
			rmSync(abs, { force: true });
		} catch (err) {
			// A missing file must never block deleting the registry row.
			this.#logger?.warn?.({ err: err?.message, relPath }, 'generated document file could not be removed');
		}
	}

	/** Turn the stored meta_json string back into an object for the API. */
	#hydrate(row) {
		if (!row) return row;
		let meta = null;
		if (row.meta_json) {
			try {
				meta = JSON.parse(row.meta_json);
			} catch {
				meta = null;
			}
		}
		return { ...row, meta };
	}
}

export default GeneratedDocumentService;