/**
 * useSpecSubscription — React hook for spec-only updates.
 *
 * Layer 2 / Tier A / Lens v0.1.
 *
 * Wraps `splitLensStores().specStore` with `useSyncExternalStore` so a
 * subscriber re-renders ONLY when the chart's structure changes — never
 * for payload-only events. This is what `<DrillableFlowchart>` should
 * use: cheap to render but EXPENSIVE to re-layout (ELK).
 *
 * Lifecycle
 * ─────────
 *   The split store is created once per (recorder, options.schedule)
 *   pair and stored in a ref so the same `specStore` reference survives
 *   across renders — required by `useSyncExternalStore` for stable
 *   subscription identity.
 *
 *   On unmount, the split store is disposed (cancels the recorder
 *   subscription, clears listener sets). Idempotent.
 *
 * Spec source
 * ───────────
 *   v0.1 derives the SpecNode tree from `recorder.boundary` via
 *   `buildSpecTreeFromBoundary`. The tree is reconstructed each time
 *   the spec version bumps — that's the WHOLE point of the spec/overlay
 *   split: the expensive rebuild only fires on structural changes, not
 *   on every event.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { SpecNode } from '../../core/buildSpecTreeFromBoundary.js';
import { LensRecorder } from '../../core/LensRecorder.js';
import { buildSpecTreeFromBoundary } from '../../core/buildSpecTreeFromBoundary.js';
import { splitLensStores, type SplitStores, type SplitLensStoresOptions } from '../../core/stores/splitLensStores.js';

export interface SpecSubscriptionResult {
  readonly spec: SpecNode | undefined;
  readonly version: number;
}

export function useSpecSubscription(
  recorder: LensRecorder,
  options?: SplitLensStoresOptions,
): SpecSubscriptionResult {
  // Hold ONE split-store handle per recorder identity. We can't create
  // it inside useMemo with [recorder] alone because useMemo's identity
  // isn't guaranteed; a ref preserves it across renders, and an effect
  // disposes on unmount or recorder swap.
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
    // Dispose on unmount only — recorder swap is handled in render path
    // above. Empty deps deliberately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const version = useSyncExternalStore(
    stores.specStore.subscribe,
    stores.specStore.getSnapshot,
    stores.specStore.getSnapshot, // SSR snapshot — version is plain number so identical
  );

  // Spec tree is REBUILT only when version changes — expensive walk
  // amortized over structural changes.
  const spec = useMemo<SpecNode | undefined>(() => {
    try {
      return buildSpecTreeFromBoundary(recorder.boundary);
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, version]);

  return { spec, version };
}
