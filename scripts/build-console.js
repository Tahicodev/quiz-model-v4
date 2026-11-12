/**
 * scripts/build-console.js
 *
 * Build the Admin control center bundle.
 *
 * The console is a NEW, self-contained ESM application (src/frontend/console).
 * Unlike the student bundle it does NOT concatenate legacy scripts — there is
 * no legacy code in the console, so the whole app is bundled from its own
 * entry point with esbuild.
 *
 * Output:
 *   public/console-bundle.js    — the application
 *   public/console-bundle.css   — the design system (imported from main.js)
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const entry = resolve(ROOT, 'src', 'frontend', 'console', 'main.js');
const outFile = resolve(ROOT, 'public', 'console-bundle.js');

const minify = !process.argv.includes('--dev');

console.log('Building console bundle…');
execSync(
	`npx esbuild "${entry}" --bundle --outfile="${outFile}" ` +
		`--format=iife --global-name=QuizConsole --loader:.css=css` +
		(minify ? ' --minify' : ''),
	{ cwd: ROOT, stdio: 'inherit' },
);
console.log('✓ Console bundle built → public/console-bundle.js');
