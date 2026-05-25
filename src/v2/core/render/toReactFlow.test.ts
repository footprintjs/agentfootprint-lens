/**
 * toReactFlow — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import { toReactFlow, defaultSize } from './toReactFlow.js';
import type { LensGroupOutput, LensNode } from '../translate/types.js';

const stage = (id: string, overrides?: Partial<LensNode>): LensNode => ({
  id,
  kind: 'stage',
  label: id,
  primitiveKind: 'LLMCall',
  ...overrides,
});

const group = (id: string, overrides?: Partial<LensNode>): LensNode => ({
  id,
  kind: 'group',
  label: id,
  primitiveKind: 'Parallel',
  ...overrides,
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('toReactFlow — unit', () => {
  it('maps a single stage node to a xyflow Node with type=lensStage', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a', { label: 'Step A' })],
      edges: [],
      rootNodeId: 'a',
    };
    const result = toReactFlow(out);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      id: 'a',
      type: 'lensStage',
      position: { x: 0, y: 0 },
      data: { label: 'Step A', primitiveKind: 'LLMCall' },
    });
  });

  it('maps a group node to a xyflow Node with type=group + placeholder style', () => {
    const out: LensGroupOutput = {
      nodes: [group('g')],
      edges: [],
      rootNodeId: 'g',
    };
    const result = toReactFlow(out);
    expect(result.nodes[0]).toMatchObject({
      id: 'g',
      type: 'group',
    });
    expect(result.nodes[0]!.style).toBeDefined();
  });

  it('passes parentId + extent: parent to xyflow when LensNode has parentId', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a', { parentId: 'container' })],
      edges: [],
      rootNodeId: 'a',
    };
    const result = toReactFlow(out);
    expect(result.nodes[0]!.parentId).toBe('container');
    expect(result.nodes[0]!.extent).toBe('parent');
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('toReactFlow — functional', () => {
  it('passes metadata through to xyflow node data', () => {
    const metadata = { slots: ['Messages'], maxIterations: 3 } as const;
    const out: LensGroupOutput = {
      nodes: [stage('a', { metadata })],
      edges: [],
      rootNodeId: 'a',
    };
    const result = toReactFlow(out);
    expect(result.nodes[0]!.data.metadata).toBe(metadata);
  });

  it('maps an edge to a xyflow Edge with kind in data', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a'), stage('b')],
      edges: [{ id: 'e1', source: 'a', target: 'b', kind: 'next' }],
      rootNodeId: 'a',
    };
    const result = toReactFlow(out);
    expect(result.edges[0]).toMatchObject({
      id: 'e1',
      source: 'a',
      target: 'b',
      type: 'default',
      data: { kind: 'next' },
    });
  });

  it('passes edge label through verbatim when present', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a'), stage('b')],
      edges: [
        { id: 'e1', source: 'a', target: 'b', kind: 'fork-branch', label: 'legal' },
      ],
      rootNodeId: 'a',
    };
    const result = toReactFlow(out);
    expect(result.edges[0]!.label).toBe('legal');
  });

  it('omits the edge label field when LensEdge has no label', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a'), stage('b')],
      edges: [{ id: 'e1', source: 'a', target: 'b', kind: 'next' }],
      rootNodeId: 'a',
    };
    const result = toReactFlow(out);
    expect('label' in result.edges[0]!).toBe(false);
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('toReactFlow — integration', () => {
  it('maps a Parallel-of-Sequence shape preserving parentId chains', () => {
    const out: LensGroupOutput = {
      nodes: [
        group('container'),
        stage('s1', { parentId: 'container' }),
        stage('s2', { parentId: 'container' }),
        stage('innerLeaf', { parentId: 's1' }),
      ],
      edges: [
        { id: 'fork-1', source: 'container', target: 's1', kind: 'fork-branch' },
        { id: 'next-1', source: 's1', target: 's2', kind: 'next' },
      ],
      rootNodeId: 'container',
    };
    const result = toReactFlow(out);
    expect(result.nodes.map((n) => n.parentId)).toEqual([
      undefined,
      'container',
      'container',
      's1',
    ]);
    expect(result.edges.map((e) => e.data?.kind)).toEqual([
      'fork-branch',
      'next',
    ]);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('toReactFlow — property', () => {
  it.each([0, 1, 5, 25, 100])(
    'output node count equals input node count (N=%d)',
    (n) => {
      const nodes = Array.from({ length: n }, (_, i) => stage(`n${i}`));
      const out: LensGroupOutput = { nodes, edges: [], rootNodeId: nodes[0]?.id ?? '' };
      expect(toReactFlow(out).nodes).toHaveLength(n);
    },
  );

  it.each([0, 1, 5, 25, 100])(
    'output edge count equals input edge count (N=%d)',
    (n) => {
      const edges = Array.from({ length: n }, (_, i) => ({
        id: `e${i}`,
        source: 'x',
        target: 'y',
        kind: 'next' as const,
      }));
      const out: LensGroupOutput = { nodes: [stage('x'), stage('y')], edges, rootNodeId: 'x' };
      expect(toReactFlow(out).edges).toHaveLength(n);
    },
  );
});

// ── 5. Security ───────────────────────────────────────────────────

describe('toReactFlow — security', () => {
  it('does NOT mutate the input LensGroupOutput', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a')],
      edges: [],
      rootNodeId: 'a',
    };
    const before = JSON.stringify(out);
    toReactFlow(out);
    expect(JSON.stringify(out)).toBe(before);
  });

  it('label / metadata are passed by reference — renderer owns escaping', () => {
    // Documented: Lens does not sanitise label/metadata. The renderer
    // (React's JSX escapes by default) owns it.
    const metadata = { dangerous: '<script>x</script>' };
    const out: LensGroupOutput = {
      nodes: [stage('a', { label: '<img>', metadata })],
      edges: [],
      rootNodeId: 'a',
    };
    const result = toReactFlow(out);
    expect(result.nodes[0]!.data.label).toBe('<img>');
    expect(result.nodes[0]!.data.metadata).toBe(metadata);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('toReactFlow — performance', () => {
  it('1000 nodes + 1000 edges map under 50ms', () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => stage(`n${i}`));
    const edges = Array.from({ length: 1000 }, (_, i) => ({
      id: `e${i}`,
      source: 'x',
      target: 'y',
      kind: 'next' as const,
    }));
    const out: LensGroupOutput = { nodes, edges, rootNodeId: nodes[0]!.id };
    const t0 = performance.now();
    toReactFlow(out);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('toReactFlow — ROI', () => {
  it('one mapper covers every LensNode + LensEdge kind without per-kind branches', () => {
    const out: LensGroupOutput = {
      nodes: [
        group('par'),
        stage('agent', { primitiveKind: 'Agent', parentId: 'par' }),
        stage('llm', { primitiveKind: 'LLMCall', parentId: 'par' }),
      ],
      edges: [
        { id: 'fk', source: 'par', target: 'agent', kind: 'fork-branch' },
        { id: 'dec', source: 'par', target: 'llm', kind: 'decision-branch' },
        { id: 'lp', source: 'agent', target: 'agent', kind: 'loop-iteration' },
      ],
      rootNodeId: 'par',
    };
    const result = toReactFlow(out);
    expect(result.nodes.map((n) => n.type)).toEqual([
      'group',
      'lensStage',
      'lensStage',
    ]);
    expect(result.edges.map((e) => e.data?.kind)).toEqual([
      'fork-branch',
      'decision-branch',
      'loop-iteration',
    ]);
  });
});

// ── defaultSize ───────────────────────────────────────────────────

describe('defaultSize', () => {
  it('returns the group default for group nodes', () => {
    expect(defaultSize(group('g'))).toEqual({ width: 260, height: 120 });
  });

  it('returns the stage default for stage nodes', () => {
    expect(defaultSize(stage('s'))).toEqual({ width: 180, height: 56 });
  });
});
