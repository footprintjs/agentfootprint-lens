/**
 * snapSteps — the two movement laws and the between-position resolution.
 *
 * These are the whole feature's arithmetic, isolated from React: which stop a
 * step stands at (and whether it is ON it), and where ◀ ▶ go from there. The
 * component tests then only have to prove the wiring.
 *
 * The load-bearing case is BETWEEN: with ◀ ▶ narrowed to the stops, the slider
 * can still park the cursor where no stop is, and every answer here has to
 * stay honest about that rather than pretending the cursor is on a stop.
 */

import { describe, it, expect } from 'vitest';
import { snapPositionOf, nextSnapStep, prevSnapStep } from './snapSteps.js';

const STOPS = [0, 4, 9] as const;

describe('snapPositionOf — where a step stands among the stops', () => {
  it('ON a stop: the stop index, and exact', () => {
    expect(snapPositionOf([...STOPS], 0)).toEqual({ index: 0, exact: true });
    expect(snapPositionOf([...STOPS], 4)).toEqual({ index: 1, exact: true });
    expect(snapPositionOf([...STOPS], 9)).toEqual({ index: 2, exact: true });
  });

  it('BETWEEN two stops: resolves to the one AT-OR-BEFORE, and says it is not exact', () => {
    // The disclosure contract: index 1 is "stop 2", `exact: false` is "you are
    // past it". A resolver that returned `exact: true` here would let a
    // readout claim the cursor is somewhere it is not.
    expect(snapPositionOf([...STOPS], 5)).toEqual({ index: 1, exact: false });
    expect(snapPositionOf([...STOPS], 8)).toEqual({ index: 1, exact: false });
    expect(snapPositionOf([...STOPS], 1)).toEqual({ index: 0, exact: false });
  });

  it('BEFORE the first stop: -1, never rounded up to stop 1', () => {
    expect(snapPositionOf([4, 9], 0)).toEqual({ index: -1, exact: false });
    expect(snapPositionOf([4, 9], 3)).toEqual({ index: -1, exact: false });
  });

  it('PAST the last stop: still the last stop, still not exact', () => {
    expect(snapPositionOf([...STOPS], 12)).toEqual({ index: 2, exact: false });
  });

  it('an EMPTY list resolves nothing', () => {
    expect(snapPositionOf([], 3)).toEqual({ index: -1, exact: false });
  });

  it('a ONE-STOP list is the degenerate case, not a crash', () => {
    expect(snapPositionOf([2], 2)).toEqual({ index: 0, exact: true });
    expect(snapPositionOf([2], 5)).toEqual({ index: 0, exact: false });
    expect(snapPositionOf([2], 1)).toEqual({ index: -1, exact: false });
  });
});

describe('nextSnapStep / prevSnapStep — the unit of movement', () => {
  it('are STRICT, which is what makes a between-position walk correctly', () => {
    // From 5 (between stops 2 and 3): ◀ goes back onto 4 — the stop you are
    // standing past — and ▶ goes on to 9. A non-strict `prev` would skip 4 and
    // strand the reader at 0, before the stop the readout just named.
    expect(prevSnapStep([...STOPS], 5)).toBe(4);
    expect(nextSnapStep([...STOPS], 5)).toBe(9);
  });

  it('from ON a stop, move to the neighbouring stops', () => {
    expect(prevSnapStep([...STOPS], 4)).toBe(0);
    expect(nextSnapStep([...STOPS], 4)).toBe(9);
  });

  it('never wrap: the ends answer undefined, which is what disables a button', () => {
    expect(prevSnapStep([...STOPS], 0)).toBeUndefined();
    expect(nextSnapStep([...STOPS], 9)).toBeUndefined();
    expect(nextSnapStep([...STOPS], 12)).toBeUndefined();
  });

  it('an EMPTY list has no moves at all', () => {
    expect(prevSnapStep([], 3)).toBeUndefined();
    expect(nextSnapStep([], 3)).toBeUndefined();
  });

  it('a ONE-STOP list can only be arrived at, never stepped along', () => {
    expect(nextSnapStep([2], 0)).toBe(2);
    expect(prevSnapStep([2], 5)).toBe(2);
    expect(nextSnapStep([2], 2)).toBeUndefined();
    expect(prevSnapStep([2], 2)).toBeUndefined();
  });

  it('answer by min/max, so an unsorted list still moves correctly', () => {
    // The contract asks for ascending (`snapPositionOf`'s INDEX is a display
    // position and needs it), but movement must not silently go backwards for
    // a host that sorted badly.
    expect(nextSnapStep([9, 0, 4], 1)).toBe(4);
    expect(prevSnapStep([9, 0, 4], 8)).toBe(4);
  });
});
