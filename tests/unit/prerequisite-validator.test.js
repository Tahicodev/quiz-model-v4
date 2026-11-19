/**
 * tests/unit/prerequisite-validator.test.js
 *
 * The prerequisite graph is directed (`objective → prerequisite`: "this
 * objective needs that one first"). A cycle would make any learning-path
 * computation non-terminating, so it is refused at write time.
 *
 * `findCycle` answers the single-edge question the service asks on POST;
 * `validatePrerequisiteGraph` is the whole-graph check (read/repair paths,
 * tests, and the depth ceiling).
 */

import { describe, it, expect } from 'vitest';

import {
  MAX_PREREQUISITE_DEPTH,
  PREREQUISITE_STRENGTHS,
  findCycle,
  validatePrerequisiteGraph,
} from '../../src/shared/learning/prerequisite-validator.js';

const edge = (objective_id, prerequisite_objective_id, extra = {}) => ({
  objective_id,
  prerequisite_objective_id,
  ...extra,
});

describe('findCycle', () => {
  it('rejects an objective as its own prerequisite', () => {
    expect(findCycle([], 'a', 'a')).toEqual(['a', 'a']);
  });

  it('returns null for an edge that closes nothing', () => {
    expect(findCycle([], 'a', 'b')).toBeNull();
  });

  it('detects a direct two-node cycle', () => {
    // a needs b already; giving b prerequisite a closes the loop.
    expect(findCycle([edge('a', 'b')], 'b', 'a')).toEqual(['b', 'a']);
  });

  it('detects a longer cycle', () => {
    // a → b → c (a needs b, b needs c). Making c need a closes a → b → c → a.
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(findCycle(edges, 'c', 'a')).toEqual(['c', 'b', 'a']);
  });

  it('ignores the edge being replaced (re-adding the same pair is not a cycle)', () => {
    expect(findCycle([edge('a', 'b')], 'a', 'b')).toBeNull();
  });

  it('is not confused by unrelated edges', () => {
    const edges = [edge('x', 'y'), edge('y', 'z'), edge('a', 'b')];
    expect(findCycle(edges, 'b', 'a')).toEqual(['b', 'a']);
    expect(findCycle(edges, 'z', 'x')).toEqual(['z', 'y', 'x']);
    expect(findCycle(edges, 'p', 'q')).toBeNull();
  });
});

describe('validatePrerequisiteGraph', () => {
  it('accepts an empty graph', () => {
    expect(validatePrerequisiteGraph([])).toEqual({ ok: true, errors: {} });
  });

  it('accepts a valid acyclic graph with allowed strengths', () => {
    const result = validatePrerequisiteGraph([
      edge('a', 'b', { strength: 'required' }),
      edge('b', 'c', { strength: 'recommended' }),
      edge('d', 'c'),
    ]);
    expect(result.ok).toBe(true);
  });

  it('rejects a non-array graph', () => {
    const result = validatePrerequisiteGraph(null);
    expect(result.ok).toBe(false);
    expect(result.errors.edges).toBeDefined();
  });

  it('rejects an edge with a missing endpoint', () => {
    const result = validatePrerequisiteGraph([edge('a', '')]);
    expect(result.ok).toBe(false);
    expect(result.errors.edges.join(' ')).toMatch(/Both objective_id and prerequisite_objective_id are required/);
  });

  it('rejects a self-edge', () => {
    const result = validatePrerequisiteGraph([edge('a', 'a')]);
    expect(result.ok).toBe(false);
    expect(result.errors.a.join(' ')).toMatch(/cannot be its own prerequisite/);
  });

  it('rejects a duplicate edge', () => {
    const result = validatePrerequisiteGraph([edge('a', 'b'), edge('a', 'b')]);
    expect(result.ok).toBe(false);
    expect(result.errors.a.join(' ')).toMatch(/Duplicate prerequisite edge/);
  });

  it('rejects an unknown strength', () => {
    const result = validatePrerequisiteGraph([edge('a', 'b', { strength: 'nice_to_have' })]);
    expect(result.ok).toBe(false);
    expect(result.errors.a.join(' ')).toMatch(new RegExp(`strength must be one of ${PREREQUISITE_STRENGTHS.join(' \\| ')}`));
  });

  it('detects a cycle anywhere in the graph', () => {
    const result = validatePrerequisiteGraph([edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]);
    expect(result.ok).toBe(false);
    expect(Object.values(result.errors).flat().join(' ')).toMatch(/Prerequisite cycle detected/);
  });

  it('rejects a chain deeper than the ceiling', () => {
    // MAX depth edges in one chain: o10 → o9 → … → o0.
    const edges = [];
    for (let i = 1; i <= MAX_PREREQUISITE_DEPTH; i += 1) {
      edges.push(edge(`o${i}`, `o${i - 1}`));
    }
    const result = validatePrerequisiteGraph(edges);
    expect(result.ok).toBe(false);
    expect(result.errors[`o${MAX_PREREQUISITE_DEPTH}`].join(' ')).toMatch(/deeper than/);
  });

  it('accepts a chain one step below the ceiling', () => {
    const edges = [];
    for (let i = 1; i < MAX_PREREQUISITE_DEPTH; i += 1) {
      edges.push(edge(`o${i}`, `o${i - 1}`));
    }
    expect(validatePrerequisiteGraph(edges).ok).toBe(true);
  });
});