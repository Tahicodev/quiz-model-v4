MOVED HERE — development leftovers, not used by the app.

These files/folders were moved here during the app cleanup. The app does not
load, import, or script any of them, and this folder is EXCLUDED from the
offline package (see scripts/make-offline-package.mjs EXCLUDE list).

Moved from app root:
  server.js                         legacy standalone Express server (app uses src/backend/server.js)
  theme-auto-generated.css          old generated theme file (no references)
  check-db.mjs                      dev-only database check script (no references)
  server-err.log / server-out.log   old runtime log output
  report.20260810.*.json            stray report file
  gui-test-screenshots/             dev-only UI test artifacts
  .zcode/                           dev planning notes
  IMPLEMENTATION_PLAN.md            internal implementation plan doc
  MIGRATION_FAILURES.md             internal migration-failure retrospective doc
  quiz_app_master_implementation_prompt.md  original dev prompt doc

Moved from prisma/:
  test-*.db                         temporary test databases (32 files)

Moved from src/frontend/ and public/ (modern admin SPA, NOT wired into any page):
  admin-main.js, main.js            admin SPA entry points
  src/frontend/ui/pages/admin/      admin SPA pages/components (the live admin UI is admin.html + root admin-*.js)
  public/admin-bundle.js            built output of the unused admin SPA
  (build:admin script removed from package.json; "npm run build" now builds the student bundle only)

To restore any item: move it back to its original location (above).