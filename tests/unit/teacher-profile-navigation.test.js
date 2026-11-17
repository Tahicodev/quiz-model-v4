/**
 * The teacher Results tab is split into an analytics pane (KPIs + intervention
 * list) and a manage pane (roster + attempts + student-profile modal).
 *
 * These tests lock the two workflows that were broken:
 *   1. The student-profile modal was rendered inside the hidden manage pane,
 *      so opening a profile from the exam analysis left an invisible overlay
 *      that locked the scroll — the app looked frozen.
 *   2. "Review results & chapters" only wrote a name into the hidden results
 *      search box, so the button did nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const resultsJs = readFileSync(path.join(ROOT, 'results-management.js'), 'utf8');
const examJs = readFileSync(path.join(ROOT, 'exam-analysis.js'), 'utf8');
const overviewJs = readFileSync(path.join(ROOT, 'teacher-overview.js'), 'utf8');
const domainJs = readFileSync(path.join(ROOT, 'teacher-domain-analytics.js'), 'utf8');

describe('student profile modal visibility', () => {
	it('re-parents the modal to <body> so no hidden pane can trap it', () => {
		expect(resultsJs).toContain('function ensureStudentProfileModalIsTopmost(modal)');
		expect(resultsJs).toContain('document.body.appendChild(modal)');
		expect(resultsJs).toMatch(
			/ensureStudentProfileModalIsTopmost\(modal\);\s*modal\.classList\.add\('active'\);/,
		);
	});

	it('removes the scroll lock when the profile is closed', () => {
		expect(resultsJs).toContain("document.body.classList.remove('results-profile-open')");
	});

	it('asks for the Results manage view before opening a profile', () => {
		expect(resultsJs).toContain('function showResultsManageView()');
		expect(resultsJs).toContain("window.TeacherDomainAnalytics.showView('results', 'manage')");
		expect(resultsJs).toContain('window.showResultsManageView = showResultsManageView');
	});

	it('opens the Results tab on the manage view without the analytics flash', () => {
		expect(resultsJs).toContain('function openResultsManageTab()');
		expect(resultsJs).toContain('window.openResultsManageTab = openResultsManageTab');
		// A truthy event stops the teacher-domain wrapper from forcing the
		// analytics view back on.
		expect(resultsJs).toContain("window.openTab({}, 'results')");
	});

	it('exposes a profile opener keyed by the student user id', () => {
		expect(resultsJs).toContain('function openStudentProfileByUserId(userId)');
		expect(resultsJs).toContain('window.openStudentProfileByUserId = openStudentProfileByUserId');
		expect(resultsJs).toContain('const key = `u:${id}`;');
	});
});

describe('exam analysis navigation', () => {
	it('requests the Exams manage view so the analysis pane is visible', () => {
		expect(examJs).toContain('function showExamAnalysisManageView()');
		expect(examJs).toContain("window.TeacherDomainAnalytics.showView('exams', 'manage')");
		expect(examJs).toMatch(/showExamAnalysisManageView\(\);/);
	});

	it('switches to the Results manage view before opening a student profile', () => {
		expect(examJs).toContain('window.openResultsManageTab()');
		expect(examJs).toMatch(
			/window\.openResultsManageTab\(\);[\s\S]{0,400}window\.openStudentProfileByKey\(key\)/,
		);
	});
});

describe('intervention list actions', () => {
	it('opens the student record instead of filtering a hidden search box', () => {
		expect(overviewJs).toMatch(
			/action === 'student'[\s\S]{0,600}window\.openStudentProfileByUserId\(link\.id\)/,
		);
	});

	it('keeps the id on the intervention link', () => {
		expect(domainJs).toContain(
			"const link = { tab: 'results', action: 'student', id: row.studentId, query: row.name };",
		);
	});
});
