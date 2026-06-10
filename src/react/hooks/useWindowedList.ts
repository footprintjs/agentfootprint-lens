/**
 * useWindowedList — minimal fixed-row-height list windowing (backlog U3).
 *
 * Pattern: spacer-based virtualization. The consumer renders only rows
 * `[start, end)` inside its OWN scroll container, with two spacer divs
 * (`topPad` / `bottomPad` px tall) standing in for the off-screen rows —
 * the scrollbar geometry stays correct while the DOM holds ~one
 * viewport of rows instead of the full list.
 *
 * Why hand-rolled: the lens has NO virtualization dependency (deps are
 * dagre only; xyflow/react are peers) and U3's scope is "windowed
 * EventStream / virtualized tree" — a fixed-row windower is ~40 lines
 * and avoids a new dependency for v1. Swap in a measured-row library
 * later if variable-height windowing is ever needed.
 *
 * Threshold contract: below `threshold` rows the hook is a no-op
 * (`windowed: false`, full range, zero pads) so small runs render the
 * exact same DOM as before — windowing only engages where the full
 * render would actually degrade.
 *
 * Usage:
 * ```tsx
 * const w = useWindowedList({ count: rows.length, rowHeight: 24 });
 * <div style={{ maxHeight: 400, overflowY: 'auto' }} onScroll={w.onScroll}>
 *   {w.topPad > 0 && <div style={{ height: w.topPad }} />}
 *   {rows.slice(w.start, w.end).map(renderRow)}
 *   {w.bottomPad > 0 && <div style={{ height: w.bottomPad }} />}
 * </div>
 * ```
 *
 * Rows must be (close to) `rowHeight` px tall when windowing is active —
 * consumers typically pin `height: rowHeight` + ellipsis overflow on
 * windowed rows (acceptable for firehose/tree rows; full content stays
 * reachable via the row's detail/select affordance).
 */

import { useCallback, useState } from 'react';
import type React from 'react';

export interface UseWindowedListOptions {
  /** Total number of rows in the list. */
  readonly count: number;
  /** Fixed pixel height of one row (when windowing is active). */
  readonly rowHeight: number;
  /** Row count below which windowing stays OFF (render-all). Default 300. */
  readonly threshold?: number;
  /** Extra rows rendered above/below the viewport. Default 12. */
  readonly overscan?: number;
  /** Viewport height assumed before the first scroll event (the hook
   *  reads the real `clientHeight` on every scroll). Default 400. */
  readonly initialViewportHeight?: number;
}

export interface UseWindowedListResult {
  /** True when the list is long enough that windowing engaged. */
  readonly windowed: boolean;
  /** First row index to render (inclusive). */
  readonly start: number;
  /** Last row index to render (exclusive). */
  readonly end: number;
  /** Height (px) of the spacer ABOVE the rendered rows. */
  readonly topPad: number;
  /** Height (px) of the spacer BELOW the rendered rows. */
  readonly bottomPad: number;
  /** Attach to the scroll container's `onScroll`. Stable identity. */
  readonly onScroll: React.UIEventHandler<HTMLElement>;
}

export function useWindowedList({
  count,
  rowHeight,
  threshold = 300,
  overscan = 12,
  initialViewportHeight = 400,
}: UseWindowedListOptions): UseWindowedListResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(initialViewportHeight);

  const onScroll = useCallback<React.UIEventHandler<HTMLElement>>(
    (e) => {
      setScrollTop(e.currentTarget.scrollTop);
      setViewportHeight(e.currentTarget.clientHeight || initialViewportHeight);
    },
    [initialViewportHeight],
  );

  if (count <= threshold) {
    return { windowed: false, start: 0, end: count, topPad: 0, bottomPad: 0, onScroll };
  }

  // Clamp against `count` so a shrinking list (clear(), filter change)
  // with a stale scrollTop can't produce an out-of-range window.
  const start = Math.max(0, Math.min(count, Math.floor(scrollTop / rowHeight) - overscan));
  const end = Math.max(
    start,
    Math.min(count, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan),
  );
  return {
    windowed: true,
    start,
    end,
    topPad: start * rowHeight,
    bottomPad: (count - end) * rowHeight,
    onScroll,
  };
}
