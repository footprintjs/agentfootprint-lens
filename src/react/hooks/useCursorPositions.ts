/**
 * useCursorPositions — React hook exposing the slider's valid positions
 * at the current drill level, on the requested AXIS.
 *
 * Layer 2 / Tier B / Lens v0.1.
 *
 * TWO AXES, ONE CURSOR (the 0.39.0 correction):
 *
 *   `'commit'`    — one stop per executed stage, straight off the commit log.
 *                   The Flow Lens's axis (`granularity="step"`): every stage
 *                   is a stop, nothing skippable, and the ruler's count is the
 *                   commit log's count by construction.
 *   `'milestone'` — one stop per agent-meaningful moment (iteration → context
 *                   → LLM turn → route → tool call), classified by the
 *                   domain's `milestoneFor`. The Why Lens's axis
 *                   (`granularity="group"`), which `stepBands` bands by
 *                   iteration.
 *
 * The cursor type is still `runtimeStageId` either way. Only the SET of valid
 * positions differs — the same compound-time-axis rule that already scaled the
 * set by drill depth now also scales it by reading.
 *
 * Lifecycle
 * ─────────
 *   Reactive to BOTH the recorder (events advance the commit log /
 *   open new groups) and to `drillPath` changes (user drill-in /
 *   drill-out). Memoized so a stable drillPath + recorder = stable
 *   array identity.
 */

import { useMemo } from 'react';
import { milestoneFor } from 'agentfootprint';
import { LensRecorder } from '../../core/LensRecorder.js';
import { useCommitSync } from './useCommitSync.js';
import { buildGroups } from '../../core/group/buildGroups.js';
import { buildCommitSyncMap } from '../../core/group/buildCommitSyncMap.js';
import {
  commitAxisPositions,
  cursorPositionsAtDrill,
  type CursorPosition,
} from '../../core/group/cursorPositionsAtDrill.js';
import type { SplitLensStoresOptions } from '../../core/stores/splitLensStores.js';

/** Which projection of the run the scrub axis stops at. */
export type ScrubAxis = 'commit' | 'milestone';

/**
 * The scrub axis for a recording, as a PURE function — the same positions the
 * mounted `<Lens>` scrubs at that granularity, computable outside React.
 *
 * This is the export a HOST holding the cursor across two granularities needs:
 * to carry a position from one axis to the other, build the target axis here
 * and resolve the commit with `stepForCommitIdx` (or an address with
 * `stepForRuntimeStageId`). Returns `[]` when the recording has no commits yet
 * (or on any read error — same posture as the hook).
 */
export function scrubAxisFor(
  recorder: LensRecorder,
  granularity: 'step' | 'group',
  drillPath: readonly string[] = [],
): readonly CursorPosition[] {
  try {
    const groups = buildGroups(recorder.boundary.boundaryIndex);
    const commits = buildCommitSyncMap(recorder);
    const overlay = recorder.runtime.getOverlay();
    if (granularity === 'step') {
      const commitAxis = commitAxisPositions(groups, commits, drillPath, overlay.executionOrder);
      if (commitAxis.length > 0) return commitAxis;
      // A recording with NO commit log (a Trace replay carries only the
      // boundary log) still deserves an axis — the milestone/structural stops
      // are the finest truth it has. Never quieter than before 0.39.0.
    }
    return cursorPositionsAtDrill(groups, commits, drillPath, milestoneFor, overlay.executionOrder);
  } catch {
    return [];
  }
}

export function useCursorPositions(
  recorder: LensRecorder,
  drillPath: readonly string[],
  options?: SplitLensStoresOptions,
  axis: ScrubAxis = 'milestone',
): readonly CursorPosition[] {
  const syncMap = useCommitSync(recorder, options);
  // The runtime overlay's executionOrder is the ONLY place a drilled subflow's
  // internal stages appear (their commits live in the subflow's own scope, not
  // the parent commit log). Pass it so drilling into such a subflow gets
  // stage-by-stage scrub stops. Key the memo on the overlay's monotonic
  // `version()` (O(1), bumps once per overlay-mutating event) — NOT on a
  // per-render `getOverlay()` (which deep-clones executionOrder every render).
  // getOverlay() is called only INSIDE the memo, so the clone happens once per
  // recompute, not once per render.
  const overlayVersion = recorder.runtime.version();

  return useMemo(() => {
    try {
      const groups = buildGroups(recorder.boundary.boundaryIndex);
      const overlay = recorder.runtime.getOverlay();
      if (axis === 'commit') {
        // The Flow reading: every executed stage is a stop (the commit log IS
        // the axis), with the overlay fallback for drilled subflow internals.
        const commitAxis = commitAxisPositions(groups, syncMap, drillPath, overlay.executionOrder);
        if (commitAxis.length > 0) return commitAxis;
        // No commit log at all (a Trace replay carries only the boundary
        // log) — fall through to the milestone/structural stops, the finest
        // truth this recording has. Never quieter than before 0.39.0.
      }
      // The grouped reading: domain milestones (iteration → llm-turn →
      // tool-call → decision), falling back to structural child-group stops
      // where the domain classifies nothing (multi-agent levels), then to
      // overlay-derived internal stops for drilled subflows whose stages are
      // neither child groups nor parent-log commits (the Injection Engine).
      return cursorPositionsAtDrill(groups, syncMap, drillPath, milestoneFor, overlay.executionOrder);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder, syncMap, drillPath, overlayVersion, axis]);
}
