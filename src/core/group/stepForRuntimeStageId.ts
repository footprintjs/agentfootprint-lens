/**
 * `stepForRuntimeStageId` — the inverse of the cursor's `describe`: an address
 * back to the position that HOLDS it.
 *
 * The lens's cursor is owned in STEPS (`<Lens step onStepChange>`) and reported
 * in three units, `runtimeStageId` among them. A view that wants to MOVE the
 * cursor, though, only ever knows an address — a slice frame's stage, a
 * routing beat's evaluate stage, a chart node — and the step axis at the
 * current drill level may not contain it. Every such view was re-deriving the
 * same rule; this is it, once.
 *
 * THE RULE (positions are a COARSER axis than addresses, never a wrong one):
 *
 *   1. exact — a position whose `runtimeStageId` is the one asked for. Several
 *      positions can share an id (a group's start and end); the FIRST is
 *      returned, because a mover means "take me there", not "take me to the
 *      end of there".
 *   2. enclosing — the position whose subflow CONTAINS the address. An
 *      address inside a subflow (`sf-x/inner#7`) is held by that subflow's own
 *      position (`sf-x#5`): the nearest one whose executionIndex is ≤ the
 *      address's. This is what makes "jump to iteration 3's evaluate stage"
 *      work on an axis whose stops are whole iterations.
 *   3. nearest-previous — the position with the largest executionIndex ≤ the
 *      address's. Standing just before something is a true answer; standing
 *      after it is not.
 *   4. `-1` — no position is at or before the address (it is before the run's
 *      first stop, or the axis is empty). A caller must not move.
 *
 * Deliberately never throws and never guesses forward: a jump that silently
 * lands past its target is worse than one that does not happen.
 */

import type { CursorPosition } from './cursorPositionsAtDrill.js';

/** Parse the `#N` executionIndex suffix off a runtimeStageId. */
function execIndex(runtimeStageId: string): number | undefined {
  const hash = runtimeStageId.lastIndexOf('#');
  if (hash < 0) return undefined;
  const n = Number(runtimeStageId.slice(hash + 1));
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Resolve an address to a step on the given position list.
 *
 * @param positions the cursor axis at the CURRENT drill level
 *                  (`useCursorPositions(recorder, drillPath)`).
 * @param runtimeStageId the address to move to.
 * @returns the step index, or `-1` when no position holds it.
 *
 * @example
 * ```ts
 * // The axis stops at whole iterations; the beat is a stage inside one.
 * stepForRuntimeStageId(positions, 'sf-injection-engine/evaluate#3'); // → the
 * // step of `sf-injection-engine#1`, the iteration that contains it.
 * ```
 */
export function stepForRuntimeStageId(
  positions: readonly CursorPosition[],
  runtimeStageId: string,
): number {
  if (positions.length === 0 || runtimeStageId === '') return -1;

  const exact = positions.findIndex((p) => p.runtimeStageId === runtimeStageId);
  if (exact >= 0) return exact;

  const target = execIndex(runtimeStageId);
  if (target === undefined) return -1;

  // The enclosing scopes of the address, innermost first: `a/b/c#7` is held by
  // `a/b`, then by `a`.
  const scopes: string[] = [];
  const base = runtimeStageId.split('#')[0] ?? '';
  for (let cut = base.lastIndexOf('/'); cut > 0; cut = base.lastIndexOf('/', cut - 1)) {
    scopes.push(base.slice(0, cut));
  }

  for (const scope of scopes) {
    let best = -1;
    let bestIdx = -1;
    for (let i = 0; i < positions.length; i += 1) {
      const id = positions[i]?.runtimeStageId ?? '';
      if ((id.split('#')[0] ?? '') !== scope) continue;
      const idx = execIndex(id);
      if (idx === undefined || idx > target || idx <= bestIdx) continue;
      best = i;
      bestIdx = idx;
    }
    if (best >= 0) return best;
  }

  let prev = -1;
  let prevIdx = -1;
  for (let i = 0; i < positions.length; i += 1) {
    const idx = execIndex(positions[i]?.runtimeStageId ?? '');
    // `<=` not `<`: two positions can share an executionIndex (a group's start
    // and its end), and the FIRST of them is the one a mover means.
    if (idx === undefined || idx > target || idx <= prevIdx) continue;
    prev = i;
    prevIdx = idx;
  }
  return prev;
}
