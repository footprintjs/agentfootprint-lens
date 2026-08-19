/**
 * `scrubAxisFor` — the scrub axis for a recording, as a PURE function.
 *
 * The same positions the mounted `<Lens>` scrubs at that granularity,
 * computable OUTSIDE React. `useCursorPositions` is the same computation with
 * a memo and a subscription around it; this is the one a non-React host calls.
 *
 * TWO AXES, ONE CURSOR (the 0.39.0 reading):
 *
 *   `'step'`  → the COMMIT axis: one stop per executed stage, straight off the
 *               commit log. Nothing is skippable and the ruler's count is the
 *               commit log's count by construction.
 *   `'group'` → the MILESTONE axis: one stop per agent-meaningful moment
 *               (iteration → context → LLM turn → route → tool call), as the
 *               domain's `milestoneFor` classifies them.
 *
 * The cursor type is still `runtimeStageId` either way. Only the SET of valid
 * positions differs.
 *
 * Lives in `/core` (zero React) because the hosts that need it most have no
 * component mounted: a server-rendered dashboard link, a CLI, a chat answer
 * resolving the step it means with `resolveNavigation`.
 *
 * @example
 * ```ts
 * import { scrubAxisFor, resolveNavigation } from 'agentfootprint-lens/core';
 *
 * const positions = scrubAxisFor(recorder, 'step');
 * const to = resolveNavigation(positions, 'llm#7'); // → { ok: true, step: 7, … }
 * ```
 */

import { milestoneFor } from 'agentfootprint';
import type { LensRecorder } from '../LensRecorder.js';
import { buildGroups } from './buildGroups.js';
import { buildCommitSyncMap } from './buildCommitSyncMap.js';
import { commitAxisPositions, cursorPositionsAtDrill, type CursorPosition } from './cursorPositionsAtDrill.js';

/** Which projection of the run the scrub axis stops at. */
export type ScrubAxis = 'commit' | 'milestone';

/**
 * Build the axis a `<Lens>` at this granularity would scrub.
 *
 * @param recorder    the recording (live `lensRecorder()` or a replayed one).
 * @param granularity `'step'` = the commit axis, `'group'` = the milestone axis
 *                    — the same two values `<Lens granularity>` takes.
 * @param drillPath   the drill level to build the axis at (default: top level).
 * @returns the positions, or `[]` when the recording has no commits yet (or on
 *          any read error — same posture as the hook).
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
