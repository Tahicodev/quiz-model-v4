/**
 * src/frontend/ui/pages/student/legacyBootstrap.js
 * Imports the legacy student-portal scripts in their original dependency order
 * so esbuild bundles them into public/student-bundle.js. Each file is a plain
 * IIFE / global-patcher (no ES exports); importing it here executes its
 * top-level code, registering window.* globals (window.Auth, window.startExam,
 * window.startTrainingMode, showStudentResults, closeLightbox, ...) that the
 * StudentLanding markup and the inline onclick handlers depend on.
 *
 * IMPORTANT: When esbuild bundles these under "type": "module", each file's
 * top-level `function` declarations are MODULE-SCOPED, not global. Classic
 * script scope-sharing via `function showToast()` in utils.js being visible
 * to auth.js is broken. To bridge that, we explicitly copy a small number of
 * cross-file function references onto `window` after the imports execute.
 *
 * Order matters and mirrors the previous <script defer> order in index.html:
 *   utils.js  → defines window.escapeHtml, function showToast(), ...
 *   auth.js   → defines window.Auth, calls showToast(), ...
 *   script.js → defines window.startExam, window.closeLightbox, ...
 *   landing.js → wires landing buttons to those globals
 *   realtime-client.js  → depends on window.io + window.getSocket
 *   legacy-auth-bridge.js → must run after auth.js
 */

// Resolve from the repo root regardless of this file's location.
import '../../../../../utils.js';
import '../../../../../auth.js';
import '../../../../../script.js';
import '../../../../../landing.js';
import '../../../../../realtime-client.js';
import '../../../../../legacy-auth-bridge.js';

// ── Cross-file global patches ────────────────────────────────────────────────
// These functions are defined via `function` declarations in one legacy file
// and called from another file's code. Under ES module scoping they are NOT
// on `window`, so we explicitly expose them here.
// Only patch functions that are actually called cross-file.

import {
  showToast as _showToast,
  safeJsonParse as _safeJsonParse,
  logActivity as _logActivity,
} from '../../../../../utils.js';

// showToast is called from auth.js (handleLogin) but defined in utils.js
window.showToast = _showToast;
// safeJsonParse is called from auth.js (getUsers) and defined in utils.js
window.safeJsonParse = _safeJsonParse;
// logActivity is called from auth.js (various places) and defined in utils.js
window.logActivity = _logActivity;
