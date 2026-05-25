/**
 * mergeAugmentedLayout — Layer 3 / Tier A tests (Convention 3, 7 patterns).
 */

import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import type { AugmentNodeData, LayoutAugment } from './overlayToLayoutAugment.js';
import { mergeAugmentedLayout } from './mergeAugmentedLayout.js';

function baseNode(id: string, x: number, y: number): Node {
  return { id, position: { x, y }, data: { label: id } };
}

function augmentNode(
  id: string,
  anchorId: string,
  attempt: number,
  status: 'failed' | 'ok' = 'failed',
): Node<AugmentNodeData> {
  return {
    id,
    type: 'retryAttempt',
    position: { x: 0, y: 0 },
    data: { label: id, status, runtimeStageId: id, anchorId, attempt },
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('mergeAugmentedLayout — unit', () => {
  it('empty augment returns base unchanged', () => {
    const base = { nodes: [baseNode('x', 100, 200)], edges: [] };
    const empty: LayoutAugment = { extraNodes: [], extraEdges: [] };
    const out = mergeAugmentedLayout(base, empty);
    expect(out).toBe(base);
  });

  it('augment with one sibling positions it leftward of anchor', () => {
    const base = { nodes: [baseNode('x', 500, 200)], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [augmentNode('retry-x#0', 'x', 1)],
      extraEdges: [],
    };
    const out = mergeAugmentedLayout(base, augment, { siblingSpacing: 200 });
    const positioned = out.nodes.find((n) => n.id === 'retry-x#0')!;
    expect(positioned.position).toEqual({ x: 300, y: 200 });
  });

  it('augment with three siblings places earliest leftmost (attempt-ascending)', () => {
    const base = { nodes: [baseNode('x', 1000, 100)], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [
        augmentNode('retry-x#2', 'x', 3),
        augmentNode('retry-x#0', 'x', 1), // out-of-order input
        augmentNode('retry-x#1', 'x', 2),
      ],
      extraEdges: [],
    };
    const out = mergeAugmentedLayout(base, augment, { siblingSpacing: 100 });
    // After sort, leftmost (attempt 1) has the largest negative offset.
    const findPos = (id: string): { x: number; y: number } => {
      const n = out.nodes.find((nn) => nn.id === id)!;
      return n.position as { x: number; y: number };
    };
    expect(findPos('retry-x#0').x).toBe(700);  // anchor 1000 - 300
    expect(findPos('retry-x#1').x).toBe(800);  // anchor 1000 - 200
    expect(findPos('retry-x#2').x).toBe(900);  // anchor 1000 - 100
  });

  it('augment node with unknown anchorId is dropped', () => {
    const base = { nodes: [baseNode('x', 0, 0)], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [augmentNode('retry-orphan', 'NOPE', 1)],
      extraEdges: [],
    };
    const out = mergeAugmentedLayout(base, augment);
    expect(out.nodes).toHaveLength(1);
    expect(out.nodes[0]!.id).toBe('x');
  });

  it('augment edge to dropped node is also dropped', () => {
    const base = { nodes: [baseNode('x', 0, 0)], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [augmentNode('retry-orphan', 'NOPE', 1)],
      extraEdges: [{ id: 'e', source: 'retry-orphan', target: 'x' }],
    };
    const out = mergeAugmentedLayout(base, augment);
    expect(out.edges).toHaveLength(0);
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('mergeAugmentedLayout — functional', () => {
  it('preserves base node order', () => {
    const base = {
      nodes: [baseNode('a', 0, 0), baseNode('b', 100, 0), baseNode('c', 200, 0)],
      edges: [{ id: 'e1', source: 'a', target: 'b' }] as Edge[],
    };
    const augment: LayoutAugment = {
      extraNodes: [augmentNode('retry-b#0', 'b', 1)],
      extraEdges: [],
    };
    const out = mergeAugmentedLayout(base, augment);
    const ids = out.nodes.map((n) => n.id);
    expect(ids.slice(0, 3)).toEqual(['a', 'b', 'c']); // base order kept
    expect(ids).toContain('retry-b#0');
  });

  it('augments survive together with base edges', () => {
    const base = {
      nodes: [baseNode('a', 0, 0), baseNode('b', 200, 0)],
      edges: [{ id: 'e1', source: 'a', target: 'b' }] as Edge[],
    };
    const augment: LayoutAugment = {
      extraNodes: [augmentNode('retry-b#0', 'b', 1)],
      extraEdges: [{ id: 'er-1', source: 'retry-b#0', target: 'b' }],
    };
    const out = mergeAugmentedLayout(base, augment);
    expect(out.edges).toHaveLength(2);
    expect(out.edges.some((e) => e.id === 'er-1')).toBe(true);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('mergeAugmentedLayout — integration', () => {
  it('two different anchors → two independent leftward rows', () => {
    const base = {
      nodes: [baseNode('a', 200, 0), baseNode('b', 200, 200)],
      edges: [],
    };
    const augment: LayoutAugment = {
      extraNodes: [
        augmentNode('retry-a#0', 'a', 1),
        augmentNode('retry-b#0', 'b', 1),
      ],
      extraEdges: [],
    };
    const out = mergeAugmentedLayout(base, augment, { siblingSpacing: 100 });
    const a = out.nodes.find((n) => n.id === 'retry-a#0')!;
    const b = out.nodes.find((n) => n.id === 'retry-b#0')!;
    expect(a.position).toEqual({ x: 100, y: 0 });
    expect(b.position).toEqual({ x: 100, y: 200 });
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('mergeAugmentedLayout — property', () => {
  it('total nodes = base + kept-augments', () => {
    const base = { nodes: [baseNode('x', 0, 0)], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [
        augmentNode('retry-x#0', 'x', 1),
        augmentNode('retry-x#1', 'x', 2),
        augmentNode('retry-orphan', 'NOPE', 1), // dropped
      ],
      extraEdges: [],
    };
    const out = mergeAugmentedLayout(base, augment);
    expect(out.nodes).toHaveLength(1 + 2);
  });

  it('synthetic siblings share Y with anchor', () => {
    const base = { nodes: [baseNode('x', 100, 555)], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [augmentNode('retry-x#0', 'x', 1), augmentNode('retry-x#1', 'x', 2)],
      extraEdges: [],
    };
    const out = mergeAugmentedLayout(base, augment);
    for (const n of out.nodes) {
      if (n.id.startsWith('retry-')) expect(n.position?.y).toBe(555);
    }
  });

  it('never throws on missing position on anchor (defaults to 0,0)', () => {
    const base = { nodes: [{ id: 'x', data: {} } as Node], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [augmentNode('retry-x#0', 'x', 1)],
      extraEdges: [],
    };
    expect(() => mergeAugmentedLayout(base, augment)).not.toThrow();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('mergeAugmentedLayout — security', () => {
  it('does not mutate the input base layout', () => {
    const base = { nodes: [baseNode('x', 0, 0)], edges: [] };
    const before = JSON.stringify(base);
    mergeAugmentedLayout(base, {
      extraNodes: [augmentNode('retry-x#0', 'x', 1)],
      extraEdges: [],
    });
    expect(JSON.stringify(base)).toBe(before);
  });

  it('orphan-edge with both sides dropped is filtered', () => {
    const base = { nodes: [baseNode('x', 0, 0)], edges: [] };
    const augment: LayoutAugment = {
      extraNodes: [],
      extraEdges: [{ id: 'orphan', source: 'NOPE-A', target: 'NOPE-B' }],
    };
    const out = mergeAugmentedLayout(base, augment);
    expect(out.edges).toHaveLength(0);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('mergeAugmentedLayout — performance', () => {
  it('500-node base + 100 augments in under 30ms', () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 500; i++) nodes.push(baseNode(`b${i}`, i * 100, 0));
    const augNodes: Node<AugmentNodeData>[] = [];
    for (let i = 0; i < 100; i++) augNodes.push(augmentNode(`retry-b${i}#0`, `b${i}`, 1));
    const start = performance.now();
    mergeAugmentedLayout({ nodes, edges: [] }, { extraNodes: augNodes, extraEdges: [] });
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('mergeAugmentedLayout — load', () => {
  it('5000-node base + 1000 augments in under 200ms', () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 5000; i++) nodes.push(baseNode(`b${i}`, i * 100, 0));
    const augNodes: Node<AugmentNodeData>[] = [];
    for (let i = 0; i < 1000; i++) augNodes.push(augmentNode(`retry-b${i}#0`, `b${i}`, 1));
    const start = performance.now();
    mergeAugmentedLayout({ nodes, edges: [] }, { extraNodes: augNodes, extraEdges: [] });
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(500);
  });
});
