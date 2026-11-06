import { z } from 'zod';

export const CourseDocumentSchema = z.object({
	format: z.enum(['pdf', 'docx']),
	templateId: z.enum(['classique', 'moderne', 'compact', 'ultra', 'officiel', 'college']).default('classique'),
	numerationTemplate: z.enum(['default', 'decimal', 'roman', 'alpha', 'book', 'module', 'progressif', 'academique']).default('default'),
	coverTemplate: z.enum(['academic', 'modern', 'book', 'university', 'elegant', 'minimal']).default('academic'),
	headerLayout: z.enum(['bandeau', 'classique', 'centre', 'split', 'boxed', 'banner', 'minimal']).default('bandeau'),
	includeCover: z.boolean().default(true),
	includeTableOfContents: z.boolean().default(true),
	includeLessonPath: z.boolean().default(false),
	startEachLessonOnNewPage: z.boolean().default(false),
	header: z.object({
		schoolName: z.string().max(200).optional().default(''),
		ministry: z.string().max(160).optional().default(''),
		academy: z.string().max(160).optional().default(''),
		academicYear: z.string().max(40).optional().default(''),
		teacherName: z.string().max(120).optional().default(''),
		subject: z.string().max(120).optional().default(''),
		level: z.string().max(80).optional().default(''),
		group: z.string().max(80).optional().default(''),
		date: z.string().max(40).optional().default(''),
	}),
});
