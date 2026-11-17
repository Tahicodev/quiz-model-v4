/**
 * tests/unit/no-remote-assets.test.js
 *
 * The application must not fetch anything from the internet to render.
 *
 * Every library was already vendored; the web fonts were the last remote
 * dependency, and they are now served from `public/fonts/`. This test is
 * the guard: it fails the moment a page, a stylesheet or a script asks a
 * remote origin for something the browser would need to draw the interface.
 *
 * The AI providers are deliberately NOT covered — they are optional, they
 * are configured by the administrator, and they are called from the server,
 * not from the browser.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** The origins the browser must never contact to render the interface. */
const FORBIDDEN = [
	'fonts.googleapis.com',
	'fonts.gstatic.com',
	'cdn.jsdelivr.net',
	'cdnjs.cloudflare.com',
	'cdn.socket.io',
	'cdn.sheetjs.com',
	'unpkg.com',
	'cdnjs.com',
];

/** The files a browser loads. */
const BROWSER_FILES = [
	'admin.html',
	'index.html',
	'student-workspace.html',
	'console.html',
	'styles.css',
	'admin.css',
	'theme.css',
	'theme-dark.css',
	'teacher-analytics.css',
	'kids-learning-games/kids-learning-games/css/styles.css',
];

/** The directories that hold browser code. */
const BROWSER_DIRS = ['src/frontend', 'public'];

function collectFiles(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			// The built bundles are generated from the sources above.
			if (entry.name === 'node_modules') continue;
			collectFiles(full, out);
			continue;
		}
		if (/\.(html|css|js)$/.test(entry.name)) out.push(full);
	}
	return out;
}

describe('the browser never reaches the internet to render', () => {
	const files = [
		...BROWSER_FILES.map((file) => path.join(ROOT, file)),
		...BROWSER_DIRS.filter((dir) => fs.existsSync(path.join(ROOT, dir))).flatMap((dir) =>
			collectFiles(path.join(ROOT, dir)),
		),
	].filter((file) => fs.existsSync(file));

	it('has files to check', () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it('references no remote origin', () => {
		const offenders = [];
		for (const file of files) {
			const text = fs.readFileSync(file, 'utf8');
			for (const origin of FORBIDDEN) {
				if (text.includes(origin)) {
					offenders.push(`${path.relative(ROOT, file)} → ${origin}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it('serves the web font from the application itself', () => {
		expect(fs.existsSync(path.join(ROOT, 'public', 'fonts', 'inter.css'))).toBe(true);
		expect(fs.existsSync(path.join(ROOT, 'public', 'fonts', 'kids.css'))).toBe(true);
		const css = fs.readFileSync(path.join(ROOT, 'public', 'fonts', 'inter.css'), 'utf8');
		// Every @font-face points at the local copy.
		const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) {
			expect(url.startsWith('/fonts/inter/')).toBe(true);
		}
		// And the file each one names actually exists.
		for (const url of urls) {
			const file = path.join(ROOT, 'public', url.replace(/^\//, ''));
			expect(fs.existsSync(file)).toBe(true);
		}
	});

	it('lets the pages load the local font', () => {
		for (const page of ['admin.html', 'index.html', 'student-workspace.html']) {
			const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
			expect(html).toContain('/fonts/inter.css');
		}
	});

	it('allows no remote font origin in the content-security policy', () => {
		const server = fs.readFileSync(path.join(ROOT, 'src', 'backend', 'server.js'), 'utf8');
		expect(server).not.toContain('fonts.googleapis.com');
		expect(server).not.toContain('fonts.gstatic.com');
	});
});
