/** @vitest-environment jsdom */
/**
 * useWindowedList — minimal fixed-row windowing hook (backlog U3).
 *
 * Verifies the threshold contract (no-op below `threshold` so small
 * lists render the exact pre-U3 DOM), the window geometry math
 * (start/end/pads from scrollTop + viewport), scroll updates, and
 * clamping when the list shrinks under a stale scroll position.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWindowedList } from './useWindowedList.js';

/** Fake scroll event with just the fields the hook reads. */
function scrollEvent(scrollTop: number, clientHeight: number): React.UIEvent<HTMLElement> {
  return { currentTarget: { scrollTop, clientHeight } } as unknown as React.UIEvent<HTMLElement>;
}

describe('useWindowedList — threshold contract', () => {
  it('is a no-op below the threshold: full range, zero pads', () => {
    const { result } = renderHook(() =>
      useWindowedList({ count: 100, rowHeight: 24, threshold: 300 }),
    );
    expect(result.current).toMatchObject({
      windowed: false,
      start: 0,
      end: 100,
      topPad: 0,
      bottomPad: 0,
    });
  });

  it('engages past the threshold', () => {
    const { result } = renderHook(() =>
      useWindowedList({ count: 1000, rowHeight: 20, threshold: 300, overscan: 12 }),
    );
    expect(result.current.windowed).toBe(true);
    // At scrollTop 0 with the default 400px viewport assumption:
    // start = 0, end = ceil(400/20) + 12 = 32.
    expect(result.current.start).toBe(0);
    expect(result.current.end).toBe(32);
    expect(result.current.topPad).toBe(0);
    expect(result.current.bottomPad).toBe((1000 - 32) * 20);
  });
});

describe('useWindowedList — scroll geometry', () => {
  it('moves the window with scrollTop and reads the live viewport height', () => {
    const { result } = renderHook(() =>
      useWindowedList({ count: 1000, rowHeight: 20, threshold: 300, overscan: 12 }),
    );
    act(() => {
      result.current.onScroll(scrollEvent(2000, 400));
    });
    // start = floor(2000/20) - 12 = 88; end = ceil(2400/20) + 12 = 132.
    expect(result.current.start).toBe(88);
    expect(result.current.end).toBe(132);
    expect(result.current.topPad).toBe(88 * 20);
    expect(result.current.bottomPad).toBe((1000 - 132) * 20);
    // Spacer + window heights reconstruct the full list height.
    const windowHeight = (result.current.end - result.current.start) * 20;
    expect(result.current.topPad + windowHeight + result.current.bottomPad).toBe(1000 * 20);
  });

  it('clamps to a valid range when the list shrinks under a stale scrollTop', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useWindowedList({ count, rowHeight: 20, threshold: 10, overscan: 2 }),
      { initialProps: { count: 1000 } },
    );
    act(() => {
      result.current.onScroll(scrollEvent(10_000, 400));
    });
    rerender({ count: 12 });
    expect(result.current.start).toBeLessThanOrEqual(12);
    expect(result.current.end).toBeLessThanOrEqual(12);
    expect(result.current.end).toBeGreaterThanOrEqual(result.current.start);
    expect(result.current.bottomPad).toBeGreaterThanOrEqual(0);
  });

  it('onScroll identity is stable across renders (safe as a prop)', () => {
    const { result, rerender } = renderHook(
      ({ count }) => useWindowedList({ count, rowHeight: 20 }),
      { initialProps: { count: 100 } },
    );
    const first = result.current.onScroll;
    rerender({ count: 200 });
    expect(result.current.onScroll).toBe(first);
  });
});
