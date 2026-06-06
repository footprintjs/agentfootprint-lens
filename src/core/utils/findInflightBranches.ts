/**
 * findInflightBranches — list subflows that are entered-but-not-exited
 * at a given commit index.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * Drives the animated-dashed-edge rendering on branches that are
 * still in-flight when the slider sits at `commitIdx`. Works for
 * both live mode (commitIdx = current commit count) and replay mode
 * (commitIdx = some past commit being scrubbed to).
 *
 * Channel
 * ───────
 *   Boundary ranges are owned by agentfootprint's `BoundaryRecorder`
 *   (a CombinedRecorder reading subflow.entry / subflow.exit /
 *   run.entry / run.exit events). The `CommitRangeIndex` is built
 *   during traversal and queried here — that is the read-only data flow.
 *   No commit-state lookups, no emit subscriptions; we just query the
 *   index the caller hands us.
 *
 * Semantics
 * ─────────
 *   A subflow is "open at commitIdx" when:
 *     - it was entered at or before commitIdx (`startIdx <= commitIdx`)
 *     - and it has not yet exited at commitIdx (`endIdx === undefined`
 *       OR `endIdx >= commitIdx`)
 *
 *   `CommitRangeIndex.enclosing(commitIdx)` returns exactly that set,
 *   sorted outer→inner. We:
 *     1. exclude the synthetic `run.entry` root (not a navigable
 *        subflow — never an edge target),
 *     2. preserve the outer→inner order so callers can pick the
 *        innermost branch (last element) when they want to animate
 *        only the deepest active edge,
 *     3. return the `runtimeStageId`s — the universal correlation
 *        key linking back to ReactFlow node ids.
 */

import type { CommitRangeIndex } from 'footprintjs/trace';
import type { BoundaryRangeLabel } from 'agentfootprint/observe';

export function findInflightBranches(
  boundaryIndex: CommitRangeIndex<BoundaryRangeLabel>,
  commitIdx: number,
): readonly string[] {
  if (!Number.isFinite(commitIdx) || commitIdx < 0) return [];
  const enclosing = boundaryIndex.enclosing(commitIdx);
  const result: string[] = [];
  for (let i = 0; i < enclosing.length; i++) {
    const label = enclosing[i]!.label;
    if (label.type === 'run.entry') continue;
    result.push(label.runtimeStageId);
  }
  return result;
}
