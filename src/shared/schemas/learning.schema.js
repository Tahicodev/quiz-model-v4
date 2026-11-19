/**
 * src/shared/schemas/learning.schema.js
 *
 * Boundary validation for the Phase 1 learning taxonomy and question pedagogy
 * routes. These only check SHAPE and coarse ranges — the semantic rules
 * (weights sum to 1, acyclic prerequisites, single primary competency, tenant
 * ownership) stay in the services/validators so they cannot be bypassed by a
 * different caller.
 */

import { z } from 'zod';

export const OBJECTIVE_STATUSES = ['proposed', 'active', 'rejected', 'archived'];
export const COMPETENCY_STATUSES = ['active', 'archived'];
export const COMPETENCY_KINDS = ['competency', 'skill', 'domain'];
export const PREREQUISITE_STRENGTHS = ['required', 'recommended'];
export const CRITERION_SOURCES = ['manual', 'imported'];
export const CRITERION_REVIEW_STATUSES = ['approved', 'needs_review'];

const id = z.string().trim().min(1).max(64);
/** Legacy/blank optional FK: accept null, "" or a real id. */
const optionalId = z.union([id, z.literal(''), z.null()]).optional();

// ── Objectives ──────────────────────────────────────────────────────────────

export const ObjectiveCreateSchema = z.object({
  subject_id: id,
  code: z.string().trim().min(1).max(60),
  statement: z.string().trim().min(1).max(1000),
  description: z.string().max(4000).nullish(),
  category_id: optionalId,
  parent_id: optionalId,
  primary_bloom_dimension_id: optionalId,
  order_index: z.coerce.number().int().min(0).optional(),
});

/**
 * A partial edit. `status` is accepted so the wire format matches the spec
 * (`PATCH status='archived'`); the route only honours `archived` and routes it
 * to the archive use-case. Any other status value is rejected there.
 */
export const ObjectiveUpdateSchema = ObjectiveCreateSchema.partial().extend({
  status: z.string().trim().optional(),
});

export const ObjectiveFilterSchema = z.object({
  status: z.enum(OBJECTIVE_STATUSES).optional(),
  subject_id: z.string().optional(),
  category_id: z.string().optional(),
  parent_id: z.string().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ObjectiveApproveSchema = z.object({
  note: z.string().trim().max(2000).nullish(),
});

export const ObjectiveRejectSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});

// ── Competencies ────────────────────────────────────────────────────────────

export const CompetencyCreateSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullish(),
  subject_id: optionalId,
  parent_id: optionalId,
  kind: z.enum(COMPETENCY_KINDS).optional(),
});

export const CompetencyUpdateSchema = CompetencyCreateSchema.partial();

export const CompetencyFilterSchema = z.object({
  subject_id: z.string().optional(),
  kind: z.enum(COMPETENCY_KINDS).optional(),
  status: z.enum(COMPETENCY_STATUSES).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Objective ↔ competency links ────────────────────────────────────────────

export const CompetencyLinkSchema = z.object({
  competency_id: id,
  weight: z.coerce.number().finite().min(0).optional(),
  is_primary: z.coerce.boolean().optional(),
});

// ── Prerequisites ───────────────────────────────────────────────────────────

export const PrerequisiteCreateSchema = z.object({
  prerequisite_objective_id: id,
  strength: z.enum(PREREQUISITE_STRENGTHS).optional(),
  min_mastery_state: z.string().trim().max(40).optional(),
  rationale: z.string().max(2000).nullish(),
});

// ── Question criteria ───────────────────────────────────────────────────────

export const CriterionSchema = z.object({
  objective_id: id,
  bloom_dimension_id: id,
  competency_id: optionalId,
  criterion_key: z.string().trim().max(60).optional(),
  weight: z.coerce.number().finite().min(0),
  max_score: z.coerce.number().finite().min(0).nullish(),
  rubric_json: z.any().optional(),
  review_status: z.enum(CRITERION_REVIEW_STATUSES).optional(),
});

export const CriteriaSetSchema = z.object({
  criteria: z.array(CriterionSchema).max(50),
  source: z.enum(CRITERION_SOURCES).optional(),
  mark_reviewed: z.coerce.boolean().optional(),
});
