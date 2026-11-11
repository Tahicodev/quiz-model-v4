/**
 * tests/unit/GeneratedDocumentService.test.js
 *
 * The registry + on-disk store behind every exported document. A fake
 * repository keeps the test hermetic; a temp uploadsDir proves the real file
 * lands under uploads/generated/<kind>/<scope>/ and that deleting a document
 * removes both the row and the bytes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GeneratedDocumentService } from '../../src/backend/services/GeneratedDocumentService.js';
import { ForbiddenError, NotFoundError } from '../../src/shared/errors.js';

class FakeRepo {
	constructor() {
		this.rows = new Map();
		this.seq = 0;
	}
	async create(table, data) {
		expect(table).toBe('generated_documents');
		this.seq += 1;
		const row = { id: `doc-${this.seq}`, created_at: new Date().toISOString(), ...data };
		this.rows.set(row.id, row);
		return row;
	}
	async getById(table, id) {
		expect(table).toBe('generated_documents');
		return this.rows.get(id) || null;
	}
	async getAll(table, { filters = {} } = {}) {
		const all = [...this.rows.values()].filter((row) =>
			Object.entries(filters).every(([key, value]) => String(row[key]) === String(value)),
		);
		return { data: all, total: all.length };
	}
	async delete(table, id) {
		expect(table).toBe('generated_documents');
		this.rows.delete(id);
	}
}

let uploadsDir;
let repo;
let svc;

beforeEach(() => {
	uploadsDir = mkdtempSync(join(tmpdir(), 'gendoc-'));
	repo = new FakeRepo();
	svc = new GeneratedDocumentService(repo, { uploadsDir });
});

afterEach(() => {
	rmSync(uploadsDir, { recursive: true, force: true });
});

const base = {
	schoolId: 'school-1',
	userId: 'teacher-1',
	kind: 'exercise',
	title: 'Exercice — Le budget du voyage (PDF)',
	courseId: 'course-1',
	lessonId: 'lesson-1',
	format: 'pdf',
	buffer: Buffer.from('%PDF-1.4 fake body'),
	meta: { difficulty: 'medium' },
};

describe('GeneratedDocumentService.saveDocument', () => {
	it('writes the file under uploads/generated/<kind>/<courseId>/ and registers it', async () => {
		const row = await svc.saveDocument(base);
		expect(row.id).toBe('doc-1');
		expect(row.kind).toBe('exercise');
		expect(row.format).toBe('pdf');
		expect(row.size_bytes).toBe(base.buffer.length);
		expect(row.rel_path).toBe(`generated/exercise/course-1/${row.file_name}`);
		expect(row.url).toBe(`/uploads/${row.rel_path}`);
		expect(row.meta).toEqual({ difficulty: 'medium' });

		const abs = join(uploadsDir, row.rel_path);
		expect(existsSync(abs)).toBe(true);
		expect(readFileSync(abs).toString()).toBe('%PDF-1.4 fake body');
	});

	it('slugifies the title and keeps a stable extension', async () => {
		const row = await svc.saveDocument({ ...base, title: 'Été — L\u2019énergie : 3/4', extension: 'PDF' });
		expect(row.file_name).toMatch(/^\d{10,}-[a-f0-9]{8}-ete-l-energie-3-4\.pdf$/i);
	});

	it('rejects an unknown kind and an empty buffer', async () => {
		await expect(svc.saveDocument({ ...base, kind: 'poster' })).rejects.toThrow(/Unknown generated document kind/);
		await expect(svc.saveDocument({ ...base, buffer: Buffer.alloc(0) })).rejects.toThrow(/Empty generated document buffer/);
	});
});

describe('GeneratedDocumentService list / read / remove', () => {
	it('lists only the requested tenant and supports kind filters', async () => {
		await svc.saveDocument(base);
		await svc.saveDocument({ ...base, kind: 'course', format: 'docx' });
		await svc.saveDocument({ ...base, schoolId: 'school-2' });

		const mine = await svc.list({ schoolId: 'school-1' });
		expect(mine.total).toBe(2);
		const exercises = await svc.list({ schoolId: 'school-1', kind: 'exercise' });
		expect(exercises.data).toHaveLength(1);
		expect(exercises.data[0].kind).toBe('exercise');
	});

	it('scopes reads to the owning teacher', async () => {
		const row = await svc.saveDocument(base);
		const read = await svc.readFile(row.id, { schoolId: 'school-1', userId: 'teacher-1', role: 'teacher' });
		expect(read.buffer.toString()).toBe('%PDF-1.4 fake body');
		await expect(
			svc.readFile(row.id, { schoolId: 'school-1', userId: 'teacher-2', role: 'teacher' }),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(svc.readFile(row.id, { schoolId: 'school-2' })).rejects.toBeInstanceOf(NotFoundError);
	});

	it('remove deletes the row and the bytes', async () => {
		const row = await svc.saveDocument(base);
		const abs = join(uploadsDir, row.rel_path);
		expect(existsSync(abs)).toBe(true);
		await svc.remove(row.id, { schoolId: 'school-1', userId: 'teacher-1', role: 'teacher' });
		expect(existsSync(abs)).toBe(false);
		expect(repo.rows.has(row.id)).toBe(false);
	});

	it('purgeSchool only drops the given tenant', async () => {
		await svc.saveDocument(base);
		const other = await svc.saveDocument({ ...base, schoolId: 'school-2' });
		const removed = await svc.purgeSchool('school-1');
		expect(removed).toBe(1);
		expect(existsSync(join(uploadsDir, other.rel_path))).toBe(true);
	});
});