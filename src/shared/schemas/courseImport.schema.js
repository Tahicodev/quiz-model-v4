import { z } from 'zod';

const MAX_COURSE_DOCUMENT_TEXT = 120000;
const MAX_COURSE_DOCUMENT_HEADINGS = 200;

export const CourseDocumentPreviewSchema = z.object({
	filename: z.string().min(1).max(255),
	data: z.string().min(1).max(12_000_000),
});

export const CourseDocumentImportSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional().nullable(),
	documentText: z.string().min(1).max(MAX_COURSE_DOCUMENT_TEXT),
	headings: z.array(z.object({
		line: z.number().int().min(1).max(MAX_COURSE_DOCUMENT_TEXT + 1),
		level: z.number().int().min(1).max(8),
		title: z.string().trim().min(1).max(100),
	})).min(1).max(MAX_COURSE_DOCUMENT_HEADINGS),
});
