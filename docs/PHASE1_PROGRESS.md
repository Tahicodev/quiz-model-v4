# Phase 1 progress log — taxonomy and question pedagogy

**Purpose.** This is the live record of the adaptive-learning Phase 1 implementation. The
previous file, [`docs/phase 01.md`](./phase%2001.md), is the **frozen spec** (what Phase 1 is
and why); this file is the **mutable record** (what has actually been done, verified and left
open). When the two disagree about *scope*, the spec wins; when they disagree about *status*,
this file wins.

**Branch:** `feature/adaptive-learning-phase1`
**Authorization:** WP1 only. WP2+ is **not** authorized until the owner accepts the WP1 review.

**Ground rules carried from the spec and Phase 0**

- Taxonomy + question pedagogy only. No evidence, mastery, level, pathway or AI-suggestion code/tables.
- No existing functionality, tenant isolation, authorization or data integrity is weakened.
- No existing column renamed, retyped or removed; additions are nullable or defaulted.
- Every new capability ships default **off**.
- Nothing advances past the authorized work package without the owner's review.

---

## Status board

| WP | Scope | Status | Verified |
|---|---|---|---|
| WP1 | Schema + migration | **Done — awaiting review** | Yes (see evidence below) |
| WP2 | Backend data access (`MODEL_MAP` / `SEARCH_FIELDS`, repository parity) | Not started | — |
| WP3 | Services (`LearningTaxonomyService`, `QuestionPedagogyService`) | Not started | — |
| WP4 | Routes + permissions + backup | Not started | — |
| WP5 | Frontend (pedagogy panel, filters, proposal queue, labels/RTL) | Not started | — |
| WP6 | Tests (validators, integration, scope, regression) | Not started | — |
| WP7 | Docs + flags / completion report | Not started | — |

---

## WP1 — Schema + migration

### Deliverables

- `prisma/schema.prisma`
  - **5 additive `Question` fields**: `pedagogy_status` (`@default("unclassified")`),
    `primary_bloom_dimension_id`, `pedagogy_reviewed_at`, `pedagogy_reviewed_by`, `pedagogy_source`.
  - **2 `Question` indexes**: `[primary_bloom_dimension_id]`, `[school_id, pedagogy_status]`.
  - **2 `Question` relations**: `primaryBloom` → `BloomDimension` (`SetNull`),
    `assessmentCriteria` → `QuestionAssessmentCriterion[]`.
  - **Back-relations** on `School`, `Subject`, `Category`, `Question` only.
  - **6 new models**: `BloomDimension`, `LearningObjective` (with `status`,
    `proposed_by`, `reviewed_by`, `reviewed_at`, `review_note`), `Competency`,
    `LearningObjectiveCompetency`, `LearningPrerequisite`, `QuestionAssessmentCriterion`.
  - Size: **+181 lines, 0 deletions** (no `prisma format` churn).
  - No `QuestionClassificationSuggestion` table — AI suggestions are deferred to Phase 6.
- `prisma/migrations/20261119000000_learning_taxonomy/migration.sql` — 214 lines:
  6 `CREATE TABLE`, one `Question` rebuild, 17 indexes. No seed SQL.

### Verification evidence

| Check | Result |
|---|---|
| `npx prisma validate` | **valid** |
| Regenerated `migrate diff` body vs committed migration | **byte-identical** (207 lines) |
| Snapshot copy (`prisma/dev.db`, 22 recorded migrations) + `prisma migrate deploy` | 43 → **49 tables**; questions **10,489 → 10,489**; **23 migrations**; 6 taxonomy tables; 5 new `Question` columns; **all 10,489 rows `unclassified`**; 7 `Question` indexes; `PRAGMA foreign_key_check` empty; `PRAGMA integrity_check` ok |
| Fresh empty DB, all 23 migrations from scratch | 49 tables; FK check empty; integrity ok |
| Temporary verification databases | deleted afterwards (nothing left in the repo) |

### Why the `Question` table is rebuilt

SQLite cannot attach a new foreign key (`primary_bloom_dimension_id`) with `ALTER TABLE`, so the
migration creates `new_Question`, inserts the 16 existing columns unchanged, drops the old table
and renames. No existing column is renamed, retyped or removed; the five new columns take their
defaults (`unclassified` / NULL).

### Why there is no Bloom seed in the migration

`INSERT OR IGNORE` is SQLite-specific and this repo must also run on PostgreSQL. The catalog is
seeded idempotently at runtime by `LearningTaxonomyService.ensureSeeded()` (WP3), so
`BloomDimension` is intentionally empty right after the migration.

### Open items carried forward

1. **`npx prisma generate` fails with EPERM** — `node_modules/.prisma/client/query_engine-windows.dll.node`
   is locked by a running Node process. No WP1 runtime code references the new models, so nothing is
   broken yet, but the generated client is **stale** and must be regenerated (with the Node process
   stopped) **before any WP2 service work**.
2. **Pre-existing migration drift — not touched, not a WP1 defect.** `prisma migrate diff --from-migrations`
   reports unrelated `KidsGame` / `KidsGameSession` / `Question` / `Tournament` redefinitions, because
   the committed migrations do not reproduce the live schema. WP1's migration was therefore generated
   against the live datasource; a fresh deploy of all committed migrations is clean. Fixing this drift is
   outside WP1 and needs its own decision.
3. **Unrelated working-tree items, left as they were:** `complete_adaptive_learning _system.md` has one
   stray line removed, and `tests/unit/ResultService.session-mode.contract.test.js` is untracked. Neither
   is part of WP1; the owner decides whether to keep, revert or commit them.

---

## Progress log

### 2026-11-19 — WP1 — schema + migration

- Implemented the additive `Question` pedagogy fields and the six taxonomy models; no suggestion table.
- Wrote and committed the `learning_taxonomy` migration; no seed SQL (portability).
- Verified: `prisma validate` clean; regenerated diff byte-identical to the migration; migration applied
  successfully to a copy of the live snapshot **and** to a fresh empty database; all 10,489 questions
  preserved and left `unclassified`; FK and integrity checks clean.
- Reported the Prisma diff, the migration SQL and the apply results.
- **Stopped for owner review.** No WP2+ work started.

---

## How to append an entry

Add a new dated section under *Progress log* when a work package finishes (or when a finding changes
the plan), and update the matching row of the *Status board* in the same commit. Keep the spec
(`docs/phase 01.md`) unchanged unless the owner approves a scope change; record approved scope changes
in the log first, with the date and the owner's decision.
