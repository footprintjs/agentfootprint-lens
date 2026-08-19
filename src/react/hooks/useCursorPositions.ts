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
import {
  commitAxisPositions,
  cursorPositionsAtDrill,
  type CursorPosition,
} from '../../core/group/cursorPositionsAtDrill.js';
import type { SplitLensStoresOptions } from '../../core/stores/splitLensStores.js';
import type { ScrubAxis } from '../../core/group/scrubAxisFor.js';

// The axis type and the pure axis builder now live in `/core` (zero React), so
// a server-rendered dashboard link or a CLI can build the same positions
// without mounting anything. Re-exported here so every existing import site —
// and the `/why` door — keeps its import line unchanged.
export { scrubAxisFor } from '../../core/group/scrubAxisFor.js';
export type { ScrubAxis } from '../../core/group/scrubAxisFor.js';

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
