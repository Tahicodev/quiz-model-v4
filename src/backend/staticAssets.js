/**
 * src/backend/staticAssets.js
 *
 * Static asset allow-list.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The server used to mount `express.static('./')` — the whole project root.
 * That published `prisma/dev.db` (the live SQLite database), the Prisma
 * schema, the migration history, the backend source and `package.json` to
 * anyone who could reach the server. On a school LAN that means every pupil's
 * machine could download the whole database.
 *
 * The rule now is simple: **only what is on the list is served.** The list is
 * explicit, so adding a new front-end file means adding it here — which is the
 * point. Nothing is served because it happens to live in the project root.
 *
 * Three layers:
 *   1. PUBLIC_ROOT_FILES — the legacy root-level JS/CSS the entry pages load.
 *   2. PUBLIC_VENDOR_FILES — the vendored browser libraries.
 *   3. PUBLIC_DIRECTORIES — whole directories that are safe to serve.
 *
 * A denylist (BLOCKED_PATTERNS) runs BEFORE any static mount as a second
 * line of defence: even a file that somehow ends up inside an allowed
 * directory is refused.
 */

/** Root-level files the entry pages load. Nothing else at the root is served. */
export const PUBLIC_ROOT_FILES = new Set([
	// ── Legacy admin / teacher surface ────────────────────────────────────
	'admin-main.js',
	'ai-question-generator.js',
	'api-client.js',
	'archives.js',
	'auth.js',
	'bulk-selection.js',
	'category-management.js',
	'class-management.js',
	'classroom-devices.js',
	'courses-management.js',
	'exam-analysis.js',
	'exam-documents.js',
	'exam-management.js',
	'games-core.js',
	'games-management.js',
	'global-search.js',
	'kids-championships-management.js',
	'kids-default-games.js',
	'kids-games-management.js',
	'legacy-auth-bridge.js',
	'legacy-bridge.js',
	'modal-layout.js',
	'notifications.js',
	'overview-dashboard.js',
	'prompt-builder.js',
	'qrcode-generator.js',
	'questions-management.js',
	'quick-start.js',
	'quiz-presets.js',
	'qx-ui.js',
	'rag.js',
	'realtime-admin.js',
	'realtime-settings.js',
	'results-management.js',
	'row-actions.js',
	'settings.js',
	'socket-auth-keeper.js',
	'teacher-analytics.js',
	'teacher-domain-analytics.js',
	'teacher-filter.js',
	'teacher-overview.js',
	'theme-toggle.js',
	'utils.js',

	// ── Student surface ───────────────────────────────────────────────────
	'landing.js',
	'realtime-client.js',
	'script.js',
	'student-courses.js',
	'student-workspace.js',

	// ── Stylesheets ───────────────────────────────────────────────────────
	'admin.css',
	'admin-console.css',
	'qx-premium.css',
	'styles.css',
	'teacher-analytics.css',
	'theme-dark.css',
	'theme.css',
	'typography.css',
]);

/** Vendored browser libraries. The offline bundle (vendor/offline) and the
 *  bundled mkcert binary are deliberately NOT here. */
export const PUBLIC_VENDOR_FILES = new Set([
	'atom-one-dark.min.css',
	'highlight.min.js',
	'mammoth.browser.min.js',
	'pdf.min.js',
	'pdf.worker.min.js',
	'socket.io.min.js',
	'xlsx.full.min.js',
]);

/**
 * Directories served in full. `public` holds the built bundles and the whole
 * Kids player; `uploads` holds user media and is mounted separately (with a
 * long cache) by the server.
 */
export const PUBLIC_DIRECTORIES = ['public'];

/**
 * Files that are never served, wherever they appear. Checked against the
 * requested path before any static mount runs.
 *
 * Covers: databases (and their journals/wal/shm sidecars), environment files,
 * keys and certificates, backups, dumps, source maps, logs and archives.
 */
export const BLOCKED_PATTERNS = [
	// Databases and their sidecars.
	/\.(db|db-journal|sqlite|sqlite3|sql)$/i,
	/(^|\/)(prisma|database|data)\/.*\.(db|sqlite|sqlite3)$/i,
	/-(wal|shm|journal)$/i,
	// Environment and configuration.
	/(^|\/)\.env(\..*)?$/i,
	/(^|\/)\.npmrc$/i,
	/(^|\/)\.netrc$/i,
	/(^|\/)\.git(\/|$)/i,
	// Project metadata — describes the application, not part of it.
	/(^|\/)package(-lock)?\.json$/i,
	/(^|\/)tsconfig[^/]*\.json$/i,
	/(^|\/)vitest\.config\.js$/i,
	// Keys, certificates and credentials.
	/\.(key|pem|pfx|p12|keystore|jks|asc|gpg)$/i,
	/(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i,
	// Backups and archives.
	/\.(bak|backup|old|orig|save|swp|tmp|log|dump|sql|sql.gz|tar|tar\.gz|tgz|zip|7z|rar)$/i,
	// Source maps and build metadata leak the original source.
	/\.map$/i,
	// TypeScript / source trees that must never be published.
	/\.(ts|tsx|mts|cts)$/i,
	// The Prisma schema and the migration history are architecture, not assets.
	/(^|\/)prisma\/(schema\.prisma|migrations)(\/|$)/i,
	// Private project directories — the source of the server itself.
	/^\/(src|tests|scripts|docs|prisma|node_modules|dist|certs|old files)(\/|$)/i,
	// Dependency trees.
	/(^|\/)node_modules(\/|$)/i,
	// Offline bundle and certificate tooling.
	/(^|\/)vendor\/(offline|mkcert)(\/|$)/i,
];

/**
 * Does this request path match a blocked pattern?
 * @param {string} pathname the request path, e.g. '/prisma/dev.db'
 */
export function isBlockedPath(pathname) {
	if (!pathname) return false;
	// Normalise: strip a leading slash and query string.
	const clean = decodeURIComponent(String(pathname).split('?')[0]);
	return BLOCKED_PATTERNS.some((pattern) => pattern.test(clean));
}
