/**
 * lensGroupTranslator — 7-pattern test matrix for the dispatcher
 * (and end-to-end composition with the per-kind translators).
 */

import { describe, expect, it } from 'vitest';
import type { GroupMetadata, Runner } from 'agentfootprint';
import { lensGroupTranslator } from './lensGroupTranslator.js';
import type { LensGroupOutput } from './types.js';

const fakeRunner = {} as Runner;

const llmCallMeta: GroupMetadata = {
  kind: 'LLMCall',
  id: 'call',
  name: 'Call',
  members: [],
  extra: { slots: ['SystemPrompt', 'Messages'] as const },
};

const agentMeta: GroupMetadata = {
  kind: 'Agent',
  id: 'agent',
  name: 'Agent',
  members: [],
  extra: {
    slots: ['SystemPrompt'] as const,
    toolNames: ['search'],
    maxIterations: 5,
  },
};

// Helper: a member whose `uiGroup` is pre-populated so the dispatcher
// trusts it instead of recursing.
const prePopulatedMember = (memberId: string, uiGroup: LensGroupOutput) => ({
  memberId,
  runner: fakeRunner,
  uiGroup,
});

const callOutput: LensGroupOutput = lensGroupTranslator(llmCallMeta);
const agentOutput: LensGroupOutput = lensGroupTranslator(agentMeta);

// ── 1. Unit ───────────────────────────────────────────────────────

describe('lensGroupTranslator — unit', () => {
  it('routes LLMCall to translateLLMCall', () => {
    expect(callOutput.nodes[0]!.primitiveKind).toBe('LLMCall');
  });

  it('routes Agent to translateAgent', () => {
    expect(agentOutput.nodes[0]!.primitiveKind).toBe('Agent');
  });

  it('throws TypeError on unknown kind', () => {
    expect(() =>
      lensGroupTranslator({
        kind: 'NotARealKind' as GroupMetadata['kind'],
        id: 'x',
        name: 'x',
        members: [],
      }),
    ).toThrowError(TypeError);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('lensGroupTranslator — functional', () => {
  it('routes Sequence — pre-populated members short-circuit recursion', () => {
    const meta: GroupMetadata = {
      kind: 'Sequence',
      id: 'seq',
      name: 'Seq',
      members: [
        prePopulatedMember('step-1', callOutput),
        prePopulatedMember('step-2', agentOutput),
      ],
    };
    const out = lensGroupTranslator(meta);
    expect(out.nodes.map((n) => n.id)).toEqual(['llmcall:call', 'agent:agent']);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]).toMatchObject({
      kind: 'next',
      source: 'llmcall:call',
      target: 'agent:agent',
    });
  });

  it('routes Loop with pre-populated body', () => {
    const meta: GroupMetadata = {
      kind: 'Loop',
      id: 'loop',
      name: 'Loop',
      members: [prePopulatedMember('body', agentOutput)],
      extra: { maxIterations: 3, hasUntilGuard: false },
    };
    const out = lensGroupTranslator(meta);
    expect(out.edges.filter((e) => e.kind === 'loop-iteration')).toHaveLength(1);
  });

  it('routes Conditional with pre-populated branches', () => {
    const meta: GroupMetadata = {
      kind: 'Conditional',
      id: 'cond',
      name: 'Cond',
      members: [
        prePopulatedMember('low', callOutput),
        prePopulatedMember('high', agentOutput),
      ],
      extra: { fallbackId: 'high' },
    };
    const out = lensGroupTranslator(meta);
    expect(out.edges.filter((e) => e.kind === 'decision-branch')).toHaveLength(2);
    expect(out.edges.find((e) => e.label === 'high (default)')).toBeDefined();
  });

  it('routes Parallel with pre-populated branches', () => {
    const meta: GroupMetadata = {
      kind: 'Parallel',
      id: 'par',
      name: 'Par',
      members: [
        prePopulatedMember('a', callOutput),
        prePopulatedMember('b', agentOutput),
      ],
      extra: { mergeStrategy: 'fn' },
    };
    const out = lensGroupTranslator(meta);
    expect(out.nodes[0]).toMatchObject({ kind: 'group', primitiveKind: 'Parallel' });
    expect(out.edges.filter((e) => e.kind === 'fork-branch')).toHaveLength(2);
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('lensGroupTranslator — integration', () => {
  it('full composition: Parallel of (Agent, Sequence of [LLMCall, Agent])', () => {
    const innerSeq: GroupMetadata = {
      kind: 'Sequence',
      id: 'inner-seq',
      name: 'Inner',
      members: [
        prePopulatedMember('a', callOutput),
        prePopulatedMember('b', agentOutput),
      ],
    };
    const innerSeqOutput = lensGroupTranslator(innerSeq);
    const outerPar: GroupMetadata = {
      kind: 'Parallel',
      id: 'outer-par',
      name: 'Outer',
      members: [
        prePopulatedMember('branch-1', agentOutput),
        prePopulatedMember('branch-2', innerSeqOutput),
      ],
      extra: { mergeStrategy: 'fn' },
    };
    const out = lensGroupTranslator(outerPar);
    // Outer container + 1 Agent branch + 2 Sequence steps + outer
    // Merge synthetic tail = 5 nodes total
    expect(out.nodes).toHaveLength(5);
    expect(out.nodes[0]!.kind).toBe('group');
    // Every non-container, non-Merge node is pinned under the outer
    // container. The Merge synthetic is a sibling sink and lives
    // OUTSIDE the compound.
    const containerId = 'parallel:outer-par';
    const mergeId = `${containerId}/merge`;
    for (const n of out.nodes) {
      if (n.id === containerId) continue;
      if (n.id === mergeId) {
        expect(n.parentId).toBeUndefined();
        continue;
      }
      expect(n.parentId).toBe(containerId);
    }
    // 1 inner-Sequence next + 2 join-to-Merge nexts (outer Parallel) = 3 nexts
    expect(out.edges.filter((e) => e.kind === 'next')).toHaveLength(3);
    expect(out.edges.filter((e) => e.kind === 'fork-branch')).toHaveLength(2);
    expect(out.exitNodeId).toBe(mergeId);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('lensGroupTranslator — property', () => {
  it.each([
    'LLMCall',
    'Agent',
  ] as const)('every leaf kind round-trips to primitiveKind=%s', (kind) => {
    const meta: GroupMetadata = {
      kind,
      id: 'x',
      name: 'x',
      members: [],
      ...(kind === 'Agent' && {
        extra: {
          slots: [],
          toolNames: [],
          maxIterations: 1,
        },
      }),
      ...(kind === 'LLMCall' && { extra: { slots: [] } }),
    };
    expect(lensGroupTranslator(meta).nodes[0]!.primitiveKind).toBe(kind);
  });
});

// ── 5. Security ───────────────────────────────────────────────────

describe('lensGroupTranslator — security', () => {
  it('throws when a member has no uiGroup and no translatable runner', () => {
    const runnerWithoutUI = {
      getUIGroupWith: () => undefined,
    } as unknown as Runner;
    const meta: GroupMetadata = {
      kind: 'Sequence',
      id: 'seq',
      name: 'Seq',
      members: [{ memberId: 'broken', runner: runnerWithoutUI }],
    };
    expect(() => lensGroupTranslator(meta)).toThrowError(
      /no translatable UI group shape/,
    );
  });

  it('does NOT mutate input metadata across the full composition', () => {
    const meta: GroupMetadata = {
      kind: 'Parallel',
      id: 'par',
      name: 'Par',
      members: [prePopulatedMember('a', callOutput)],
      extra: { mergeStrategy: 'fn' },
    };
    const before = JSON.stringify(meta);
    lensGroupTranslator(meta);
    expect(JSON.stringify(meta)).toBe(before);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('lensGroupTranslator — performance', () => {
  it('500 dispatches under 30ms (mostly LLMCall hot path)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) lensGroupTranslator(llmCallMeta);
    expect(performance.now() - t0).toBeLessThan(30);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('lensGroupTranslator — ROI', () => {
  it('one dispatcher covers all 6 kinds without per-call configuration', () => {
    expect(lensGroupTranslator(llmCallMeta).rootNodeId).toBe('llmcall:call');
    expect(lensGroupTranslator(agentMeta).rootNodeId).toBe('agent:agent');
    expect(
      lensGroupTranslator({
        kind: 'Sequence',
        id: 's',
        name: 's',
        members: [prePopulatedMember('a', callOutput)],
      }).rootNodeId,
    ).toBe('llmcall:call');
  });
});
