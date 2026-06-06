/**
 * useLensRenderGraph — 7-pattern test matrix.
 *
 * Tests construct runners via the public `.create({...}).build()`
 * builder API (the same API consumers use). The mock provider returns
 * an empty reply — we never run the graph, we only ask it for its
 * UI group shape, which is computed at build time.
 */

import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { LLMCall, Sequence, Parallel, type LLMProvider } from 'agentfootprint';
import { useLensRenderGraph } from './useLensRenderGraph.js';

// Minimal LLMProvider stub — these tests never invoke .complete(), they
// only ask the runner for its build-time UI group. Cast to satisfy the
// full LLMProvider shape without writing out fields we don't exercise.
const stubProvider = { name: 'mock' } as unknown as LLMProvider;

const buildLLMCall = (id = 'call') =>
  LLMCall.create({ id, name: 'Call', provider: stubProvider, model: 'mock' })
    .system('test')
    .build();

const buildSeq = (...stepIds: string[]) => {
  let b = Sequence.create({ id: 'seq', name: 'Seq' });
  for (const id of stepIds) b = b.step(id, buildLLMCall(`${id}-call`));
  return b.build();
};

const buildPar = (...branchIds: string[]) => {
  let b = Parallel.create({ id: 'par', name: 'Committee' });
  for (const id of branchIds) b = b.branch(id, buildLLMCall(`${id}-call`));
  return b
    .mergeWithFn((results) => Object.values(results).join(' / '))
    .build();
};

// ── 1. Unit ───────────────────────────────────────────────────────

describe('useLensRenderGraph — unit', () => {
  it('returns a positioned graph for a single LLMCall runner', () => {
    const runner = buildLLMCall();
    const { result } = renderHook(() => useLensRenderGraph(runner));
    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.nodes[0]!.data.primitiveKind).toBe('LLMCall');
  });

  it('returns graph for a Sequence composition', () => {
    const runner = buildSeq('a', 'b');
    const { result } = renderHook(() => useLensRenderGraph(runner));
    expect(result.current.nodes).toHaveLength(2);
    expect(
      result.current.edges.filter((e) => e.data?.kind === 'next'),
    ).toHaveLength(1);
  });
});

// ── 2. Functional ─────────────────────────────────────────────────

describe('useLensRenderGraph — functional', () => {
  it('returns a stable reference when the runner identity is unchanged', () => {
    const runner = buildLLMCall();
    const { result, rerender } = renderHook(() => useLensRenderGraph(runner));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('recomputes when the runner identity changes', () => {
    const r1 = buildLLMCall('call-1');
    const r2 = buildLLMCall('call-2');
    const { result, rerender } = renderHook(
      ({ runner }) => useLensRenderGraph(runner),
      { initialProps: { runner: r1 } },
    );
    const first = result.current;
    rerender({ runner: r2 });
    expect(result.current).not.toBe(first);
    expect(result.current.nodes[0]!.id).toBe('llmcall:call-2');
  });
});

// ── 3. Integration ────────────────────────────────────────────────

describe('useLensRenderGraph — integration', () => {
  it('lays out a Parallel-of-LLMCalls composition end-to-end', () => {
    const runner = buildPar('legal', 'ops');
    const { result } = renderHook(() => useLensRenderGraph(runner));
    // 1 container + 2 children + 1 Merge synthetic tail = 4
    expect(result.current.nodes).toHaveLength(4);
    const container = result.current.nodes.find((n) => n.type === 'group');
    expect(container).toBeDefined();
    expect(container!.data.primitiveKind).toBe('Parallel');
    // children carry parentId pointing at the container
    const children = result.current.nodes.filter(
      (n) => n.parentId === container!.id,
    );
    expect(children).toHaveLength(2);
  });
});

// ── 4. Property ───────────────────────────────────────────────────

describe('useLensRenderGraph — property', () => {
  it.each([1, 2, 3, 5])(
    'N-step Sequence produces N nodes (N=%d)',
    (n) => {
      const ids = Array.from({ length: n }, (_, i) => `s${i}`);
      const runner = buildSeq(...ids);
      const { result } = renderHook(() => useLensRenderGraph(runner));
      expect(result.current.nodes).toHaveLength(n);
    },
  );
});

// ── 5. Security ───────────────────────────────────────────────────

describe('useLensRenderGraph — security', () => {
  it('rejects a runner that returns undefined from getUIGroupWith with a clear error', () => {
    const brokenRunner = {
      getUIGroupWith: () => undefined,
    } as unknown as Parameters<typeof useLensRenderGraph>[0];
    expect(() =>
      renderHook(() => useLensRenderGraph(brokenRunner)),
    ).toThrowError(/does not expose a translatable UI group shape/);
  });
});

// ── 6. Performance ────────────────────────────────────────────────

describe('useLensRenderGraph — performance', () => {
  it('20-branch Parallel renders under 500ms', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `b${i}`);
    const runner = buildPar(...ids);
    const t0 = performance.now();
    renderHook(() => useLensRenderGraph(runner));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

// ── 7. ROI ────────────────────────────────────────────────────────

describe('useLensRenderGraph — ROI', () => {
  it('one hook drives every composition kind', () => {
    // Parallel requires >= 2 branches by design — that's the smallest
    // shape consumers can construct, and Lens supports it.
    const llm = buildLLMCall();
    const seq = buildSeq('a');
    const par = buildPar('a', 'b');
    for (const runner of [llm, seq, par]) {
      const { result } = renderHook(() => useLensRenderGraph(runner));
      expect(result.current.nodes.length).toBeGreaterThan(0);
    }
  });
});
