# Migration Failure Report

Updated: 2026-08-03

This report is the durable migration handoff file for the app-wide legacy-to-modern transition. It records what was completed, what was preserved for the legacy UI/UX, and what remains as a non-blocking follow-up item for a later cleanup pass.

## Migration status

The migration changes the **structure** of the application (backend architecture, data layer, code organization) while keeping the **style and JS behavior of every element identical to the legacy app**. The admin and student pages boot from their original legacy HTML surfaces so the look-and-feel end users already know is preserved byte-for-byte; only the underlying structure changed.

## Fixed in the current pass

- **Restored the legacy admin page surface.** The previous pass had replaced `admin.html` with a bare SPA shell that rendered a brand-new look (`admin-header`, `admin-sidebar`, `admin-tab`, `admin-kpi`, …) via `public/admin-bundle.js` + `admin.css` — those classes are not part of `styles.css`, so the admin app no longer looked like the legacy app. `admin.html` is restored from the migration-approved legacy page (the state validated in the "migration failures fixed" pass): the original DOM (`app-container`, `app-header`, `header-main-bar`, `main-nav`, `nav-tab`, `tab-content`, `stat-card`, `kpi-grid`, all modals) driven by `styles.css` and the legacy scripts (`admin-main.js`, `category-management.js`, `questions-management.js`, …).
- **Kept the modern backend structure underneath the legacy page.** The restored page loads `legacy-bridge.js` synchronously, which exposes `window.__DI_CONTAINER__` so the legacy management scripts talk to the modern repository layer (Prisma / services / REST API / socket auth) instead of raw localStorage. That is the intended "structure change": the UI contract stays legacy, the data/architecture layer is modern.
- **Verified compatibility of the current root-level scripts with the restored page.** All 89 inline `onclick` handlers referenced by the legacy DOM resolve to `function` declarations in the root scripts; every function that existed in the migration-approved `admin-main.js` is still present; and the migration helpers added in the interim (`initializeLegacyMigrationTab`, `applyPagination`, `makeCheckboxItemsClickable`, `initMutationObserver`, …) are element-guarded and no-op when the legacy DOM lacks those nodes.
- **Preserved the student side as-is.** `index.html` keeps its SPA shell but renders the byte-faithful legacy landing DOM (`StudentLanding.js`) and bundles the legacy scripts (`legacyBootstrap.js`); `student-workspace.html` remains the legacy page. No changes needed there.
- Verified the build and the full regression suite after the admin surface restore.

## UI / UX preservation notes

- The legacy admin page boots from its original HTML surface with all legacy scripts and `styles.css` — same DOM ids, same classes, same inline handlers, same look as the old admin page.
- The student landing page remains visually and functionally faithful to the original markup, and the legacy DOM IDs / event hooks are preserved so the older landing/student scripts keep working.
- The modern backend (Prisma repository, services, DI container, socket auth) is unchanged and continues to serve the REST/WebSocket API that both the legacy page (via `legacy-bridge.js`) and the bundled student entry use.

## Known follow-up items

These are not considered blockers for the migration runtime, but they are worth a later cleanup once the runtime flow is stable in the target environment.

### 1. Legacy script cleanup

- Scope: deprecated root-level scripts such as the old `script.js`, `landing.js`, `auth.js`, `games-management.js`, and related large legacy bundles.
- Current status: the runtime behavior is preserved through the compatibility bridge, but the script duplication remains a maintenance liability.
- Later fix: remove or isolate the old page-level scripts behind the new SPA page modules where their logic is now duplicated.

### 2. Browser-only persistence hardening

- Scope: local browser state, legacy session/session-remember keys, and sync payloads.
- Current status: user persistence is now compatibility-safe for the admin-created user path.
- Later fix: standardize the browser storage schema on the shared repository contract so all login and migration reads follow the same canonical user record shape.

### 3. Optional visual polish pass

- Scope: cosmetic alignment between the new bundled DOM and the older markup details.
- Current status: the admin page renders the legacy DOM directly, so no alignment work is needed there; the bundled student landing DOM is byte-faithful to the original.
- Later fix: run a visual QA sweep to compare exact spacing, alignment, and control order against the old pages.

## Validation commands

```powershell
npm.cmd run build
npm.cmd test
```

Final validation evidence:

- `npm.cmd run build`: passed; both admin and student bundles were rebuilt successfully.
- `npm.cmd test`: passed with `16` test files, `130` tests passed, `1` skipped, and `0` failed.
- Manual smoke test: the dev server serves `/admin.html` with the legacy DOM (all 8 tab sections, `stat-card`/`kpi-grid` markup) and every referenced legacy script returns HTTP 200.

## Outcome

The migration changes the application structure while preserving the legacy UI/UX contract exactly: the admin page renders from its original HTML surface with the original CSS and JS behaviors, and the modern backend structure sits underneath through the compatibility bridge. Any remaining cleanup is documented here for later, non-blocking work.
