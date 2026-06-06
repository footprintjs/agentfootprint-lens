/**
 * pinUnderParent — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import { pinUnderParent } from './pinUnderParent.js';
import type { LensGroupOutput, LensNode } from '../types.js';

const node = (id: string, overrides?: Partial<LensNode>): LensNode => ({
  id,
  kind: 'stage',
  label: id,
  primitiveKind: 'LLMCall',
  ...overrides,
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('pinUnderParent — unit', () => {
  it('sets parentId on every top-level node (single-container case)', () => {
    // Inner Parallel-like shape: container at top, members already
    // pinned inside it. Only the container is top-level.
    const child: LensGroupOutput = {
      nodes: [
        node('container', { kind: 'group' }),
        node('leaf', { parentId: 'container' }),
      ],
      edges: [],
      rootNodeId: 'container',
    };
    const pinned = pinUnderParent(child, 'outer');
    expect(pinned.nodes[0]!.parentId).toBe('outer');
    expect(pinned.nodes[1]!.parentId).toBe('container'); // unchanged
  });

  it('pins every top-level node when child has no own container (Sequence-like)', () => {
    const child: LensGroupOutput = {
      nodes: [node('s1'), node('s2'), node('s3')],
      edges: [],
      rootNodeId: 's1',
    };
    const pinned = pinUnderParent(child, 'parallel');
    expect(pinned.nodes.map((n) => n.parentId)).toEqual([
      'parallel',
      'parallel',
      'parallel',
    ]);
  });

  it('preserves edges verbatim', () => {
    const child: LensGroupOutput = {
      nodes: [node('a'), node('b')],
      edges: [{ id: 'e', source: 'a', target: 'b', kind: 'next' }],
      rootNodeId: 'a',
    };
    const pinned = pinUnderParent(child, 'p');
    expect(pinned.edges).toBe(child.edges); // structural identity preserved
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('pinUnderParent — functional', () => {
  it('preserves rootNodeId across the pin', () => {
    const child: LensGroupOutput = {
      nodes: [node('lead')],
      edges: [],
      rootNodeId: 'lead',
    };
    expect(pinUnderParent(child, 'p').rootNodeId).toBe('lead');
  });

  it('does NOT overwrite pre-existing parentId on inner nodes', () => {
    // Grandchild already inside an inner container — must NOT be
    // re-parented to the outer container.
    const child: LensGroupOutput = {
      nodes: [
        node('innerContainer', { kind: 'group' }),
        node('grandchild', { parentId: 'innerContainer' }),
      ],
      edges: [],
      rootNodeId: 'innerContainer',
    };
    const pinned = pinUnderParent(child, 'outerContainer');
    expect(pinned.nodes[0]!.parentId).toBe('outerContainer');
    expect(pinned.nodes[1]!.parentId).toBe('innerContainer'); // PRESERVED
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('pinUnderParent — integration', () => {
  it('two-level nesting: outer Parallel pins a Sequence whose first step is an inner Parallel', () => {
    // Realistic shape: inner Parallel's output (container + member),
    // followed by a plain stage. Sequence-style outputs concatenate
    // without their own container.
    const seqOutput: LensGroupOutput = {
      nodes: [
        node('innerContainer', { kind: 'group' }),
        node('innerMember', { parentId: 'innerContainer' }),
        node('plainStage'),
      ],
      edges: [],
      rootNodeId: 'innerContainer',
    };
    // Outer Parallel pins this Sequence under its container.
    const pinned = pinUnderParent(seqOutput, 'outerContainer');
    // innerContainer was top-level → gets outerContainer as parent.
    expect(pinned.nodes[0]!.parentId).toBe('outerContainer');
    // innerMember already pinned to innerContainer → PRESERVED.
    expect(pinned.nodes[1]!.parentId).toBe('innerContainer');
    // plainStage was top-level → gets outerContainer as parent.
    expect(pinned.nodes[2]!.parentId).toBe('outerContainer');
  });

  it('idempotent: pinning twice with the same parent is a no-op after the first', () => {
    const child: LensGroupOutput = {
      nodes: [node('top'), node('child', { parentId: 'somewhere' })],
      edges: [],
      rootNodeId: 'top',
    };
    const once = pinUnderParent(child, 'P');
    const twice = pinUnderParent(once, 'P');
    expect(twice.nodes[0]!.parentId).toBe('P');
    expect(twice.nodes[1]!.parentId).toBe('somewhere');
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('pinUnderParent — property', () => {
  it('node count is preserved across the pin', () => {
    const child: LensGroupOutput = {
      nodes: [node('a'), node('b'), node('c'), node('d')],
      edges: [],
      rootNodeId: 'a',
    };
    const pinned = pinUnderParent(child, 'p');
    expect(pinned.nodes).toHaveLength(child.nodes.length);
  });

  it('every output node has either its original parentId or the new one', () => {
    const child: LensGroupOutput = {
      nodes: [
        node('top1'),
        node('top2'),
        node('child', { parentId: 'somewhere' }),
      ],
      edges: [],
      rootNodeId: 'top1',
    };
    const pinned = pinUnderParent(child, 'P');
    expect(pinned.nodes[0]!.parentId).toBe('P');
    expect(pinned.nodes[1]!.parentId).toBe('P');
    expect(pinned.nodes[2]!.parentId).toBe('somewhere');
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('pinUnderParent — security', () => {
  it('does NOT mutate the input child', () => {
    const child: LensGroupOutput = {
      nodes: [node('root')],
      edges: [],
      rootNodeId: 'root',
    };
    pinUnderParent(child, 'container');
    expect(child.nodes[0]!.parentId).toBeUndefined();
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('pinUnderParent — performance', () => {
  it('1000-node child pins under 30ms', () => {
    const nodes: LensNode[] = Array.from({ length: 1000 }, (_, i) =>
      node(`n${i}`),
    );
    const child: LensGroupOutput = { nodes, edges: [], rootNodeId: 'n0' };
    const t0 = performance.now();
    pinUnderParent(child, 'container');
    expect(performance.now() - t0).toBeLessThan(30);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('pinUnderParent — ROI', () => {
  it('one helper handles both single-container and multi-top-level child shapes', () => {
    // Parallel-as-child: only its container is top-level.
    const parallelChild: LensGroupOutput = {
      nodes: [
        node('par-container', { kind: 'group' }),
        node('branch1', { parentId: 'par-container' }),
      ],
      edges: [],
      rootNodeId: 'par-container',
    };
    // Sequence-as-child: 3 step nodes, none with parentId.
    const sequenceChild: LensGroupOutput = {
      nodes: [node('s1'), node('s2'), node('s3')],
      edges: [],
      rootNodeId: 's1',
    };
    const p1 = pinUnderParent(parallelChild, 'P');
    const p2 = pinUnderParent(sequenceChild, 'P');
    expect(p1.nodes.filter((n) => n.parentId === 'P')).toHaveLength(1);
    expect(p2.nodes.filter((n) => n.parentId === 'P')).toHaveLength(3);
  });
});
