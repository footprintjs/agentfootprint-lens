/**
 * `LensCursor` — the ONE cursor, in the ONE vocabulary every view is handed.
 *
 * THE LAW THIS FILE EXISTS FOR:
 *
 *   **A stage id is an ADDRESS, not a POSITION.** It says WHICH stage, never
 *   WHERE on an axis. Only an axis can answer that, and it may honestly answer
 *   "not here".
 *
 * Before this shape there were three vocabularies for the same cursor, and a
 * fourth was invented by every new view:
 *
 *   | view | handed | reads |
 *   |---|---|---|
 *   | skill graph | `cursorRuntimeStageId` + `onJumpTo` | the EVENT record |
 *   | a consumer's data graph | `{ step, total, stepOf(id), onStep }` | the COMMIT record |
 *   | Served tab / graph | `cursorRuntimeStageId` + `commitIdx` | the COMMIT record |
 *
 * This is their superset, and it is deliberately only three things:
 *
 *   - `at` — a READING. Where the one cursor stands, in every unit the lens
 *     knows. Not a position anyone here owns: it is derived from the axis and
 *     the step on every build, so a view that renders it cannot drift from the
 *     cursor, and a view that STORED it would be storing a stale copy.
 *   - `resolve(runtimeStageId)` — an ADDRESS, answered honestly by the axis.
 *     A hit with its step, or a refusal carrying `reason`, `message` and an
 *     optional `nearest`. This is the rung-named ladder (`resolveNavigation`),
 *     handed to the view rather than re-derived inside it.
 *   - `moveTo(step)` — the ONE funnel. The same one the step strip, the ◀ ▶
 *     buttons, the arrow keys, a chart click and the live auto-advance use.
 *
 * WHAT IS DELIBERATELY ABSENT: a position of its own. There is no `setStep`
 * here, no internal state, no second axis. A view that wants to move calls
 * `moveTo` and waits to be told where the cursor went — which is the correct
 * behaviour for a controlled view whose owner ignored it.
 *
 * THE THREE CASES A CONTRACT MUST NAME, because each is a real run:
 *
 *   1. **The axis does not stop there.** A filtered or tag axis over an
 *      untagged stage. `resolve` refuses `'not-on-axis'` and offers the
 *      nearest earlier stop. The element is drawn UNPLACED, with the
 *      refusal's own message — never hidden. (Omit never deny.)
 *   2. **The id belongs to an inner log.** A subflow's stages commit into
 *      their own isolated log. The ladder's `'enclosing'` rung answers with
 *      the MOUNT: `{ ok: true, match: 'enclosing' }`, whose `runtimeStageId`
 *      is the mount's, not the one asked for. A view that must distinguish
 *      "landed on it" from "landed on the thing that contains it" branches on
 *      `match` — and offers a drill to go deeper.
 *   3. **The event has no stage at all.** Run start, run end. There is no id
 *      to resolve; `resolve('')` refuses `'no-id'` and the view says so
 *      rather than inventing an address.
 *
 * Pure, frozen, no React. `react/useLensCursor.ts` returns one of these beside
 * what it always returned; `<Lens>` hands it to every view it mounts.
 *
 * @example Placing an element by ADDRESS, and drawing the unplaced case.
 * ```tsx
 * function Element({ cursor, runtimeStageId }: { cursor: LensCursor; runtimeStageId: string }) {
 *   const to = cursor.resolve(runtimeStageId);
 *   if (!to.ok) {
 *     // Drawn, not hidden — and the sentence is the LIBRARY's, not this view's.
 *     return <li data-unplaced="true" title={to.message}>{runtimeStageId}</li>;
 *   }
 *   return (
 *     <li
 *       data-step={to.step}
 *       data-enclosing={to.match === 'enclosing' ? 'true' : undefined}
 *       onClick={() => cursor.moveTo(to.step)}
 *     >
 *       {to.label}
 *     </li>
 *   );
 * }
 * ```
 */

import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import { resolveNavigation, type NavigationResult } from '../group/resolveNavigation.js';

/**
 * Where the ONE cursor stands, in every unit the lens knows.
 *
 * This is the READING half of `LensCursorAt` (`react/useLensCursor.ts`),
 * which adds the `clamped` flag a MOVE REPORT needs and this does not: a
 * reading is a fact about now, not a report about a move.
 */
export interface LensCursorReading {
  /** The cursor, on the lens's step axis. */
  readonly step: number;
  /** How many positions the axis has right now. Valid steps are
   *  `0 … totalSteps - 1`. GROWS during a live run. */
  readonly totalSteps: number;
  /** The cursor's address in footprintjs's address space
   *  (`[subflowPath/]stageId#executionIndex`). `''` when the axis is empty. */
  readonly runtimeStageId: string;
  /** The commit-log index this position anchors to. `-1` when unknown. */
  readonly commitIdx: number;
  /** The position's human label, as the step strip and the timeline spell it
   *  ("Iteration 2", "Context 3", "Run · start"). */
  readonly label: string;
  /** What kind of stop this is. Absent when the axis is empty. */
  readonly kind?: string;
}

/**
 * The ONE cursor, as every view receives it: a reading plus two functions.
 *
 * It holds NO position of its own — `at` is derived, `resolve` is a pure query
 * over the axis, and `moveTo` is the owner's funnel. Rebuild it when the axis
 * or the step changes (`lensCursorFrom`); never store it.
 */
export interface LensCursor {
  /** Where the cursor stands. Derived, never owned. */
  readonly at: LensCursorReading;
  /** How many positions the axis has — the same number as `at.totalSteps`,
   *  named the way a view that only counts asks for it. */
  readonly total: number;
  /**
   * Resolve an ADDRESS against this axis, honestly.
   *
   * A hit carries the `step` to move to and `match` (`'exact'` — the stop IS
   * the address; `'enclosing'` — the stop CONTAINS it, and `runtimeStageId` is
   * then the containing stop's). A refusal carries a machine-checkable
   * `reason`, a `message` safe to print, and sometimes a `nearest` OFFER.
   *
   * The offer is never taken here: taking it is another call.
   */
  resolve(runtimeStageId: string): NavigationResult;
  /**
   * Move the ONE cursor to a step — the same funnel every built-in mover goes
   * through. Out-of-range asks are the funnel's business, not this object's.
   */
  moveTo(step: number): void;
}

/** The reading of an EMPTY axis — no stop, so no address and no label. */
const EMPTY_READING: LensCursorReading = Object.freeze({
  step: 0,
  totalSteps: 0,
  runtimeStageId: '',
  commitIdx: -1,
  label: '',
});

/**
 * Build the one cursor over one axis.
 *
 * @param positions the ACTIVE scrub axis — `useCursorPositions(recorder,
 *   drillPath, undefined, axis)` in React, or `scrubAxisFor(recorder,
 *   granularity)` outside it. The SAME list the lens draws its ruler from;
 *   handing a different one would be a second axis wearing the first's name.
 * @param step where the cursor's owner says it stands.
 * @param moveTo the owner's funnel.
 *
 * @example Headless — no React, no mount.
 * ```ts
 * import { scrubAxisFor, lensCursorFrom } from 'agentfootprint-lens/core';
 *
 * const positions = scrubAxisFor(recorder, 'step');
 * const cursor = lensCursorFrom(positions, 0, (n) => { myStep = n; });
 * const to = cursor.resolve('llm#7');
 * const href = to.ok ? `/run/${runId}?step=${to.step}` : undefined;
 * ```
 */
export function lensCursorFrom(
  positions: readonly CursorPosition[],
  step: number,
  moveTo: (step: number) => void,
): LensCursor {
  const here = positions[step];
  const at: LensCursorReading =
    here === undefined
      ? Object.freeze({ ...EMPTY_READING, step, totalSteps: positions.length })
      : Object.freeze({
          step,
          totalSteps: positions.length,
          runtimeStageId: here.runtimeStageId,
          commitIdx: here.commitIdx,
          label: here.label,
          ...(here.kind !== undefined ? { kind: here.kind } : {}),
        });
  return Object.freeze({
    at,
    total: positions.length,
    resolve: (runtimeStageId: string): NavigationResult =>
      resolveNavigation(positions, runtimeStageId),
    moveTo,
  });
}
