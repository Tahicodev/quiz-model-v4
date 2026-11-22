/**
 * tests/integration/learning.dataset-completeness.test.js
 *
 * Defect B — school-wide loaders must never silently truncate at 1,000 rows.
 *
 * These tests run against a REAL database, with real datasets larger than the
 * 1,000-row page size, and prove the three failure modes the fix removes:
 *
 *   • A prerequisite cycle whose closing edge sorts beyond the first page is
 *     still REJECTED (before the fix it was accepted — the edge was invisible).
 *   • Competency and objective labels beyond the first page still resolve in
 *     the pedagogy view (before the fix they came back null).
 *   • `fetchAllRows` reads a real 1,000-row and >1,000-row dataset completely.
 *
 * The critical rows are positioned by ID (the loaders page with
 * `orderBy: 'id', direction: 'asc'`), so page membership is deterministic and
 * never depends on incidental insertion order.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { PrismaRepository } from '../../src/backend/infrastructure/PrismaRepository.js';
import { LearningTaxonomyService } from '../../src/backend/services/learning/LearningTaxonomyService.js';
import { QuestionPedagogyService } from '../../src/backend/services/learning/QuestionPedagogyService.js';
import { findCycle } from '../../src/shared/learning/prerequisite-validator.js';
import { fetchAllRows } from '../../src/shared/pagination.js';
import { BLOOM_DIMENSIONS, toBloomRow } from '../../src/shared/learning/bloomCatalog.js';

const SCHOOL = 'school-test';
const ADMIN = 'user-test-admin';
const SUBJECT = 'pg-co-subject';

const SCHOOL_EXACT = 'pg-exact-1000';
const SCHOOL_EXACT_SUBJECT = 'pg-exact-subject';

const CYCLE_TARGET = 'cyc-target'; // objective that would receive a prerequisite
const CYCLE_SOURCE = 'cyc-source'; // the proposed prerequisite
const FILLER_EDGES = 1000; // fills page 1 by id order, hiding the closing edge
const CRITICAL_EDGE_ID = 'edge-zzz-critical'; // sorts after every filler id

const FILLER_COMPETENCIES = 1204; // + the target = 1205, the target on page 2
const COMPETENCY_TARGET = 'cmp-zzz';
const LABEL_OBJECTIVE = 'zzz-obj'; // sorts after every other objective id
const LABEL_OBJECTIVE_CODE = 'CO-LABEL';
const QUESTION = 'pg-co-question';

const admin = { id: ADMIN, role: 'admin', school_id: SCHOOL };

const objectiveRow = (id, schoolId, subjectId, code) => ({
  id,
  school_id: schoolId,
  subject_id: subjectId,
  code,
  statement: `Objective ${id}`,
  status: 'active',
  created_by: ADMIN,
});

let prisma;
let repo;
let taxonomy;
let pedagogy;

beforeAll(async () => {
  ({ prisma } = await setupTestDb());

  // Bloom catalog is seeded at boot in production; seed it for the test DB.
  await prisma.bloomDimension.createMany({ data: BLOOM_DIMENSIONS.map(toBloomRow) });

  repo = new PrismaRepository(prisma);
  taxonomy = new LearningTaxonomyService(repo, { auditSvc: null });
  pedagogy = new QuestionPedagogyService(repo, { auditSvc: null });

  await prisma.subject.create({
    data: { id: SUBJECT, school_id: SCHOOL, created_by: ADMIN, name: 'Completeness Subject' },
  });

  // ── Prerequisite fixture: an acyclic filler chain + a closing edge ────────
  // Filler edges fill page 1 by id ('edge-fill-*' < 'edge-zzz-critical'); the
  // single edge that would make `CYCLE_TARGET → CYCLE_SOURCE` a cycle is on
  // page 2. Objective ids mirror the chain so every edge has both endpoints.
  const fillerObjectiveIds = Array.from(
    { length: FILLER_EDGES + 1 },
    (_, i) => `cyc-fill-${String(i).padStart(4, '0')}`,
  );
  await prisma.learningObjective.createMany({
    data: [
      ...fillerObjectiveIds.map((id, i) => objectiveRow(id, SCHOOL, SUBJECT, `CO-${i}`)),
      objectiveRow(CYCLE_TARGET, SCHOOL, SUBJECT, 'CO-CYCLE-TARGET'),
      objectiveRow(CYCLE_SOURCE, SCHOOL, SUBJECT, 'CO-CYCLE-SOURCE'),
      objectiveRow(LABEL_OBJECTIVE, SCHOOL, SUBJECT, LABEL_OBJECTIVE_CODE),
    ],
  });

  const fillerEdgeRows = Array.from({ length: FILLER_EDGES }, (_, i) => ({
    id: `edge-fill-${String(i).padStart(4, '0')}`,
    school_id: SCHOOL,
    objective_id: fillerObjectiveIds[i],
    prerequisite_objective_id: fillerObjectiveIds[i + 1],
    created_by: ADMIN,
  }));
  await prisma.learningPrerequisite.createMany({
    data: [
      ...fillerEdgeRows,
      // The critical edge: CYCLE_SOURCE requires CYCLE_TARGET, so proposing
      // CYCLE_TARGET → CYCLE_SOURCE closes a cycle — but only if this edge is
      // loaded.
      {
        id: CRITICAL_EDGE_ID,
        school_id: SCHOOL,
        objective_id: CYCLE_SOURCE,
        prerequisite_objective_id: CYCLE_TARGET,
        created_by: ADMIN,
      },
    ],
  });

  // ── Competency fixture: 1,205 competencies, the target on page 2 ─────────
  const fillerCompetencyIds = Array.from(
    { length: FILLER_COMPETENCIES },
    (_, i) => `cmp-${String(i).padStart(4, '0')}`,
  );
  await prisma.competency.createMany({
    data: [...fillerCompetencyIds, COMPETENCY_TARGET].map((id) => ({
      id,
      school_id: SCHOOL,
      code: `CMP-${id}`,
      name: `Competency ${id}`,
      kind: 'competency',
      status: 'active',
      created_by: ADMIN,
    })),
  });

  // The label objective is linked to the page-2 competency and carries a
  // criterion, so both pedagogy label maps are exercised past the boundary.
  await taxonomy.linkCompetency(admin, LABEL_OBJECTIVE, COMPETENCY_TARGET, { weight: 1 });
  await prisma.question.create({
    data: {
      id: QUESTION,
      school_id: SCHOOL,
      type: 'mcq',
      text: 'Completeness probe',
      options_json: '["a","b"]',
      answer: 'a',
      created_by: ADMIN,
    },
  });
  await pedagogy.setCriteria(admin, QUESTION, [
    {
      objective_id: LABEL_OBJECTIVE,
      competency_id: COMPETENCY_TARGET,
      bloom_dimension_id: 'apply',
      criterion_key: 'main',
      weight: 1,
    },
  ]);

  // ── A second school with EXACTLY 1,000 competencies ──────────────────────
  await prisma.school.create({ data: { id: SCHOOL_EXACT, name: 'Exact 1000', slug: 'exact-1000' } });
  await prisma.subject.create({
    data: { id: SCHOOL_EXACT_SUBJECT, school_id: SCHOOL_EXACT, created_by: ADMIN, name: 'Exact Subject' },
  });
  await prisma.competency.createMany({
    data: Array.from({ length: 1000 }, (_, i) => ({
      id: `exact-${String(i).padStart(4, '0')}`,
      school_id: SCHOOL_EXACT,
      code: `EXACT-${String(i).padStart(4, '0')}`,
      name: `Exact competency ${i}`,
      kind: 'competency',
      status: 'active',
      created_by: ADMIN,
    })),
  });
});

afterAll(async () => {
  await teardownTestDb();
});

// ─── 1. Prerequisite cycle beyond the first page ────────────────────────────

describe('prerequisite cycle detection past the page boundary', () => {
  it('rejects the cycle and proves the closing edge sits beyond page 1', async () => {
    const allEdges = await prisma.learningPrerequisite.findMany({
      where: { school_id: SCHOOL },
      orderBy: { id: 'asc' },
    });
    expect(allEdges).toHaveLength(FILLER_EDGES + 1);
    // Deterministic placement: the closing edge is NOT in the first 1,000 rows.
    expect(allEdges.slice(0, 1000).some((e) => e.id === CRITICAL_EDGE_ID)).toBe(false);
    expect(allEdges[1000].id).toBe(CRITICAL_EDGE_ID);

    // What a single capped page saw: no cycle → the write would have been accepted.
    expect(findCycle(allEdges.slice(0, 1000), CYCLE_TARGET, CYCLE_SOURCE)).toBeNull();
    // What the complete dataset sees: a cycle.
    expect(findCycle(allEdges, CYCLE_TARGET, CYCLE_SOURCE)).not.toBeNull();

    // The service must now reject it, naming the cycle.
    const failure = await taxonomy
      .addPrerequisite(admin, CYCLE_TARGET, CYCLE_SOURCE)
      .then(() => null, (error) => error);
    expect(failure).not.toBeNull();
    expect(failure.code).toBe('VALIDATION_ERROR');
    expect(failure.fields?.prerequisite_objective_id?.[0]).toMatch(/cycle/i);
  });

  it('still accepts an acyclic prerequisite (regression)', async () => {
    const created = await taxonomy.addPrerequisite(admin, LABEL_OBJECTIVE, CYCLE_TARGET);
    expect(created.objective_id).toBe(LABEL_OBJECTIVE);
    expect(created.prerequisite_objective_id).toBe(CYCLE_TARGET);
  });
});

// ─── 2. Competency / objective labels beyond the first page ─────────────────

describe('pedagogy labels past the page boundary', () => {
  it('resolves a competency link whose competency is beyond the first 1,000', async () => {
    const links = await taxonomy.listObjectiveCompetencies(admin, LABEL_OBJECTIVE);
    expect(links).toHaveLength(1);
    // The label is populated, not null-then-dropped.
    expect(links[0].competency_id).toBe(COMPETENCY_TARGET);
    expect(links[0].code).toBe(`CMP-${COMPETENCY_TARGET}`);
    expect(links[0].name).toBe(`Competency ${COMPETENCY_TARGET}`);
  });

  it('returns an empty list for an objective with no competency links', async () => {
    // Exercises the empty-page path of the paginated link loader.
    const links = await taxonomy.listObjectiveCompetencies(admin, CYCLE_TARGET);
    expect(links).toEqual([]);
  });

  it('resolves objective and competency labels in the question pedagogy view', async () => {
    const view = await pedagogy.getQuestionPedagogy(admin, QUESTION);
    expect(view.criteria).toHaveLength(1);
    const criterion = view.criteria[0];
    expect(criterion.objective_code).toBe(LABEL_OBJECTIVE_CODE);
    expect(criterion.objective_statement).toBe(`Objective ${LABEL_OBJECTIVE}`);
    expect(criterion.competency_code).toBe(`CMP-${COMPETENCY_TARGET}`);
    expect(criterion.bloom_name).toBeTruthy();
  });
});

// ─── 3. Real 1,000-row and >1,000-row retrieval ─────────────────────────────

describe('fetchAllRows against the real database', () => {
  it('retrieves exactly 1,000 rows without false truncation', async () => {
    const rows = await fetchAllRows(repo, 'competencies', {
      filters: { school_id: SCHOOL_EXACT },
      orderBy: 'id',
      direction: 'asc',
    });
    expect(rows).toHaveLength(1000);
  });

  it('retrieves more than 1,000 rows completely', async () => {
    const rows = await fetchAllRows(repo, 'competencies', {
      filters: { school_id: SCHOOL },
      orderBy: 'id',
      direction: 'asc',
    });
    expect(rows).toHaveLength(FILLER_COMPETENCIES + 1); // 1205
    expect(rows.some((r) => r.id === COMPETENCY_TARGET)).toBe(true);
  });

  it('retrieves an empty dataset', async () => {
    const rows = await fetchAllRows(repo, 'competencies', {
      filters: { school_id: 'no-such-school' },
      orderBy: 'id',
      direction: 'asc',
    });
    expect(rows).toEqual([]);
  });
});
