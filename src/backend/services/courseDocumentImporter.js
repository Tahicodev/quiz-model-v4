import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { JSDOM } from 'jsdom';
import { ValidationError } from '../../shared/errors.js';

export const MAX_COURSE_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_COURSE_DOCUMENT_TEXT = 120000;
export const MAX_COURSE_DOCUMENT_HEADINGS = 200;
export const MAX_COURSE_DOCUMENT_DEPTH = 4;
export const MAX_IMPORTED_SECTION_LENGTH = 50000;

function normalizedHeadingText(value) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.replace(/^\s*(?:#{1,6}\s*|(?:module|chapter|chapitre|partie|part|unit|unité)\s+\S+\s*[:.)\-–—]?\s*)/i, '')
		.replace(/[.:;!?]+$/, '')
		.trim()
		.toLocaleLowerCase();
}

function inferHeadingLevel(line, currentLevel = 0, hasRoot = false) {
	const title = String(line || '').trim();
	if (/^(?:#{1,6})\s+/.test(title)) {
		return title.match(/^#+/)[0].length;
	}
	if (/^(?:module|partie|part|unit|unité|volume)\s+(?:\d+|[ivxlcdm]+(?=$|[\s:.)\-–—])|[a-z](?=$|[\s:.)\-–—]))/i.test(title)) return 1;
	if (/^(?:chapter|chapitre|section|book|livre)\s+(?:\d+|[ivxlcdm]+(?=$|[\s:.)\-–—])|[a-z](?=$|[\s:.)\-–—]))/i.test(title)) return Math.min(hasRoot ? 2 : 1, MAX_COURSE_DOCUMENT_DEPTH);

	const numbered = title.match(/^\s*(\d+(?:\.\d+)*)(?:\s*[-–—.)]|\s+)/);
	if (numbered) {
		const depth = numbered[1].split('.').length;
		if (depth > 1) return Math.min(depth + (hasRoot ? 1 : 0), MAX_COURSE_DOCUMENT_DEPTH);
		return Math.min(hasRoot ? 2 : 1, MAX_COURSE_DOCUMENT_DEPTH);
	}
	if (/^\s*[A-Z][.)]\s+/.test(title)) return Math.min(currentLevel + 1 || 1, MAX_COURSE_DOCUMENT_DEPTH);
	return 0;
}

export function detectCourseDocumentHeadings(documentText, { allowStandaloneTitles = true } = {}) {
	const lines = String(documentText || '').split('\n');
	const headings = [];
	let currentLevel = 0;
	let hasRoot = false;

	for (let index = 0; index < lines.length; index += 1) {
		const text = String(lines[index] || '').trim();
		if (!text || text.length > 100) continue;

		let level = inferHeadingLevel(text, currentLevel, hasRoot);
		if (!level && allowStandaloneTitles) {
			const previous = String(lines[index - 1] || '').trim();
			const next = String(lines[index + 1] || '').trim();
			const looksLikeShortTitle =
				text.length >= 3 &&
				text.length <= 60 &&
				text.split(/\s+/).length <= 8 &&
				!/[.!?;:,]$/.test(text) &&
				!/^[-*•]/.test(text) &&
				(text === text.toLocaleUpperCase() || (!previous && !next));
			if (looksLikeShortTitle && currentLevel > 0) {
				level = Math.min(currentLevel + 1, MAX_COURSE_DOCUMENT_DEPTH);
			}
		}
		if (!level) continue;
		if (!hasRoot && level > 1) level = 1;
		if (currentLevel && level > currentLevel + 1) level = currentLevel + 1;
		headings.push({ line: index + 1, level });
		currentLevel = level;
		hasRoot = true;
		if (headings.length >= MAX_COURSE_DOCUMENT_HEADINGS) break;
	}
	return headings;
}

async function detectDocxStyledHeadings(buffer, documentText) {
	const { value: html } = await mammoth.convertToHtml({ buffer });
	const document = new JSDOM(html).window.document;
	const lines = String(documentText || '').split('\n');
	const headings = [];
	let searchFrom = 0;
	for (const element of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
		const label = element.textContent.replace(/\s+/g, ' ').trim();
		const normalized = normalizedHeadingText(label);
		if (!normalized) continue;
		const index = lines.findIndex((line, candidate) =>
			candidate >= searchFrom && normalizedHeadingText(line) === normalized,
		);
		if (index < 0) continue;
		const level = Number(element.tagName.slice(1));
		headings.push({ line: index + 1, level: Math.min(level, MAX_COURSE_DOCUMENT_DEPTH) });
		searchFrom = index + 1;
	}
	return headings;
}

export async function detectCourseDocumentOutline(buffer, filename, documentText) {
	if (String(filename || '').split('.').pop()?.toLowerCase() !== 'docx') {
		return { headings: detectCourseDocumentHeadings(documentText), method: 'local-patterns' };
	}
	const styled = await detectDocxStyledHeadings(buffer, documentText);
	const docxPatterns = detectCourseDocumentHeadings(documentText, { allowStandaloneTitles: false });
	if (!styled.length) return { headings: docxPatterns, method: 'local-patterns' };
	const styledByLine = new Map(styled.map((heading) => [heading.line, heading]));
	for (const heading of docxPatterns) {
		if (!styledByLine.has(heading.line)) styledByLine.set(heading.line, heading);
	}
	return {
		headings: [...styledByLine.values()]
			.sort((a, b) => a.line - b.line)
			.slice(0, MAX_COURSE_DOCUMENT_HEADINGS),
		method: 'docx-styles-and-local-patterns',
	};
}

export async function extractCourseDocumentText(buffer, filename) {
	const extension = String(filename || '').split('.').pop()?.toLowerCase();
	let text;

	try {
		if (extension === 'docx') {
			const result = await mammoth.extractRawText({ buffer });
			text = result.value;
		} else if (extension === 'pdf') {
			if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
				throw new ValidationError({ file: ['This is not a valid PDF file.'] });
			}
			const parser = new PDFParse({ data: buffer });
			try {
				const result = await parser.getText();
				text = result.text;
			} finally {
				await parser.destroy();
			}
		} else {
			throw new ValidationError({ file: ['Choose a DOCX or PDF file.'] });
		}
	} catch (error) {
		if (error instanceof ValidationError) throw error;
		throw new ValidationError({
			file: [`Could not read this ${extension === 'pdf' ? 'PDF' : 'DOCX'} file. Check that it is not damaged or password-protected.`],
		});
	}

	const normalized = String(text || '')
		.replace(/\r\n?/g, '\n')
		.replace(/\u0000/g, '')
		.replace(/^\s*--\s+\d+\s+of\s+\d+\s+--\s*$/gm, '');
	if (!normalized.trim()) {
		throw new ValidationError({
			file: [
				extension === 'pdf'
					? 'No selectable text was found. Scanned/image-only PDFs are not supported yet; use a text-based PDF or DOCX.'
					: 'No readable text was found in this DOCX file.',
			],
		});
	}
	if (normalized.length > MAX_COURSE_DOCUMENT_TEXT) {
		throw new ValidationError({
			file: [`Extracted text exceeds the ${MAX_COURSE_DOCUMENT_TEXT.toLocaleString()} character limit. Split the document into smaller files so all content can be preserved.`],
		});
	}
	return normalized;
}

export function buildCourseImportSections(documentText, headings) {
	const lines = String(documentText || '').split('\n');
	if (!Array.isArray(headings) || headings.length === 0) {
		throw new ValidationError({ headings: ['At least one course heading is required.'] });
	}
	if (headings.length > MAX_COURSE_DOCUMENT_HEADINGS) {
		throw new ValidationError({ headings: [`A document can contain at most ${MAX_COURSE_DOCUMENT_HEADINGS} course headings.`] });
	}

	const ordered = headings
		.map((heading) => ({
			line: Number(heading.line),
			level: Number(heading.level),
			title: String(heading.title || '').trim(),
		}))
		.sort((a, b) => a.line - b.line);
	const seenLines = new Set();
	let previousLevel = 0;
	for (const heading of ordered) {
		if (!Number.isInteger(heading.line) || heading.line < 1 || heading.line > lines.length) {
			throw new ValidationError({ headings: [`Heading line must be between 1 and ${lines.length}.`] });
		}
		if (seenLines.has(heading.line)) {
			throw new ValidationError({ headings: [`More than one heading points to source line ${heading.line}.`] });
		}
		seenLines.add(heading.line);
		if (!Number.isInteger(heading.level) || heading.level < 1 || heading.level > MAX_COURSE_DOCUMENT_DEPTH) {
			throw new ValidationError({ headings: [`Heading depth must be between 1 and ${MAX_COURSE_DOCUMENT_DEPTH}.`] });
		}
		if (heading.level > previousLevel + 1) {
			throw new ValidationError({ headings: ['Use Heading 1 for main categories and add each intermediate heading level before nesting deeper.'] });
		}
		if (!heading.title || heading.title.length > 100) {
			throw new ValidationError({ headings: ['Each category title must contain 1–100 characters.'] });
		}
		if (!String(lines[heading.line - 1] || '').trim()) {
			throw new ValidationError({ headings: [`Source line ${heading.line} is blank; choose a line containing the heading.`] });
		}
		previousLevel = heading.level;
	}

	const roots = [];
	const stack = [];
	for (let index = 0; index < ordered.length; index += 1) {
		const heading = ordered[index];
		while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
		const nextHeading = ordered[index + 1];
		const contentEnd = nextHeading ? nextHeading.line - 1 : lines.length;
		const content = lines.slice(heading.line, contentEnd).join('\n');
		if (content.length > MAX_IMPORTED_SECTION_LENGTH) {
			throw new ValidationError({
				headings: [`Content under "${heading.title}" exceeds the ${MAX_IMPORTED_SECTION_LENGTH.toLocaleString()} character per-section limit. Split this section into smaller headings before importing.`],
			});
		}
		const node = { title: heading.title, level: heading.level, children: [], content };
		const parent = stack[stack.length - 1];
		if (parent) parent.children.push(node);
		else roots.push(node);
		stack.push(node);
	}

	const introduction = lines.slice(0, ordered[0].line - 1).join('\n');
	if (introduction.length > MAX_IMPORTED_SECTION_LENGTH) {
		throw new ValidationError({
			headings: [`The introductory text exceeds the ${MAX_IMPORTED_SECTION_LENGTH.toLocaleString()} character per-section limit. Split the document before importing.`],
		});
	}
	return {
		roots,
		introduction: introduction.trim() ? introduction : '',
	};
}
