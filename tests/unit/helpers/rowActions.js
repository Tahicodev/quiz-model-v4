/**
 * tests/unit/helpers/rowActions.js
 *
 * The manage-section scripts (category-management.js, class-management.js,
 * exam-management.js) paint their rows through the shared row-actions.js
 * helper (window.RowActions). The browser loads it from admin.html before
 * those scripts; the node:vm sandboxes have to do the same, otherwise the row
 * templates throw on `window.RowActions.render`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const SRC = readFileSync(path.join(ROOT, 'row-actions.js'), 'utf8');

/**
 * Loads row-actions.js into a vm context so `window.RowActions` exists.
 * @param {object} ctx the vm context
 * @returns {object} the RowActions helper
 */
export function installRowActions(ctx) {
	vm.runInContext(SRC, ctx, { filename: 'row-actions.js' });
	return vm.runInContext('RowActions', ctx);
}
