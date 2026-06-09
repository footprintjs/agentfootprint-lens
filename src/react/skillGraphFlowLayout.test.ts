/**
 * skillGraphFlowLayout — pure layout unit + property tests.
 */

import { describe, it, expect } from 'vitest';
import {
  layoutSkillGraph,
  routingPathTo,
  sizeFor,
  SKILL_GRAPH_START_ID,
  type SkillGraphInput,
} from './skillGraphFlowLayout.js';

// A decision tree as agentfootprint's skillGraph().tree(...).build() emits it.
const tree: SkillGraphInput = {
  nodes: [
    { id: 'd0', kind: 'predicate', label: 'io intent?' },
    { id: 'io-profile', kind: 'skill', label: 'io-profile' },
    { id: 'd1', kind: 'predicate', label: 'sfp intent?' },
    { id: 'sfp-audit', kind: 'skill', label: 'sfp-audit' },
    { id: 'triage', kind: 'skill', label: 'triage' },
  ],
  edges: [
    { from: null, to: 'd0', kind: 'predicate' },
    { from: 'd0', to: 'io-profile', kind: 'predicate', label: 'yes' },
    { from: 'd0', to: 'd1', kind: 'predicate', label: 'no' },
    { from: 'd1', to: 'sfp-audit', kind: 'predicate', label: 'yes' },
    { from: 'd1', to: 'triage', kind: 'predicate', label: 'no' },
  ],
};

describe('layoutSkillGraph', () => {
  it('lays out every node plus the synthetic START, with positions + sizes', () => {
    const { nodes } = layoutSkillGraph(tree);
    expect(nodes).toHaveLength(tree.nodes.length + 1); // + start
    const start = nodes.find((n) => n.id === SKILL_GRAPH_START_ID)!;
    expect(start.kind).toBe('start');
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(n.width).toBe(sizeFor(n.kind).width);
      expect(n.height).toBe(sizeFor(n.kind).height);
    }
  });

  it('preserves node kinds (predicate vs skill) and labels', () => {
    const { nodes } = layoutSkillGraph(tree);
    const d0 = nodes.find((n) => n.id === 'd0')!;
    expect(d0.kind).toBe('predicate');
    expect(d0.label).toBe('io intent?');
    expect(nodes.find((n) => n.id === 'io-profile')!.kind).toBe('skill');
  });

  it('top-to-bottom: START is above the root predicate, which is above its leaves', () => {
    const { nodes } = layoutSkillGraph(tree);
    const y = (id: string) => nodes.find((n) => n.id === id)!.y;
    expect(y(SKILL_GRAPH_START_ID)).toBeLessThan(y('d0'));
    expect(y('d0')).toBeLessThan(y('io-profile'));
    expect(y('d1')).toBeLessThan(y('sfp-audit'));
  });

  it('gives every node a DISTINCT position — incl. siblings of the same kind', () => {
    // Regression: dagre mutates the label object passed to setNode, so sharing one
    // size object per kind made same-kind nodes collide onto one (x,y).
    const { nodes } = layoutSkillGraph(tree);
    const seen = new Set(nodes.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(nodes.length);
    // The two predicate diamonds must not stack.
    const d0 = nodes.find((n) => n.id === 'd0')!;
    const d1 = nodes.find((n) => n.id === 'd1')!;
    expect(d0.x !== d1.x || d0.y !== d1.y).toBe(true);
  });

  it('emits an edge per declared edge (incl. the entry), carrying branch labels', () => {
    const { edges } = layoutSkillGraph(tree);
    expect(edges).toHaveLength(tree.edges.length);
    const entry = edges.find((e) => e.source === SKILL_GRAPH_START_ID)!;
    expect(entry.target).toBe('d0');
    expect(edges.filter((e) => e.label === 'yes')).toHaveLength(2);
    expect(edges.filter((e) => e.label === 'no')).toHaveLength(2);
  });

  it('showStart:false drops the START node and its entry edges', () => {
    const { nodes, edges } = layoutSkillGraph(tree, { showStart: false });
    expect(nodes.some((n) => n.id === SKILL_GRAPH_START_ID)).toBe(false);
    expect(edges.some((e) => e.source === SKILL_GRAPH_START_ID)).toBe(false);
    expect(edges).toHaveLength(tree.edges.length - 1); // the one entry edge gone
  });

  it("marks 'model' edges dashed; other kinds solid", () => {
    const flat: SkillGraphInput = {
      nodes: [
        { id: 'a', kind: 'skill', label: 'a' },
        { id: 'b', kind: 'skill', label: 'b' },
      ],
      edges: [
        { from: null, to: 'a', kind: 'entry' },
        { from: 'a', to: 'b', kind: 'model' }, // model-reachable → dashed
      ],
    };
    const { edges } = layoutSkillGraph(flat);
    expect(edges.find((e) => e.target === 'a')!.dashed).toBe(false);
    expect(edges.find((e) => e.target === 'b')!.dashed).toBe(true);
  });

  it('skips dangling edges instead of throwing', () => {
    const broken: SkillGraphInput = {
      nodes: [{ id: 'a', kind: 'skill', label: 'a' }],
      edges: [
        { from: null, to: 'a', kind: 'entry' },
        { from: 'a', to: 'ghost', kind: 'predicate' }, // target not in nodes
      ],
    };
    const { nodes, edges } = layoutSkillGraph(broken);
    expect(nodes.some((n) => n.id === 'a')).toBe(true);
    expect(edges.some((e) => e.target === 'ghost')).toBe(false);
  });

  it('handles an empty graph', () => {
    const { nodes, edges } = layoutSkillGraph({ nodes: [], edges: [] });
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});

describe('routingPathTo', () => {
  it('returns the root→leaf decision path for a tree leaf', () => {
    expect(routingPathTo(tree, 'sfp-audit')).toEqual([
      { predicate: 'io intent?', branch: 'no' },
      { predicate: 'sfp intent?', branch: 'yes' },
    ]);
    expect(routingPathTo(tree, 'io-profile')).toEqual([{ predicate: 'io intent?', branch: 'yes' }]);
    expect(routingPathTo(tree, 'triage')).toEqual([
      { predicate: 'io intent?', branch: 'no' },
      { predicate: 'sfp intent?', branch: 'no' },
    ]);
  });

  it('returns the path to a predicate node too (stops at START)', () => {
    expect(routingPathTo(tree, 'd1')).toEqual([{ predicate: 'io intent?', branch: 'no' }]);
    expect(routingPathTo(tree, 'd0')).toEqual([]); // root predicate — reached from START
  });

  it('a flat entry skill (reached from START) → empty path', () => {
    const flat: SkillGraphInput = {
      nodes: [{ id: 'a', kind: 'skill', label: 'a' }],
      edges: [{ from: null, to: 'a', kind: 'entry' }],
    };
    expect(routingPathTo(flat, 'a')).toEqual([]);
  });

  it('is cycle-guarded (loop edges do not hang)', () => {
    const cyclic: SkillGraphInput = {
      nodes: [
        { id: 'a', kind: 'skill', label: 'a' },
        { id: 'b', kind: 'skill', label: 'b' },
      ],
      edges: [
        { from: 'b', to: 'a', label: 'x' },
        { from: 'a', to: 'b', label: 'y' },
      ],
    };
    expect(() => routingPathTo(cyclic, 'a')).not.toThrow();
  });
});
