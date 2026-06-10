/**
 * LensRecorder `maxEvents` cap tests — backlog item U3.
 *
 * The event log is BOUNDED by default (50K entries). Past the cap the
 * recorder evicts the OLDEST entries in ~10%-of-cap batches (amortized
 * O(1) per event) from BOTH the flat SequenceStore AND the run tree's
 * per-node `events` lists (shared references — pruning both is what
 * actually releases memory). Eviction is honest, never silent:
 * `getDiagnostics().droppedEvents` counts every eviction, and debug
 * mode warns ONCE when the cap first engages.
 *
 * 7 patterns (repo Convention 3 mapping):
 *   1. unit        — option validation (positive integer or Infinity)
 *   2. functional  — FIFO eviction: oldest dropped, newest retained,
 *                    entryCount never exceeds the cap
 *   3. integration — run-tree node `events` lists pruned in step with
 *                    the store; keyed/range indices stay consistent;
 *                    selectSummary stays anchored to the true run start
 *   4. property    — randomized caps/volumes: entryCount ≤ maxEvents
 *                    and entryCount + droppedEvents === total pushed
 *   5. honesty     — debug warn fires ONCE; silent without debug but
 *                    counters always maintained; clear() resets
 *   6. performance — default 50K cap sustains a 50K+ event run within
 *                    budget (the eviction batch is amortized)
 *   7. opt-out     — maxEvents: Infinity never evicts
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AgentfootprintEvent } from 'agentfootprint';
import { disableDevMode } from 'footprintjs';
import { LensRecorder, lensRecorder, DEFAULT_MAX_EVENTS } from './LensRecorder.js';

// ─── Fixtures ───────────────────────────────────────────────────

/** Synthetic typed-event envelope (same shape the dispatcher emits). */
function evt(
  type: string,
  i: number,
  payload: Record<string, unknown> = {},
): AgentfootprintEvent {
  return {
    type,
    payload,
    meta: {
      wallClockMs: 1000 + i * 10,
      runOffsetMs: i * 10,
      runtimeStageId: `stage#${i}`,
      subflowPath: [],
      compositionPath: [],
      runId: 'test',
    },
  } as unknown as AgentfootprintEvent;
}

/** Feed a synthetic event through the recorder's private event path —
 *  the same seam `observe()`'s `runner.on('*')` subscription uses. */
function feed(rec: LensRecorder, e: AgentfootprintEvent): void {
  (
    rec as unknown as { handleEvent: (e: AgentfootprintEvent) => void }
  ).handleEvent(e);
}

/** Push `n` structurally-inert events (attach to root, no brackets). */
function feedN(rec: LensRecorder, n: number, startAt = 0): void {
  for (let i = 0; i < n; i++) feed(rec, evt('agentfootprint.cost.tick', startAt + i, { cumulative: { estimatedUsd: 0 } }));
}

afterEach(() => {
  disableDevMode();
  vi.restoreAllMocks();
});

// ─── Pattern 1 (unit): option validation ─────────────────────────

describe('LensRecorder cap — pattern 1: maxEvents validation', () => {
  it('rejects zero, negatives, fractions, and NaN with a RangeError', () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      expect(() => new LensRecorder('Run', { maxEvents: bad })).toThrow(RangeError);
    }
  });

  it('accepts positive integers and Infinity', () => {
    expect(() => new LensRecorder('Run', { maxEvents: 1 })).not.toThrow();
    expect(() => new LensRecorder('Run', { maxEvents: 50_000 })).not.toThrow();
    expect(
      () => new LensRecorder('Run', { maxEvents: Number.POSITIVE_INFINITY }),
    ).not.toThrow();
  });
});

// ─── Pattern 2 (functional): FIFO eviction ───────────────────────

describe('LensRecorder cap — pattern 2: drop-oldest eviction', () => {
  it('evicts the oldest entries once the cap is exceeded; newest survive', () => {
    const rec = lensRecorder('Run', { maxEvents: 10 });
    feedN(rec, 20);

    // Cap respected at every observable moment (eviction is synchronous
    // inside handleEvent).
    expect(rec.entryCount).toBeLessThanOrEqual(10);
    // Conservation: nothing vanishes unaccounted.
    expect(rec.entryCount + rec.getDiagnostics().droppedEvents).toBe(20);

    const entries = rec.selectEventLog();
    const seqs = entries.map((e) => e.seq);
    // Newest entry always retained; seqs keep their original values
    // (the gap at the front is visible, not papered over).
    expect(seqs[seqs.length - 1]).toBe(19);
    expect(Math.min(...seqs)).toBe(20 - rec.entryCount);
    // Strictly ascending — order preserved through rebuilds.
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it('does not evict (droppedEvents stays 0) while at or under the cap', () => {
    const rec = lensRecorder('Run', { maxEvents: 10 });
    feedN(rec, 10);
    expect(rec.entryCount).toBe(10);
    expect(rec.getDiagnostics().droppedEvents).toBe(0);
  });
});

// ─── Pattern 3 (integration): tree pruning + indices + summary ───

describe('LensRecorder cap — pattern 3: eviction reaches every shelf', () => {
  it('prunes evicted entries from run-tree node events lists (root + nested)', () => {
    const rec = lensRecorder('Run', { maxEvents: 10 });
    // Open an LLM node so subsequent events attach to a NESTED node.
    feed(rec, {
      type: 'agentfootprint.stream.llm_start',
      payload: {
        provider: 'mock',
        model: 'm',
        systemPromptChars: 0,
        messagesCount: 0,
        toolsCount: 0,
      },
      meta: {
        wallClockMs: 1000,
        runOffsetMs: 0,
        runtimeStageId: 'llm#0',
        subflowPath: [],
        compositionPath: [],
        runId: 'test',
      },
    } as unknown as AgentfootprintEvent);
    feedN(rec, 30, 1); // attach to the open llm node; forces evictions

    const minRetainedSeq = Math.min(...rec.selectEventLog().map((e) => e.seq));
    expect(rec.getDiagnostics().droppedEvents).toBeGreaterThan(0);

    // Walk the frozen tree: NO node may still hold an evicted entry —
    // entry objects are shared references, so a stale tree list would
    // keep the memory alive.
    const assertPruned = (node: ReturnType<LensRecorder['selectRunTree']>): void => {
      for (const e of node.events) expect(e.seq).toBeGreaterThanOrEqual(minRetainedSeq);
      for (const c of node.children) assertPruned(c);
    };
    assertPruned(rec.selectRunTree());
  });

  it('keyed + range indices rebuild consistently after eviction', () => {
    const rec = lensRecorder('Run', { maxEvents: 10 });
    feedN(rec, 25);

    const entries = rec.selectEventLog();
    const retainedIds = new Set(entries.map((e) => e.runtimeStageId));
    // Evicted step keys are gone from the keyed index…
    expect(rec.getEntriesForStep('stage#0')).toEqual([]);
    // …retained step keys resolve…
    const lastId = entries[entries.length - 1]!.runtimeStageId!;
    expect(rec.getEntriesForStep(lastId)).toHaveLength(1);
    // …and every range points INSIDE the rebuilt entries array.
    for (const [id, range] of rec.getEntryRanges()) {
      expect(retainedIds.has(id)).toBe(true);
      expect(range.firstIdx).toBeGreaterThanOrEqual(0);
      expect(range.endIdx).toBeLessThanOrEqual(entries.length);
      expect(range.firstIdx).toBeLessThan(range.endIdx);
    }
  });

  it('selectSummary stays anchored to the true first event after eviction', () => {
    const rec = lensRecorder('Run', { maxEvents: 10 });
    feedN(rec, 30);
    const summary = rec.selectSummary();
    // First event ever had wallClockMs 1000 — evicted from the store,
    // but the run's time axis must not shift.
    expect(summary.startedAt).toBe(1000);
    expect(summary.durationMs).toBe(29 * 10);
  });
});

// ─── Pattern 4 (property): conservation invariant ────────────────

describe('LensRecorder cap — pattern 4: invariants hold for any cap/volume', () => {
  it('entryCount ≤ maxEvents and entryCount + droppedEvents === total, always', () => {
    for (let trial = 0; trial < 25; trial++) {
      const maxEvents = 1 + Math.floor(Math.random() * 50);
      const total = Math.floor(Math.random() * 200);
      const rec = lensRecorder('Run', { maxEvents });
      feedN(rec, total);
      expect(rec.entryCount).toBeLessThanOrEqual(maxEvents);
      expect(rec.entryCount + rec.getDiagnostics().droppedEvents).toBe(total);
      if (total > 0) {
        const log = rec.selectEventLog();
        expect(log[log.length - 1]!.seq).toBe(total - 1); // newest always kept
      }
    }
  });
});

// ─── Pattern 5 (honesty): never silent, warn once, clear resets ──

describe('LensRecorder cap — pattern 5: honest eviction surfacing', () => {
  it('warns ONCE in debug mode when the cap first engages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { maxEvents: 10, debug: true });
    feedN(rec, 40); // multiple eviction batches
    const evictionWarns = warn.mock.calls.filter(([msg]) =>
      String(msg).includes('maxEvents cap'),
    );
    expect(evictionWarns).toHaveLength(1);
    expect(String(evictionWarns[0]![0])).toContain('getDiagnostics().droppedEvents');
  });

  it('stays console-silent without debug — but counters are always maintained', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { maxEvents: 10, debug: false });
    feedN(rec, 40);
    expect(warn).not.toHaveBeenCalled();
    expect(rec.getDiagnostics().droppedEvents).toBeGreaterThan(0);
  });

  it('clear() resets droppedEvents and re-arms the warn-once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rec = lensRecorder('Run', { maxEvents: 10, debug: true });
    feedN(rec, 40);
    rec.clear();
    expect(rec.getDiagnostics().droppedEvents).toBe(0);
    expect(rec.entryCount).toBe(0);

    warn.mockClear();
    feedN(rec, 40);
    expect(
      warn.mock.calls.filter(([msg]) => String(msg).includes('maxEvents cap')),
    ).toHaveLength(1);
  });
});

// ─── Pattern 6 (performance): default cap at scale ───────────────

describe('LensRecorder cap — pattern 6: default cap sustains a 50K+ run', () => {
  it('caps a run larger than DEFAULT_MAX_EVENTS within budget', () => {
    const total = DEFAULT_MAX_EVENTS + 10;
    const rec = new LensRecorder(); // default cap
    const t0 = performance.now();
    feedN(rec, total);
    const elapsed = performance.now() - t0;

    expect(rec.entryCount).toBeLessThanOrEqual(DEFAULT_MAX_EVENTS);
    expect(rec.entryCount + rec.getDiagnostics().droppedEvents).toBe(total);
    // Generous CI budget — the point is "amortized, not quadratic".
    expect(elapsed).toBeLessThan(10_000);
  });
});

// ─── Pattern 7 (opt-out): Infinity disables the cap ──────────────

describe('LensRecorder cap — pattern 7: maxEvents: Infinity opt-out', () => {
  it('never evicts', () => {
    const rec = lensRecorder('Run', { maxEvents: Number.POSITIVE_INFINITY });
    feedN(rec, 2_000);
    expect(rec.entryCount).toBe(2_000);
    expect(rec.getDiagnostics().droppedEvents).toBe(0);
  });
});
