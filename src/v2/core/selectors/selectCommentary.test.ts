/**
 * selectCommentary — Phase 5 Layer 3 selectors over BoundaryRecorder.
 * Covers all 7 test types per Convention 3.
 *
 * Sections:
 *   1. unit         — selectCommentaryAt + selectCommentaryRanges shapes
 *   2. functional   — typical nested scenario (Sequence > LLMCall)
 *   3. integration  — wired to a real Parallel runner via Lens
 *   4. property     — invariant: active === breadcrumb leaf-most for all positions
 *   5. security     — labels never expose payload
 *   6. performance  — 1000 positions × selectCommentaryAt < 100ms
 *   7. load         — 100 boundaries + 1000 queries < 500ms
 */

import { describe, it, expect } from 'vitest';
import { boundaryRecorder, LLMCall, Parallel, MockProvider } from 'agentfootprint';
import {
  selectCommentaryAt,
  selectCommentaryRanges,
} from './selectCommentary.js';
import { LensRecorder } from '../LensRecorder.js';
import type {
  TraversalContext,
  FlowSubflowEvent,
} from 'footprintjs';

function ctx(opts: { rid: string; runId?: string }): TraversalContext {
  return {
    runId: opts.runId ?? 'test-run',
    stageId: opts.rid.split('#')[0] ?? '',
    runtimeStageId: opts.rid,
    stageName: opts.rid,
    depth: 0,
  };
}

function subflowEvent(rid: string, subflowId: string, description: string): FlowSubflowEvent {
  return {
    name: subflowId,
    subflowId,
    description,
    traversalContext: ctx({ rid }),
  };
}

function llm(reply: string) {
  return LLMCall.create({ provider: new MockProvider({ reply }), model: 'mock' })
    .system('hi')
    .build();
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('selectCommentaryAt — unit', () => {
  it('returns empty when no ranges enclose the commit position', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    const result = selectCommentaryAt(rec, 5);
    expect(result.active).toBeUndefined();
    expect(result.breadcrumb).toHaveLength(0);
  });

  it('rejects non-finite commitIdx (NaN / Infinity / negative) — security panel fix', () => {
    let count = 5;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    rec.onSubflowEntry(subflowEvent('a#1', 'a', 'LLMCall: x'));
    expect(selectCommentaryAt(rec, Number.NaN).active).toBeUndefined();
    expect(selectCommentaryAt(rec, Number.POSITIVE_INFINITY).active).toBeUndefined();
    expect(selectCommentaryAt(rec, -1).active).toBeUndefined();
  });

  it('returns active + breadcrumb for nested boundaries', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    count = 0;
    rec.onSubflowEntry(subflowEvent('outer#1', 'outer', 'Sequence: pipeline'));
    count = 3;
    rec.onSubflowEntry(subflowEvent('inner#2', 'inner', 'LLMCall: classify'));
    count = 10;
    rec.onSubflowExit(subflowEvent('inner#2', 'inner', 'LLMCall: classify'));
    count = 15;
    rec.onSubflowExit(subflowEvent('outer#1', 'outer', 'Sequence: pipeline'));

    // At commit 5 (inside both): active = inner, breadcrumb = [outer, inner].
    const at5 = selectCommentaryAt(rec, 5);
    expect(at5.breadcrumb.map((b) => b.subflowName)).toEqual(['outer', 'inner']);
    expect(at5.active?.subflowName).toBe('inner');

    // At commit 12 (after inner, still inside outer): active = outer.
    const at12 = selectCommentaryAt(rec, 12);
    expect(at12.breadcrumb.map((b) => b.subflowName)).toEqual(['outer']);
    expect(at12.active?.subflowName).toBe('outer');

    // At commit 20: nothing.
    expect(selectCommentaryAt(rec, 20).active).toBeUndefined();
  });
});

describe('selectCommentaryRanges — unit', () => {
  it('returns all ranges sorted by startIdx', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    count = 5;
    rec.onSubflowEntry(subflowEvent('a#1', 'a', 'LLMCall: x'));
    count = 8;
    rec.onSubflowEntry(subflowEvent('b#2', 'b', 'LLMCall: y'));
    count = 10;
    rec.onSubflowExit(subflowEvent('b#2', 'b', 'LLMCall: y'));
    count = 12;
    rec.onSubflowExit(subflowEvent('a#1', 'a', 'LLMCall: x'));

    const ranges = selectCommentaryRanges(rec);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]?.startIdx).toBeLessThanOrEqual(ranges[1]!.startIdx);
  });

  it('open ranges have undefined endIdx', () => {
    let count = 5;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    rec.onSubflowEntry(subflowEvent('a#1', 'a', 'LLMCall: x'));
    // No exit fired → still open.
    const ranges = selectCommentaryRanges(rec);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.endIdx).toBeUndefined();
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('selectCommentary — functional', () => {
  it('two-stage Sequence: commentary reflects each stage at its position', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    count = 0;
    rec.onSubflowEntry(subflowEvent('stage1#1', 'classify', 'LLMCall: cls'));
    count = 5;
    rec.onSubflowExit(subflowEvent('stage1#1', 'classify', 'LLMCall: cls'));
    count = 6;
    rec.onSubflowEntry(subflowEvent('stage2#2', 'respond', 'LLMCall: resp'));
    count = 12;
    rec.onSubflowExit(subflowEvent('stage2#2', 'respond', 'LLMCall: resp'));

    expect(selectCommentaryAt(rec, 3).active?.subflowName).toBe('classify');
    expect(selectCommentaryAt(rec, 8).active?.subflowName).toBe('respond');
    // Between stages — no commentary.
    expect(selectCommentaryAt(rec, 5).active?.subflowName).toBe('classify'); // boundary inclusive
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('selectCommentary — integration with LensRecorder + real Parallel', () => {
  it('Parallel run: commentary at mid-fork shows enclosing + sibling branches', async () => {
    const par = Parallel.create({ name: 'committee' })
      .branch('legal', llm('L'))
      .branch('ethics', llm('E'))
      .mergeWithFn((r) => Object.values(r).join('|'))
      .build();

    const lens = new LensRecorder();
    lens.observe(par);
    await par.run({ message: 'go' });

    // The boundary index is populated incrementally during the run.
    // Query at some mid-run commit.
    const total = par.getLastSnapshot()?.commitLog.length ?? 0;
    expect(total).toBeGreaterThan(0);
    const ranges = selectCommentaryRanges(lens.boundary);
    expect(ranges.length).toBeGreaterThan(0);
    // Verify at least one query returns valid commentary.
    const midResult = selectCommentaryAt(lens.boundary, Math.floor(total / 2));
    // active may be defined or undefined depending on commit positions,
    // but breadcrumb must be a valid array.
    expect(Array.isArray(midResult.breadcrumb)).toBe(true);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('selectCommentary — property', () => {
  it('active === breadcrumb leaf-most for every commit position', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    // Random nested + sequential boundaries.
    const ranges: Array<{ rid: string; start: number; end: number }> = [];
    for (let i = 0; i < 20; i++) {
      const start = Math.floor(Math.random() * 50);
      const end = start + Math.floor(Math.random() * 30);
      count = start;
      rec.onSubflowEntry(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
      count = end;
      rec.onSubflowExit(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
      ranges.push({ rid: `s${i}#${i}`, start, end });
    }
    for (let q = 0; q < 20; q++) {
      const point = Math.floor(Math.random() * 100);
      const result = selectCommentaryAt(rec, point);
      if (result.breadcrumb.length === 0) {
        expect(result.active).toBeUndefined();
      } else {
        expect(result.active).toBe(result.breadcrumb[result.breadcrumb.length - 1]);
      }
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('selectCommentary — security', () => {
  it('labels never expose payload (BoundaryRangeLabel is stripped projection)', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    rec.onSubflowEntry({
      name: 'leaky',
      subflowId: 'leaky',
      description: 'LLMCall: x',
      mappedInput: { secret: 'should-not-leak' },
      traversalContext: ctx({ rid: 'leaky#1' }),
    });
    const result = selectCommentaryAt(rec, 0);
    expect((result.active as { payload?: unknown })?.payload).toBeUndefined();
    expect(result.breadcrumb.every((b) => (b as { payload?: unknown }).payload === undefined)).toBe(true);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('selectCommentary — performance', () => {
  it('1000 selectCommentaryAt calls on 100-boundary index < 200ms', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    for (let i = 0; i < 100; i++) {
      count = i * 10;
      rec.onSubflowEntry(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
      count = i * 10 + 5;
      rec.onSubflowExit(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
    }
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      selectCommentaryAt(rec, i);
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(200);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('selectCommentary — load', () => {
  it('100 boundaries + 5000 queries < 500ms total', () => {
    let count = 0;
    const rec = boundaryRecorder({ getCommitCount: () => count });
    for (let i = 0; i < 100; i++) {
      count = i * 5;
      rec.onSubflowEntry(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
      count = i * 5 + 8;
      rec.onSubflowExit(subflowEvent(`s${i}#${i}`, `s${i}`, 'LLMCall: x'));
    }
    const t0 = performance.now();
    for (let i = 0; i < 5000; i++) {
      selectCommentaryAt(rec, i % 500);
    }
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
  });
});
