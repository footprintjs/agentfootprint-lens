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
 *
 * ONE LADDER, TWO READINGS (0.42.0): the rungs live in `resolveNavigation`,
 * which NAMES each one and hands rung 3 back as an OFFER on a miss rather than
 * taking it. This function is the terse reading of the same climb — it takes
 * the offer and answers with a bare step, which is what its callers (chart
 * clicks, beat jumps, provenance frames) have always wanted. A host that must
 * distinguish "landed on it" from "landed just before it" — a chat pointing at
 * evidence — calls `resolveNavigation` instead. There is no second rule here:
 * change the ladder in one place and both readings follow.
 */

import type { CursorPosition } from './cursorPositionsAtDrill.js';
import { resolveNavigation } from './resolveNavigation.js';

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
  const to = resolveNavigation(positions, runtimeStageId);
  // Rungs 1–2 landed; else take rung 3's offer, else `-1`. Taking the offer
  // silently is exactly what this narrower reading promises to do.
  return to.ok ? to.step : (to.nearest?.step ?? -1);
}
