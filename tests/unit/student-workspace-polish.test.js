/**
 * tests/unit/student-workspace-polish.test.js
 *
 * Source-level guards for the student workspace polish pass. The workspace
 * is a classic browser script with a lot of globals, so the checks are made
 * against the shipped markup and stylesheets rather than by booting the
 * whole app — the same approach `examRowMobileSheet.test.js` uses.
 *
 * What is pinned here:
 *   1. every workspace tab panel shares ONE container style (the Games /
 *      Tournament look) — the old `.games-panel`-only override is gone;
 *   2. the Courses filter bar no longer sits inside the panel header, so it
 *      cannot push the Refresh chip out of the row;
 *   3. every Reset affordance carries an icon, an accessible name and a
 *      disabled state when nothing is filtered;
 *   4. the Student Account modal is a real WAI-ARIA tab set (roving
 *      tabindex, aria-controls / aria-labelledby, keyboard navigation) and
 *      stays reachable on phones (the tab bar used to be hidden below
 *      760px, stranding students on the Profile tab);
 *   5. the training modal header has no "Attempt" chip and promotes the
 *      exam name to a heading.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const html = read('student-workspace.html');
const css = read('styles.css');
const darkCss = read('theme-dark.css');
const workspaceJs = read('student-workspace.js');
const coursesJs = read('student-courses.js');

describe('workspace tab panels share one container style', () => {
	it('styles every workspace panel, not only the games one', () => {
		// The Games/Tournament look was promoted to the shared
		// `.workspace-panel` rule so every tab renders identically.
		// The rule is declared more than once, so the LAST one wins in CSS
		// and that is the one that must carry the shared surface.
		const matches = [
			...css.matchAll(/body\.student-workspace \.workspace-panel\s*\{([^}]*)\}/g),
		];
		expect(matches.length).toBeGreaterThan(0);
		const effective = matches[matches.length - 1][1];
		expect(effective).toMatch(/linear-gradient/);
		expect(effective).toMatch(/border-top/);
	});

	it('no longer carries a separate visual override for the games panel', () => {
		const gamesRules = css.match(/\.games-panel\s*\{[^}]*\}/g) || [];
		for (const rule of gamesRules) {
			// The class stays for the kids-mode selectors, but it must not
			// paint a different surface than the other tabs.
			expect(rule).not.toMatch(/background:/);
			expect(rule).not.toMatch(/border-top/);
		}
	});

	it('has a dark-theme variant of the shared panel style', () => {
		expect(darkCss).toMatch(
			/html\[data-theme='dark'\] body\.student-workspace \.workspace-panel/,
		);
	});
});

describe('courses filter bar', () => {
	it('lives outside the panel header so the Refresh chip keeps its row', () => {
		const doc = new JSDOM(html).window.document;
		const filters = doc.getElementById('studentCourseFilters');
		expect(filters).not.toBeNull();
		// The filter bar must be a sibling of the panel header, not a child
		// of `.panel-filters` — otherwise it pushes the Refresh chip away.
		expect(filters.closest('.panel-filters')).toBeNull();
		expect(filters.closest('.panel-header')).toBeNull();
		const panel = filters.closest('.workspace-panel');
		expect(panel).not.toBeNull();
		expect(panel.getAttribute('data-workspace-section')).toBe('courses');
		const header = panel.querySelector('.panel-header');
		expect(header).not.toBeNull();
		expect(header.querySelector('.panel-filters .filter-chip')).not.toBeNull();
	});

	it('renders the Reset button after the filter fields, not inside them', () => {
		expect(coursesJs).toMatch(/student-filter-fields[\s\S]*?<\/div>[\s\S]*?student-filter-reset/);
	});

	it('disables the Reset button when no course filter is active', () => {
		expect(coursesJs).toMatch(/student-filter-reset[\s\S]{0,400}disabled/);
	});
});

describe('reset buttons across the student tabs', () => {
	it('renders the shared filter reset with an icon and an accessible name', () => {
		expect(workspaceJs).toMatch(/student-filter-reset[\s\S]{0,600}aria-label="Reset filters"/);
	});

	it('disables the shared filter reset when no filter is active', () => {
		expect(workspaceJs).toMatch(/hasActiveFilter[\s\S]{0,600}disabled/);
	});

	it('gives the account modal reset an icon and an accessible name', () => {
		expect(html).toMatch(
			/id="studentProfileReset"[\s\S]{0,400}aria-label="Discard unsaved changes"/,
		);
	});

	it('keeps the account reset in sync with the dirty flag', () => {
		expect(workspaceJs).toContain('syncProfileResetState');
		// Every place that changes the dirty flag must re-sync the button.
		const dirtyAssignments = workspaceJs.match(/state\.profileDirty\s*=\s*(true|false)/g) || [];
		const syncCalls = workspaceJs.match(/syncProfileResetState\(\)/g) || [];
		expect(syncCalls.length).toBeGreaterThanOrEqual(dirtyAssignments.length);
	});
});

describe('student account modal', () => {
	it('exposes the three tabs as a WAI-ARIA tab set', () => {
		expect(html).toMatch(/role="tablist"/);
		expect(html).toMatch(/id="studentProfileTabProfile"[\s\S]{0,200}aria-controls="profile-tab"/);
		expect(html).toMatch(/id="studentProfileTabUpdate"[\s\S]{0,200}aria-controls="update-tab"/);
		expect(html).toMatch(/id="studentProfileTabSecurity"[\s\S]{0,200}aria-controls="security-tab"/);
	});

	it('labels every tab panel with its tab', () => {
		expect(html).toMatch(/id="profile-tab"[\s\S]{0,200}aria-labelledby="studentProfileTabProfile"/);
		expect(html).toMatch(/id="update-tab"[\s\S]{0,200}aria-labelledby="studentProfileTabUpdate"/);
		expect(html).toMatch(/id="security-tab"[\s\S]{0,200}aria-labelledby="studentProfileTabSecurity"/);
	});

	it('keeps a roving tabindex on the tab buttons', () => {
		expect(workspaceJs).toMatch(/btn\.setAttribute\('tabindex', isActive \? '0' : '-1'\)/);
	});

	it('supports arrow-key navigation on the tab list', () => {
		expect(workspaceJs).toMatch(/accountTablist[\s\S]{0,1200}ArrowRight/);
		expect(workspaceJs).toMatch(/accountTablist[\s\S]{0,1200}ArrowLeft/);
		expect(workspaceJs).toMatch(/accountTablist[\s\S]{0,1200}Home/);
		expect(workspaceJs).toMatch(/accountTablist[\s\S]{0,1200}End/);
	});

	it('announces the profile request status', () => {
		expect(html).toMatch(
			/id="studentProfileRequestStatus"[\s\S]{0,200}aria-live="polite"/,
		);
	});

	it('keeps the tab bar reachable on phones', () => {
		// The old rule hid `.sa-tabs-sticky` entirely below 760px, which
		// removed access to Update Profile and Security on mobile.
		const mobileBlock = /@media \(max-width: 760px\)\s*\{([\s\S]*?)\n\}/.exec(css);
		expect(mobileBlock).not.toBeNull();
		expect(mobileBlock[1]).not.toMatch(/\.sa-tabs-sticky\s*\{[^}]*display:\s*none/);
	});
});

describe('training / exam modal header', () => {
	it('has no "Attempt" chip', () => {
		expect(html).not.toContain('training-context-chip--attempt');
		expect(html).not.toMatch(/>Attempt</);
	});

	it('no longer renders a standalone modal title heading', () => {
		// The attempt name used to be a sibling <h2> in the modal header,
		// where it fought the close button for the same grid cell and
		// knocked the header out of alignment. It now lives inside the
		// student strip as the third line of the identity block.
		expect(html).not.toMatch(/<h2[^>]*id="trainingModalTitle"/);
		expect(html).not.toContain('training-modal-title');
	});

	it('keeps the attempt name inside the student strip', () => {
		const doc = new JSDOM(html).window.document;
		const title = doc.getElementById('trainingModalTitle');
		expect(title).not.toBeNull();
		expect(title.tagName.toLowerCase()).toBe('span');
		expect(title.classList.contains('training-student-title')).toBe(true);
		// It must live inside the strip, not as a competing heading.
		expect(title.closest('#trainingStudentStrip')).not.toBeNull();
	});

	it('removes the category chip and balances the remaining context into two groups', () => {
		const doc = new JSDOM(html).window.document;
		const context = doc.getElementById('trainingContextMeta');
		const groups = context.querySelectorAll('.training-context-group');
		expect(context.querySelector('.training-context-chip--category')).toBeNull();
		expect(doc.getElementById('trainingContextCategory')).toBeNull();
		expect(groups).toHaveLength(2);
		const expectedIds = [
			['trainingContextSchool', 'trainingContextSubject'],
			['trainingContextYear', 'trainingContextTeacher'],
		];
		groups.forEach((group, index) => {
			expect(
				[...group.querySelectorAll('.training-context-value')].map((item) => item.id),
			).toEqual(expectedIds[index]);
		});
		expect(context.getAttribute('aria-label')).not.toMatch(/category/i);
	});
});

describe('courses filter bar alignment', () => {
	it('renders the teacher and subject selects without visible captions', () => {
		// The captions pushed the selects out of alignment with each other.
		// The select's option text names the dimension and the control
		// carries an aria-label instead.
		expect(coursesJs).not.toMatch(/student-filter-label/);
		expect(coursesJs).toMatch(/aria-label="\$\{esc\(label\)\}"/);
	});

	it('still exposes both course dimensions', () => {
		expect(coursesJs).toMatch(/makeSelect\('teacher'/);
		expect(coursesJs).toMatch(/makeSelect\('subject'/);
	});
});

describe('student workspace card borders', () => {
	it('gives the student workspace cards a shared green edge', () => {
		expect(css).toMatch(/--student-card-green:\s*#86efac/);
		// Every card family that appears in the tabs is covered.
		[
			'exam-card',
			'performance-row',
			'training-category-card',
			'course-student-card',
			'course-outline-card',
			'results-list .result-row',
			'student-badge-card',
			'game-card',
			'game-stat-card',
		].forEach((selector) => {
			const escaped = selector
				.split(' ')
				.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
				.join(' ');
			expect(css).toMatch(
				new RegExp(`body\\.student-workspace \\.${escaped}[^{]*\\{[^}]*student-card-green`),
			);
		});
	});

	it('has a dark-theme counterpart', () => {
		expect(darkCss).toMatch(/--student-card-green:/);
		expect(darkCss).toMatch(/body\.student-workspace \.exam-card[^{]*\{[^}]*student-card-green/);
	});
});

describe('teacher results filters', () => {
	const adminHtml = read('admin.html');

	it('gives the search field its own row above the filters', () => {
		const doc = new JSDOM(adminHtml).window.document;
		const search = doc.getElementById('resultSearch');
		expect(search).not.toBeNull();
		const row = search.closest('.results-search-row');
		expect(row).not.toBeNull();
		// The search must NOT be one of the grid filter groups any more.
		expect(search.closest('.results-filters-row')).toBeNull();
	});

	it('keeps the attempt score filter in the filter row', () => {
		const doc = new JSDOM(adminHtml).window.document;
		const score = doc.getElementById('resultFilterScore');
		expect(score).not.toBeNull();
		expect(score.closest('.results-filters-row')).not.toBeNull();
	});

	it('lets the filter selects fill their grid track instead of overflowing', () => {
		// The shared `.filter-group select { min-width: 180px }` used to be
		// wider than a 155px grid track, which pushed the "Attempt score"
		// select out of line with its neighbours.
		expect(css).toMatch(
			/#results \.results-filters-row \.filter-group select[^{]*\{[^}]*min-width:\s*0/,
		);
	});
});
