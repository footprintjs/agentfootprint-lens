/**
 * useOverlaySubscription — React hook for overlay updates (every event,
 * rAF-coalesced).
 *
 * Layer 2 / Tier A / Lens v0.1.
 *
 * Wraps `splitLensStores().overlayStore` so subscribers re-render on
 * every event (LLM token deltas, tool latencies, payload updates) but
 * coalesced to one flush per animation frame. Use for side panels,
 * iteration scrubbers, badges, anything payload-bound.
 *
 * Inputs
 * ──────
 *   `recorder`       — the LensRecorder driving the run.
 *   `timingRecorder` — optional TimingRecorder for the timing snapshot.
 *                      Omitted → returned `timing` is the empty Map.
 *                      Consumers that don't render durations don't pay
 *                      for the snapshot copy.
 *
 * Returned shape
 * ──────────────
 *   `stepGraph` — the live StepGraph (stable identity until the next
 *                 mutation in LensSnapshotRecorder).
 *   `timing`    — frozen snapshot of the TimingRecorder's keyed store
 *                 at flush time. Empty Map when no recorder supplied.
 *   `version`   — monotonic overlay version (post-coalescing).
 *
 * Lifecycle
 * ─────────
 *   Same split-store lifecycle as `useSpecSubscription`. The split
 *   handle is shared via the recorder identity, so wiring both hooks
 *   to the same recorder still produces only one underlying
 *   recorder.subscribe() — unless callers pass different `schedule`
 *   options (then they get distinct split handles).
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { LensRecorder } from '../../core/LensRecorder.js';
import { TimingRecorder, type TimingEntry } from '../../core/TimingRecorder.js';
import { splitLensStores, type SplitStores, type SplitLensStoresOptions } from '../../core/stores/splitLensStores.js';

// Imported via type-only for the public return signature.
type StepGraph = ReturnType<LensRecorder['snapshot']['getStepGraph']>;

export interface OverlaySubscriptionResult {
  readonly stepGraph: StepGraph | undefined;
  readonly timing: ReadonlyMap<string, TimingEntry>;
  readonly version: number;
}

const EMPTY_TIMING: ReadonlyMap<string, TimingEntry> = new Map();

export function useOverlaySubscription(
  recorder: LensRecorder,
  timingRecorder?: TimingRecorder,
  options?: SplitLensStoresOptions,
): OverlaySubscriptionResult {
  const storesRef = useRef<{ recorder: LensRecorder; stores: SplitStores } | null>(null);
  if (storesRef.current === null || storesRef.current.recorder !== recorder) {
    storesRef.current?.stores.dispose();
    storesRef.current = { recorder, stores: splitLensStores(recorder, options) };
  }
  const stores = storesRef.current.stores;

  useEffect(() => {
    return () => {
      storesRef.current?.stores.dispose();
      storesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const version = useSyncExternalStore(
    stores.overlayStore.subscribe,
    stores.overlayStore.getSnapshot,
    stores.overlayStore.getSnapshot,
  );

  const stepGraph = useMemo<StepGraph | undefined>(() => {
    try {
      // Read via the recorder's public getStepGraph() so this consumes
      // the SAME rich ReAct StepGraph the main Lens render uses (agent
      // actor-arrow steps + iterationIndex + slotUpdated), not the
      // subflow-only LensSnapshotRecorder. Single source of truth.
      return recorder.getStepGraph();
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, version]);

  const timing = useMemo<ReadonlyMap<string, TimingEntry>>(() => {
    if (!timingRecorder) return EMPTY_TIMING;
    return timingRecorder.getAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timingRecorder, version]);

  return { stepGraph, timing, version };
}
