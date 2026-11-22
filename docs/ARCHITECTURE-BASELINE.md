# Adaptive Learning — Architecture Baseline (Baseline of Record)

**Status:** **BASELINE OF RECORD — consolidated 2026-11-21; reconciled to the owner's consolidated decision
record the same day.** This is the single authoritative index of
the adaptive-learning architecture: what governs, what is decided, what is implemented, and which
documents are current, historical or superseded.

**This document approves nothing and authorizes no implementation.** It records authority and status only.
Phase 1B remains **unauthorized**; ADR-0001 remains **Proposed**. The substantive **D15** gate is
**decided** (substantively approved 2026-11-21, owner decision F1 — a decision, not implementation
authorization); the full **G4** wording is **adopted** (owner decision E1, 2026-11-21), satisfying U15's
wording condition; **U8 is closed**; the document hierarchy is ratified with owner-provenance safeguards
(§2.1). **Update 2026-11-21 (owner): WP5 is accepted** (the refactored Questions-tab integration,
superseding A2, which is preserved as history) **and WP7 is accepted**; Phase 1 is ready for formal
closure review subject to record reconciliation and safe preservation of the accepted deliverables.
**Update 2026-11-22 (owner): Phase 1 is FORMALLY CLOSED.** The corrected snapshot commit `d22d22e` on
`feature/adaptive-learning-phase1` (pushed to `origin/feature/adaptive-learning-phase1`, approved
45-file manifest) is the authoritative Phase 1 snapshot. Phase 1B remains **unauthorized**; ADR-0001
remains **Proposed**; U6 remains **deferred**.

**Date:** 2026-11-21 · **Branch (worktree):** `feature/adaptive-learning-phase1`

---

## 1. How to read this baseline

- **Authority** answers "if two documents disagree, which wins?" (§2).
- **Decision status** answers "what has the owner actually decided?" (§3) — it never treats a
  recommendation, a draft clause, or an appearance in an architecture document as an approval.
- **Content map** answers "where is each architectural area specified?" (§4).
- **Implementation status** answers "what exists in code today?" (§5) — kept strictly separate from
  decisions.
- **Supersession** answers "which documents are current, historical or obsolete?" (§6).
- **Remaining gates** answers "what must close before Phase 1B?" (§7).

Rule of precedence when documents conflict: the **decision register** is normative for phase gates; the
**frozen Phase 1 spec** is normative for Phase 1 scope; the **progress log** is normative for Phase 1
status; everything else is design, rationale or history.

---

## 2. Authority hierarchy

| Document | Authority | Current status |
|---|---|---|
| `docs/PHASE0_DECISION_REGISTER.md` | **Normative for adaptive phase gates** (D1–D15, approval record, deferral rules) | Partially approved — Phase 1 gate + D15 (substantive approval 2026-11-21, F1) |
| `docs/phase 01.md` | **Frozen Phase 1 spec** — scope authority for Phase 1 | Frozen; not modified |
| `docs/PHASE1_PROGRESS.md` | **Live Phase 1 status record** — status authority for Phase 1 | Live log; current through 2026-11-21 |
| `docs/DRAFT-PROGRAMME-ARCHITECTURE-REVISION.md` | **Current architecture content** for programmes/objective versioning/coverage; §19–§20 record owner dispositions; §§1–§18 are proposals | Draft; owner dispositions recorded (§19–§20); non-decided parts remain proposals |
| `docs/ARCHITECTURE-BASELINE.md` (this file) | **Baseline of record / index** | Current |
| `docs/ADR-0001-ADAPTIVE-LEARNING-FOUNDATION.md` | Architecture Decision Record | **Proposed** — not accepted |
| `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` | Phase 0 architecture **proposal** | Historical snapshot (2026-11-19); superseded for status |
| `docs/PHASE0_ARCHITECTURE_REVIEW.md` | Phase 0 **review report** | Historical snapshot (2026-11-19) |
| `docs/OWNER-DECISION-REVIEW.md` | Owner decision **worksheet + §9 answer summary** | Historical snapshot (2026-11-20); answers now in draft §19; updates in its §9.1–§9.2 |
| `docs/PHASE1_COMPLETION_REPORT.md` | Phase 1 **completion report** (WP7) | Snapshot (2026-11-20); addendum 2026-11-21 — WP5/WP7 accepted |
| `docs/DEFECT-A-B-FIX-PROPOSAL.md` | Defect A/B **proposal** | Superseded as status (A/B closed); retained as rationale |
| `docs/PHASE5_REPORT.md` | **Platform** Phase 5 (offline/SaaS/security) — not adaptive | Historical platform report; "Phase 5" here ≠ adaptive Phase 5 |
| `complete_adaptive_learning _system.md` | Original **vision** input | Historical input |

### 2.1 Owner-provenance safeguards (ratified 2026-11-21 — owner decision I1)

The owner ratified the document hierarchy above with the following mandatory safeguards:

- Explicit owner decisions made in ChatGPT conversations are valid owner-decision provenance.
- An agent must never infer owner approval from implementation authorization, continuation instructions
  ("continue"), silence, test completion or its own documentation.
- Agent-authored statements claiming owner approval do not independently establish that approval.
- An explicit later owner decision takes precedence over an earlier agent interpretation.
- This baseline cannot independently create, modify or supersede owner decisions or phase gates — it is a
  navigation and index document only.
- Any unresolved provenance must be labelled accurately rather than presented as an established owner
  decision.

These safeguards are why the register's approval record and `docs/PHASE1_PROGRESS.md` cite this section
when recording owner decisions provenance from explicit conversation decisions.

---

## 3. Current decision status (consolidated)

### 3.1 Decision register (D1–D15)

| # | Decision | Status |
|---|---|---|
| D1 | User-facing profile label | **Approved 2026-11-19 (Phase 1 gate)** |
| D2 | Who governs learning objectives | **Approved 2026-11-19 (Phase 1 gate)** |
| D3 | Historical result backfill | Recommended, not approved (Phase 2) |
| D4 | High-stakes gate | Recommended, not approved (Phase 3) |
| D5 | Mastery thresholds/weights (`mastery-v1.1`) | Recommended, not approved; `mastery-v1.1` is an unvalidated review candidate (Phase 3) |
| D6 | Who may override levels | Recommended, not approved (Phase 3) |
| D7 | Whether games contribute to mastery | Recommended, not approved (Phase 2) |
| D8 | Arabic RTL scope | **Approved 2026-11-19 (Phase 1 gate)** |
| D9 | Evidence/snapshot retention | Recommended, not approved (Phase 2 direction; Phase 8 final) |
| D10 | Background job queue | Recommended, not approved (Phase 2) |
| D11 | Per-student personalized assessment | Recommended, not approved (Phase 5) |
| D12 | Teacher visibility of evidence | Recommended, not approved (Phase 2) |
| D13 | Trust boundary for summative evidence | Recommended, not approved (Phase 2) |
| D14 | Which formal exams are high-stakes | Recommended, not approved (Phase 3) |
| D15 | Programme governance and objective versioning | **Substantively approved 2026-11-21 (owner decision F1)** — the recommended default is accepted unchanged (immutable published official objectives; explicit per-class adoption, no automatic moves; server-side-scoped imports; audited governance setting). Wording acceptance (also 2026-11-21) is recorded **separately** from the substantive approval. This is a decision only: **Phase 1B implementation remains unauthorized** and requires a separate explicit owner authorization. |

### 3.2 Architecture decisions (U1–U15, G1–G6)

| # | Status |
|---|---|
| U1–U5 | Approved (2026-11-20) |
| U6 | **Deferred** — console placement; blocks nothing |
| U7 | Approved — option B (insert Phase 1B; no renumbering) |
| U8 | **Closed 2026-11-21** — D15 substantively approved (F1) and recorded in the register; closure records the underlying decision, not a label change |
| U9 | Approved — local objectives private by default |
| U10 | Approved with clarifications (counting policy; normative once Phase 1B is authorized) |
| U11 | Approved — import trust mode-dependent, audited |
| U12 | Approved — legacy criteria never auto-confirmed; migration starts `unreviewed` |
| U13 | Approved — hard-block cross-subject mappings; quarantine/report existing rows |
| U14 | Approved — relationship guard + confirmation-time snapshot + append-only event stream |
| U15 | **Approved in principle — now decided**: archive subjects/questions; the complete G4 wording was **adopted 2026-11-21 (E1)**, satisfying U15's outstanding wording condition |
| G1 | Confirmed — U4's two alternatives are equivalent |
| G2 | Approved; **wording accepted 2026-11-21** (event stream authoritative; F1 extension for question existence) |
| G3 | Approved; **wording accepted 2026-11-21** (archived subjects retain historical coverage; current coverage marks `subject_archived`) |
| G4 | **Required** → **owner choices finalized and complete wording ADOPTED 2026-11-21 (E1)** — decision only; see §3.3 |
| G6 | Approved — §12 enumeration correction applied |

### 3.3 G4 (question archival) — choices finalized and wording adopted (E1, 2026-11-21)

Owner choices finalized 2026-11-21 (draft §20.2/§20.6):

- **Authority:** teachers may archive/restore their **own** questions (`class.learning.classify`); admins
  may act on **any** question (`school.learning.manage`). No new permission string.
- **Routes (proposed API-contract additions):** `POST /api/v1/questions/:id/archive` and `/restore`.
  `DELETE /api/v1/questions/:id` refuses a protected delete with **HTTP 409**
  (`{ success: false, error: { code: 'CONFLICT', message } }`).
- **Audit vs history:** the audit row is written in the **same transaction** as the state change; the
  `archive`/`restore` **lifecycle events** used for historical reconstruction go to the **authoritative
  event stream**, not only to `audit_logs`.
- **Blocking scope:** archival is blocked while the question is linked to an **`EXAM_STATUS.ACTIVE`** exam,
  **including active training exams**. `draft`/`archived` exams do **not** block even when
  `Exam.is_training = true`; **games/tournaments do not block**. The guard is status-based
  (`status === ACTIVE`), not `status === ACTIVE || is_training`.
- **Hard-delete refusal:** absolute (admins included) for any question that **ever** contributed a
  confirmed mapping. **Not enforceable today** — it is co-packaged with the `CriterionReviewEvent`
  evidence stream and the U12 reliability states; **T53 is not satisfied** until that implementation
  exists. No interim refusal based on criterion-row existence is adopted.
- **Additive/inert until dependencies ship.** Restore does not reinstate exam/game/tournament associations.
- **Status:** choices finalized and the **complete wording adopted (owner decision E1, 2026-11-21)**,
  incorporating the confirmed archival guard (C1: active exams — summative or training — block;
  draft/archived exams, games and tournaments do not; status-based, not the training flag), restore
  without automatic reassociation (D1) and the preserved permission model (D1). Adoption closes U15's
  wording condition as a decision only and **authorizes no code**.

---

## 4. Architecture content map

| Area | Where specified | State |
|---|---|---|
| Phase 1 scope (taxonomy, question pedagogy) | `docs/phase 01.md` (frozen spec); `docs/PHASE1_PROGRESS.md` | Implemented (default-off flags) |
| Programmes, objective identity/versioning, ownership, imports | Draft §§2–§8 (P1–P9), §5A (P10) | Proposed; D15 decided (substantive approval 2026-11-21) |
| Class-programme assignment (historized) | Draft §5B (P12) | Proposed |
| Coverage (defined / question-mapped / learning-evidence) | Draft §6 (P5) | Proposed; U10/U14/G2/G3 decided |
| Historical reconstruction / criterion review events | Draft §6, §10A (P11), §16.3 (T1–T55) | Proposed; U12/U13/U14 decided |
| Question archival (G4) | Draft §20.2 | Wording adopted (E1, 2026-11-21); implementation unauthorized |
| Evidence, attempts, summative trust (Phase 2) | Register D3/D7/D9/D10/D12/D13; architecture §E.2 | Not started; gates open |
| Mastery/profiles (Phase 3) | Register D4/D5/D6/D14 | Not started; gates open |
| Pathways/groups/assignments (Phase 5) | Register D11 | Not started |
| Roadmap naming / Phase 1B insertion | Draft §13.11 | U7 approved (option B); 7-phase rename is a target, not adopted |
| Platform offline/SaaS/security | `docs/PHASE5_REPORT.md` | Historical platform work; "Phase 5" ≠ adaptive Phase 5 |

---

## 5. Implementation status

### 5.1 Implemented and closed

- **Phase 1** — taxonomy + manual question pedagogy, behind default-off flags
  (`learning.adaptive.enabled` + admin toggle) on `feature/adaptive-learning-phase1`. **WP1–WP7 all
  accepted by the owner** (WP5 accepted 2026-11-21 — the refactored Questions-tab integration, superseding
  A2; WP7 accepted the same day; the pre-WP7 fix set was part of the accepted result). **Phase 1 formally
  closed by owner decision 2026-11-22**; the corrected snapshot commit `d22d22e` (pushed to
  `origin/feature/adaptive-learning-phase1`, approved 45-file manifest) is the authoritative Phase 1
  snapshot.
- **Defect A** — non-transactional `setCriteria` fixed: `runInTransaction(fn)` + `deleteMany` on the
  repository; `setCriteria`/`clearCriteria` atomic; repository without transaction support is refused.
- **Defect B** — silent 1,000-row truncation replaced by a complete pagination helper
  (`src/shared/pagination.js`, `fetchAllRows`) used by the competency/prerequisite/objective loaders;
  bulk restore now reports dropped rows. **B2 (targeted graph optimization) deferred**; **B4**
  (`#schoolObjectives` removal) done, confirmed unused.

### 5.2 Not implemented

- Phase 1B (programmes, objective versioning, class assignments, coverage).
- Question archival (G4) — no `Question.status`/`archived_at`, no `CriterionReviewEvent`, no
  archive/restore routes; hard-delete protection not enforceable.
- Phase 2–8 (evidence, mastery, profiles, pathways, recommendations, analytics, hardening).

### 5.3 Database

- The **live development database has not been migrated** by this work. The Phase 1 migration was applied
  only to a **copy** of a real snapshot and to throwaway test databases. No DB reset/recreation occurred.
  *(Update 2026-11-21: superseded — the owner applied migration `20261119000000_learning_taxonomy` to the
  live `prisma/dev.db` on 2026-11-21; reported in-session at the time (23 migrations, learning tables
  live, Bloom seed present, `learning.adaptive.enabled` set). No fresh database verification was performed
  during the final reconciliation — database access was unavailable; recorded from that previously
  verified evidence only.)*

### 5.4 Open non-decision items

- **WP5 acceptance** — **resolved 2026-11-21: accepted by the owner** (Questions-tab integration;
supersedes A2, preserved as history).
- **Native Arabic/French review** of AR/FR strings — open (WP7 localization gate).
- **Phase-numbering collision** — platform "Phase 5" vs adaptive "Phase 5"; disambiguation (prefix platform
  docs) is recommended but not adopted; the 7-phase rename is a recorded target, not approved.

---

## 6. Superseded, obsolete and historical documents

| Document | Classification | Notes |
|---|---|---|
| `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` | **Historical Phase 0 proposal** | Header (branch `feature/kid-games`, 14 decisions, "no source code changed") is a 2026-11-19 snapshot; superseded for status by this baseline and the register. |
| `docs/PHASE0_ARCHITECTURE_REVIEW.md` | **Historical review report** | 2026-11-19; led to the Phase 1 gate. |
| `docs/OWNER-DECISION-REVIEW.md` | **Historical worksheet** | Owner answers now recorded in draft §19; §9 is a summary. |
| `docs/PHASE1_COMPLETION_REPORT.md` | **Snapshot report** | 2026-11-20; addendum 2026-11-21 (WP5/WP7 accepted). |
| `docs/DEFECT-A-B-FIX-PROPOSAL.md` | **Superseded as status; retained as rationale** | A/B now closed. |
| `docs/PHASE5_REPORT.md` | **Platform (non-adaptive) historical** | Not part of the adaptive roadmap. |
| `complete_adaptive_learning _system.md` | **Historical vision input** | Original feature vision. |

No document is deleted. Each is preserved for traceability and labeled above.

---

## 7. Gates remaining before Phase 1B

1. ~~Substantive D15 approval~~ — **satisfied 2026-11-21 (owner decision F1)**: the recommended default is
   approved unchanged and recorded in the register. This closes the gate *as a decision*; it is **not**
   implementation authorization.
2. ~~Formal adoption of the full G4 wording~~ — **satisfied 2026-11-21 (owner decision E1)**; U15's
   wording condition is recorded as satisfied (decision only, no code).
3. **Owner authorization for Phase 1B implementation** — a separate, explicit authorization. **This is the
   only remaining gate; it has not been given (owner decision J, 2026-11-21).**

U6 is deferred and blocks nothing. No other decision blocks Phase 1B.

---

## 8. Non-authorization

Nothing in this baseline authorizes code, schema, migration, service, route, frontend, test, or database
change. Phase 1B, Phase 2–8, question archival, and coverage remain unimplemented and unauthorized.
ADR-0001 remains **Proposed**. Any implementation requires a separate, explicit owner authorization.