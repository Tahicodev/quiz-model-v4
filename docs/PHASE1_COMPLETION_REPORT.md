# Phase 1 completion report — taxonomy and question pedagogy

**Work package:** WP7 (docs + flags) — the last Phase 1 work package.
**Branch:** `feature/adaptive-learning-phase1`
**Date:** 2026-11-20
**Status:** report drafted for owner review. Nothing here is a request to merge or push. WP5 was still
**not accepted** by the owner at the time this snapshot was written (2026-11-20); that is recorded as an
open item, not hidden. **Update 2026-11-21 (owner):** WP5 and WP7 are now **accepted**; the acceptance
supersedes the open items 1 and the WP7 "awaiting owner review" status below, which are preserved as the
dated snapshot record. **Phase 1B remains NOT authorized.**

Companion documents: the frozen spec [`docs/phase 01.md`](./phase%2001.md), the live record
[`docs/PHASE1_PROGRESS.md`](./PHASE1_PROGRESS.md), the architecture
[`docs/ADAPTIVE_LEARNING_ARCHITECTURE.md`](./ADAPTIVE_LEARNING_ARCHITECTURE.md) and
[`docs/ADR-0001-ADAPTIVE-LEARNING-FOUNDATION.md`](./ADR-0001-ADAPTIVE-LEARNING-FOUNDATION.md)
(ADR-0001 remains **Proposed**).

---

## 1. Scope delivered (and the scope lock that was held)

Phase 1 is **taxonomy + question pedagogy only**, behind off-by-default flags. It answers "what is
this question teaching, and how will we know?" It does not record evidence, derive mastery, or run
adaptation.

| In Phase 1 | Deliberately not in Phase 1 |
|---|---|
| Bloom catalog, learning objectives, competencies, objective↔competency links, prerequisites | Evidence ingest, mastery, levels, profiles, pathways |
| Question assessment criteria (objective + Bloom + weight) and derived `pedagogy_status` | Session linkage, attestation, backfill, reconciliation |
| Teacher objective proposals + admin approve/reject; teacher question classification | AI suggestions (deferred to Phase 6) |
| Read/classify permissions split by scope | Any write to `Result`, `ExamSession`, `Exam` |

## 2. Delivered surface

- **Tables (6, all new):** `BloomDimension`, `LearningObjective`, `Competency`,
  `LearningObjectiveCompetency`, `LearningPrerequisite`, `QuestionAssessmentCriterion`.
- **Question columns (5, additive):** `pedagogy_status` (default `"unclassified"`),
  `primary_bloom_dimension_id`, `pedagogy_reviewed_at`, `pedagogy_reviewed_by`, `pedagogy_source`.
  No existing column renamed, retyped or removed.
- **Migration:** `prisma/migrations/20261119000000_learning_taxonomy` (24th migration). The `Question`
  table is rebuilt because SQLite cannot attach a new foreign key in place; the 16 legacy columns are
  copied verbatim.
- **Endpoints:** `/learning/flags`, `/learning/bloom`, objectives CRUD + approve/reject + archive,
  competencies + archive, objective↔competency links, prerequisites, and question pedagogy
  (`GET`/`PUT`/`POST`/`DELETE` criteria, `recompute`).
- **Permissions:** `class.learning.read`, `class.learning.classify` (teacher scope);
  `school.learning.read`, `school.learning.manage` (admin scope). `class.learning.manage`,
  `class.learning.assign` and `school.learning.admin` remain Phase 3 design-only and are **not** in the
  catalog.
- **Backup:** the five learning tables are in the export/import store list; restores now report
  `dropped: { total, reasons, samples }` instead of silently discarding rows.
- **UI:** the console SPA learning surface (taxonomy, pedagogy editor, proposal queue) and the
  learning label dictionary EN/FR/AR with panel-only RTL.
- **Pure validators:** `pedagogy-validator.js`, `prerequisite-validator.js`,
  `competency-link-validator.js`, `bloom-catalog-validator.js`.

## 3. Flags default off — verified

| Check | Evidence |
|---|---|
| Master switch is off unless a row says otherwise | `LearningTaxonomyService.isAdaptiveEnabled` (`src/backend/services/learning/LearningTaxonomyService.js:151-159`) returns `false` when the setting row is absent |
| Teacher direct-publish is off unless a row says otherwise | `isTeacherCreationEnabled` (same file, `124-131`), same absent-row rule |
| Nothing seeds either key to `"true"` | `prisma/seed.js` contains no `learning.*` key; the settings table is keyed per school |
| The gate is enforced server-side, not just in the UI | `requireAdaptiveEnabled` is registered before every learning route except `/flags` and returns `403 FEATURE_DISABLED` (`src/backend/routes/learning.routes.js:96-113`) |
| A sweep proves it | the learning integration suite walks the router stack and asserts every route refuses while the flag is off, including the per-school case |
| The client cannot turn it on | the console reads the flags (`src/frontend/console/pages/learning/flags.js`) and on any error leaves both `false`; no frontend code writes the key |

**Deviation from the spec, recorded:** the spec said the setting is "seeded value `false`". The
implementation does not seed a row at all — absence means off, which is the same effective default and
one fewer row to keep in sync. Reported here rather than left implicit.

## 4. No evidence/mastery rows — verified

| Check | Evidence |
|---|---|
| No evidence or mastery tables exist | `prisma/schema.prisma` has 48 models; none is an evidence, mastery, pathway or level table |
| No learning code writes one | a repository-wide search for evidence/mastery identifiers in `src/` finds only unrelated strings: TeacherOverview copy, the `min_mastery_state` label on a prerequisite, and a form field id |
| Learning code never touches assessment outcomes | the learning services read and write only the six taxonomy tables and the five additive `Question` columns; `Result`, `ExamSession` and `Exam` are not written anywhere on the learning paths |
| The invariant is documented | architecture + ADR carry *what is recorded ≠ what can be proven ≠ what a teacher designates as formal* |

## 5. Verification evidence

- **Full test suite (2026-11-20):** `122 files passed (122) · 1600 tests passed (1600)`, 46.6s.
  A first run under parallel load produced four `beforeAll` hook timeouts in integration files that
  each boot a throwaway SQLite database via `prisma migrate deploy`; the immediate clean re-run passed
  every file with no failures. The contending-setup behaviour is documented in `vitest.config.js`, and
  the same suite is the WP6 acceptance evidence.
- **Learning-specific suites:** learning routes (44 tests), console permissions sweep (17),
  bulk drop-report (4).
- **Migration:** applied to a **copy** of a real database snapshot, not the live one. All 16 legacy
  `Question` columns preserved (SHA-256 digest of the legacy content unchanged), 21 live columns,
  0 schema mismatches, 7 indexes recreated, every pre-existing table unchanged, 6 new tables empty,
  integrity check `ok`, foreign-key check 0 violations.
- **Browser walkthrough (real UI):** teacher classified a question (Bloom Apply → `Classified` badge);
  admin approved a proposed objective (queue emptied); Arabic switched the learning panel to
  `dir="rtl"` (labels only — the console shell stays LTR by design); admin disabled
  `learning.adaptive.enabled` and the hub + questions rendered the disabled state with **nothing
  deleted**. The walkthrough found and fixed a genuine WP5 crash (`bindControls` referenced an
  undeclared `bloomCache`), and the bundle was rebuilt.
- **Console authorization sweep:** a teacher gets `403` on every console route except
  `/console/session`; the sweep also exposed and fixed four previously unguarded routes.

## 6. Open items and limitations (not hidden)

1. **WP5 is not accepted.** The owner's five pre-WP7 fixes are applied; re-review is pending. Every
   other package is accepted. *(Update 2026-11-21: superseded — the owner has accepted WP5, specifically
   the refactored Questions-tab integration; this snapshot item is preserved as history.)*
2. **Localization gate (pre-pilot).** The EN/FR/AR strings — Bloom labels, pedagogy statuses, proposal
   states — are best-effort and still need native Arabic and French reviewers before any real-school
   pilot. Flagged in-file since WP3.
3. **The live `prisma/dev.db` has not been migrated** (22 migrations; no learning tables). The
   migration was verified on a copy. Deploying it to the live database is a deliberate, unexecuted step.
   *(Update 2026-11-21: superseded — the owner applied migration `20261119000000_learning_taxonomy` to the
   live database on 2026-11-21, reported in-session at the time (23 migrations, learning tables live,
   Bloom seed present, `learning.adaptive.enabled` set). No fresh database verification was performed
   during the final reconciliation — database access was unavailable; this record relies on that
   previously verified evidence only.)*
4. **No admin UI enables the master switch.** `learning.adaptive.enabled` is turned on through
   `PATCH /api/v1/settings/learning.adaptive.enabled` (admin) today; there is no console toggle. That
   is consistent with a not-yet-piloted feature, but it should be a conscious choice before a pilot.
5. **Leftover test databases.** `prisma/test-*.db` has grown to ~4,000 files (~3.1 GB) from repeated
   throwaway runs. Reported, not deleted (not all were created by this work).
6. **AR/FR is pending native review** (same as item 2), and the console shell remains LTR by design
   while only the learning panel flips.

## 7. Acceptance criteria — status

| Criterion (from the spec) | Status |
|---|---|
| A teacher can classify a question with one or more criteria; weights sum to 1 | Met (validated server-side, exercised in the walkthrough) |
| A question without criteria works in every existing flow | Met (`unclassified` is the default; no existing flow reads the new fields) |
| Bloom is independent of difficulty | Met (no code path reads or infers `difficulty`) |
| Cross-tenant ids are rejected | Met (services re-check tenant; tests cover it) |
| Proposal state and the setting behave as specified | Met (teacher → `proposed`; admin → `active`; approve/reject admin-only) |
| No evidence/mastery rows are written | Met (§4) |
| Existing question/exam/game tests pass unchanged | Met (full suite green) |
| Migration applies cleanly to a copy of a real snapshot | Met (§5) |
| No existing field renamed, retyped or removed | Met (§5) |
| New endpoints tenant-scoped and audited | Met |
| Panel works EN/FR/AR with panel-only RTL | **Partial** — works; native review pending (§6.2) |
| Flags default off | Met (§3) |

## 8. How to enable, for the record

Per school, admin only, and deliberately not scripted here:

1. `PATCH /api/v1/settings/learning.adaptive.enabled` with value `"true"` — turns on the learning
   surfaces. Until then, every learning route except `/learning/flags` returns `403 FEATURE_DISABLED`.
2. Optionally `learning.teacher_objective_creation = "true"` — lets teachers publish objectives
   directly instead of proposing them. Off by default.
3. Nothing is deleted or migrated by either flag; turning the master switch back off hides the surfaces
   and re-blocks the routes.

## 9. WP7 declaration

WP7 is complete as a **documentation and verification** work package: this completion report, the
flags-default-off confirmation (§3), and the no-evidence/no-mastery confirmation (§4). No code was
changed to produce it. No merge, no push, and no Phase 2 work has been performed.

---

## 10. Formal closure (owner decision, 2026-11-22)

**DECISION: APPROVED — PHASE 1 FORMALLY CLOSED.** Following WP1–WP7 acceptance and the final
read-only closure audit, the owner formally approved closure of Phase 1 on 2026-11-22. This entry
records that decision; nothing above is rewritten.

- **Authoritative Phase 1 snapshot:** branch `feature/adaptive-learning-phase1`, commit `d22d22e`
  ("feat(learning): Phase 1 — taxonomy + question pedagogy (WP1–WP7, owner-accepted)"), approved
  45-file manifest, remote `origin/feature/adaptive-learning-phase1`; working tree clean at the last
  verification.
- **Confirmed by closure:** WP1–WP7 accepted; Defects A and B closed; G2/G3 remain accepted; G4 adopted
  per owner decisions C1 and D1 (E1 wording); D15 approved with its implementation and governance
  boundaries preserved; U8 closed; U15 approved in principle with its wording condition satisfied; the
  provenance hierarchy and historical decision safeguards remain authoritative. Superseded decision
  records are preserved, not removed.
- **Unchanged by closure:** U6 remains **deferred (non-blocking)**; ADR-0001 remains **Proposed**;
  **Phase 1B remains NOT AUTHORIZED**; Arabic/French localization stays a pre-pilot gate; deployment
  readiness is a separate assessment; database/test-file hygiene remains outstanding. Closure
  authorizes no additional implementation, deployment or pilot launch.
- **Open items preserved (not resolved by closure):** (1) native Arabic/French review before pilot;
  (2) tracked database files and database exposure hygiene; (3) test-database storage accumulation;
  (4) the minor documentation inaccuracy concerning the admin enable toggle; (5) U6 deferred status;
  (6) ADR-0001 Proposed status; (7) remaining deployment and pre-pilot readiness requirements.
- **Execution:** documentation-only — this entry, `PHASE1_PROGRESS.md` (status board note, header
  update, dated log entry), `ARCHITECTURE-BASELINE.md` (status header + §5.1) and
  `OWNER-DECISION-REVIEW.md` (§9.4). No code, tests, schema, database or Git history was modified; the
  local recovery branch `backup/phase1-snapshot-d584df3` is preserved; no reflog expiration or garbage
  collection ran; no merge, force-push or deploy. Documentation changes were left **unstaged and
  uncommitted** for owner review.
