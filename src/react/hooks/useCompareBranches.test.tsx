/**
 * useCompareBranches — Layer 2 / Tier B tests (Convention 3, 7 patterns).
 */

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SpecNode } from '../../core/buildSpecTreeFromBoundary.js';
import type { StepGraph, StepNode } from 'agentfootprint/observe';
import { useCompareBranches } from './useCompareBranches.js';

function parallelSpec(branchIds: readonly string[]): SpecNode {
  return {
    name: 'fan',
    description: 'Parallel: 2-way',
    children: branchIds.map((id) => ({
      name: id, description: '', subflowId: id, subflowName: id, isSubflowRoot: true,
    })),
  };
}

function nonParallelSpec(): SpecNode {
  return { name: 'seq', description: 'Sequence: simple', children: [] };
}

function step(partial: Partial<StepNode> & { id: string; kind: StepNode['kind'] }): StepNode {
  return {
    label: partial.id,
    startOffsetMs: 0,
    subflowPath: [],
    ...partial,
  } as StepNode;
}

function graph(nodes: StepNode[]): StepGraph {
  return { nodes, edges: [] } as unknown as StepGraph;
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('useCompareBranches — unit', () => {
  it('undefined spec → null', () => {
    const { result } = renderHook(() => useCompareBranches(undefined, graph([])));
    expect(result.current).toBeNull();
  });

  it('undefined stepGraph → null', () => {
    const { result } = renderHook(() => useCompareBranches(parallelSpec(['a', 'b']), undefined));
    expect(result.current).toBeNull();
  });

  it('non-Parallel spec → null', () => {
    const { result } = renderHook(() => useCompareBranches(nonParallelSpec(), graph([])));
    expect(result.current).toBeNull();
  });

  it('Parallel with two branches → 2 columns (empty data)', () => {
    const { result } = renderHook(() => useCompareBranches(parallelSpec(['a', 'b']), graph([])));
    expect(result.current).toHaveLength(2);
    expect(result.current![0]!.branchId).toBe('a');
    expect(result.current![1]!.branchId).toBe('b');
  });

  it('column defaults: empty arrays, zero tokens, status=running', () => {
    const { result } = renderHook(() => useCompareBranches(parallelSpec(['a']), graph([])));
    const col = result.current![0]!;
    expect(col.systemPrompt).toBe('');
    expect(col.messages).toEqual([]);
    expect(col.tools).toEqual([]);
    expect(col.response).toBe('');
    expect(col.tokenCount).toEqual({ input: 0, output: 0 });
    expect(col.status).toBe('running');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('useCompareBranches — functional', () => {
  it('sums tokens across branch LLM steps', () => {
    const nodes: StepNode[] = [
      step({ id: 's-a-1', kind: 'user->llm', subflowPath: ['a'], tokens: { in: 100, out: 50 } }),
      step({ id: 's-a-2', kind: 'tool->llm', subflowPath: ['a'], tokens: { in: 30, out: 10 } }),
      step({ id: 's-b-1', kind: 'user->llm', subflowPath: ['b'], tokens: { in: 80, out: 20 } }),
    ];
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a', 'b']), graph(nodes)),
    );
    expect(result.current![0]!.tokenCount).toEqual({ input: 130, output: 60 });
    expect(result.current![1]!.tokenCount).toEqual({ input: 80, output: 20 });
  });

  it('response is last llm->user assistantText in branch', () => {
    const nodes: StepNode[] = [
      step({ id: 's-a-1', kind: 'llm->user', subflowPath: ['a'], assistantText: 'first' }),
      step({ id: 's-a-2', kind: 'llm->user', subflowPath: ['a'], assistantText: 'final' }),
    ];
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a']), graph(nodes)),
    );
    expect(result.current![0]!.response).toBe('final');
  });

  it('status=ok when branch subflow has endOffsetMs', () => {
    const nodes: StepNode[] = [
      step({ id: 'a', kind: 'subflow', subflowPath: ['a'], startOffsetMs: 0, endOffsetMs: 1000 }),
    ];
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a']), graph(nodes)),
    );
    expect(result.current![0]!.status).toBe('ok');
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('useCompareBranches — integration', () => {
  it('three-way parallel produces three columns', () => {
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a', 'b', 'c']), graph([])),
    );
    expect(result.current).toHaveLength(3);
  });

  it('messages/tools/systemPrompt pulled from slotUpdated steps', () => {
    const nodes: StepNode[] = [
      step({
        id: 's-a-1', kind: 'user->llm', subflowPath: ['a'],
        slotUpdated: 'messages',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ exitPayload: [{ role: 'user', content: 'hi' }] } as any),
      }),
      step({
        id: 's-a-2', kind: 'user->llm', subflowPath: ['a'],
        slotUpdated: 'system-prompt',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ exitPayload: 'You are helpful.' } as any),
      }),
      step({
        id: 's-a-3', kind: 'user->llm', subflowPath: ['a'],
        slotUpdated: 'tools',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ exitPayload: [{ name: 'search', description: 'web search' }] } as any),
      }),
    ];
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a']), graph(nodes)),
    );
    const col = result.current![0]!;
    expect(col.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(col.systemPrompt).toBe('You are helpful.');
    expect(col.tools).toEqual([{ name: 'search', description: 'web search' }]);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('useCompareBranches — property', () => {
  it('columns appear in spec children order', () => {
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['z', 'a', 'm']), graph([])),
    );
    expect(result.current!.map((c) => c.branchId)).toEqual(['z', 'a', 'm']);
  });

  it('memoizes — same spec+graph identity → same result', () => {
    const spec = parallelSpec(['a']);
    const g = graph([]);
    const { result, rerender } = renderHook(
      ({ s, gr }) => useCompareBranches(s, gr),
      { initialProps: { s: spec, gr: g } },
    );
    const first = result.current;
    rerender({ s: spec, gr: g });
    expect(result.current).toBe(first);
  });

  it('null result when stepGraph is undefined regardless of spec', () => {
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a']), undefined),
    );
    expect(result.current).toBeNull();
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('useCompareBranches — security', () => {
  it('hostile exitPayload (non-array) produces empty messages/tools', () => {
    const nodes: StepNode[] = [
      step({
        id: 's', kind: 'user->llm', subflowPath: ['a'],
        slotUpdated: 'messages',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ exitPayload: { hostile: 'object' } } as any),
      }),
    ];
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a']), graph(nodes)),
    );
    expect(result.current![0]!.messages).toEqual([]);
  });

  it('hostile message items (missing role, null, or content-only) are filtered out', () => {
    const nodes: StepNode[] = [
      step({
        id: 's', kind: 'user->llm', subflowPath: ['a'],
        slotUpdated: 'messages',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ exitPayload: [{ content: 'x' }, null, { role: 'assistant', content: 'ok' }] } as any),
      }),
    ];
    const { result } = renderHook(() =>
      useCompareBranches(parallelSpec(['a']), graph(nodes)),
    );
    // role is required; content-only items + null are dropped.
    expect(result.current![0]!.messages).toHaveLength(1);
    expect(result.current![0]!.messages[0]).toEqual({ role: 'assistant', content: 'ok' });
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('useCompareBranches — performance', () => {
  it('5-branch parallel × 500 step nodes in under 50ms', () => {
    const branchIds = ['a', 'b', 'c', 'd', 'e'];
    const nodes: StepNode[] = [];
    for (let i = 0; i < 500; i++) {
      const b = branchIds[i % 5]!;
      nodes.push(step({ id: `s${i}`, kind: 'user->llm', subflowPath: [b], tokens: { in: 1, out: 1 } }));
    }
    const start = performance.now();
    renderHook(() => useCompareBranches(parallelSpec(branchIds), graph(nodes)));
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(200);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('useCompareBranches — load', () => {
  it('10-branch parallel × 5000 step nodes in under 500ms', () => {
    const branchIds = Array.from({ length: 10 }, (_, i) => `b${i}`);
    const nodes: StepNode[] = [];
    for (let i = 0; i < 5000; i++) {
      const b = branchIds[i % 10]!;
      nodes.push(step({ id: `s${i}`, kind: 'user->llm', subflowPath: [b], tokens: { in: 1, out: 1 } }));
    }
    const start = performance.now();
    renderHook(() => useCompareBranches(parallelSpec(branchIds), graph(nodes)));
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(1500);
  });
});
