/**
 * useChartGroup — the group the cursor is standing in, ready for the chart.
 *
 * Layer 2 / Tier B / Lens v0.1.
 *
 * The two-line wiring an embedder needs to turn on group mode:
 *
 *   const group = useChartGroup(recorder, cursorCommitIdx);
 *   <LensFlow chart={chart} granularity="group" activeGroup={group} … />
 *
 * Everything it returns comes out of the recording that was already fetched —
 * the boundary ranges the grouped ruler computes its stops from, and the commit
 * log. No request, no extra recorder, no second cursor: the input is THE cursor
 * as a commit index, the same integer the ruler moves.
 *
 * `useActiveGroup` (which takes a runtimeStageId) is the sibling for consumers
 * holding the stage cursor; this one takes the commit index because that is what
 * a grouped ruler's stop IS, and because membership is a commit RANGE.
 */

import { useMemo } from 'react';
import type { LensRecorder } from '../../core/LensRecorder.js';
import { useCommitSync } from './useCommitSync.js';
import { buildGroups } from '../../core/group/buildGroups.js';
import {
  activeChartGroup,
  type ChartGroupHighlight,
} from '../../core/group/activeChartGroup.js';
import type { SplitLensStoresOptions } from '../../core/stores/splitLensStores.js';

export interface UseChartGroupOptions extends SplitLensStoresOptions {
  /** Let the synthetic Run root be the active group. Default `false` — a
   *  boundary around the whole chart states nothing. */
  readonly includeRoot?: boolean;
}

/**
 * The active group at `commitIdx`, or `undefined` when no boundary encloses it
 * (the chart then renders exactly as it does on the per-commit ruler).
 *
 * Reactive to the recorder through `useCommitSync`, so a live run's groups
 * appear as their boundaries open.
 */
export function useChartGroup(
  recorder: LensRecorder,
  commitIdx: number | undefined,
  options?: UseChartGroupOptions,
): ChartGroupHighlight | undefined {
  const syncMap = useCommitSync(recorder, options);
  const includeRoot = options?.includeRoot ?? false;

  return useMemo(() => {
    if (commitIdx === undefined) return undefined;
    try {
      const groups = buildGroups(recorder.boundary.boundaryIndex);
      // `syncMap` IS the commit log in cursor form (one row per commit, in
      // commit order) — reusing it keeps one derivation of "which stage wrote
      // commit i" instead of re-reading the log a second way.
      return activeChartGroup({ groups, commits: syncMap, commitIdx, includeRoot });
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, syncMap, commitIdx, includeRoot]);
}
