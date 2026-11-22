# WP5 refactor — Adaptive Learning inside the existing Questions tab

**Status:** implementation record for the authorized WP5 refactor (2026-11-21). WP5 only — **Phase 1B
remains unauthorized** and nothing here implements or activates it. **Update 2026-11-21 (owner): WP5 is
accepted** — this document records what was built, and the acceptance record lives in
`docs/PHASE1_PROGRESS.md`; A2 is superseded and preserved there as history.

**Architectural decision (owner):** Adaptive Learning must not live in a separate Learning Console.
The teacher works inside the existing application — the legacy admin app (`admin.html`) whose
**Questions tab** is the question workspace and whose **Subjects tab** owns curriculum organization.

**Principle:** *Subject defines the learning structure. Questions define how that learning is
assessed. Adaptive Learning connects curriculum, assessment evidence and student progress.*

---

## 1. Mapping produced before any change (owner instruction §2)

### 1.1 Existing Questions tab (legacy app — `admin.html` + `questions-management.js`)

| Piece | Where | Notes |
|---|---|---|
| Bank list | `#questions` → `#question-list` table | rendered client-side from the bootstrap mirror (`window.__DI_CONTAINER__.repo`), rows built by `createQuestionRow` |
| Filters | type badge bar (`setMainTypeFilter`), search box, admin-only teacher scope; `filterQuestions()` in `admin-main.js` filters DOM rows by `data-*` attributes, `applyPagination()` paginates 20/page | attribute-driven — new dimensions can hook the same mechanism |
| Row columns | #, Question (with badges + expandable details), Options, Image, Points, Time, Correct Answer, **Used in** (games/tournaments/training/exams chips from `GET /questions/usage`), Actions | "Used in" already covers §F "where it is used" |
| Editor | `#questionFormModal` (`openQuestionFormModal` / `addOrUpdateQuestion`) | fields: text, media, **Subject**, **Module/Lesson (category)**, type radios (7 types), options, answer, points, time, **Difficulty (easy/medium/hard — separate from Bloom)**, explanation |
| Save path | `API.create('questions', …)` / `API.update('questions', id, …)`; mirror updated from the server row | single canonical save path — adaptive writes must ride **after** it |
| Bulk actions | `#bulk-actions-container` (Delete / mobile Edit) when rows are checked | natural home for bulk classification |
| Cross-tab | Category tab name-click opens Questions pre-filtered (`questionsFilterByCategoryName`) | existing pattern for cross-navigation |

### 1.2 Subjects tab (existing — must be respected, not duplicated)

`#subjects` (data-roles admin+teacher): subject pill strip → **Courses & Curriculum Outlines**
(`courses-management.js` — course generator: modules, chapters, lessons) → **Categories** nested per
subject (`category-management.js` `SubjectsManagement`). The Subject tab already owns curriculum
structure and content organization. Phase 1 introduced **no** curriculum entities in it, and this
refactor adds none: objectives/competencies remain the WP1–WP4 taxonomy (`learning_objectives`,
`competencies`, …), and programmes/versions remain **Phase 1B** (not authorized, not built).

### 1.3 Existing adaptive-learning backend (WP1–WP4 — reused, zero new endpoints)

| Capability | Endpoint | Guard |
|---|---|---|
| Master switch + teacher-creation flag | `GET /learning/flags` | read permissions |
| Bloom catalog (6 dimensions, EN/FR/AR) | `GET /learning/bloom` | read |
| Objectives (official/local, status) | `GET/POST /learning/objectives`, `PATCH …/:id`, approve/reject (admin) | read / write / manage |
| Objective → its questions | `GET /learning/objectives/:id/questions` | read |
| Competencies + objective links + prerequisites | `/learning/competencies…`, `/learning/objectives/:id/competencies|prerequisites` | read / manage |
| Question pedagogy (the criteria set) | `GET/PUT/DELETE /learning/questions/:id/pedagogy`, `POST …/criteria`, `POST …/recompute` (admin) | read / write / manage |
| Question list filters | `GET /questions?pedagogy_status=…&primary_bloom_dimension_id=…&ids=…` | existing route |
| Derived caches | `Question.pedagogy_status`, `Question.primary_bloom_dimension_id` | server-derived on every pedagogy write |

Every learning route is gated server-side by `learning.adaptive.enabled` (403 `FEATURE_DISABLED`)
plus the existing permission model. **Nothing here changes permissions, governance rules or APIs.**

### 1.4 Current Learning Console features (SPA — the implementation being refactored)

| Console feature | Verdict | Destination |
|---|---|---|
| Learning hub (KPI cards + admin enable toggle) | **Relocate/Retain** | Admin enable toggle stays with the admin console (governance); KPI cards removed — they duplicated counts the Questions tab now shows contextually |
| Pedagogy questions page (list + filters + classify) | **Integrate** | Questions tab (list badges, filters, editor section, row action, per-question context) |
| Criteria editor modal | **Integrate** | Questions tab row action + advanced editor |
| Bulk classify | **Integrate** | Questions tab bulk bar |
| Taxonomy page (objectives/competencies/proposals/prerequisites) | **Retain internally** | Administrative governance — stays in the admin console, teacher-facing classification use replaced by the Questions tab |
| Label dictionary + RTL helper (`labels.js`) | **Integrate** | carried into the Questions tab module |
| Flags client (`flags.js`) | **Integrate** | carried into the Questions tab module |
| AI suggestions | **Defer** | Phase 6 (recorded in Phase 1: no suggestion table/endpoints exist; building one now would be a new capability outside WP5 scope) |

**Redundancy result:** the console no longer offers a *teacher question-classification* workflow; the
Questions tab is the single place teachers classify questions. No competing interface remains.

---

## 2. Where each capability landed (owner brief §3 → implementation)

| Brief capability | Location in the existing UI |
|---|---|
| A. Creation/editing metadata (objective, competency, Bloom, difficulty kept separate, prerequisites, programme/subject context) | collapsible **Learning alignment** section in the existing `#questionFormModal` (progressive disclosure, entirely optional); difficulty stays the existing field; subject/module stay the existing fields; prerequisite management stays objective-side (taxonomy service), not per-question |
| B. List & overview | badges (status + Bloom) beside each question; **Adaptive filters** (status / Bloom / objective-or-unaligned) hooking the existing `filterQuestions()` pipeline; no new columns table-wide |
| C. Objective/competency management view | **Learning coverage** panel in the Questions tab: objectives of the teacher's authorized subjects, question counts, unaligned-objective and unaligned-question identification, objective→filter cross-links; objective/competency *governance* (CRUD, proposals, links, prerequisites) stays administrative |
| D. Coverage & quality | same panel: no-question objectives, single-Bloom concentration, missing metadata counts; labelled **"questions associated"** — actual association, never a mastery claim |
| E. AI assistance | **Deferred to Phase 6** with rationale (see §1.4) |
| F. Individual question context | expanded row details gain a lazy-loaded **Learning alignment** block (objective, competency, Bloom, difficulty, review stamp); "where used" already exists as the *Used in* column |

---

## 3. Governance constraints honoured (owner brief §7)

- Bloom ≠ difficulty (separate fields/selects, separate catalog).
- No mastery claims anywhere: coverage numbers count *associations*.
- Official objectives immutable; teachers select existing objectives, never edit them here.
- No new hierarchy, no new data model, no new endpoint, no schema/migration change.
- Flags stay default-off: with `learning.adaptive.enabled` off the Questions tab renders exactly as
  before (the integration fails closed and draws nothing).
- Permissions unchanged: teacher classify = own questions (`class.learning.classify`), admin = any
  (`school.learning.manage`), enforced server-side as before; the client only hides what the server
  would refuse.

## 4. Console disposition summary

- Removed from the SPA: the pedagogy question-classification page and its bulk action (integrated),
  the teacher auto-redirect into `#/learning` (teachers work in the app), hub KPI cards.
- Kept in the SPA (administrative): Learning section entry point for administrators — objective/
  competency governance, proposal queue, prerequisites, the master-switch toggle.
- Backend: **unchanged** (routes, services, permissions, schema — zero modifications).
