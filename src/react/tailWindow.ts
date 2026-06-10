/**
 * tailWindow — bound a cumulative feed to its most recent `max` items
 * (backlog U3).
 *
 * The commentary surfaces are TAIL-ANCHORED feeds: the focused line is
 * always the LAST visible row (the cutoff/cursor), and scrubbing back
 * moves the cutoff — so rendering only the newest `max` rows up to the
 * cutoff preserves the entire interaction model (focus highlight,
 * scroll-into-view, live line) while keeping the DOM bounded. Earlier
 * rows aren't lost: scrubbing back slides the window back with the
 * cutoff.
 *
 * Honesty: the caller renders `hidden` as an explicit "… N earlier
 * moments hidden" leader line whenever it is non-zero — a bounded view
 * is never silent about what it cut.
 */

/** Default row bound for the commentary surfaces. ~500 rows is well past
 *  a screenful but cheap enough to mount eagerly in one pass. */
export const MAX_COMMENTARY_LINES = 500;

export interface TailWindowResult<T> {
  /** Number of items cut from the FRONT (oldest). 0 when under `max`. */
  readonly hidden: number;
  /** The newest `max` items (or all of them, when under `max`). */
  readonly shown: readonly T[];
}

/** Keep the newest `max` items of `items`; report how many were cut. */
export function tailWindow<T>(items: readonly T[], max: number): TailWindowResult<T> {
  if (items.length <= max) return { hidden: 0, shown: items };
  return { hidden: items.length - max, shown: items.slice(items.length - max) };
}
