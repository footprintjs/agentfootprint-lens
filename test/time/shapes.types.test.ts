/**
 * The mirrors in `src/core/time/shapes.ts` (and the axis mirrors in
 * `timeAxis.ts`) are held to the library's own types: every library row type
 * must be assignable to the lens's mirror. A renamed or retyped field the lens
 * prints fails `npm run typecheck` here, against the pinned devDependency —
 * the mirror is never a second owner of the shape.
 */
import { describe, expect, it } from 'vitest';
import type {
  CallRow,
  CallWindowRow,
  ClockOnResumeRow,
  ClockRow,
  DatasetTimeAxis,
  AxisCounts,
  TimeRange,
  TimeReadingRow,
} from 'agentfootprint';

import type {
  CallRowShape,
  CallWindowRowShape,
  ClockOnResumeRowShape,
  ClockRowShape,
  TimeRangeShape,
  TimeReadingRowShape,
} from '../../src/core/time/shapes.js';
import type { AxisCountsShape, DatasetTimeAxisShape } from '../../src/core/time/timeAxis.js';

/** Compiles only when `L` is assignable to `M`. */
type Holds<L, M> = [L] extends [M] ? true : never;

const pins: {
  clock: Holds<ClockRow, ClockRowShape>;
  resume: Holds<ClockOnResumeRow, ClockOnResumeRowShape>;
  call: Holds<CallRow, CallRowShape>;
  window: Holds<CallWindowRow, CallWindowRowShape>;
  reading: Holds<TimeReadingRow, TimeReadingRowShape>;
  range: Holds<TimeRange, TimeRangeShape>;
  axis: Holds<DatasetTimeAxis, DatasetTimeAxisShape>;
  counts: Holds<AxisCounts, AxisCountsShape>;
} = {
  clock: true,
  resume: true,
  call: true,
  window: true,
  reading: true,
  range: true,
  axis: true,
  counts: true,
};

describe('time shapes mirror the library types', () => {
  it('every pin compiles (the check is the type-check)', () => {
    expect(Object.values(pins).every((v) => v === true)).toBe(true);
  });
});
