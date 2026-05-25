/**
 * TimingRecorder — Lens v0.1 Layer 1 / Tier A tests.
 * Covers all 7 test types per Convention 3 + a composition-safe gate
 * section that cross-cuts unit + functional + property.
 *
 * Pattern under test: COMPOSITION (KeyedStore<TimingEntry> owned as a
 * private field). NO inheritance from KeyedRecorder. Per Convention 1.
 *
 * Sections:
 *   1. unit         — single hook behaves correctly in isolation
 *   2. functional   — happy path: start → end → durationMs settled
 *   3. integration  — real Sequence + Parallel-like overlapping flows
 *   4. property     — durationMs invariant for any (start,end) pair
 *   5. security     — TimingEntry payload only — no event-field leak
 *   6. performance  — 1000 start/end pairs in <10ms (tightened)
 *   7. load         — 10k start/end pairs in <100ms (tightened)
 *   8. composition-safe gate — clear() no-op when in flight; settled
 *                              duplicates ignored; underflow guard.
 *   9. composition pattern witness — Convention 1 compliance.
 */

import { describe, it, expect } from 'vitest';
import { TimingRecorder, timingRecorder } from './TimingRecorder.js';
import type { StageEvent } from 'footprintjs';

function makeStageEvent(rid: string, timestamp: number): StageEvent {
  return {
    stageName: rid.split('#')[0] ?? rid,
    stageId: rid.split('#')[0] ?? rid,
    runtimeStageId: rid,
    pipelineId: 'test-pipeline',
    timestamp,
  };
}

// ─── 1. UNIT ────────────────────────────────────────────────────────

describe('TimingRecorder — unit', () => {
  it('records startMs on onStageStart', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 1000));
    expect(rec.getTiming('a#1')).toEqual({
      runtimeStageId: 'a#1',
      startMs: 1000,
    });
  });

  it('records endMs + durationMs on onStageEnd', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 1000));
    rec.onStageEnd(makeStageEvent('a#1', 1340));
    expect(rec.getTiming('a#1')).toEqual({
      runtimeStageId: 'a#1',
      startMs: 1000,
      endMs: 1340,
      durationMs: 340,
    });
  });

  it('returns undefined for unknown runtimeStageId', () => {
    const rec = timingRecorder();
    expect(rec.getTiming('never-started')).toBeUndefined();
  });

  it('clamps negative durationMs to 0 (defensive against clock skew)', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 2000));
    rec.onStageEnd(makeStageEvent('a#1', 1000));
    expect(rec.getTiming('a#1')?.durationMs).toBe(0);
  });

  it('handles unmatched onStageEnd without crash (writes zero-duration entry)', () => {
    const rec = timingRecorder();
    rec.onStageEnd(makeStageEvent('orphan#1', 1500));
    const entry = rec.getTiming('orphan#1');
    expect(entry).toBeDefined();
    expect(entry?.durationMs).toBe(0);
  });

  it('factory assigns auto-incremented default id', () => {
    const rec1 = timingRecorder();
    const rec2 = timingRecorder();
    expect(rec1.id).not.toBe(rec2.id);
    expect(rec1.id).toMatch(/^timing-/);
  });

  it('explicit id overrides default', () => {
    const rec = timingRecorder({ id: 'custom-timing' });
    expect(rec.id).toBe('custom-timing');
  });
});

// ─── 2. FUNCTIONAL ──────────────────────────────────────────────────

describe('TimingRecorder — functional', () => {
  it('sequential start→end produces durationMs immediately', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('seed#0', 0));
    rec.onStageEnd(makeStageEvent('seed#0', 50));
    rec.onStageStart(makeStageEvent('call-llm#1', 60));
    rec.onStageEnd(makeStageEvent('call-llm#1', 3400));
    rec.onStageStart(makeStageEvent('merge#2', 3410));
    rec.onStageEnd(makeStageEvent('merge#2', 3420));

    expect(rec.getTiming('seed#0')?.durationMs).toBe(50);
    expect(rec.getTiming('call-llm#1')?.durationMs).toBe(3340);
    expect(rec.getTiming('merge#2')?.durationMs).toBe(10);
    expect(rec.size).toBe(3);
  });

  it('in-flight stage has startMs but no endMs/durationMs', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 1000));
    const entry = rec.getTiming('a#1');
    expect(entry?.startMs).toBe(1000);
    expect(entry?.endMs).toBeUndefined();
    expect(entry?.durationMs).toBeUndefined();
  });

  it('totalDurationMs sums settled entries; skips in-flight', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.onStageEnd(makeStageEvent('a#1', 100));
    rec.onStageStart(makeStageEvent('b#2', 100));
    rec.onStageEnd(makeStageEvent('b#2', 250));
    rec.onStageStart(makeStageEvent('c#3', 250));
    expect(rec.totalDurationMs(['a#1', 'b#2', 'c#3'])).toBe(250);
  });

  it('totalDurationMs silently skips missing keys (typo-tolerant)', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.onStageEnd(makeStageEvent('a#1', 100));
    expect(rec.totalDurationMs(['a#1', 'typo#999'])).toBe(100);
  });
});

// ─── 3. INTEGRATION ─────────────────────────────────────────────────

describe('TimingRecorder — integration', () => {
  it('100 sequential start/end pairs all settle', () => {
    const rec = timingRecorder();
    for (let i = 0; i < 100; i++) {
      rec.onStageStart(makeStageEvent(`stage#${i}`, i * 10));
      rec.onStageEnd(makeStageEvent(`stage#${i}`, i * 10 + 7));
    }
    expect(rec.size).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(rec.getTiming(`stage#${i}`)?.durationMs).toBe(7);
    }
  });

  it('overlapping starts (Parallel-like) produce independent entries', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('legal#1', 0));
    rec.onStageStart(makeStageEvent('ethics#2', 0));
    rec.onStageStart(makeStageEvent('cost#3', 0));
    rec.onStageEnd(makeStageEvent('cost#3', 200));
    rec.onStageEnd(makeStageEvent('legal#1', 300));
    rec.onStageEnd(makeStageEvent('ethics#2', 400));
    expect(rec.getTiming('cost#3')?.durationMs).toBe(200);
    expect(rec.getTiming('legal#1')?.durationMs).toBe(300);
    expect(rec.getTiming('ethics#2')?.durationMs).toBe(400);
  });
});

// ─── 4. PROPERTY ────────────────────────────────────────────────────

describe('TimingRecorder — property', () => {
  it('durationMs === max(0, end - start) for ANY (start,end) pair', () => {
    const rec = timingRecorder();
    const rng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };
    const r = rng(42);
    // 25% intentionally-negative skew cases exercise the clamp path.
    for (let i = 0; i < 200; i++) {
      const start = Math.floor(r() * 1_000_000);
      const skewProbability = r();
      const end = skewProbability < 0.25
        ? start - Math.floor(r() * 1000)
        : Math.floor(r() * 1_000_000);
      rec.onStageStart(makeStageEvent(`s#${i}`, start));
      rec.onStageEnd(makeStageEvent(`s#${i}`, end));
      const entry = rec.getTiming(`s#${i}`);
      expect(entry?.durationMs).toBe(Math.max(0, end - start));
    }
  });
});

// ─── 5. SECURITY ────────────────────────────────────────────────────

describe('TimingRecorder — security', () => {
  it('TimingEntry carries only 4 fields — no event-payload leak', () => {
    const rec = timingRecorder();
    rec.onStageStart({
      ...makeStageEvent('a#1', 1000),
      mappedInput: { secret: 'should-not-leak' },
      mappedOutput: { other: 'also-not' },
    } as StageEvent & Record<string, unknown>);
    rec.onStageEnd(makeStageEvent('a#1', 1340));
    const entry = rec.getTiming('a#1');
    expect(entry).toBeDefined();
    const keys = Object.keys(entry as object).sort();
    expect(keys).toEqual(['durationMs', 'endMs', 'runtimeStageId', 'startMs']);
  });
});

// ─── 6. PERFORMANCE ────────────────────────────────────────────────

describe('TimingRecorder — performance', () => {
  it('1000 start/end pairs recorded in under 10ms (tightened budget)', () => {
    const rec = timingRecorder();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      rec.onStageStart(makeStageEvent(`s#${i}`, i));
      rec.onStageEnd(makeStageEvent(`s#${i}`, i + 1));
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(10);
    expect(rec.size).toBe(1000);
  });
});

// ─── 7. LOAD ────────────────────────────────────────────────────────

describe('TimingRecorder — load', () => {
  it('10000 start/end pairs recorded in under 100ms (tightened budget)', () => {
    const rec = timingRecorder();
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      rec.onStageStart(makeStageEvent(`s#${i}`, i));
      rec.onStageEnd(makeStageEvent(`s#${i}`, i + 1));
    }
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(100);
    expect(rec.size).toBe(10_000);
  });

  it('totalDurationMs across 10000 keys in under 50ms', () => {
    const rec = timingRecorder();
    const keys: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      rec.onStageStart(makeStageEvent(`s#${i}`, i));
      rec.onStageEnd(makeStageEvent(`s#${i}`, i + 1));
      keys.push(`s#${i}`);
    }
    const start = performance.now();
    const total = rec.totalDurationMs(keys);
    const ms = performance.now() - start;
    expect(total).toBe(10_000);
    expect(ms).toBeLessThan(50);
  });
});

// ─── 8. COMPOSITION-SAFE GATE (cross-cut) ───────────────────────────

describe('TimingRecorder — composition-safe gate', () => {
  it('clear() proceeds when idle (no stages in flight)', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.onStageEnd(makeStageEvent('a#1', 100));
    expect(rec.size).toBe(1);
    rec.clear();
    expect(rec.size).toBe(0);
  });

  it('clear() is a no-op while stages are in flight', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.clear();
    expect(rec.size).toBe(1);
    expect(rec.getTiming('a#1')?.startMs).toBe(0);
    rec.onStageEnd(makeStageEvent('a#1', 100));
    rec.clear();
    expect(rec.size).toBe(0);
  });

  it('R1 fix — duplicate onStageStart does NOT double-increment the gate', () => {
    // Without the fix: two starts push inflightCount to 2; one end
    // leaves it at 1 → clear() stuck forever (latch deadlock).
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.onStageStart(makeStageEvent('a#1', 5));   // duplicate start
    rec.onStageEnd(makeStageEvent('a#1', 10));
    rec.clear();
    expect(rec.size).toBe(0);
  });

  it('R2 fix — orphan onStageEnd does NOT pin the gate via inflight phantom', () => {
    const rec = timingRecorder();
    rec.onStageEnd(makeStageEvent('orphan#1', 50));
    // Subsequent legitimate flow works cleanly.
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.onStageEnd(makeStageEvent('a#1', 100));
    rec.clear();
    expect(rec.size).toBe(0);
  });

  it('size unchanged when same runtimeStageId is started twice (overwrite)', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.onStageEnd(makeStageEvent('a#1', 10));
    rec.onStageStart(makeStageEvent('a#1', 20));
    rec.onStageEnd(makeStageEvent('a#1', 30));
    expect(rec.size).toBe(1);
    expect(rec.getTiming('a#1')?.durationMs).toBe(10);
  });

  it('duplicate onStageEnd for already-settled stage does NOT push counter negative', () => {
    const rec = timingRecorder();
    rec.onStageStart(makeStageEvent('a#1', 0));
    rec.onStageEnd(makeStageEvent('a#1', 100));
    rec.onStageEnd(makeStageEvent('a#1', 200));   // dup end
    // Recorder must still be idle — clear works.
    rec.clear();
    expect(rec.size).toBe(0);
  });
});

// ─── 9. COMPOSITION PATTERN WITNESS (Convention 1) ─────────────────

describe('TimingRecorder — composition pattern (Convention 1)', () => {
  it('does NOT inherit base-class methods (no leaked KeyedRecorder API)', () => {
    // The recorder OWNS a KeyedStore privately. Convention 1: one
    // purpose per recorder. Storage methods like aggregate/accumulate/
    // filterByKeys must NOT leak into the recorder's public surface —
    // those are STORE methods, not recorder methods.
    const rec = new TimingRecorder();
    expect((rec as unknown as { aggregate?: unknown }).aggregate).toBeUndefined();
    expect((rec as unknown as { accumulate?: unknown }).accumulate).toBeUndefined();
    expect((rec as unknown as { filterByKeys?: unknown }).filterByKeys).toBeUndefined();
    expect((rec as unknown as { set?: unknown }).set).toBeUndefined();
    expect((rec as unknown as { delete?: unknown }).delete).toBeUndefined();
    // Purpose-built surface is what's exposed.
    expect(typeof rec.getTiming).toBe('function');
    expect(typeof rec.totalDurationMs).toBe('function');
    expect(typeof rec.getAll).toBe('function');
    expect(typeof rec.clear).toBe('function');
  });
});
