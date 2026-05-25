/**
 * translateSequence — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import type { GroupMember, GroupMetadata, Runner } from 'agentfootprint';
import { translateSequence } from './translateSequence.js';
import type { LensGroupOutput, LensNode } from '../types.js';
import type { MemberResolver } from './MemberResolver.js';

// Fake runner — never invoked in these unit tests; the resolver
// short-circuits via member.uiGroup.
const fakeRunner = {} as Runner;

const stage = (id: string): LensNode => ({
  id,
  kind: 'stage',
  label: id,
  primitiveKind: 'LLMCall',
});

const memberOutput = (
  rootId: string,
  extraNodes: LensNode[] = [],
): LensGroupOutput => ({
  nodes: [stage(rootId), ...extraNodes],
  edges: [],
  rootNodeId: rootId,
});

const member = (id: string, uiGroup: LensGroupOutput): GroupMember => ({
  memberId: id,
  runner: fakeRunner,
  uiGroup,
});

// Resolver that trusts pre-populated uiGroup. Per-kind translators
// don't care HOW the resolver works; they only care that it returns
// a LensGroupOutput.
const trustResolver: MemberResolver = (m) => m.uiGroup as LensGroupOutput;

const meta = (members: GroupMember[]): GroupMetadata => ({
  kind: 'Sequence',
  id: 'seq',
  name: 'My Sequence',
  members,
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('translateSequence — unit', () => {
  it('single member: no edges, rootNodeId equals member rootNodeId', () => {
    const out = translateSequence(
      meta([member('m1', memberOutput('a'))]),
      trustResolver,
    );
    expect(out.nodes.map((n) => n.id)).toEqual(['a']);
    expect(out.edges).toEqual([]);
    expect(out.rootNodeId).toBe('a');
  });

  it('two members: one next edge between their rootNodeIds', () => {
    const out = translateSequence(
      meta([
        member('m1', memberOutput('a')),
        member('m2', memberOutput('b')),
      ]),
      trustResolver,
    );
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]).toMatchObject({
      kind: 'next',
      source: 'a',
      target: 'b',
    });
  });

  it("throws on wrong kind", () => {
    expect(() =>
      translateSequence(
        { ...meta([member('m1', memberOutput('a'))]), kind: 'Parallel' },
        trustResolver,
      ),
    ).toThrowError(TypeError);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('translateSequence — functional', () => {
  it('chain length: N members produce N-1 next edges in order', () => {
    const ms = ['a', 'b', 'c', 'd'].map((id) =>
      member(id, memberOutput(id)),
    );
    const out = translateSequence(meta(ms), trustResolver);
    expect(out.edges.map((e) => `${e.source}->${e.target}`)).toEqual([
      'a->b',
      'b->c',
      'c->d',
    ]);
  });

  it('rootNodeId is the FIRST member rootNodeId (entry point)', () => {
    const out = translateSequence(
      meta([
        member('m1', memberOutput('first')),
        member('m2', memberOutput('second')),
      ]),
      trustResolver,
    );
    expect(out.rootNodeId).toBe('first');
  });

  it('throws RangeError on zero members (caller bug, loud failure)', () => {
    expect(() => translateSequence(meta([]), trustResolver)).toThrowError(
      RangeError,
    );
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('translateSequence — integration', () => {
  it('absorbs nested subgraphs verbatim (members carry their own children + edges)', () => {
    const nested: LensGroupOutput = {
      nodes: [
        { id: 'agroup', kind: 'group', label: 'A', primitiveKind: 'Parallel' },
        { id: 'achild', kind: 'stage', label: 'C', primitiveKind: 'Agent', parentId: 'agroup' },
      ],
      edges: [{ id: 'inner', source: 'agroup', target: 'achild', kind: 'fork-branch' }],
      rootNodeId: 'agroup',
    };
    const out = translateSequence(
      meta([
        member('m1', nested),
        member('m2', memberOutput('next-step')),
      ]),
      trustResolver,
    );
    expect(out.nodes.map((n) => n.id)).toEqual(['agroup', 'achild', 'next-step']);
    // chain edge plus the absorbed inner edge survives
    expect(out.edges).toHaveLength(2);
    expect(out.edges[0]!.kind).toBe('fork-branch'); // inner first
    expect(out.edges[1]!.kind).toBe('next');        // then chain
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('translateSequence — property', () => {
  it.each([1, 2, 3, 5, 10])(
    'N members produce exactly max(N-1, 0) next edges (N=%d)',
    (n) => {
      const ms = Array.from({ length: n }, (_, i) =>
        member(`m${i}`, memberOutput(`r${i}`)),
      );
      const out = translateSequence(meta(ms), trustResolver);
      const nextCount = out.edges.filter((e) => e.kind === 'next').length;
      expect(nextCount).toBe(Math.max(n - 1, 0));
    },
  );

  it('every chain edge connects consecutive members in declaration order', () => {
    const ids = ['x', 'y', 'z'];
    const ms = ids.map((id) => member(id, memberOutput(id)));
    const out = translateSequence(meta(ms), trustResolver);
    const chainEdges = out.edges.filter((e) => e.kind === 'next');
    for (let i = 0; i < chainEdges.length; i++) {
      expect(chainEdges[i]!.source).toBe(ids[i]);
      expect(chainEdges[i]!.target).toBe(ids[i + 1]);
    }
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('translateSequence — security', () => {
  it('does NOT mutate input metadata or its members', () => {
    const ms = [member('m1', memberOutput('a')), member('m2', memberOutput('b'))];
    const m = meta(ms);
    const before = JSON.stringify(m);
    translateSequence(m, trustResolver);
    expect(JSON.stringify(m)).toBe(before);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('translateSequence — performance', () => {
  it('500-member sequence translates under 50ms', () => {
    const ms = Array.from({ length: 500 }, (_, i) =>
      member(`m${i}`, memberOutput(`r${i}`)),
    );
    const m = meta(ms);
    const t0 = performance.now();
    translateSequence(m, trustResolver);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('translateSequence — ROI', () => {
  it('one translator covers Sequence of any kind of member subgraph', () => {
    const agentLike: LensGroupOutput = memberOutput('agent-x');
    const parallelLike: LensGroupOutput = {
      nodes: [
        { id: 'pcont', kind: 'group', label: 'P', primitiveKind: 'Parallel' },
        { id: 'pa', kind: 'stage', label: 'A', primitiveKind: 'Agent', parentId: 'pcont' },
      ],
      edges: [{ id: 'fork', source: 'pcont', target: 'pa', kind: 'fork-branch' }],
      rootNodeId: 'pcont',
    };
    const out = translateSequence(
      meta([member('m1', agentLike), member('m2', parallelLike)]),
      trustResolver,
    );
    expect(out.nodes.map((n) => n.id)).toEqual(['agent-x', 'pcont', 'pa']);
    expect(out.edges.find((e) => e.kind === 'next')).toMatchObject({
      source: 'agent-x',
      target: 'pcont',
    });
  });
});
