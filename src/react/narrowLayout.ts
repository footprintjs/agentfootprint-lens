/**
 * The narrow degrade — where the engineer view stops being two columns.
 *
 * `<Lens view="engineer">` is a chart column beside a 300px-minimum inspector.
 * Measured in a real browser, that pair needs about 690px of row width before
 * the chart stops being a chart; below it the columns were CLIPPING rather than
 * reflowing — and a split panel dragged narrow measures as little as 392px.
 *
 * So below the threshold the two columns STACK. Nothing is hidden, nothing is
 * clipped; the same panes are read top to bottom instead of left to right.
 */

import { useEffect, useState, type RefObject } from 'react';

/**
 * Available row width, in CSS pixels, below which the engineer view stacks its
 * columns instead of placing them side by side.
 *
 * 690 = a chart column still worth calling a chart + the inspector's own 300px
 * minimum + the collapse pills between them.
 */
export const LENS_NARROW_BREAKPOINT = 690;

/**
 * Should this row stack? A width of `0` means "not measured yet" (server
 * render, a detached node, a test environment with no layout) — an unmeasured
 * row keeps the shipped side-by-side layout rather than guessing narrow.
 */
export function isNarrowRow(width: number): boolean {
  return width > 0 && width < LENS_NARROW_BREAKPOINT;
}

/**
 * Watch an element's width and report whether it has crossed below
 * `LENS_NARROW_BREAKPOINT`. Falls back to the shipped wide layout wherever
 * `ResizeObserver` is unavailable.
 */
export function useNarrowRow(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (width: number): void => {
      const next = isNarrowRow(width);
      setNarrow((prev) => (prev === next ? prev : next));
    };

    const measure = (): number =>
      typeof el.getBoundingClientRect === 'function'
        ? el.getBoundingClientRect().width
        : 0;

    apply(measure());

    const RO = (globalThis as { ResizeObserver?: typeof ResizeObserver })
      .ResizeObserver;
    if (typeof RO !== 'function') return;

    const observer = new RO((entries) => {
      const entry = entries[0];
      const width = entry?.contentRect?.width ?? measure();
      apply(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return narrow;
}
