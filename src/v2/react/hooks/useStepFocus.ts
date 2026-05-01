/**
 * useStepFocus — scrub cursor with auto-advance when live.
 *
 * Pattern: one state field (`focus`) + one ref (`wasLive`) + a
 *          `setFocus` setter. Auto-advances to `max` when the user
 *          was already at `max` before the last event fired; pins
 *          to the user's chosen index when they've manually scrubbed
 *          back. Matches v1's TimeTravel auto-advance semantics.
 * Role:    Owns scrub state. Consumers pass `max` (total step count
 *          from the selectors) and receive the controlled position
 *          + an `isLive` flag for the ⟳Live button.
 */

import { useEffect, useRef, useState } from 'react';

export interface UseStepFocusResult {
  readonly focus: number;
  /** True when the user is at the most-recent step (new events advance). */
  readonly isLive: boolean;
  readonly setFocus: (next: number) => void;
}

/**
 * Controlled scrub cursor. Keeps pace with `max` when the user is at
 * the end; pins to the manually-scrubbed position otherwise.
 *
 * Contract:
 *   - Initial `focus` = `max` (at the end / live).
 *   - When `max` grows (a new step landed), if the user WAS at the
 *     previous `max` (i.e., was live), snap to the new `max`. Else
 *     leave `focus` where it is.
 *   - `setFocus(max)` re-engages live mode for subsequent events.
 */
export function useStepFocus(max: number): UseStepFocusResult {
  const [focus, setFocus] = useState(Math.max(0, max));
  // Track the PREVIOUS max so we can compare "was the user live
  // before this change?" inside the effect. Using focus >= max at
  // render time would capture the post-change relation, not the
  // pre-change one — leading to missed auto-advances.
  const prevMax = useRef(max);
  useEffect(() => {
    const wasLiveBefore = focus >= prevMax.current;
    if (wasLiveBefore) setFocus(max);
    prevMax.current = max;
    // `focus` is intentionally excluded from deps — including it
    // would re-fire this effect every time the user manually scrubs,
    // which would snap them back to live. The ref-read captures the
    // current-focus value at effect time without triggering re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max]);

  return {
    focus,
    isLive: focus >= max,
    setFocus,
  };
}
