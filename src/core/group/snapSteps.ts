/**
 * snapSteps — the stops a transport's ◀ ▶ is allowed to LAND on, as pure
 * queries over the ONE step axis.
 *
 * ── The problem, from a real consumer ───────────────────────────────────────
 * A hosted view shares the host's axis. That is the one-cursor law working
 * correctly — but the host's axis is the run's, not the view's. A four-tool
 * turn puts 73 stops on it, and a view that only changes at eight of them
 * spends 65 presses of ◀ ▶ showing the reader the same picture twice. The
 * scrubbing is not wrong; it is DEAD AIR.
 *
 * The fix that must NOT be taken is a second slider with its own numbers: two
 * transports over one run is the drift class this package keeps refusing
 * (`lens_v0_1_one_cursor_architecture`). So the axis stays the host's, the
 * numbers stay the host's, and the only thing that changes is WHICH of those
 * numbers the step buttons stop at.
 *
 * ── What a snap list IS ─────────────────────────────────────────────────────
 * An ascending list of positions on the axis the transport already receives.
 * It is not an axis, not a projection, and carries no addresses: every entry
 * is a step the host could already have moved to. Nothing here is stored, and
 * nothing downstream may store an index into it — a stored snap index would be
 * a second cursor, the exact thing the locked v0.1 architecture bans.
 *
 * ── The two laws, and why they are STRICT ───────────────────────────────────
 * `nextSnapStep` takes the least stop strictly GREATER than the cursor;
 * `prevSnapStep` the greatest stop strictly LESS. Strictness is what makes a
 * cursor parked BETWEEN two stops behave: ◀ from step 5 with stops
 * `[0, 4, 9]` lands on 4 — back onto the stop you are standing past — while ▶
 * lands on 9. A non-strict `prev` would skip 4 and jump to 0, stranding the
 * reader before the stop the readout just told them they were near.
 *
 * Both are min/max scans, so they answer correctly whatever order the list
 * arrives in; `snapPositionOf`'s INDEX is the one answer that assumes the
 * documented ascending order (it is a display position — "stop 2 of 5").
 *
 * Never throw, never invent, and never move a cursor on their own: they answer
 * `undefined` for "there is no such stop" and let the caller decide that a
 * button is disabled.
 */

/**
 * Where a step stands relative to a list of snap stops.
 *
 * The two fields answer two different questions, and a readout that collapses
 * them lies: `index` is which stop the cursor is AT OR PAST, `exact` is
 * whether it is actually ON it.
 */
export interface SnapPosition {
  /**
   * Index in the snap list of the stop AT-OR-BEFORE the step — `-1` when the
   * step falls before the first stop (or the list is empty).
   */
  readonly index: number;
  /**
   * `true` when the step IS that stop; `false` when it stands BETWEEN that
   * stop and the next (or past the last one). A cursor between stops is a real
   * position, not a stop, and a readout must say so rather than rounding it
   * down silently.
   */
  readonly exact: boolean;
}

/**
 * Resolve a step onto a snap list: the stop at-or-before it, and whether the
 * step is that stop or merely past it.
 *
 * @param snapSteps the permitted stops, ascending.
 * @param step the cursor's position on the same axis.
 *
 * @example
 * ```ts
 * snapPositionOf([0, 4, 9], 4); // → { index: 1, exact: true }   — on stop 2
 * snapPositionOf([0, 4, 9], 5); // → { index: 1, exact: false }  — between 2 and 3
 * snapPositionOf([4, 9], 0);    // → { index: -1, exact: false } — before stop 1
 * ```
 */
export function snapPositionOf(snapSteps: readonly number[], step: number): SnapPosition {
  let index = -1;
  let best = -Infinity;
  for (let i = 0; i < snapSteps.length; i += 1) {
    const s = snapSteps[i];
    if (s === undefined || s > step) continue;
    if (s >= best) {
      best = s;
      index = i;
    }
  }
  return { index, exact: index >= 0 && best === step };
}

/**
 * The next stop after `step` — the least entry strictly greater than it.
 *
 * `undefined` means "no stop ahead", which is what disables a ▶ button. There
 * is deliberately no wrap: a transport that wrapped would make the end of a
 * run indistinguishable from its start.
 *
 * @example
 * ```ts
 * nextSnapStep([0, 4, 9], 5); // → 9
 * nextSnapStep([0, 4, 9], 9); // → undefined
 * ```
 */
export function nextSnapStep(snapSteps: readonly number[], step: number): number | undefined {
  let best: number | undefined;
  for (const s of snapSteps) {
    if (s > step && (best === undefined || s < best)) best = s;
  }
  return best;
}

/**
 * The previous stop before `step` — the greatest entry strictly less than it.
 *
 * Strictly less is what makes a between-position walk back onto the stop it is
 * standing past: from 5 with stops `[0, 4, 9]` this answers 4, not 0.
 *
 * @example
 * ```ts
 * prevSnapStep([0, 4, 9], 5); // → 4  — the stop you are standing past
 * prevSnapStep([0, 4, 9], 4); // → 0  — already on a stop, so the one before it
 * prevSnapStep([0, 4, 9], 0); // → undefined
 * ```
 */
export function prevSnapStep(snapSteps: readonly number[], step: number): number | undefined {
  let best: number | undefined;
  for (const s of snapSteps) {
    if (s < step && (best === undefined || s > best)) best = s;
  }
  return best;
}
