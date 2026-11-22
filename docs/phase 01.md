# Phase 1 plan — Taxonomy and question pedagogy (approved with changes)

**Branch:** `feature/adaptive-learning-phase1` (dedicated; no unrelated work).
**Status:** live status lives in [`docs/PHASE1_PROGRESS.md`](./PHASE1_PROGRESS.md) — as of 2026-11-21 all
Phase 1 work packages (WP1–WP7) are accepted by the owner and Phase 1 is ready for formal closure review.
**This file is the frozen Phase 1 spec** — scope, decisions, field names, lifecycle rules, acceptance criteria. It changes only when the owner approves a scope change. Live status, verification evidence and the dated progress log are in [`docs/PHASE1_PROGRESS.md`](./PHASE1_PROGRESS.md).
**Scope lock:** taxonomy + question pedagogy only. No evidence, no mastery, no levels, no evidence tables, no writes to `Result` / `ExamSession` / `Exam`. Every new capability is default off.

## Owner decisions incorporated

**(a) AI suggestions are deferred entirely.** No `QuestionClassificationSuggestion` table, no suggestion endpoints, no suggestion UI, and nothing consumes `learning.ai_suggestions.enabled` in Phase 1. Roadmap revision recorded in `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2: it lands in **Phase 6 — Recommendations and interventions** (AI layer §H.7), teacher-reviewed and never authoritative.

**(b) Teacher objective creation.** Direct creation is allowed only when the school enables `learning.teacher_objective_creation` (**default `false`**). When the setting is off, a teacher-created objective is stored with `status = 'proposed'` and needs admin approval. When it is on, it is created `active`. The setting, the proposal state and the approve/reject endpoints are part of Phase 1.

## Field names (aligned with the architecture)

The plan previously said `classification_status`; the architecture's `Question` fields are authoritative and are used as-is:

| Field | Type / default | Notes |
|---|---|---|
| `pedagogy_status` | `String @default("unclassified")` | `unclassified` / `partial` / `classified` / `needs_review` |
| `primary_bloom_dimension_id` | `String?` | cached filter/display value; criteria stay authoritative |
| `pedagogy_reviewed_at` | `DateTime?` | last teacher review |
| `pedagogy_reviewed_by` | `String?` | reviewer |
| `pedagogy_source` | `String?` | `manual` / `imported`; `ai_accepted` reserved and never written in Phase 1 |

`difficulty` is untouched. No existing column is renamed, retyped or removed.

## Objective proposal governance (D2)

- `LearningObjective.status`: **`proposed` | `active` | `rejected` | `archived`** (default `active` for admin-created rows).
- Additional fields: `proposed_by`, `reviewed_by`, `reviewed_at`, `review_note`.
- Setting: `learning.teacher_objective_creation`, visibility `admin`, seeded value `"false"`; read server-side and enforced in the service.
- Endpoints (specified now, implemented in WP4):
  - `POST /learning/objectives` — admin → `active`; teacher + setting on → `active`; teacher + setting off → `proposed`.
  - `PATCH /learning/objectives/:id` — admin any; teacher only their own `proposed` row (cannot change status).
  - `GET /learning/objectives?status=proposed` — admin review queue.
  - `POST /learning/objectives/:id/approve` — admin (`school.learning.manage`) → `active`, records `reviewed_by` / `reviewed_at`.
  - `POST /learning/objectives/:id/reject` — admin, requires `review_note` → `rejected`.
  - Archive remains `PATCH status='archived'`; referenced objectives are never hard-deleted.

## Criteria lifecycle (normative for Phase 1)

| Event | Behavior |
|---|---|
| **Question delete** | Hard-delete cascades the question's `QuestionAssessmentCriterion` rows (`onDelete: Cascade`). Objectives/competencies/Bloom rows are untouched. The existing guard still blocks deletion while the question is in an `active` exam. The delete is audited. |
| **Question duplicate** | No duplicate/copy-question feature exists today (verified: no route or service). Nothing is preserved. Rule for any future copy feature: copy the criteria with the question, set `pedagogy_status='needs_review'`, clear `pedagogy_reviewed_*`, and require teacher re-approval. |
| **Import** | `QuestionService.bulkImport` (defined but not route-wired) and the backup `bulk/questions` path create questions with no criteria → `pedagogy_status='unclassified'`. A backup row carrying `primary_bloom_dimension_id` is accepted only if the Bloom ID exists; otherwise it is nulled and the question stays `unclassified`. No auto-classification. |
| **Export** | Question rows carry the new additive fields automatically (the repository returns raw rows). WP4 adds `learning_objectives`, `competencies`, `learning_objective_competencies`, `learning_prerequisites`, `question_assessment_criteria` to the backup export/import store list; `bloom_dimensions` is global and seeded, so it is not exported. Until WP4, a backup restores questions as `unclassified` with no criteria. |

## Named validators (pure modules, `tests/unit/learning/`)

| Module | Responsibility |
|---|---|
| `pedagogy-validator.js` | criterion weights sum to 1.0 ± 0.001; no duplicate criterion keys; valid Bloom/objective/competency; objective and competency belong to the same tenant |
| `prerequisite-validator.js` | acyclic graph (DFS), self-edge rejection, maximum depth |
| `competency-link-validator.js` | objective↔competency link: same school, subject compatibility, weight ≥ 0, at most one `is_primary` per objective |
| `bloom-catalog-validator.js` | exactly the six fixed IDs, unique `key`, `labels_json` parses with `en`/`fr`/`ar`, `order_index` 0–5, idempotent seed |

## Work packages

**WP1 (this work package) — schema + migration only**
- Additive `Question` fields above.
- `BloomDimension`, `LearningObjective`, `Competency`, `LearningObjectiveCompetency`, `LearningPrerequisite`, `QuestionAssessmentCriterion`.
- Phase-1 relation subset only: `BloomDimension` links to objectives, primary questions and criteria; later-phase relations are added by their own migration.
- Back-relations on `School`, `Subject`, `Category`, `Question` only.
- Migration `learning_taxonomy`, additive in effect (no existing column renamed/retyped/removed). The `Question` **table is rebuilt** because SQLite cannot attach a new foreign key (`primary_bloom_dimension_id`) with `ALTER TABLE`: the migration creates `new_Question`, copies the 16 existing columns, drops and renames. Bloom seed is a separate idempotent step (WP3), not a hand-written seed inside the migration.

**WP2 — Backend data access** — `PrismaRepository` `MODEL_MAP` / `SEARCH_FIELDS`; `IStorageRepository` / `ApiRepository` parity.

**WP3 — Services** — `LearningTaxonomyService` (objectives, competencies, links, prerequisites, archive, proposal approve/reject, `ensureSeeded()`, setting read), `QuestionPedagogyService` (criteria CRUD, weight validation, primary-Bloom cache). Tenant re-checks in services. No suggestion review.

**WP4 — Routes + permissions + backup** — taxonomy/criteria/proposal endpoints behind `enforceTenant`; `school.learning.*` / `class.learning.*` in `src/shared/permissions.js` + `ROLE_PERMISSIONS`; audit via `AdminActionService`/`AuditService`; add the taxonomy stores to the backup export/import list.

**WP5 — Frontend** — Question Pedagogy panel (classify with ≥1 criterion), filters (objective/Bloom/pedagogy status), bulk classify, admin proposal queue; learning label dictionary EN/FR/AR; RTL `dir` on the learning-panel root only. **No AI controls.**

**WP6 — Tests** — unit (all four validators, Bloom ≠ difficulty), integration (criteria CRUD, proposal flow, question-without-criteria still works everywhere), security/scope (below), regression (existing question/exam/game suites unchanged), Phase-0 contract test green.

**WP7 — Docs + flags** — Phase 1 completion report; flags default off; confirm no evidence/mastery rows.

### Teacher-scope tests (required in WP6)

- teacher + setting off → `POST /learning/objectives` creates `proposed`, not `active`.
- teacher + setting on → creates `active`.
- teacher cannot approve/reject (403).
- teacher cannot edit another teacher's proposed objective.
- teacher can classify only their own questions (existing ownership rule).
- cross-tenant objective/criterion IDs rejected (404/403).
- teacher cannot manage competencies/prerequisites (admin only).
- `tests/integration/questions.author-scope.test.js` passes unchanged.

## Localization review gate (before any pilot)

Before any real-school pilot, a native **Arabic** and a native **French** reviewer must sign off on every new label (Bloom labels, pedagogy statuses, proposal states) and on non-stigmatizing wording; the sign-off is recorded. Until then the UI ships behind the off-by-default flag. Implemented as a Phase 8 pilot gate and listed here so Phase 1 strings are reviewable early.

## Acceptance criteria

- A teacher can classify a question with one or more criteria; weights sum to 1.
- A question without criteria works in every existing flow.
- Bloom is independent of difficulty.
- Cross-tenant IDs are rejected.
- Proposal state and the setting behave as specified.
- No evidence/mastery rows are written.
- Existing question/exam/game tests pass unchanged.

## Definition of done (reworded)

- Migration applies cleanly to a copy of a real database snapshot.
- **No existing field is renamed, retyped or removed; new fields are additive (nullable or defaulted).** Because the repository returns raw rows, API payloads gain those new nullable/defaulted fields; clients that read named fields are unaffected.
- New endpoints tenant-scoped and audited.
- Panel works EN/FR/AR with panel-only RTL.
- Full test suite green.
- Flags default off.

## Roadmap revision

AI question-classification suggestions (table + endpoints + UI + flag consumer) are deferred to **Phase 6 — Recommendations and interventions** (AI layer §H.7). Recorded in `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §N.2 (Phase 1 and Phase 6), §D.7, §J.3 and §D.2.

## Deliberately out of Phase 1

Evidence ingest, D13/D14 mechanics, session-linkage/attestation, backfill, reconciliation, mastery, profiles, pathways, AI suggestions.

## Stop point

After WP1: Prisma diff, the migration SQL, and the result of applying it to a copy of a real snapshot. No WP2 or later work until that is reviewed and approved.