/**
 * useCommitSync — React hook exposing the one-cursor commit-sync map.
 *
 * Layer 2 / Tier A / Lens v0.1.
 *
 * Subscribes to the LensRecorder, rebuilds the sync map whenever the
 * commit log grows or the boundary state changes, and returns the
 * latest snapshot via `useSyncExternalStore`. Coalesced through
 * `splitLensStores` so a fast event stream cannot starve React.
 *
 * Lifecycle
 * ─────────
 *   - Creates a split-store handle per recorder identity (stored in a
 *     ref).
 *   - The cache itself is a captured closure; rebuilt only when the
 *     overlay version bumps (the rAF-coalesced channel).
 *   - Disposes the split store on unmount + recorder swap.
 *
 * Why overlay version, not spec version
 * ─────────────────────────────────────
 *   The sync map can change when a new COMMIT lands (commit log grows)
 *   even without a structural Spec change. The overlay store bumps on
 *   every event — that catches commit additions. The spec store bumps
 *   only when boundary events grow — too coarse for slider updates.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { LensRecorder } from '../../core/LensRecorder.js';
import {
  splitLensStores,
  type SplitStores,
  type SplitLensStoresOptions,
} from '../../core/stores/splitLensStores.js';
import {
  buildCommitSyncMap,
  type CommitSyncEntry,
} from '../../core/group/buildCommitSyncMap.js';

export function useCommitSync(
  recorder: LensRecorder,
  options?: SplitLensStoresOptions,
): readonly CommitSyncEntry[] {
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

  // Rebuild the sync map when version changes. Cheap O(n) walk over
  // commit log + group lookup. Memoized against recorder+version so the
  // returned array identity is stable per overlay tick.
  const syncMap = useMemo<readonly CommitSyncEntry[]>(() => {
    try {
      return buildCommitSyncMap(recorder);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, version]);

  return syncMap;
}
