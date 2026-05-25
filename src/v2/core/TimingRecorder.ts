/**
 * TimingRecorder — Lens v0.1 wall-clock recorder (composition pattern).
 *
 * Why this exists: agentfootprint-lens's side panel wants per-step
 * wall-clock metadata (`started at t+1.2s, duration 340ms`). The
 * footprintjs Inventor explicitly rejected adding a `wallClockMs`
 * field to `CommitBundle` during the v0.1 panel review: "Lens
 * computes wall-clock externally via a custom recorder. Zero engine
 * change. Honors the layer."
 *
 * **Composition, not inheritance.** Per Convention 1 (footprintjs
 * CLAUDE.md): "new code MUST use stores." This recorder OWNS a
 * `KeyedStore<TimingEntry>` as a private field — it does NOT extend
 * `KeyedRecorder` (which is the deprecated abstract base from the
 * v5 migration window). The recorder implements `ScopeRecorder`
 * (event hook interface) and delegates all storage to the store.
 *
 * **Composition-safe + tamper-resistant clear gate.** The recorder
 * tracks `inflightCount` of stages that started but haven't ended.
 * `clear()` is a no-op while any stage is in flight. This:
 *   1. Prevents sub-executor pre-run clear loops from wiping the
 *      parent's mid-run state (the Phase 5 Layer 4 wipe bug).
 *   2. Acts as a tamper boundary against nested/third-party
 *      executors that might call `clear()` mid-run.
 *
 * The inflight counter is gated on **state**, not blind increment:
 * a re-start for an in-flight stage does NOT double-increment, and
 * an orphan end does NOT write a settled entry that could leak the
 * counter. This avoids the latch-deadlock that blind counters create.
 *
 * Pattern: Recorder + composed Store (Convention 1).
 * Role:    derived wall-clock metadata for Lens side panel.
 * Channel: ScopeRecorder (data-flow channel — onStageStart/End).
 *
 * @example
 * ```typescript
 * const timing = timingRecorder();
 * runner.attachRecorder(timing);
 * await runner.run({ input });
 * const entry = timing.getTiming('call-llm#5');
 * // → { runtimeStageId: 'call-llm#5', startMs: 1739..., endMs: 1739..., durationMs: 340 }
 * ```
 */

import { KeyedStore } from 'footprintjs/trace';
import type { ScopeRecorder, StageEvent } from 'footprintjs';

/**
 * One stage's timing data. `endMs` and `durationMs` are populated
 * after `onStageEnd` fires. While a stage is in flight, only
 * `startMs` is set — consumers must handle the undefined branch.
 */
export interface TimingEntry {
  readonly runtimeStageId: string;
  readonly startMs: number;
  readonly endMs?: number;
  readonly durationMs?: number;
}

/**
 * Auto-incremented per construction, used when no explicit id is
 * passed. Module-scoped — under dual CJS+ESM builds each format
 * gets its own counter (same pattern as agentfootprint's
 * `BoundaryRecorder` counter; consistent for now).
 */
let _counter = 0;

export class TimingRecorder implements ScopeRecorder {
  readonly id: string;

  /** Composed storage. Single purpose: 1:1 keyed entries. */
  private readonly store = new KeyedStore<TimingEntry>();

  /**
   * Count of stages currently in flight (started without a matching
   * end). The clear gate consults this. Incremented ONLY on a real
   * "new in-flight stage" transition — not on a blind start. See
   * `isInflight()` for the predicate.
   */
  private inflightCount = 0;

  constructor(options: { id?: string } = {}) {
    this.id = options.id ?? `timing-${++_counter}`;
  }

  // ── State predicates ─────────────────────────────────────────

  /**
   * Returns true if the recorder considers the given runtimeStageId
   * to be currently in flight (started but not yet ended). Used by
   * the start/end hooks to gate the inflight counter — prevents
   * double-increment on repeated starts and counter leak on orphan
   * ends.
   */
  private isInflight(runtimeStageId: string): boolean {
    const entry = this.store.get(runtimeStageId);
    return entry !== undefined && entry.endMs === undefined;
  }

  // ── ScopeRecorder hooks (footprintjs data-flow channel) ──────

  onStageStart(event: StageEvent): void {
    // Only increment the counter for a TRUE new in-flight transition.
    // If a stage with the same runtimeStageId is already in flight
    // (rare misuse), don't double-count — just overwrite with the
    // newer start timestamp.
    if (!this.isInflight(event.runtimeStageId)) {
      this.inflightCount++;
    }
    this.store.set(event.runtimeStageId, {
      runtimeStageId: event.runtimeStageId,
      startMs: event.timestamp,
    });
  }

  onStageEnd(event: StageEvent): void {
    const existing = this.store.get(event.runtimeStageId);
    if (existing === undefined) {
      // Orphan onStageEnd — record what we have for diagnostic
      // visibility, but DO NOT touch the inflight counter (the
      // stage was never marked in flight, so there's nothing to
      // decrement; touching would push the counter negative on
      // future legitimate flows).
      this.store.set(event.runtimeStageId, {
        runtimeStageId: event.runtimeStageId,
        startMs: event.timestamp,
        endMs: event.timestamp,
        durationMs: 0,
      });
      return;
    }
    if (existing.endMs === undefined) {
      // Legitimate end of an in-flight stage.
      this.inflightCount = Math.max(0, this.inflightCount - 1);
    }
    // Else: duplicate end for an already-settled stage. No counter
    // change. Refresh the entry with the latest timestamps.
    const endMs = event.timestamp;
    const durationMs = Math.max(0, endMs - existing.startMs);
    this.store.set(event.runtimeStageId, {
      ...existing,
      endMs,
      durationMs,
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Reset all timing state.
   *
   * **Composition-safe gate:** no-op while any stage is in flight
   * (`inflightCount > 0`). Rationale: `FlowChartExecutor.run()`
   * calls `clear()` on every attached recorder in its pre-run loop.
   * When agentfootprint composition primitives propagate the parent's
   * recorders to sub-executors, EACH sub-executor's pre-run clear
   * fires on the SHARED parent recorder mid-run — wiping live state.
   * The gate distinguishes:
   *
   *   - **Legitimate reset** — recorder is idle (no in-flight stages).
   *     Wipe.
   *   - **Composition wipe** — sub-executor's pre-run clear fires
   *     while parent stages are mid-execution. Skip.
   *
   * Mirrors the gate in `BoundaryRecorder.clear()` (Phase 5 Layer 4).
   */
  clear(): void {
    if (this.inflightCount > 0) return;
    this.store.clear();
  }

  // ── Lookups ──────────────────────────────────────────────────

  /** O(1) lookup by `runtimeStageId`. */
  getTiming(runtimeStageId: string): TimingEntry | undefined {
    return this.store.get(runtimeStageId);
  }

  /** All settled + in-flight entries as a read-only view. */
  getAll(): ReadonlyMap<string, TimingEntry> {
    return this.store.getMap();
  }

  /** Number of entries stored. */
  get size(): number {
    return this.store.size;
  }

  /**
   * Sum `durationMs` across a subtree of runtimeStageIds. In-flight
   * entries (no `endMs` yet) are skipped — the badge updates
   * progressively as children settle. Missing keys are silently
   * skipped (typo-tolerant).
   *
   * This sums child-stage durations only. It does NOT include any
   * wait time between siblings. For the wall-clock window of the
   * whole subtree, compute `subtreeRoot.endMs - subtreeRoot.startMs`.
   */
  totalDurationMs(runtimeStageIds: Iterable<string>): number {
    let total = 0;
    for (const id of runtimeStageIds) {
      const entry = this.store.get(id);
      if (entry?.durationMs !== undefined) total += entry.durationMs;
    }
    return total;
  }
}

/**
 * Factory matching the agentfootprint recorder convention
 * (`boundaryRecorder()`, `liveStateRecorder()`, etc.).
 */
export function timingRecorder(
  options: { id?: string } = {},
): TimingRecorder {
  return new TimingRecorder(options);
}
