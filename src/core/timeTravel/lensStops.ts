/**
 * `lensStopsStrategy` — the Lens's own stops, spoken in the port's grammar.
 *
 * footprintjs 9.17 owns the READER'S CURSOR: `timeTravel(snapshot, { strategy })`
 * gives one interface for first / last / prev / next / jumpTo, with the
 * clamp-and-miss law stated once (`Move` — a miss NEVER moves). The library
 * ships ONE strategy, `commitStops`: one stop per executed stage. That is not
 * the Why Lens's axis. The Lens stops at the moments the DOMAIN declares —
 * iteration, context, LLM turn, route, tool call — and at drill-scoped
 * structural boundaries, banded and ordinal-labelled
 * (`cursorPositionsAtDrill` / `commitAxisPositions`).
 *
 * The strategy seam is exactly the seam for that. This module does not change
 * which stops exist, what they are called, or in what order they come: it
 * hands the port the Lens's `CursorPosition[]` verbatim, wearing the port's
 * `Stop` shape. `stop.step` IS the index into the position list, so the two
 * axes are the same axis, addressed the same way — which is what lets the
 * cursor the Lens owns in steps be MOVED by the port without either side
 * learning the other's arithmetic.
 *
 * WHAT THE `Stop` SHAPE CANNOT CARRY: `runtimeGroupId`, `depth`,
 * `coActiveGroupIds` and `milestone` are the Lens's, and `Stop` has no
 * free-form slot for them. They are NOT flattened or dropped — the position
 * list stays beside the cursor as the side map (`positionAt(step)`), and every
 * panel keeps reading the `CursorPosition`, not the `Stop`. See
 * `lensCursorPort.ts`.
 */

import { parseRuntimeStageId } from 'footprintjs/trace';
import type { Stop, StopKind, TimeTravelStrategy } from 'footprintjs/trace';

import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';

/**
 * The Lens's stop kind, said in the port's four words.
 *
 * The port's vocabulary describes the COMMIT axis: `'start'` / `'end'` are the
 * run's bookends, `'mount'` is a boundary you can drill into, `'commit'` is one
 * executed stage. The Lens's is richer, so the mapping is a projection and the
 * original survives in the side map (`CursorPosition.kind`, which is what
 * `<Lens onStepChange>` still reports).
 *
 *   - `'group-start'` at step 0 → `'start'` (the axis's own opening bookend,
 *     "Run · start"); anywhere else it opens a group the reader can drill
 *     into, which is precisely `'mount'`.
 *   - `'group-end'` at the last step → `'end'` ("Run · end"); elsewhere it is
 *     a real moment at a real commit (a fork's "merged", a loop's "exit"), so
 *     `'commit'`.
 *   - `'parallel'` → `'commit'`: the stop's address is ONE executed stage's;
 *     the concurrent branches are chart-highlight data, never a second cursor.
 *   - `'user-in'` / `'user-out'` → the bookends they were reserved to be.
 *
 * Nothing in the port branches on `kind` — it is what a UI puts on a tick — so
 * this projection cannot change where any move lands.
 */
export function lensStopKind(position: CursorPosition, step: number, total: number): StopKind {
  switch (position.kind) {
    case 'user-in':
      return 'start';
    case 'user-out':
      return 'end';
    case 'group-start':
      return step === 0 ? 'start' : 'mount';
    case 'group-end':
      return step === total - 1 ? 'end' : 'commit';
    default:
      return 'commit';
  }
}

/** One Lens position, wearing the port's `Stop`. */
export function lensStop(position: CursorPosition, step: number, positions: readonly CursorPosition[]): Stop {
  const parsed = parseRuntimeStageId(position.runtimeStageId);
  // The port's stops PARTITION the log: a stop's slice ends just before the
  // next stop's first commit. The Lens's positions are already in commit
  // order, so the partition is read straight off the neighbour — never
  // recomputed from the log, which would be a second opinion about the axis.
  const next = positions[step + 1];
  const lastCommitIdx =
    next === undefined ? position.commitIdx : Math.max(position.commitIdx, next.commitIdx - 1);
  return {
    step,
    runtimeStageId: position.runtimeStageId,
    commitIdx: position.commitIdx,
    lastCommitIdx,
    stageId: parsed.stageId,
    ...(parsed.subflowPath !== undefined ? { subflowPath: parsed.subflowPath } : {}),
    label: position.label,
    kind: lensStopKind(position, step, positions.length),
  };
}

/**
 * The Lens's positions as a `TimeTravelStrategy`.
 *
 * The port's law for a strategy is that stops are DERIVED FROM THE RECORDED
 * LOG, never invented by re-walking a tree. These are: `cursorPositionsAtDrill`
 * and `commitAxisPositions` read the recording's commit log and boundary index
 * and nothing else. The log argument is unused here because that derivation
 * already happened — passing it again would invite a second derivation, which
 * is the drift this port exists to end.
 *
 * @example
 * ```ts
 * const positions = scrubAxisFor(recorder, 'group');
 * const cursor = timeTravel(recording.snapshot, { strategy: lensStopsStrategy(positions) });
 * cursor.jumpTo('llm#7');   // the port's ladder, over the Lens's stops
 * ```
 */
export function lensStopsStrategy(positions: readonly CursorPosition[]): TimeTravelStrategy {
  const stops = positions.map((p, i) => lensStop(p, i, positions));
  return { stopsFor: () => [...stops] };
}
