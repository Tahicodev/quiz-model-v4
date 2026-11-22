# ADR-0001 — Adaptive Learning Foundation Architecture

- **Status:** Proposed — pending owner approval
- **Date:** 2026-11-19
- **Decision owner:** Product owner, with pedagogy and engineering review
- **Related documents:**
  - `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md`
  - `docs/PHASE0_DECISION_REGISTER.md`
  - `docs/PHASE0_ARCHITECTURE_REVIEW.md`
  - `complete_adaptive_learning _system.md`
- **Implementation status:** Phase 1 (taxonomy + manual question pedagogy) implemented behind default-off flags on branch `feature/adaptive-learning-phase1`; Phase 2–8 not started. The ADR status remains **Proposed** by owner instruction (§6.5).

---

## 1. Context

The current Quiz App is a multi-tenant assessment and content platform. The completed feature audit found that it has question difficulty and teacher/school analytics, but it does not yet have Bloom classification, learning objectives, student learning evidence, mastery, dynamic levels, personalized pathways, differentiated assignments, personalized assessments, adaptive recommendations or continuous adaptation.

The product specification requires a complete adaptive learning ecosystem, not a question-tagging feature. It must reuse the existing question, exam, course, lesson-exercise, game, Kids Space and result systems. It must preserve school isolation, role authorization, existing grading and `/20` conventions, API contracts and offline behavior.

The architecture proposal in `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` defines the additive pedagogical layer. Phase 0 reviewed that proposal for mathematical consistency, pedagogical validity, specification coverage, missing relationships, contradictions, complexity, scalability, localization and backward compatibility.

---

## 2. Proposed decision (not yet adopted)

This ADR **proposes** the following foundation for all subsequent adaptive-learning phases. Nothing here is adopted, accepted or authorized by the existence of this document: the ADR remains **Proposed**, and the approval fields in §6 stay empty until the owner records explicit dispositions. Language such as "propose", "recommend" or "under review" is used deliberately and does not imply prior acceptance.

### 2.1 Core architecture

1. **Additive only.** New tables, new nullable `Question` columns, optional fields and feature flags. No existing column is renamed, retyped or removed; no existing table is rebuilt.
2. **Reuse existing systems.** Questions, exams, sessions, results, courses, lessons, exercises, classroom games, tournaments, Kids Space and grading remain authoritative. No duplicate assessment, course, question or game engine.
3. **Pedagogical taxonomy.** A global six-row Bloom catalog plus school-scoped learning objectives, competencies/skills, objective–competency links, prerequisites and question assessment criteria.
4. **Evidence layer.** Immutable-content evidence derived only from real persisted results and activity attempts (including teacher-assessed activities). Unmapped evidence is stored but excluded from mastery. No inference of objectives or Bloom from text or AI.
5. **Deterministic mastery.** A pure, versioned calculator using policy v1.1 (review candidate). AI has no authority over evidence, mastery, levels or assignments.
6. **Teacher-controlled adaptation.** Pathways, groups, assignments, interventions and overrides are teacher/admin actions with audit. Recommendations are suggestions, never automatic assignments. Question classification is its own class-scope permission (`class.learning.classify`, Phase 1): a teacher may attach criteria only to questions the server confirms are their own, and may propose (not activate) an objective; `class.learning.read` covers reading and `school.learning.manage` covers admin approval. `class.learning.manage`/`class.learning.assign` remain Phase 3 design permissions and are not in the Phase 1 catalog.
7. **No permanent global level.** Mastery and support levels are per objective/competency/topic, evidence-scoped and recomputed. “Not enough evidence” is a first-class state.
8. **Tenant safety.** Every new school-scoped table carries `school_id`; services re-check tenant and class scope; cross-tenant IDs are rejected.
9. **No LocalStorage authority.** The frontend reads adaptive state from APIs only. Offline adaptive data is unavailable or read-only.
10. **Feature-flagged rollout.** All adaptive capabilities default off and can be disabled without changing existing product behavior.

### 2.2 Proposed evidence and mastery decisions

The following are **proposed**, not accepted. Each is subject to the owner decisions named in §6.

- Evidence records carry `source_type`, `source_id`, `source_mode`, `method`, `evidence_class`, `evidence_item_key`, attempt metadata, score/max, credit, weight components, timestamp and provenance.
- **Classification is derived, not guessed from `Result.mode`.** Because the session path always writes `mode='exam'`, a formal exam is identified as `mode='exam'` **and** a real `exam_id` **and** joined `Exam.is_training=false`; every other `Result` is `training`, `game`, `tournament` or `kids_game`, and all of these are `formative` (`docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §E.2.1). Only `source_kind='exam'` or `method='teacher_rubric'` is `summative`. A `mode='training'` row that carries a real `exam_id` is **not** exam evidence. This is what makes it impossible for repeated training attempts to satisfy the summative gate.
- **What is recorded ≠ what can be proven ≠ what a teacher designates as formal.** This is a non-negotiable invariant, not a slogan. *Recorded* is what a system persisted (a result, a score, an attempt) and is not proof, because `mode`, `exam_id` and scores can be client-supplied. *Proven* is what survives the D13 trust checks (server-authoritative completed session, single use, server re-grade, mapped criteria), and only proven evidence may satisfy a mastery gate. *Formal* is a governance designation — D14's `Exam.is_high_stakes`, a teacher attestation for an offline/paper exam, an admin's approval of a proposed objective — and it changes how proven evidence is treated; it cannot promote recorded-but-unproven rows, and it is itself audited and revocable. The API and UI must state which of the three a value represents.
- **Summative (`exam`) evidence is server-authoritative (D13).** Because `mode`, `exam_id` and the score can be client-supplied on `POST /results` and bulk writes, a rule-4 row is promoted to `summative` only when it matches a committed completed `ExamSession` (same `exam_id`, `user_id`, `school_id`; single use) and its per-question correctness is re-derived server-side with `GradingService`. Otherwise it is ingested as `formative` and flagged for admin review. Offline, bulk-imported and paper exams enter only through an **explicit, audited teacher attestation** (`method='teacher_attestation'`), never as an unattested bulk row. See `docs/PHASE0_DECISION_REGISTER.md` D13.
- **Which formal exams are high-stakes (D14).** Every `is_training=false` exam is high-stakes by default; a school may explicitly designate a formal-but-non-summative exam (diagnostic/placement) as `is_high_stakes=false`. High-stakes still requires the D13 checks. See D14.
- `source_type` is limited to `result` and `activity_attempt`. Teacher assessment is a `LearningActivityAttempt` that carries assessed `LearningActivityCriterion` rows; the evidence it produces has `method='teacher_rubric'` (derived from the criteria — `LearningActivityAttempt` itself has **no** `method` column). Interventions are pedagogical actions, not an evidence source; a teacher observation that should count is recorded as an activity attempt.
- Current mastery uses **two evidence lanes per item/criterion**: the latest summative evidence and the latest formative evidence. This prevents practice retries from erasing a summative result and prevents a summative result from erasing recent formative improvement. All attempts remain in the evidence table for history and trend analysis.
- Counts used for advanced gates are distinct evidence items, not raw criterion rows. One multi-criterion question cannot satisfy four “evidence items.”
- Competency mastery is a rollup of objective mastery through `LearningObjectiveCompetency`; the displayed level is the minimum contributing objective level and coverage is reported, so a competency never outranks its objectives.
- The high-stakes gate remains for `proficient` and `advanced`. Strong formative evidence can display a `summative_pending` recognition badge and remain `developing`; it is not mislabeled as proficient. A teacher rubric on an activity satisfies the gate.
- The high-stakes count formula is corrected **in the proposal** to require both the source/method condition and the credit threshold.
- The proposal corrects the mastery examples, including the rubric effective weight and the subject-rollup label.
- The policy is `mastery-v1.1` (review candidate), provisional and subject to owner approval. It is versioned and snapshotted for reproducibility.

### 2.3 Proposed schema decisions

The following schema additions are **proposed**, not accepted, and are not created by this ADR.

- Add `LearningActivityCriterion` so a teacher-assessed exercise/activity can attribute its score to objective/Bloom/competency criteria instead of guessing from a lesson mapping.
- Add activity attempt idempotency and attempt metadata.
- Add tournament resources to `LearningResourceMap` and `LearningPathwayItem`.
- Add evidence fields for method, lane, item key, canonical criterion identity, source fingerprint, attempt number and weight components.
- Add `Exam.is_high_stakes` (additive, default `true`; meaningful only when `is_training=false`) for the D14 designation. **Phase 2/3 design only:** not created by the Phase 1 schema or migration, and no Phase 1 code reads or writes it.
- Add mastery fields for attempt/current-evidence counts, recent/previous performance, recognition state and last computation.
- Add tenant-safe unique constraints where appropriate.
- Keep course mastery as a derived scope: objectives are resolved through the course’s category branch and/or `LearningResourceMap` targets; no duplicate course/objective table is introduced in v1. If direct objective–course association becomes a product requirement, add an explicit join in Phase 4, not a second curriculum tree.

### 2.4 Localization

- New learning panels and shared components support English, French and Arabic labels.
- Arabic uses RTL root direction and CSS logical properties.
- The existing `app.language` setting is the default locale source; a user preference may override it for the new panels.
- Full-application RTL is not claimed; it is a separate future project.
- Labels avoid diagnostic, stigmatizing or learning-style language.

### 2.5 Operational choices

- **No background job queue in v1.** Evidence ingestion remains bounded and post-commit, but a dirty marker alone is not the recovery mechanism.
- **Durable source receipt and reconciliation.** Each source result/activity attempt upserts a `LearningSourceIngestion` receipt keyed by school, source type, source ID and source fingerprint. The receipt records pending/complete/failed/superseded status, retry metadata and error codes. A bounded, idempotent reconciliation/replay job (scheduled or admin-triggered, with `dry_run`) detects committed source rows without complete evidence and recovers them without duplicating evidence. A queue may be reconsidered in Phase 8 if volume or latency demonstrates the need.
- **Crash windows are explicit.** If the source commits but the receipt is missing, reconciliation scans source tables by watermark. If the process crashes before the dirty marker, the receipt still records the pending/complete state. If evidence is inserted but mastery recomputation fails, the profile is marked stale and recomputed later. Corrections create a new fingerprint and retract the old evidence; deletions/retractions follow D9.
- **Freshness is visible.** Profiles expose `freshness.status`, `last_computed_at`, `dirty_since` and `last_error_code`. Teachers and admins see stale/incomplete labels; students see “Your progress is being updated.”
- **Backfill** is off by default, admin-only, dry-run first, criteria-only and idempotent.
- **Profile snapshots** are bounded to one per student/scope/day plus intervention references. D9 defines the retention lifecycle; final retention periods require privacy approval before a real-school pilot. Indefinite retention is not assumed.
- **Evidence explanations** use the D12 four-part structure: observed performance, evidence sufficiency, missing/limiting evidence and recommended next action. Student wording is non-stigmatizing and shows no raw weights or peer ranking.
- No adaptive tables are added to the bootstrap preload.

### 2.6 Pedagogical status and validation

- `mastery-v1.1` is a **review candidate**, not scientifically validated.
- Thresholds are cumulative upper bounds. The proposed bands are:

  | Band | Mastery range | Additional conditions |
  |---|---|---|
  | Foundation | `M < 0.55` | sufficient evidence (`W >= 2.0`, `C >= 0.30`) |
  | Developing | `0.55 <= M < 0.70` | or `C < 0.55` with sufficient evidence |
  | Proficient | `0.70 <= M < 0.85` | `C >= 0.55` and the high-stakes gate passed |
  | Advanced candidate | `M >= 0.85` | then the advanced gate (evidence count, `C >= 0.75`, Bloom rules) |

  `proficient_below = 0.85` is the upper bound of the proficient band, **not** its entry threshold; proficiency starts at `0.70`. If the owner wants proficiency to start at `0.85`, that is a D5 policy change and Example 1 becomes `developing`; no threshold is changed silently.
- One summative item satisfies the minimum high-stakes count but is weak evidence; confidence can still keep the student at `developing`.
- Teacher-rubric evidence carries a higher method weight (1.2); the source weight depends on whether it is an exercise-based rubric (0.9, combined 1.08) or a teacher-created activity (1.1, combined 1.32). These are provisional policy choices, not empirical findings. **Teacher-attestation weight is capped at 1.0** and is set to 1.0 pending the owner's D5 decision: an attestation has no session or answer key to re-grade, so its only trust anchor is teacher accountability, and it must not outweigh auto-graded or rubric evidence. Raising it requires a recorded D5 disposition and pilot data.
- Four distinct items can satisfy the advanced evidence-count gate, but the advanced confidence gate and Evaluate/Create rubric requirement still apply.
- The same provisional thresholds apply across subjects and age groups in v1; subject/age calibration is a pilot question, not an established result.
- D4/D5 remain provisional. A pilot with teachers and real student evidence must measure one-item proficiency, teacher disagreement, override frequency, time in `summative_pending`, and explanation comprehension before thresholds are treated as validated.

### 2.7 Retention and privacy direction

- D9 defines the lifecycle for enrolled students, class changes, cross-school transfers, leaving the school, account deletion, school closure, and evidence correction/retraction/anonymization.
- Account deletion cascades student-linked adaptive rows; no student-level adaptive data remains. Audit records are minimized but retain the fact of deletion where required.
- Cross-school transfer does not copy adaptive data across tenants; the student starts a new profile in the new school.
- Correction preserves history by retracting the old evidence and inserting a new fingerprint; it does not silently overwrite evidence.
- Student-level anonymization is not a v1 promise. Pseudonymous aggregate retention, if needed, requires separate privacy approval.
- Final retention periods, export/deletion runbooks and school-closure handling require approval before a real-school pilot.

---

## 3. Alternatives considered

### 3.1 Build a separate adaptive-learning module with its own questions, exams, courses and games

**Rejected.** It would duplicate the content and assessment systems, split reporting, create migration and security risk, and violate the explicit constraint not to rebuild existing features.

### 3.2 Tag questions with Bloom only

**Rejected.** It would not provide objectives, evidence, mastery, profiles, pathways or recommendations. The specification requires the complete system, and Bloom alone cannot represent mastery.

### 3.3 Compute mastery in the frontend or LocalStorage

**Rejected.** It cannot be authoritative, reproducible, auditable or tenant-safe. It also violates the existing SaaS architecture and the no-LocalStorage rule.

### 3.4 Let AI assign mastery, levels or pathways

**Rejected.** It would make pedagogical decisions opaque and non-reproducible. AI remains an optional draft assistant with teacher review.

### 3.5 Use a single global student level

**Rejected.** It would stigmatize students, contradict the specification and hide subject/objective-specific needs. Levels are per objective/competency/topic and recomputed.

### 3.6 Backfill all historical data automatically

**Rejected.** Existing results may lack per-question correctness, criteria or mappings. Automatic backfill would fabricate evidence. Backfill is optional and dry-run first.

### 3.7 Require a background queue for v1

**Rejected for v1, with a durable recovery substitute.** The current SQLite deployment has no queue and evidence volume is unknown. Instead of a queue, v1 uses a `LearningSourceIngestion` receipt ledger plus a bounded idempotent reconciliation/replay path. This detects committed sources without evidence, survives crashes before the dirty marker and avoids duplicate evidence. A queue can be added later without changing the evidence contract; Phase 8 must re-evaluate whether volume or latency makes it necessary.

### 3.8 Full-application RTL immediately

**Rejected for v1.** It is a separate product-wide project. The new learning panels deliver Arabic RTL support without destabilizing unrelated pages.

---

## 4. Consequences

### Positive

- Preserves current question, exam, course, game, result, grading and offline behavior.
- Provides a coherent pedagogical model rather than a collection of tags.
- Makes every mastery claim traceable to real evidence and a versioned policy.
- Keeps teachers in control and gives students non-stigmatizing feedback.
- Supports one class with multiple personalized pathways without separate classes.
- Enables incremental delivery with feature flags and rollback by disabling features.
- Keeps AI optional and non-authoritative.

### Negative / costs

- Adds a substantial number of tables and services; SQLite performance and storage must be monitored.
- Teacher workload increases for classification, mapping and pathway creation; bulk tools and AI drafts mitigate but do not eliminate it.
- The high-stakes gate and conservative confidence may leave strong formative students at `developing` until a check is completed.
- Backfill is limited; profiles start empty for old activity unless mappings and per-question data exist.
- No background queue means profiles can be stale until recompute or reconciliation; the UI must show freshness and stale profiles must be visibly labeled.
- Reconciliation adds an operational runbook and monitoring obligation, even though it is simpler than a queue.
- Durable receipts add a table and write path to every evidence-producing source.
- Localization adds translation and RTL maintenance for the new panels; full-app RTL remains unresolved.
- Thresholds are provisional and may need recalibration after pilot.

### Neutral / follow-up

- The policy may evolve to `mastery-v2`; old snapshots remain.
- A school-level policy editor is deferred.
- A group-level recommendation entity is not introduced in v1; per-student recommendations can be grouped for display.
- Unique per-student exams are deferred.
- Retention and privacy controls require D9 direction before Phase 2 and final approval before the real-school pilot.
- Full-app RTL, if required, needs a separate ADR.

---

## 5. Compliance with critical constraints

| Constraint | ADR compliance |
|---|---|
| Do not modify source code | No source code changed by this ADR |
| Do not create migrations | No migration created |
| Do not implement features | No feature implemented |
| Do not use mock data as evidence | Evidence derives only from real persisted sources |
| Preserve existing SaaS architecture | Additive tables, existing tenancy/auth, no second runtime |
| Reuse question/course/exam/exercise/game systems | Explicit reuse; no duplicate engines |
| Do not introduce duplicate systems | Deliberate non-entities documented |
| Do not use LocalStorage as source of truth | API-only authoritative state |
| Do not introduce fake student evidence | Unmapped evidence excluded; no inference |
| What is recorded is not proof and not formal | Recorded ≠ proven ≠ formal; only D13-checked evidence satisfies a gate; D14/attestation/approval are audited designations |
| Do not assign permanent global levels | Per-objective/topic mastery; no global level |
| Bloom is not difficulty | Separate axes and fields |
| Automatic MCQ cannot prove creative/advanced reasoning | Evaluate/Create automatic cap and rubric requirements |
| AI is not the mastery authority | AI drafts only; teacher acceptance |
| Preserve school isolation/authorization | `school_id` everywhere; service checks; tenant tests |
| Wait for explicit approval | This ADR is Proposed, not Accepted |

---

## 6. Approval

This ADR becomes **Accepted** only when the owner records the required gate dispositions. Not every decision must be approved before Phase 1, but every decision must be approved, revised, or explicitly deferred to a named dependent phase with an accountable owner.

> **Status note (2026-11-19).** The owner recorded the §6.1 Phase-1 dispositions below and **explicitly directed that this ADR remain Proposed**, because the Phase 2–8 decisions (D3–D7, D9–D14) are still open and the ADR spans all phases. Recording §6.1 is not, in this instance, a transition to Accepted; the ADR moves to Accepted only on the owner's explicit instruction recorded in §6.5.

### 6.1 Required before Phase 1

1. ~~Decide D1 (label), D2 (objective governance) and D8 (Arabic/French/RTL scope).~~ **Done 2026-11-19:** D1 = “Learning profile”; D2 = school-managed objectives with teacher proposals; D8 = EN/FR/AR learning panels, no full-app RTL.
2. ~~Review the Phase 0 findings in `docs/PHASE0_ARCHITECTURE_REVIEW.md`.~~ **Done 2026-11-19** (findings accepted; D13/D14 added in review).
3. ~~Acknowledge `mastery-v1.1` as a review candidate, not validated science.~~ **Acknowledged 2026-11-19** as an unvalidated candidate.
4. ~~Explicitly authorize Phase 1.~~ **Authorized 2026-11-19 — Phase 1 only.**

### 6.2 Required before Phase 2

1. Decide or explicitly defer D3 (backfill), D7 (games), D10 (receipt/reconciliation), D12 (evidence visibility) and D13 (trust boundary for summative evidence).
2. Approve the D9 retention/privacy **direction** before real evidence is stored.
3. Do not assume indefinite retention.

### 6.3 Required before Phase 3 publishes levels

1. Decide D4 (high-stakes gate), D5 (thresholds/weights), D6 (overrides) and D14 (which formal exams are high-stakes). D4/D5 may be provisionally approved only for fixture tests; D6 is an authority and security decision and must be approved.
2. Final D4/D5 approval is required before a real student sees a level.
3. Approve the pilot validation plan and teacher-reviewed explanation templates.

### 6.4 Required before later phases

- D11 before Phase 5.
- D9 final retention periods and deletion runbook before Phase 8 / the real-school pilot.
- D8 full-app RTL decision and D10 queue re-evaluation before Phase 8.

### 6.5 Transition to Accepted

The owner recorded the §6.1 Phase-1 dispositions on 2026-11-19 and directed that this ADR **remain Proposed**. This ADR becomes **Accepted** only when the owner records that instruction here. The Phase 2–8 gates (D3–D7, D9–D14) remain open; the architecture stays the reference proposal and Phase 1 may proceed on the §6.1 dispositions alone.

| Approval field | Value |
|---|---|
| Owner decision | **Pending** — Phase 1 authorized 2026-11-19; ADR status intentionally left **Proposed** by owner instruction |
| Date | 2026-11-19 (Phase 1 gate dispositions recorded; ADR acceptance not recorded) |
| Accepted / accepted with conditions / rejected | ____________________ |
| D1/D2/D8 Phase 1 dispositions | **Approved 2026-11-19** (D1 = “Learning profile”; D2 = school-managed objectives with teacher proposals; D8 = EN/FR/AR panels, no full-app RTL) |
| `mastery-v1.1` | Acknowledged as an unvalidated review candidate (not validated science) |
| Deferred decisions and dependent phases | D3, D4, D5, D6, D7, D9, D10, D11, D12, D13, D14 → their dependent phases → owner TBD |
| Conditions | Phase 1 only; no Phase 2 evidence storage, no `summative` promotion and no level publication until the Phase 2/3 gates are recorded |
| Signature or confirmation | ____________________ (name/signature line still blank) |

### 6.6 Phase 1 scope notes (2026-11-19)

- AI question-classification suggestions are deferred to Phase 6; Phase 1 creates no `QuestionClassificationSuggestion` table and adds no suggestion endpoints or UI.
- Teacher objective creation is governed by `learning.teacher_objective_creation` (default `false`): off → teacher-created objectives are `proposed` and need admin approval; on → `active`.
- Phase 1 is schema + taxonomy + manual question pedagogy only. No evidence, mastery or pathway tables are created.
- **Permission split (as-built).** `class.learning.read` (read the taxonomy and pedagogy) and `class.learning.classify` (attach criteria to the teacher's own questions and propose objectives) are the two Phase 1 class-scope permissions; approval uses `school.learning.manage`. `class.learning.manage` and `class.learning.assign` are not in the catalog.
- **Master switch (as-built).** `learning.adaptive.enabled` defaults to `false` and is enforced by the `/learning` router on every route except `GET /learning/flags`, returning `403 FEATURE_DISABLED`. `/learning/flags` remains readable so the console can show the disabled state and an administrator can enable the capability; the flag payload is display input, never authorization.
- `Exam.is_high_stakes` is design-only in Phase 1: the column, its migration and its D14 confirmation/audit flow are Phase 2/3 work.

---

## 7. Follow-up actions after acceptance

1. Create the Phase 1 implementation plan from the accepted architecture.
2. Implement only Phase 1 (taxonomy and question pedagogy) under the existing repository/service/route conventions.
3. Add the Bloom seed, taxonomy tables, question pedagogy fields and criteria API/UI.
4. Preserve the existing question create/update contract.
5. Add unit and integration tests before wiring evidence ingestion.
6. Re-review the evidence model against real Phase 1 data before Phase 2.
7. Do not create evidence, mastery or pathway tables until their phases are authorized.