/**
 * splitLensStores — split a `LensRecorder`'s single change stream into
 * two distinct subscription channels.
 *
 * Layer 2 / Tier A / Lens v0.1.
 *
 * Lens components have two very different re-render appetites:
 *
 *   1. `<DrillableFlowchart>` only needs to re-render when the chart
 *      STRUCTURE changes — new steps appear, subflows mount, lazy
 *      subflows resolve. During the bulk of a run (LLM token deltas,
 *      tool latency updates, scope writes) the structure is stable
 *      and re-rendering the flowchart re-runs ELK layout — expensive.
 *
 *   2. Side panels, badges, the iteration scrubber — these are
 *      payload-bound and DO need an update on every event.
 *
 * LensRecorder offers a single `subscribe` + `getVersion` pair that
 * bumps on every observed event, so both audiences re-render at the
 * fastest cadence today. `splitLensStores` fixes that by deriving two
 * `ExternalStore<number>`s from the recorder:
 *
 *   - `specStore`   bumps only when `StepGraph.nodes.length` increases.
 *                   That's the load-bearing structural signal in v0.1:
 *                   new nodes appear when subflows enter, agents start
 *                   iterations, parallel branches spawn, and so on.
 *                   Payload changes do NOT bump it.
 *
 *   - `overlayStore` bumps on every recorder notification, but flushes
 *                    are coalesced to once per animation frame so a
 *                    fast event stream cannot starve React with
 *                    cascading renders. Identical behavior to the
 *                    single-store path under a 60 Hz event rate; only
 *                    matters when a streamed LLM call fires 500+
 *                    chunks/sec.
 *
 * Composition (Convention 1)
 * ──────────────────────────
 *   This factory owns its own private listener sets + change cursor.
 *   It does NOT extend a base class. It composes one subscription to
 *   the recorder + one rAF-coalescer + two minimal external stores.
 *
 * Lifecycle
 * ─────────
 *   Returns a `SplitStores` handle with a `dispose()` method. Calling
 *   `dispose()` unsubscribes from the recorder, cancels any pending
 *   rAF flush, and prevents future listener notifications. Idempotent.
 *
 * Test ergonomics
 * ───────────────
 *   `options.schedule` injects a custom flush scheduler. Tests pass
 *   `(fn) => fn()` for synchronous flush; production code defaults to
 *   `requestAnimationFrame` when present, falling back to
 *   `queueMicrotask`. The default never throws on missing DOM globals.
 */

import type { LensRecorder } from '../LensRecorder.js';

export interface ExternalStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

export interface SplitStores {
  readonly specStore: ExternalStore<number>;
  readonly overlayStore: ExternalStore<number>;
  /** Tear down the recorder subscription + cancel pending flushes. Idempotent. */
  dispose(): void;
}

export interface SplitLensStoresOptions {
  /** Custom scheduler for overlay flush. Defaults to `requestAnimationFrame`
   *  when present, else `queueMicrotask`. Tests pass `(fn) => fn()` for
   *  synchronous flush. */
  schedule?: (fn: () => void) => void;
}

function defaultSchedule(fn: () => void): void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => fn());
    return;
  }
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
    return;
  }
  setTimeout(fn, 0);
}

export function splitLensStores(
  recorder: LensRecorder,
  options: SplitLensStoresOptions = {},
): SplitStores {
  const schedule = options.schedule ?? defaultSchedule;

  // Spec change signal: the count of subflow-entry boundary events
  // observed so far. The Lens v0.1 Spec tree is built via
  // `buildSpecTreeFromBoundary(rec.boundary)` — so every new subflow
  // entry IS a structural change in the spec. This is the load-bearing
  // source. (The snapshot StepGraph is a separate UI projection and is
  // not wired under all LensRecorder.observe() configurations.)
  //
  // We use the total event count rather than filtering to subflow.entry
  // because the boundary recorder's payload shape is internal — using
  // total length is robust, monotonically non-decreasing, and resets
  // correctly when the recorder is cleared.
  const readNodeCount = (): number => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = (recorder.boundary as any).getEvents?.() as readonly unknown[] | undefined;
      if (events) return events.length;
      // Fallback to the public step graph if boundary doesn't expose
      // getEvents — uses the same rich source as the rest of Lens.
      return recorder.getStepGraph().nodes.length;
    } catch {
      return 0;
    }
  };

  let specVersion = 0;
  let overlayVersion = 0;
  let lastNodeCount = readNodeCount();

  const specListeners = new Set<() => void>();
  const overlayListeners = new Set<() => void>();

  let disposed = false;
  let overlayPending = false;

  const fanOut = (set: ReadonlySet<() => void>): void => {
    for (const fn of set) {
      try {
        fn();
      } catch {
        // Swallow to isolate bad listeners from each other; matches
        // ChangeNotifier's contract. Consumers must log inside their
        // own listener if they need a trace.
      }
    }
  };

  const flushOverlay = (): void => {
    overlayPending = false;
    if (disposed) return;
    overlayVersion++;
    fanOut(overlayListeners);
  };

  const onRecorderChange = (): void => {
    if (disposed) return;

    // Spec-level check — synchronous, cheap. nodes.length only grows
    // when StepGraph appends a node (subflow entry, new step, etc.).
    const count = readNodeCount();
    if (count !== lastNodeCount) {
      lastNodeCount = count;
      specVersion++;
      fanOut(specListeners);
    }

    // Overlay flush — rAF-coalesced so a burst of N events in one
    // frame triggers exactly one re-render.
    if (!overlayPending) {
      overlayPending = true;
      schedule(flushOverlay);
    }
  };

  const unsubscribeRecorder = recorder.subscribe(onRecorderChange);

  const specStore: ExternalStore<number> = {
    subscribe(listener) {
      specListeners.add(listener);
      return () => {
        specListeners.delete(listener);
      };
    },
    getSnapshot() {
      return specVersion;
    },
  };

  const overlayStore: ExternalStore<number> = {
    subscribe(listener) {
      overlayListeners.add(listener);
      return () => {
        overlayListeners.delete(listener);
      };
    },
    getSnapshot() {
      return overlayVersion;
    },
  };

  return {
    specStore,
    overlayStore,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeRecorder();
      specListeners.clear();
      overlayListeners.clear();
    },
  };
}
