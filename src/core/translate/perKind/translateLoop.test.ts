/**
 * translateLoop — 7-pattern test matrix.
 */

import { describe, expect, it } from 'vitest';
import type { GroupMember, GroupMetadata, Runner } from 'agentfootprint';
import { translateLoop } from './translateLoop.js';
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
  body: GroupMember,
  extra?: Readonly<Record<string, unknown>>,
): GroupMetadata => ({
  kind: 'Loop',
  id: 'loop',
  name: 'Retry Loop',
  members: [body],
  ...(extra !== undefined && { extra }),
});

// ── 1. Unit ───────────────────────────────────────────────────────

describe('translateLoop — unit', () => {
  it('emits body nodes verbatim + 1 self-edge of kind loop-iteration', () => {
    const out = translateLoop(
      meta(member('body', memberOutput('b'))),
      trustResolver,
    );
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]).toMatchObject({
      kind: 'loop-iteration',
      source: 'b',
      target: 'b',
    });
  });

  it('rootNodeId equals the body rootNodeId', () => {
    const out = translateLoop(
      meta(member('body', memberOutput('the-body'))),
      trustResolver,
    );
    expect(out.rootNodeId).toBe('the-body');
  });

  it("throws on wrong kind", () => {
    expect(() =>
      translateLoop(
        { ...meta(member('body', memberOutput('b'))), kind: 'Sequence' },
        trustResolver,
      ),
    ).toThrowError(TypeError);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('translateLoop — functional', () => {
  it('label encodes maxIterations when present', () => {
    const out = translateLoop(
      meta(member('body', memberOutput('b')), { maxIterations: 7 }),
      trustResolver,
    );
    expect(out.edges[0]!.label).toBe('max 7');
  });

  it('label encodes both maxIterations and maxWallclockMs (s rounded)', () => {
    const out = translateLoop(
      meta(member('body', memberOutput('b')), {
        maxIterations: 10,
        maxWallclockMs: 30000,
      }),
      trustResolver,
    );
    expect(out.edges[0]!.label).toBe('max 10 · 30s');
  });

  it("label falls back to 'iterate' when no budgets are configured", () => {
    const out = translateLoop(
      meta(member('body', memberOutput('b')), { hasUntilGuard: true }),
      trustResolver,
    );
    expect(out.edges[0]!.label).toBe('iterate');
  });

  it('throws RangeError on != 1 member (Loop must have exactly 1 body)', () => {
    expect(() =>
      translateLoop({ ...meta(member('b', memberOutput('b'))), members: [] }, trustResolver),
    ).toThrowError(RangeError);
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('translateLoop — integration', () => {
  it('preserves body subgraph including its internal nodes/edges', () => {
    const body: LensGroupOutput = {
      nodes: [
        { id: 'g', kind: 'group', label: 'G', primitiveKind: 'Parallel' },
        { id: 'c', kind: 'stage', label: 'C', primitiveKind: 'Agent', parentId: 'g' },
      ],
      edges: [{ id: 'in', source: 'g', target: 'c', kind: 'fork-branch' }],
      rootNodeId: 'g',
    };
    const out = translateLoop(meta(member('b', body), { maxIterations: 3 }), trustResolver);
    expect(out.nodes.map((n) => n.id)).toEqual(['g', 'c']);
    expect(out.edges).toHaveLength(2);
    expect(out.edges[1]!).toMatchObject({
      kind: 'loop-iteration',
      source: 'g',
      target: 'g',
      label: 'max 3',
    });
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('translateLoop — property', () => {
  it('always emits exactly 1 self-edge regardless of body shape', () => {
    const ids = ['a', 'b', 'c'];
    for (const id of ids) {
      const out = translateLoop(meta(member('b', memberOutput(id))), trustResolver);
      const selfEdges = out.edges.filter(
        (e) => e.kind === 'loop-iteration' && e.source === e.target,
      );
      expect(selfEdges).toHaveLength(1);
    }
  });

  it('self-edge always targets the body rootNodeId', () => {
    const out = translateLoop(meta(member('b', memberOutput('xyz'))), trustResolver);
    expect(out.edges[0]!.source).toBe('xyz');
    expect(out.edges[0]!.target).toBe('xyz');
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('translateLoop — security', () => {
  it('does NOT mutate input metadata', () => {
    const m = meta(member('b', memberOutput('b')), { maxIterations: 5 });
    const before = JSON.stringify(m);
    translateLoop(m, trustResolver);
    expect(JSON.stringify(m)).toBe(before);
  });

  it('rejects non-numeric extras gracefully (falls back to default label)', () => {
    const out = translateLoop(
      meta(member('b', memberOutput('b')), { maxIterations: '10' as unknown as number }),
      trustResolver,
    );
    expect(out.edges[0]!.label).toBe('iterate');
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('translateLoop — performance', () => {
  it('1000 translations under 30ms', () => {
    const m = meta(member('b', memberOutput('b')), { maxIterations: 1 });
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) translateLoop(m, trustResolver);
    expect(performance.now() - t0).toBeLessThan(30);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('translateLoop — ROI', () => {
  it('one translator handles any Loop body (Agent, Parallel, Sequence)', () => {
    const agentBody = memberOutput('agent');
    const parallelBody: LensGroupOutput = {
      nodes: [
        { id: 'pc', kind: 'group', label: 'P', primitiveKind: 'Parallel' },
        { id: 'leaf', kind: 'stage', label: 'L', primitiveKind: 'Agent', parentId: 'pc' },
      ],
      edges: [],
      rootNodeId: 'pc',
    };
    const a = translateLoop(meta(member('b', agentBody)), trustResolver);
    const b = translateLoop(meta(member('b', parallelBody)), trustResolver);
    expect(a.edges[0]!.kind).toBe('loop-iteration');
    expect(b.edges[0]!.kind).toBe('loop-iteration');
  });
});
