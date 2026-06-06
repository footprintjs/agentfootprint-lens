/**
 * translateConditional — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import type { GroupMember, GroupMetadata, Runner } from 'agentfootprint';
import { translateConditional } from './translateConditional.js';
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
  fallbackId?: string,
): GroupMetadata => ({
  kind: 'Conditional',
  id: 'cond',
  name: 'Route',
  members,
  ...(fallbackId !== undefined && { extra: { fallbackId } }),
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('translateConditional — unit', () => {
  it('emits a synthetic decision stage with primitiveKind=Conditional', () => {
    const out = translateConditional(
      meta([member('low', memberOutput('a')), member('high', memberOutput('b'))]),
      trustResolver,
    );
    const decision = out.nodes[0]!;
    expect(decision.id).toBe('conditional:cond');
    expect(decision.kind).toBe('stage');
    expect(decision.primitiveKind).toBe('Conditional');
  });

  it('rootNodeId equals the decision stage id', () => {
    const out = translateConditional(
      meta([member('low', memberOutput('a'))]),
      trustResolver,
    );
    expect(out.rootNodeId).toBe('conditional:cond');
  });

  it('throws on wrong kind', () => {
    expect(() =>
      translateConditional(
        { ...meta([member('low', memberOutput('a'))]), kind: 'Sequence' },
        trustResolver,
      ),
    ).toThrowError(TypeError);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('translateConditional — functional', () => {
  it('emits one decision-branch edge per member, all sourced from the decision node', () => {
    const out = translateConditional(
      meta([
        member('low', memberOutput('a')),
        member('mid', memberOutput('b')),
        member('high', memberOutput('c')),
      ]),
      trustResolver,
    );
    const dbe = out.edges.filter((e) => e.kind === 'decision-branch');
    expect(dbe).toHaveLength(3);
    for (const e of dbe) expect(e.source).toBe('conditional:cond');
  });

  it('decision-branch edges carry member ids; fallback gets a (default) suffix', () => {
    const out = translateConditional(
      meta(
        [member('low', memberOutput('a')), member('mid', memberOutput('b'))],
        'mid',
      ),
      trustResolver,
    );
    const decisionLabels = out.edges
      .filter((e) => e.kind === 'decision-branch')
      .map((e) => e.label);
    expect(decisionLabels).toEqual(['low', 'mid (default)']);
  });

  it('emits a Converge synthetic stage at the tail; exitNodeId = converge', () => {
    const out = translateConditional(
      meta([member('low', memberOutput('a'))]),
      trustResolver,
    );
    const converge = out.nodes[out.nodes.length - 1]!;
    expect(converge.id).toBe('conditional:cond/converge');
    expect(converge.label).toBe('converge');
    expect(out.exitNodeId).toBe('conditional:cond/converge');
  });

  it('every branch is joined to the converge node via a next edge', () => {
    const out = translateConditional(
      meta([member('a', memberOutput('ra')), member('b', memberOutput('rb'))]),
      trustResolver,
    );
    const joinEdges = out.edges.filter(
      (e) => e.kind === 'next' && e.target === 'conditional:cond/converge',
    );
    expect(joinEdges.map((e) => e.source).sort()).toEqual(['ra', 'rb']);
  });

  it('throws RangeError on zero branches (caller bug)', () => {
    expect(() => translateConditional(meta([]), trustResolver)).toThrowError(
      RangeError,
    );
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('translateConditional — integration', () => {
  it('preserves branch subgraphs verbatim (their inner nodes + edges survive)', () => {
    const richBranch: LensGroupOutput = {
      nodes: [
        { id: 'pcont', kind: 'group', label: 'P', primitiveKind: 'Parallel' },
        { id: 'pa', kind: 'stage', label: 'A', primitiveKind: 'Agent', parentId: 'pcont' },
      ],
      edges: [{ id: 'innerfork', source: 'pcont', target: 'pa', kind: 'fork-branch' }],
      rootNodeId: 'pcont',
    };
    const out = translateConditional(
      meta([member('br', richBranch), member('other', memberOutput('o'))]),
      trustResolver,
    );
    // decision node + branches + Converge tail
    expect(out.nodes.map((n) => n.id)).toEqual([
      'conditional:cond',
      'pcont',
      'pa',
      'o',
      'conditional:cond/converge',
    ]);
    // 1 inner fork + 2 decision-branch + 2 join-to-converge = 5
    expect(out.edges).toHaveLength(5);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('translateConditional — property', () => {
  it.each([1, 2, 3, 5, 10])(
    'N branches produce exactly N decision-branch edges (N=%d)',
    (n) => {
      const members = Array.from({ length: n }, (_, i) =>
        member(`b${i}`, memberOutput(`r${i}`)),
      );
      const out = translateConditional(meta(members), trustResolver);
      const dbe = out.edges.filter((e) => e.kind === 'decision-branch');
      expect(dbe).toHaveLength(n);
    },
  );

  it('every decision-branch edge targets a unique member rootNodeId', () => {
    const members = ['a', 'b', 'c'].map((id) => member(id, memberOutput(id)));
    const out = translateConditional(meta(members), trustResolver);
    const dbe = out.edges.filter((e) => e.kind === 'decision-branch');
    const targets = new Set(dbe.map((e) => e.target));
    expect(targets.size).toBe(dbe.length);
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('translateConditional — security', () => {
  it('does NOT mutate input metadata', () => {
    const m = meta([member('low', memberOutput('a'))], 'low');
    const before = JSON.stringify(m);
    translateConditional(m, trustResolver);
    expect(JSON.stringify(m)).toBe(before);
  });

  it('non-string fallbackId is ignored — no default suffix appears', () => {
    const m = {
      ...meta([member('low', memberOutput('a'))]),
      extra: { fallbackId: 42 as unknown as string },
    };
    const out = translateConditional(m, trustResolver);
    expect(out.edges[0]!.label).toBe('low');
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('translateConditional — performance', () => {
  it('100-branch Conditional translates under 30ms', () => {
    const members = Array.from({ length: 100 }, (_, i) =>
      member(`b${i}`, memberOutput(`r${i}`)),
    );
    const m = meta(members, 'b50');
    const t0 = performance.now();
    translateConditional(m, trustResolver);
    expect(performance.now() - t0).toBeLessThan(30);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('translateConditional — ROI', () => {
  it('one translator handles any mix of branch shapes', () => {
    const agentBranch = memberOutput('agent');
    const parallelBranch: LensGroupOutput = {
      nodes: [
        { id: 'pc', kind: 'group', label: 'P', primitiveKind: 'Parallel' },
      ],
      edges: [],
      rootNodeId: 'pc',
    };
    const out = translateConditional(
      meta([member('a', agentBranch), member('b', parallelBranch)]),
      trustResolver,
    );
    expect(out.edges.filter((e) => e.kind === 'decision-branch')).toHaveLength(
      2,
    );
  });
});
