/**
 * foldAt — the ONE owner of "which commit a stop's fold runs THROUGH".
 *
 * A position's `commitIdx` is where it ANCHORS on the log (what `jumpTo`, the
 * address and `stepForCommitIdx` read). For every stop but one, that is also
 * the last commit the record held there: a stage's stop stands on its own
 * commit. The exception is the run's opening bookend, "Run · start" (the
 * root group's `group-start`, depth 0): the root group OPENS at the first
 * commit, so the bookend shares that index with the first stage's stop — but
 * it stands BEFORE that commit happened. Folding it inclusively shows the
 * first stage's writes at "Run · start", and on a RESUMED leg that is the
 * paused call's stand-in: the answer bound, the call dispatched — every stop
 * of the leg then looked the same from the first (found in the 2026-10-01
 * demo video). footprintjs's own axis says the same thing: its `'start'` stop
 * is `commitIdx: -1`, the fold base (`splitAxis` · `axis.start.commitIdx`).
 *
 * So every fold of the record at a stop — `contextAt`, the Served tab, the
 * Time view a host mounts — asks here: `-1` (the base: the run's
 * `initialState`, which on a resumed leg is the state at the pause) for the
 * opening bookend, the position's own `commitIdx` otherwise. The reading a
 * cursor hands out carries it (`LensCursorReading.foldCommitIdx`), and
 * {@link foldCursorOf} turns a reading into the cursor a fold takes.
 *
 * Pure; no React.
 */
import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';
import type { ServedCursor } from '../served/types.js';

/**
 * The last commit the record held at `position`: `-1` at the run's opening
 * bookend ("Run · start", or a `user-in` bookend — depth 0), its `commitIdx`
 * at every other stop.
 *
 * @example
 * ```ts
 * const positions = scrubAxisFor(recorder, 'group');
 * foldCommitIdxOf(positions[0]!); // -1 — Run · start folds the base
 * foldCommitIdxOf(positions[1]!); // positions[1].commitIdx
 * ```
 */
export function foldCommitIdxOf(position: Pick<CursorPosition, 'kind' | 'depth' | 'commitIdx'>): number {
  const opening = position.kind === 'group-start' || position.kind === 'user-in';
  return opening && position.depth === 0 ? -1 : position.commitIdx;
}

/**
 * The cursor a fold takes (`contextAt`, `servedRowAt`) for a cursor reading:
 * its address, folded through `foldCommitIdx`. A reading built before the
 * field existed (a host's own) carries none, and folds its `commitIdx`.
 *
 * @example
 * ```ts
 * const at = shared.forAxis('group').at;
 * const ledger = contextAt(snapshot, foldCursorOf(at)).keys.find((k) => k.path === 'findingsLedger')?.value;
 * ```
 */
export function foldCursorOf(at: {
  readonly runtimeStageId: string;
  readonly commitIdx: number;
  readonly foldCommitIdx?: number;
}): ServedCursor {
  return { runtimeStageId: at.runtimeStageId, commitIdx: at.foldCommitIdx ?? at.commitIdx };
}
