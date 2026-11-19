/**
 * src/shared/learning/prerequisite-validator.js
 *
 * Pure validation for the objective prerequisite graph. The graph is directed:
 * edge `objective_id → prerequisite_objective_id` means "objective needs
 * prerequisite first". Cycles would make any learning-path computation
 * non-terminating, so they are rejected at write time rather than defended
 * against at read time.
 *
 * Pure: no repository, no I/O.
 */

/** Hard ceiling on prerequisite depth, to keep pathways finite and reviewable. */
export const MAX_PREREQUISITE_DEPTH = 10;

export const PREREQUISITE_STRENGTHS = Object.freeze(['required', 'recommended']);

/**
 * Depth of each node's prerequisite chain, walking down `prerequisite` edges.
 * Assumes the graph is acyclic; `validatePrerequisiteGraph` proves that first.
 */
function computeDepths(edges) {
  const needs = new Map(); // objective → its prerequisites
  for (const edge of edges) {
    if (!needs.has(edge.objective_id)) needs.set(edge.objective_id, []);
    needs.get(edge.objective_id).push(edge.prerequisite_objective_id);
  }
  const depth = new Map();
  const visit = (id) => {
    if (depth.has(id)) return depth.get(id);
    depth.set(id, 0); // guard against unexpected cycles
    const parents = needs.get(id) || [];
    const value = parents.length ? 1 + Math.max(...parents.map(visit)) : 0;
    depth.set(id, value);
    return value;
  };
  for (const id of needs.keys()) visit(id);
  return depth;
}

/**
 * Detect the cycle a new/edited edge would close. Returns the cycle path
 * (`[from, ..., to]`) when adding `toId → fromId` is invalid, else null.
 *
 * @param {{objective_id: string, prerequisite_objective_id: string}[]} edges existing edges
 * @param {string} objectiveId              the objective being given a prerequisite
 * @param {string} prerequisiteObjectiveId  the proposed prerequisite
 * @returns {string[]|null}
 */
export function findCycle(edges, objectiveId, prerequisiteObjectiveId) {
  if (objectiveId === prerequisiteObjectiveId) return [objectiveId, prerequisiteObjectiveId];

  // Walk the prerequisite chain of the proposed prerequisite: if we reach the
  // objective itself, the new edge would close a loop.
  const needs = new Map();
  for (const edge of edges) {
    // Ignore an existing edge for the same pair — it is being replaced, not added.
    if (edge.objective_id === objectiveId && edge.prerequisite_objective_id === prerequisiteObjectiveId) continue;
    if (!needs.has(edge.objective_id)) needs.set(edge.objective_id, []);
    needs.get(edge.objective_id).push(edge.prerequisite_objective_id);
  }

  const path = [];
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    path.push(id);
    if (id === objectiveId) return true;
    for (const parent of needs.get(id) || []) {
      if (walk(parent)) return true;
    }
    path.pop();
    return false;
  };

  return walk(prerequisiteObjectiveId) ? [...path].reverse() : null;
}

/**
 * Validate the whole graph (used by the read/repair paths and by tests).
 * @returns {{ ok: boolean, errors: Record<string, string[]> }}
 */
export function validatePrerequisiteGraph(edges) {
  const errors = {};
  const push = (key, msg) => {
    (errors[key] ||= []).push(msg);
  };

  if (!Array.isArray(edges)) return { ok: false, errors: { edges: ['Edges must be an array'] } };

  const seen = new Set();
  for (const edge of edges) {
    const objective = edge?.objective_id;
    const prerequisite = edge?.prerequisite_objective_id;

    if (!objective || !prerequisite) {
      push('edges', ['Both objective_id and prerequisite_objective_id are required']);
      continue;
    }
    if (objective === prerequisite) push(objective, ['An objective cannot be its own prerequisite']);

    const pair = `${objective}|${prerequisite}`;
    if (seen.has(pair)) push(objective, [`Duplicate prerequisite edge to "${prerequisite}"`]);
    else seen.add(pair);

    if (edge.strength != null && !PREREQUISITE_STRENGTHS.includes(edge.strength)) {
      push(objective, [`strength must be one of ${PREREQUISITE_STRENGTHS.join(' | ')}`]);
    }
  }

  // Cycle check over the whole graph (iterative-safe for small graphs).
  const acyclic = new Set();
  const needs = new Map();
  for (const edge of edges) {
    if (!edge?.objective_id || !edge?.prerequisite_objective_id) continue;
    if (!needs.has(edge.objective_id)) needs.set(edge.objective_id, []);
    needs.get(edge.objective_id).push(edge.prerequisite_objective_id);
  }
  const visit = (id, stack) => {
    if (stack.has(id)) return false;
    if (acyclic.has(id)) return true;
    stack.add(id);
    for (const parent of needs.get(id) || []) {
      if (!visit(parent, stack)) return false;
    }
    stack.delete(id);
    acyclic.add(id);
    return true;
  };
  for (const id of needs.keys()) {
    if (!visit(id, new Set())) {
      push(id, ['Prerequisite cycle detected']);
      break;
    }
  }

  const depths = computeDepths(edges);
  for (const [id, depth] of depths.entries()) {
    if (depth >= MAX_PREREQUISITE_DEPTH) {
      push(id, [`Prerequisite chain deeper than ${MAX_PREREQUISITE_DEPTH}`]);
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
