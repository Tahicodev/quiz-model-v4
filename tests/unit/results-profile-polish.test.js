import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../../results-management.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const darkCss = readFileSync(new URL('../../theme-dark.css', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8');
const examJs = readFileSync(new URL('../../exam-analysis.js', import.meta.url), 'utf8');

describe('student profile panel spacing', () => {
	it('gives every profile panel body an inner margin', () => {
		// `.panel-body` has no global padding, so Focus areas / Exam history /
		// Recent training used to touch the panel edges.
		expect(css).toMatch(
			/\.results-profile-body \.panel-body \{\s*padding: 14px 16px;\s*\}/,
		);
	});

	it('keeps the chart panel padding intact', () => {
		expect(css).toContain('.results-profile-charts .panel-body');
	});
});

describe('attempt-count caption', () => {
	it('renders the caption as a pill instead of a plain muted line', () => {
		expect(js).toContain('results-caption');
		expect(js).toContain('results-caption-dot');
		expect(js).toContain('Showing the ${rows.length} most recent of ${training.length} training attempts.');
		expect(js).toContain('Showing the ${rows.length} most recent of ${examResults.length} exam attempts.');
		expect(css).toContain('.results-caption');
		expect(css).toContain('.results-caption-dot');
	});
});

describe('results count badge removal', () => {
	it('is gone from the markup', () => {
		expect(adminHtml).not.toContain('results-count-badge');
		expect(adminHtml).not.toContain('resultsStudentCount');
		expect(adminHtml).not.toContain('resultsCountBadge');
		expect(adminHtml).not.toContain('resultsAttemptLabel');
		expect(adminHtml).not.toContain('resultsStudentLabel');
	});

	it('is gone from the renderer', () => {
		expect(js).not.toContain('resultsStudentCount');
		expect(js).not.toContain('resultsCountBadge');
		expect(js).not.toContain('resultsAttemptLabel');
		expect(js).not.toContain('resultsStudentLabel');
	});

	it('is gone from the stylesheets', () => {
		expect(css).not.toContain('results-count-badge');
		expect(darkCss).not.toContain('results-count-badge');
	});
});

describe('per-question student navigation', () => {
	it('renders the student names as clickable profile links', () => {
		expect(examJs).toContain('function examAnalysisStudentLinkHtml(entry)');
		expect(examJs).toContain('class="eas-student-link"');
		expect(examJs).toContain('data-eas-student-key');
		expect(examJs).toContain('function examAnalysisPeopleHtml(entries, variant, title)');
		expect(css).toContain('.eas-student-link');
	});

	it('opens the Results-tab profile after switching tabs', () => {
		expect(examJs).toContain('function openExamAnalysisStudentProfile(key)');
		expect(examJs).toContain("window.openTab({}, 'results')");
		expect(examJs).toContain('window.openResultsManageTab()');
		expect(examJs).toContain('window.openStudentProfileByKey(key)');
		// The key must match the one the Results table uses.
		expect(js).toContain('window.resultsStudentKeyForResult = studentKeyForResult');
		expect(examJs).toContain('window.resultsStudentKeyForResult');
	});

	it('styles the hint as an inline info chip', () => {
		expect(examJs).toContain('eas-hint-icon');
		expect(css).toContain('.eas-hint');
		expect(css).toContain('.eas-hint-icon');
		expect(darkCss).toContain("html[data-theme='dark'] .eas-hint");
	});
});

describe('exam analysis KPIs', () => {
	it('reads the session rows instead of the non-existent students list', () => {
		expect(examJs).not.toContain('payload.students');
		expect(examJs).toContain('const sessionRows = payload.sessionRows || []');
		expect(examJs).toContain('sessionRows.reduce');
	});
});
