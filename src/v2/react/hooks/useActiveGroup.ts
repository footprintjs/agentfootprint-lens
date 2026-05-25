/**
 * useActiveGroup — given a slider cursor (runtimeStageId), return the
 * `Group` whose box should be highlighted on the Lens chart.
 *
 * Layer 2 / Tier B / Lens v0.1.
 *
 * Thin selector. Reads `useCommitSync` to find the entry whose
 * `runtimeStageId === cursorRid` and returns the matching Group via
 * `buildGroups` + `groupForRuntimeStageId`.
 *
 * Why a hook, not a pure selector
 * ───────────────────────────────
 *   Consumers want chart-highlight to update reactively as the cursor
 *   moves AND as the recorder accumulates events. Using `useCommitSync`
 *   gives us the live overlay subscription for free; pure selectors
 *   would require the consumer to wire their own subscription.
 */

import { useMemo } from 'react';
import { LensRecorder } from '../../core/LensRecorder.js';
import { useCommitSync } from './useCommitSync.js';
import { buildGroups } from '../../core/group/buildGroups.js';
import { groupForRuntimeStageId } from '../../core/group/groupForRuntimeStageId.js';
import type { Group } from '../../core/group/Group.js';
import type { SplitLensStoresOptions } from '../../core/stores/splitLensStores.js';

export function useActiveGroup(
  recorder: LensRecorder,
  cursorRuntimeStageId: string | undefined,
  options?: SplitLensStoresOptions,
): Group | undefined {
  // Trigger overlay-tracked rerenders via useCommitSync. We don't
  // actually need its output here — but the subscription is the channel
  // through which we observe boundary state changes.
  const _syncMap = useCommitSync(recorder, options);

  return useMemo(() => {
    if (!cursorRuntimeStageId) return undefined;
    try {
      const groups = buildGroups(recorder.boundary.boundaryIndex);
      return groupForRuntimeStageId(groups, cursorRuntimeStageId);
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, cursorRuntimeStageId, _syncMap]);
}
