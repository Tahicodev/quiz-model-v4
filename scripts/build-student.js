/**
 * scripts/build-student.js
 * Build script for the student SPA bundle.
 *
 * Concatenates the 6 legacy files into one shared module scope, deduplicating
 * ONLY the known colliding top-level function declarations across files.
 *
 * Known colliding top-level functions (both defined at module scope in two
 * different files — the second matches classic-script override behavior):
 *
 *   escapeHtml   utils.js:12   ← REMOVED, script.js:3965 kept (overrides)
 *   logActivity  utils.js:119  ← REMOVED, script.js:839 kept  (overrides)
 *
 * Functions inside IIFEs (safeJsonParse in landing.js, buildSession &
 * persistSession in legacy-auth-bridge.js) do NOT collide because they
 * are NOT at module top level — they're scoped to their IIFE.
 *
 * After concatenation, the student-main.js entry is appended (with its
 * legacyBootstrap import stripped), and the combined file is fed to esbuild.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const LEGACY_FILES = [
  'utils.js',
  'auth.js',
  'script.js',
  'landing.js',
  'realtime-client.js',
  'legacy-auth-bridge.js',
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. Read all files
// ═══════════════════════════════════════════════════════════════════════════

const entries = LEGACY_FILES.map((file) => ({
  file,
  text: readFileSync(resolve(ROOT, file), 'utf8'),
}));

// ═══════════════════════════════════════════════════════════════════════════
// 2. Remove escapeHtml and logActivity from utils.js (first file)
//    These are overridden by script.js's versions. We remove them instead of
//    selectively keeping the second to avoid ordering dependencies.
// ═══════════════════════════════════════════════════════════════════════════

const REMOVALS = {
  // escapeHtml: function at line 12, remove lines 11 (comment) through closing brace
  escapeHtml: { startMarker: 'function escapeHtml(unsafe) {', bodyLines: 8 },
  // logActivity: function at line 119, remove lines 112-118 (comment) through closing brace
  logActivity: { startMarker: 'function logActivity(type, name, action', bodyLines: 30 },
};

function removeFunction(text, name, startMarker, bodyLines) {
  // Find the function declaration line
  const idx = text.indexOf(startMarker);
  if (idx === -1) {
    console.warn(`  ⚠ could not find "${name}" in utils.js, skipping`);
    return text;
  }
  // Find the line start (backtrack to the previous newline)
  const lineStart = text.lastIndexOf('\n', idx) + 1;
  // Find the LAST '{' in this line — that's the function body opening brace
  const lineEndNewline = text.indexOf('\n', idx);
  const line = text.slice(lineStart, lineEndNewline >= 0 ? lineEndNewline : undefined);
  const bodyOpen = line.lastIndexOf('{');
  if (bodyOpen === -1) {
    console.warn(`  ⚠ could not find "{" for "${name}"`);
    return text;
  }
  const bodyStart = lineStart + bodyOpen;
  // Count braces from bodyStart to find matching closing brace
  let braceDepth = 0;
  let endPos = bodyStart;
  for (; endPos < text.length; endPos++) {
    const ch = text[endPos];
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    if (braceDepth === 0 && endPos > bodyStart) {
      break;
    }
  }
  // Include the newline after the closing brace
  const lineEnd = text.indexOf('\n', endPos) + 1;
  const removed = text.slice(lineStart, lineEnd);
  console.log(`  ✂ removed "${name}" from utils.js (${removed.split('\n').length} lines)`);
  return text.slice(0, lineStart) + text.slice(lineEnd);
}

let utilsText = entries[0].text;
for (const [name, spec] of Object.entries(REMOVALS)) {
  utilsText = removeFunction(utilsText, name, spec.startMarker, spec.bodyLines);
}
entries[0].text = utilsText;

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read student-main.js entry and remove the legacyBootstrap import
// ═══════════════════════════════════════════════════════════════════════════

const studentMain = readFileSync(
  resolve(ROOT, 'src', 'frontend', 'student-main.js'), 'utf8'
)
  .replace(/^import\s+['"][^'"]*legacyBootstrap[^'"]*['"]\s*;\s*$/m, '')
  .trim();

// ═══════════════════════════════════════════════════════════════════════════
// 4. Concatenate: legacy files in order + student-main entry
// ═══════════════════════════════════════════════════════════════════════════

const parts = entries.map(e => e.text);
parts.push('\n// ── Student SPA entry ──\n');
parts.push(studentMain);

const combined = parts.join('\n');

// ═══════════════════════════════════════════════════════════════════════════
// 5. Write temp entry and run esbuild
// ═══════════════════════════════════════════════════════════════════════════

const tmpFile = resolve(ROOT, 'src', 'frontend', '.student-build-entry.js');
const outFile = resolve(ROOT, 'public', 'student-bundle.js');

writeFileSync(tmpFile, combined, 'utf8');

try {
  const sizeKB = (combined.length / 1024).toFixed(1);
  console.log(`Writing temp entry (${sizeKB} KB) → esbuild → student-bundle.js`);
  execSync(
    `npx esbuild "${tmpFile}" --bundle --outfile="${outFile}" --format=iife --global-name=QuizStudent`,
    { cwd: ROOT, stdio: 'inherit' }
  );
  console.log('✓ Student bundle built successfully');
} finally {
  try { unlinkSync(tmpFile); } catch {}
}
