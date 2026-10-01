/**
 * scripts/validate-kids-levels.mjs
 *
 * Checks a teacher-made levels file before it is imported.
 *
 *   node scripts/validate-kids-levels.mjs my-levels.json
 *   node scripts/validate-kids-levels.mjs my-levels.json --template treasure_hunt
 *   Get-Content levels.json -Raw | node scripts/validate-kids-levels.mjs
 *
 * The rules live in src/shared/kids-level-checks.js, which is the same module
 * the in-app import button calls, so this command and the app cannot disagree.
 * It re-runs the Zod schemas the server enforces, plus the cross-references a
 * schema cannot express: a correctId that points at no option, a drag_drop whose
 * blank count does not match its {blank} tokens, a sequence whose correctOrder
 * is not a permutation, a memory deck with an unpaired card. Those all pass
 * validation and then fail in front of a child.
 *
 * Exit code 0 when the file is importable, 1 when it is not.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { validateLevelsFile } from '../src/shared/kids-level-checks.js';
import { KIDS_TEMPLATES_SEED_DATA } from '../prisma/seeds/kids-game-templates.js';

const TEMPLATES = new Map(KIDS_TEMPLATES_SEED_DATA.map(t => [t.id, t]));

// Parsed by hand rather than by filtering argv: --template's value sits right
// after the flag, and an off-by-one here silently skips the minimum-level check.
const argv = process.argv.slice(2);
const positional = [];
let templateId = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--template') templateId = argv[++i] ?? null;
  else positional.push(argv[i]);
}

let minItems;
if (templateId) {
  const template = TEMPLATES.get(templateId);
  if (!template) {
    console.error(`Unknown template "${templateId}". Known: ${[...TEMPLATES.keys()].join(', ')}`);
    process.exit(1);
  }
  minItems = template.min_items;
}

let text;
if (positional[0] && positional[0] !== '-') {
  try { text = readFileSync(positional[0], 'utf8'); }
  catch (err) { console.error(`Cannot read ${positional[0]}: ${err.message}`); process.exit(1); }
} else {
  text = readFileSync(0, 'utf8');
}

// A file saved by Notepad or exported from Word starts with a BOM, which
// JSON.parse rejects before it looks at anything else.
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

let doc;
try { doc = JSON.parse(text); }
catch (err) { console.error(`That file is not valid JSON: ${err.message}`); process.exit(1); }

const { ok, count, problems } = validateLevelsFile(doc, { minItems, templateId });

if (ok) {
  console.log(`OK - ${count} level(s) valid.`);
  console.log(templateId
    ? `The "${templateId}" game needs ${minItems} levels to be published, so this one can be published.`
    : 'Pass --template <id> to also check the minimum number of levels needed to publish.');
  process.exit(0);
}

console.error(`Not importable - ${problems.length} problem(s):\n`);
for (const { label, message } of problems) console.error(`  ${label}: ${message}`);
console.error('\nSee docs/KIDS_LEVELS_IMPORT.md for the format and a ready-to-paste prompt.');
process.exit(1);
