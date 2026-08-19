/**
 * `stepForCommitIdx` — resolve a COMMIT-LOG index to the step that holds it,
 * on any position axis.
 *
 * Why this exists: the lens now has two axes for the same run — the COMMIT
 * axis (`granularity="step"`: one stop per executed stage) and the MILESTONE
 * axis (`granularity="group"`: one stop per agent-meaningful moment, banded by
 * iteration). A host that keeps ONE cursor across both (two tabs over one
 * recording) needs to carry a position from one axis to the other, and the
 * unit both axes share is the commit index: every `CursorPosition` anchors to
 * one (`commitIdx`).
 *
 * THE RULE (same spirit as `stepForRuntimeStageId` — a coarser axis is never a
 * wrong one):
 *
 *   1. the position with the LARGEST `commitIdx` that is ≤ the asked-for
 *      index — the stop standing AT the commit when one exists, else the
 *      nearest stop BEFORE it. Standing just before something is a true
 *      answer; standing after it is not.
 *   2. among positions sharing that `commitIdx` (a group's start and a
 *      milestone can anchor the same commit), the FIRST — a mover means
 *      "take me there", not "take me to the end of there".
 *   3. `-1` when no position is at or before the commit (empty axis, or the
 *      commit pre-dates the first stop). A caller must not move.
 *
 * Mapping this way is exact in both directions for the shipped axes: a
 * milestone stop's commit exists verbatim on the commit axis (every commit is
 * a stop there), and a commit maps to the milestone at-or-nearest-before it —
 * the moment that was underway when that stage ran.
 */

import type { CursorPosition } from './cursorPositionsAtDrill.js';

export function stepForCommitIdx(
  positions: readonly CursorPosition[],
  commitIdx: number,
): number {
  if (positions.length === 0 || commitIdx < 0) return -1;
  let best = -1;
  let bestCommit = -1;
  for (let i = 0; i < positions.length; i += 1) {
    const c = positions[i]!.commitIdx;
    // `>` (strict): the FIRST position among equals wins.
    if (c > commitIdx || c <= bestCommit) continue;
    best = i;
    bestCommit = c;
  }
  return best;
}
