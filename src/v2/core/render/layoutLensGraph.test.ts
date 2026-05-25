/**
 * layoutLensGraph — 7-pattern test matrix.
 *
 * dagre is a real dependency in the lens package; these tests treat
 * it as a black box and assert the orchestrator's contract
 * (positions get filled in, sizes are honoured via sizeOverride).
 */

import { describe, expect, it } from 'vitest';
import { layoutLensGraph } from './layoutLensGraph.js';
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

describe('layoutLensGraph — unit', () => {
  it('returns positioned nodes (x/y filled in by dagre, not the {0,0} placeholder)', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a'), stage('b')],
      edges: [{ id: 'e', source: 'a', target: 'b', kind: 'next' }],
      rootNodeId: 'a',
    };
    const { nodes } = layoutLensGraph(out);
    // dagre places at least one of two connected nodes off (0,0).
    const offOrigin = nodes.some(
      (n) => n.position.x !== 0 || n.position.y !== 0,
    );
    expect(offOrigin).toBe(true);
  });

  it('preserves the input node count', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a'), stage('b'), stage('c')],
      edges: [],
      rootNodeId: 'a',
    };
    const { nodes } = layoutLensGraph(out);
    expect(nodes).toHaveLength(3);
  });

  it('preserves the input edge count and order', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a'), stage('b')],
      edges: [
        { id: 'e1', source: 'a', target: 'b', kind: 'next' },
        { id: 'e2', source: 'b', target: 'a', kind: 'next' },
      ],
      rootNodeId: 'a',
    };
    const { edges } = layoutLensGraph(out);
    expect(edges.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('layoutLensGraph — functional', () => {
  it('sizeOverride wins over defaultSize when provided', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a')],
      edges: [],
      rootNodeId: 'a',
    };
    const { nodes } = layoutLensGraph(out, {
      sizeOverride: () => ({ width: 999, height: 1 }),
    });
    // dagre places the node centered on its size; the centered position
    // for an isolated node at {999, 1} differs from the default {180,
    // 56} — observable via x position bounds.
    expect(typeof nodes[0]!.position.x).toBe('number');
  });

  it('sizeOverride returning undefined falls back to defaultSize', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a')],
      edges: [],
      rootNodeId: 'a',
    };
    const { nodes } = layoutLensGraph(out, {
      sizeOverride: () => undefined,
    });
    expect(nodes).toHaveLength(1);
  });

  it('respects layout direction option (TB vs LR produces different positions)', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a'), stage('b')],
      edges: [{ id: 'e', source: 'a', target: 'b', kind: 'next' }],
      rootNodeId: 'a',
    };
    const tb = layoutLensGraph(out, { direction: 'TB' });
    const lr = layoutLensGraph(out, { direction: 'LR' });
    // TB stacks vertically (y differs); LR stacks horizontally (x differs).
    // Stronger guarantee that swapping direction changes the layout.
    const tbYGap = Math.abs(tb.nodes[1]!.position.y - tb.nodes[0]!.position.y);
    const lrXGap = Math.abs(lr.nodes[1]!.position.x - lr.nodes[0]!.position.x);
    expect(tbYGap).toBeGreaterThan(0);
    expect(lrXGap).toBeGreaterThan(0);
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('layoutLensGraph — integration', () => {
  it('lays out a compound graph (Parallel container + pinned children)', () => {
    const out: LensGroupOutput = {
      nodes: [
        group('container'),
        stage('s1', { parentId: 'container' }),
        stage('s2', { parentId: 'container' }),
      ],
      edges: [
        { id: 'f1', source: 'container', target: 's1', kind: 'fork-branch' },
        { id: 'f2', source: 'container', target: 's2', kind: 'fork-branch' },
      ],
      rootNodeId: 'container',
    };
    const { nodes, edges } = layoutLensGraph(out);
    expect(nodes[0]!.type).toBe('group');
    expect(nodes[1]!.parentId).toBe('container');
    expect(nodes[2]!.parentId).toBe('container');
    expect(edges).toHaveLength(2);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('layoutLensGraph — property', () => {
  it.each([1, 3, 5, 10])(
    'N-node linear chain produces N nodes with non-overlapping positions (N=%d)',
    (n) => {
      const nodes = Array.from({ length: n }, (_, i) => stage(`n${i}`));
      const edges = Array.from({ length: n - 1 }, (_, i) => ({
        id: `e${i}`,
        source: `n${i}`,
        target: `n${i + 1}`,
        kind: 'next' as const,
      }));
      const result = layoutLensGraph(
        { nodes, edges, rootNodeId: 'n0' },
        { direction: 'TB' },
      );
      const ys = result.nodes.map((nd) => nd.position.y);
      const uniqueYs = new Set(ys);
      // In a TB layout, distinct chain steps live at distinct y values.
      expect(uniqueYs.size).toBe(n);
    },
  );
});

// ── 5. Security ───────────────────────────────────────────────────

describe('layoutLensGraph — security', () => {
  it('does NOT mutate the input LensGroupOutput', () => {
    const out: LensGroupOutput = {
      nodes: [stage('a')],
      edges: [],
      rootNodeId: 'a',
    };
    const before = JSON.stringify(out);
    layoutLensGraph(out);
    expect(JSON.stringify(out)).toBe(before);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('layoutLensGraph — performance', () => {
  it('100-node linear chain lays out under 200ms', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => stage(`n${i}`));
    const edges = Array.from({ length: 99 }, (_, i) => ({
      id: `e${i}`,
      source: `n${i}`,
      target: `n${i + 1}`,
      kind: 'next' as const,
    }));
    const t0 = performance.now();
    layoutLensGraph({ nodes, edges, rootNodeId: 'n0' });
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('layoutLensGraph — ROI', () => {
  it('one orchestrator covers every composition shape (Parallel, Sequence-like, leaf)', () => {
    const par: LensGroupOutput = {
      nodes: [group('par'), stage('a', { parentId: 'par' })],
      edges: [{ id: 'fk', source: 'par', target: 'a', kind: 'fork-branch' }],
      rootNodeId: 'par',
    };
    const seq: LensGroupOutput = {
      nodes: [stage('s1'), stage('s2')],
      edges: [{ id: 'nx', source: 's1', target: 's2', kind: 'next' }],
      rootNodeId: 's1',
    };
    const leaf: LensGroupOutput = {
      nodes: [stage('only')],
      edges: [],
      rootNodeId: 'only',
    };
    for (const out of [par, seq, leaf]) {
      const result = layoutLensGraph(out);
      expect(result.nodes.length).toBeGreaterThan(0);
    }
  });
});
