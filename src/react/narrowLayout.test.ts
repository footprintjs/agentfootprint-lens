/**
 * The narrow degrade's decision function — the whole threshold rule, with no
 * DOM in the way. The stacking itself is asserted end-to-end in
 * `Lens.layout.test.tsx` at the measured 392px split-panel width.
 */

import { describe, it, expect } from 'vitest';
import { LENS_NARROW_BREAKPOINT, isNarrowRow } from './narrowLayout.js';

describe('LENS_NARROW_BREAKPOINT', () => {
  it('is the measured floor: a usable chart plus the inspector minimum', () => {
    expect(LENS_NARROW_BREAKPOINT).toBe(690);
  });
});

describe('isNarrowRow', () => {
  it('stacks below the threshold — including the 392px split panel', () => {
    expect(isNarrowRow(392)).toBe(true);
    expect(isNarrowRow(1)).toBe(true);
    expect(isNarrowRow(LENS_NARROW_BREAKPOINT - 1)).toBe(true);
  });

  it('keeps the two columns at and above the threshold', () => {
    expect(isNarrowRow(LENS_NARROW_BREAKPOINT)).toBe(false);
    expect(isNarrowRow(1573)).toBe(false); // the measured split-view row
    expect(isNarrowRow(2000)).toBe(false); // the measured expanded row
  });

  it('treats an UNMEASURED row as wide — never guesses narrow from no data', () => {
    // Server render, detached node, or a test environment with no layout.
    expect(isNarrowRow(0)).toBe(false);
    expect(isNarrowRow(-1)).toBe(false);
  });
});
