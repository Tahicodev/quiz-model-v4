# Migration Failure Report

Updated: 2026-08-03

This report is the durable migration handoff file for the app-wide legacy-to-modern transition. It records what was completed, what was preserved for the legacy UI/UX, and what remains as a non-blocking follow-up item for a later cleanup pass.

## Migration status

The legacy shell and the modern SPA shell are now aligned so the application can run through a single compatible boot path while preserving the legacy look-and-feel that the old admin/student pages were built around.

## Fixed in the current pass

- Restored the legacy admin entry shell and routed it to the new SPA bundle contract.
- Preserved the legacy admin page runtime shape while exposing the new admin tab orchestration path in the bundled frontend.
- Preserved the student workspace entry and the landing-page DOM contract so the old inline UX still renders correctly under the new bundled boot path.
- Added legacy browser compatibility for local-storage-backed user records, so newly created users survive the admin-to-student login path.
- Added the missing migration entry point and status rendering path in the restored legacy admin UI shell.
- Expanded migration normalization for the remaining session/join-table snapshot shapes used by the old local app data.
- Fixed the repository ordering regression that previously caused Prisma validation errors on session-related tables.
- Kept the migration flow tenant-scoped and idempotent, with status reporting backed by the real backend query surface.
- Verified the build and the full regression suite after the migration compatibility fixes.

## UI / UX preservation notes

- The legacy admin page still boots from its original HTML surface, but the runtime is now exercised through the modern admin SPA page modules instead of a disconnected monolithic script stack.
- The student landing page remains visually and functionally faithful to the original markup, and the legacy DOM IDs / event hooks are preserved so the older landing/student scripts keep working.
- The migration path is surfaced in the header/sidebar and page shell without changing the legacy page structure that end users already know.

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
- Current status: the major structure and controls were preserved to match the legacy UX.
- Later fix: run a visual QA sweep to compare exact spacing, alignment, and control order against the old pages.

## Validation commands

```powershell
npm.cmd run build
npm.cmd test
```

Final validation evidence:

- `npm.cmd run build`: passed; both admin and student bundles were rebuilt successfully.
- `npm.cmd test`: passed with `16` test files, `130` tests passed, `1` skipped, and `0` failed.

## Outcome

The migration is now complete from the runtime and compatibility standpoint, and the legacy UI/UX contract is preserved through the compatibility shell and SPA bootstrap glue. Any remaining cleanup is documented here for later, non-blocking work.
