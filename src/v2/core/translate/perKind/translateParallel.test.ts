/**
 * translateParallel — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import type { GroupMember, GroupMetadata, Runner } from 'agentfootprint';
import { translateParallel } from './translateParallel.js';
import type { LensGroupOutput, LensNode } from '../types.js';
import type { MemberResolver } from './MemberResolver.js';

const fakeRunner = {} as Runner;

const stage = (id: string): LensNode => ({
  id,
  kind: 'stage',
  label: id,
  primitiveKind: 'LLMCall',
});

const memberOutput = (rootId: string): LensGroupOutput => ({
  nodes: [stage(rootId)],
  edges: [],
  rootNodeId: rootId,
});

const member = (id: string, uiGroup: LensGroupOutput): GroupMember => ({
  memberId: id,
  runner: fakeRunner,
  uiGroup,
});

const trustResolver: MemberResolver = (m) => m.uiGroup as LensGroupOutput;

const meta = (
  members: GroupMember[],
  mergeStrategy: 'fn' | 'llm' | 'outcomes-fn' = 'fn',
): GroupMetadata => ({
  kind: 'Parallel',
  id: 'par',
  name: 'Committee',
  members,
  extra: { mergeStrategy },
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('translateParallel — unit', () => {
  it('emits a compound group node as the first element of nodes', () => {
    const out = translateParallel(
      meta([member('legal', memberOutput('a')), member('ops', memberOutput('b'))]),
      trustResolver,
    );
    expect(out.nodes[0]).toMatchObject({
      id: 'parallel:par',
      kind: 'group',
      primitiveKind: 'Parallel',
    });
  });

  it('rootNodeId equals the container node id', () => {
    const out = translateParallel(
      meta([member('legal', memberOutput('a'))]),
      trustResolver,
    );
    expect(out.rootNodeId).toBe('parallel:par');
  });

  it('throws on wrong kind', () => {
    expect(() =>
      translateParallel(
        { ...meta([member('legal', memberOutput('a'))]), kind: 'Sequence' },
        trustResolver,
      ),
    ).toThrowError(TypeError);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('translateParallel — functional', () => {
  it('pins every branch rootNodeId under the container', () => {
    const out = translateParallel(
      meta([
        member('legal', memberOutput('a')),
        member('ops', memberOutput('b')),
      ]),
      trustResolver,
    );
    // The container and the synthetic Merge node sit OUTSIDE the
    // compound (Merge is a sibling sink, not a child). Every real
    // branch member is pinned inside the container.
    const branchNodes = out.nodes.filter(
      (n) => n.id !== 'parallel:par' && n.id !== 'parallel:par/merge',
    );
    for (const n of branchNodes) {
      expect(n.parentId).toBe('parallel:par');
    }
  });

  it('emits a Merge synthetic stage at the tail; exitNodeId = merge', () => {
    const out = translateParallel(
      meta([member('legal', memberOutput('a')), member('ops', memberOutput('b'))]),
      trustResolver,
    );
    const merge = out.nodes[out.nodes.length - 1]!;
    expect(merge.id).toBe('parallel:par/merge');
    expect(merge.label).toBe('merge');
    expect(out.exitNodeId).toBe('parallel:par/merge');
  });

  it('every branch is joined to the Merge node via a next edge', () => {
    const out = translateParallel(
      meta([member('a', memberOutput('ra')), member('b', memberOutput('rb'))]),
      trustResolver,
    );
    const joinEdges = out.edges.filter(
      (e) => e.kind === 'next' && e.target === 'parallel:par/merge',
    );
    expect(joinEdges.map((e) => e.source).sort()).toEqual(['ra', 'rb']);
  });

  it('emits N fork-branch edges, all sourced from the container', () => {
    const out = translateParallel(
      meta([
        member('legal', memberOutput('a')),
        member('ops', memberOutput('b')),
        member('finance', memberOutput('c')),
      ]),
      trustResolver,
    );
    const forks = out.edges.filter((e) => e.kind === 'fork-branch');
    expect(forks).toHaveLength(3);
    for (const e of forks) expect(e.source).toBe('parallel:par');
  });

  it('fork-branch edge labels are the member ids (branch ids)', () => {
    const out = translateParallel(
      meta([
        member('legal', memberOutput('a')),
        member('ops', memberOutput('b')),
      ]),
      trustResolver,
    );
    const forks = out.edges.filter((e) => e.kind === 'fork-branch');
    expect(forks.map((e) => e.label)).toEqual(['legal', 'ops']);
  });

  it('container.metadata carries the merge strategy', () => {
    const out = translateParallel(
      meta([member('legal', memberOutput('a'))], 'llm'),
      trustResolver,
    );
    expect(out.nodes[0]!.metadata).toEqual({ mergeStrategy: 'llm' });
  });

  it('throws RangeError on zero branches (caller bug)', () => {
    expect(() => translateParallel(meta([]), trustResolver)).toThrowError(
      RangeError,
    );
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('translateParallel — integration', () => {
  it('preserves a branch that has its own inner Parallel container', () => {
    const innerParallel: LensGroupOutput = {
      nodes: [
        { id: 'inner', kind: 'group', label: 'I', primitiveKind: 'Parallel' },
        { id: 'inner-a', kind: 'stage', label: 'A', primitiveKind: 'Agent', parentId: 'inner' },
      ],
      edges: [{ id: 'innerfork', source: 'inner', target: 'inner-a', kind: 'fork-branch' }],
      rootNodeId: 'inner',
    };
    const out = translateParallel(
      meta([member('nested', innerParallel), member('flat', memberOutput('flat-a'))]),
      trustResolver,
    );
    // Container, then nested-inner (pinned outer), then nested-inner-a
    // (pinned inner — UNCHANGED), then flat-a (pinned outer), then the
    // Merge synthetic tail (sibling of container).
    expect(out.nodes.map((n) => n.id)).toEqual([
      'parallel:par',
      'inner',
      'inner-a',
      'flat-a',
      'parallel:par/merge',
    ]);
    expect(out.nodes[1]!.parentId).toBe('parallel:par');
    expect(out.nodes[2]!.parentId).toBe('inner'); // grandchild preserved
    expect(out.nodes[3]!.parentId).toBe('parallel:par');
    expect(out.nodes[4]!.parentId).toBeUndefined(); // Merge is a sibling
  });

  it('absorbs a Sequence-like branch (multiple top-level nodes all pinned)', () => {
    const seq: LensGroupOutput = {
      nodes: [stage('s1'), stage('s2'), stage('s3')],
      edges: [
        { id: 'n1', source: 's1', target: 's2', kind: 'next' },
        { id: 'n2', source: 's2', target: 's3', kind: 'next' },
      ],
      rootNodeId: 's1',
    };
    const out = translateParallel(meta([member('seq', seq)]), trustResolver);
    expect(out.nodes.filter((n) => n.parentId === 'parallel:par')).toHaveLength(3);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('translateParallel — property', () => {
  it.each([1, 2, 3, 5, 10])(
    'N branches produce exactly N fork-branch edges (N=%d)',
    (n) => {
      const members = Array.from({ length: n }, (_, i) =>
        member(`b${i}`, memberOutput(`r${i}`)),
      );
      const out = translateParallel(meta(members), trustResolver);
      const forks = out.edges.filter((e) => e.kind === 'fork-branch');
      expect(forks).toHaveLength(n);
    },
  );

  it('container always appears at array index 0 (parent-before-child invariant)', () => {
    const members = ['a', 'b', 'c'].map((id) => member(id, memberOutput(id)));
    const out = translateParallel(meta(members), trustResolver);
    expect(out.nodes[0]!.kind).toBe('group');
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('translateParallel — security', () => {
  it('does NOT mutate input metadata', () => {
    const m = meta([member('legal', memberOutput('a'))]);
    const before = JSON.stringify(m);
    translateParallel(m, trustResolver);
    expect(JSON.stringify(m)).toBe(before);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('translateParallel — performance', () => {
  it('100-branch Parallel translates under 50ms', () => {
    const members = Array.from({ length: 100 }, (_, i) =>
      member(`b${i}`, memberOutput(`r${i}`)),
    );
    const m = meta(members);
    const t0 = performance.now();
    translateParallel(m, trustResolver);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('translateParallel — ROI', () => {
  it('one translator handles arbitrary branch shapes (Agent, LLMCall, nested Parallel, Sequence)', () => {
    const agentBranch = memberOutput('agent-x');
    const innerParallel: LensGroupOutput = {
      nodes: [{ id: 'inner', kind: 'group', label: 'I', primitiveKind: 'Parallel' }],
      edges: [],
      rootNodeId: 'inner',
    };
    const seqLike: LensGroupOutput = {
      nodes: [stage('s1'), stage('s2')],
      edges: [{ id: 'n', source: 's1', target: 's2', kind: 'next' }],
      rootNodeId: 's1',
    };
    const out = translateParallel(
      meta([
        member('agent', agentBranch),
        member('par', innerParallel),
        member('seq', seqLike),
      ]),
      trustResolver,
    );
    expect(out.edges.filter((e) => e.kind === 'fork-branch')).toHaveLength(3);
    // Sequence's inner next edge survives
    expect(out.edges.some((e) => e.kind === 'next')).toBe(true);
  });
});
