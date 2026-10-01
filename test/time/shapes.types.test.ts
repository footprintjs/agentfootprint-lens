/**
 * The mirrors in `src/core/time/shapes.ts` (and the axis mirrors in
 * `timeAxis.ts`, the period row in `timeRows.ts`) are held to the library's
 * own types: every library row type must be assignable to the lens's mirror.
 * A renamed or retyped field the lens prints fails `npm run typecheck` here,
 * against the pinned devDependency — the mirror is never a second owner of
 * the shape.
 *
 * The three rows agentfootprint 9.132.0 added (`time-answer`, `time-derived`,
 * `source-clock`) are not exported by name from its root in 9.132.0. They are
 * members of the exported `FindingsRow` union, so each is reached by its
 * `kind` — the library's own type, no missing name imported. The pin moves to
 * the root name (`TimeAnswerRow`, `TimeDerivedRow`, `SourceClockRow`) once the
 * library exports it.
 */
import { describe, expect, it } from 'vitest';
import type {
  CallRow,
  CallWindowRow,
  ClockOnResumeRow,
  ClockRow,
  DatasetTimeAxis,
  AxisCounts,
  FindingsRow,
  PeriodRow,
  TimeRange,
  TimeReadingRow,
} from 'agentfootprint';

import type {
  CallRowShape,
  CallWindowRowShape,
  ClockOnResumeRowShape,
  ClockRowShape,
  PeriodDiffersShape,
  SourceClockRowShape,
  TimeAnswerRowShape,
  TimeDerivedRowShape,
  TimeRangeShape,
  TimeReadingRowShape,
} from '../../src/core/time/shapes.js';
import type { AxisCountsShape, DatasetTimeAxisShape } from '../../src/core/time/timeAxis.js';
import type { PeriodRowShape } from '../../src/core/time/timeRows.js';

/** Compiles only when `L` is assignable to `M`. */
type Holds<L, M> = [L] extends [M] ? true : never;
/** Compiles only when `L` is a real type AND assignable to `M` — an `Extract` that found no member is `never`, which would hold vacuously. */
type HoldsReal<L, M> = [L] extends [never] ? never : Holds<L, M>;

/** A member of the library's ledger union, by its `kind`. */
type RowOfKind<K extends string> = Extract<FindingsRow, { readonly kind: K }>;

const pins: {
  clock: Holds<ClockRow, ClockRowShape>;
  resume: Holds<ClockOnResumeRow, ClockOnResumeRowShape>;
  call: Holds<CallRow, CallRowShape>;
  window: Holds<CallWindowRow, CallWindowRowShape>;
  reading: Holds<TimeReadingRow, TimeReadingRowShape>;
  range: Holds<TimeRange, TimeRangeShape>;
  axis: Holds<DatasetTimeAxis, DatasetTimeAxisShape>;
  counts: Holds<AxisCounts, AxisCountsShape>;
  period: Holds<PeriodRow, PeriodRowShape>;
  differs: HoldsReal<NonNullable<PeriodRow['differs']>, PeriodDiffersShape>;
  answer: HoldsReal<RowOfKind<'time-answer'>, TimeAnswerRowShape>;
  derived: HoldsReal<RowOfKind<'time-derived'>, TimeDerivedRowShape>;
  sourceClock: HoldsReal<RowOfKind<'source-clock'>, SourceClockRowShape>;
} = {
  clock: true,
  resume: true,
  call: true,
  window: true,
  reading: true,
  range: true,
  axis: true,
  counts: true,
  period: true,
  differs: true,
  answer: true,
  derived: true,
  sourceClock: true,
};

describe('time shapes mirror the library types', () => {
  it('every pin compiles (the check is the type-check)', () => {
    expect(Object.values(pins).every((v) => v === true)).toBe(true);
  });
});
