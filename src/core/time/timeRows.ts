/**
 * foldTimeRows — the time layer's rows on the honesty ledger, grouped for
 * reading (agentfootprint 9.129.0 and 9.132.0, time design § 10.6; the row
 * shapes are `core/time/rows.ts` · `TimeRow` and `coverage/period.ts` ·
 * `PeriodRow`).
 *
 * WHY. An armed agent (`.time()`) files eight row kinds on
 * `AgentState.findingsLedger` beside the findings rows: one `clock` per turn,
 * a `clock-on-resume` when a resume passed a different `time`, a
 * `time-reading` per mention the reader found, a `time-answer` per mention
 * the person settled in the time ask, a `call-window` per call to a tool that
 * declares period forms, a `call` per dispatched call, a `source-clock` per
 * call and zone whose dataset declares a wall-clock zone, and a
 * `time-derived` per judged answer that states values the library spelled
 * from a reading. The results layer files a `period` verdict per call whose
 * tool declares a period — under `.time()` with its result checks
 * (`differs`, `shifted`, `beyondRetention`, `partlyBeyondRetention`). Read
 * raw, one call's story is spread over four rows; this fold joins them by
 * `toolCallId` under their turn, and joins the call's own declared period
 * (`coverageDeclared` · `period`) beside the verdict, so the reader sees
 * asked → sent → covered in one place. A `time-answer` is joined to its
 * reading by `mention` within the turn (`answerOfReading` — the LATEST answer
 * for the mention, the one the library binds).
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. A SHAPE THE LENS DOES NOT OWN. The rows came off a recording as JSON,
 *      so each is narrowed by its shape here and a row that does not fit is
 *      passed over (the `FindingsBand.tsx` · `standingOf` precedent). Types
 *      mirror the library's (`shapes.ts`, pinned to them by a type test).
 *   2. NEVER INFER. Nothing here compares instants, computes a verdict or
 *      decides that a window differs: `wider than asked` is printed only
 *      where the row carries `differs`, a drift only where it carries
 *      `drift`. A row kind the lens does not know is skipped.
 *   3. OMIT, NEVER DENY. `undefined` when the ledger holds no time row and no
 *      period row — an unarmed run has no band, never an empty one.
 *
 * Pure: no React, no clock, no I/O.
 */

import type {
  CallRowShape as CallRow,
  CallWindowRowShape as CallWindowRow,
  ClockOnResumeRowShape as ClockOnResumeRow,
  ClockRowShape as ClockRow,
  PeriodDiffersShape,
  SourceClockRowShape as SourceClockRow,
  TimeAnswerRowShape as TimeAnswerRow,
  TimeDerivedRowShape as TimeDerivedRow,
  TimeReadingRowShape as TimeReadingRow,
  TimeRangeShape as TimeRange,
} from './shapes.js';

/**
 * A period verdict row, as read — a mirror of the library's `PeriodRow`
 * (`test/time/shapes.types.test.ts` pins it). The four check fields are the
 * time layer's result checks (agentfootprint 9.132.0), filed only under
 * `.time()` and only when they hold; each is printed only where the row
 * carries it.
 */
export interface PeriodRowShape {
  readonly kind: 'period';
  readonly turn: number;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly iteration: number;
  readonly verdict: string;
  readonly argument?: string;
  /** `period-differs-from-asked` — what the call read is not the range compared against. */
  readonly differs?: PeriodDiffersShape;
  /** `period-shifted` — the look-back ran as sent, `byMs` after the turn's `now`. */
  readonly shifted?: { readonly byMs: number };
  /** `period-beyond-retention` — wholly older than the tool declares its source keeps. */
  readonly beyondRetention?: true;
  /** The read crosses the edge of what the source keeps; the verdict decides. */
  readonly partlyBeyondRetention?: true;
}

/** What a result declared its read covered (`DeclaredPeriod`), as read. */
export interface DeclaredPeriodShape {
  readonly queried: TimeRange;
  readonly held: TimeRange | 'unknown';
  readonly readAt?: string;
}

/** One call's time story: its window decision, its dispatch moment, its period verdict. */
export interface TimeCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly iteration: number;
  readonly window?: CallWindowRow;
  readonly dispatch?: CallRow;
  readonly period?: PeriodRowShape;
  /** The period the call's result declared (`coverageDeclared` · `period`), joined by `toolCallId`. */
  readonly declared?: DeclaredPeriodShape;
  /** The wall-clock zones the call's datasets declare (`source-clock`, one per zone) — 9.132.0. */
  readonly sourceClocks?: readonly SourceClockRow[];
}

/** One turn's time rows, in the order the ledger holds them. */
export interface TimeTurn {
  readonly turn: number;
  readonly clock?: ClockRow;
  readonly resumes: readonly ClockOnResumeRow[];
  readonly readings: readonly TimeReadingRow[];
  readonly calls: readonly TimeCall[];
  /** The windows the person settled in the time ask, in ledger order (9.132.0). */
  readonly answers: readonly TimeAnswerRow[];
  /** The answer values the library spelled from a reading of this turn (9.132.0). */
  readonly derived: readonly TimeDerivedRow[];
}

export interface TimeFold {
  /** How many ledger rows the fold read (time kinds and `period`). */
  readonly rows: number;
  readonly turns: readonly TimeTurn[];
}

// ─── Narrowing ────────────────────────────────────────────────────────────

type Rec = Readonly<Record<string, unknown>>;

const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** `{ from, to }` of two strings — the one range shape every time row carries. */
export function isRangeShape(v: unknown): v is TimeRange {
  return isRec(v) && isStr(v.from) && isStr(v.to);
}

const hasTurn = (r: Rec): boolean => isCount(r.turn) && isCount(r.iteration);

function clockOf(r: Rec): ClockRow | undefined {
  return isStr(r.now) && isStr(r.zone) && isStr(r.nowSource) && isStr(r.zoneSource)
    ? (r as unknown as ClockRow)
    : undefined;
}

function resumeOf(r: Rec): ClockOnResumeRow | undefined {
  return isRec(r.passed) && isRec(r.kept) ? (r as unknown as ClockOnResumeRow) : undefined;
}

function readingOf(r: Rec): TimeReadingRow | undefined {
  const reader = r.reader;
  if (!isRec(reader) || !isStr(reader.id) || !isStr(reader.version) || !isCount(r.mentions)) {
    return undefined;
  }
  if (r.candidates !== undefined && !Array.isArray(r.candidates)) return undefined;
  return r as unknown as TimeReadingRow;
}

const callIdentity = (r: Rec): boolean => isStr(r.toolCallId) && typeof r.toolName === 'string';

function windowOf(r: Rec): CallWindowRow | undefined {
  return callIdentity(r) && isStr(r.how) ? (r as unknown as CallWindowRow) : undefined;
}

function dispatchOf(r: Rec): CallRow | undefined {
  return callIdentity(r) && isStr(r.dispatchedAt) ? (r as unknown as CallRow) : undefined;
}

const isRanges = (v: unknown): v is readonly TimeRange[] => Array.isArray(v) && v.every(isRangeShape);

/** A period row's `differs`, when every field fits; otherwise the field is passed over. */
function differsOf(v: unknown): PeriodDiffersShape | undefined {
  if (!isRec(v) || !isStr(v.against) || !isStr(v.source) || !isRangeShape(v.asked)) return undefined;
  if (!isRanges(v.read) || !isRanges(v.missing) || !isRanges(v.extra)) return undefined;
  if (v.stepMs !== undefined && typeof v.stepMs !== 'number') return undefined;
  return v as unknown as PeriodDiffersShape;
}

/**
 * A period row, field by field: the identity and verdict, then each result
 * check only when it fits its shape — a malformed check is passed over, never
 * printed half, and the verdict still reads.
 */
function periodOf(r: Rec): PeriodRowShape | undefined {
  if (!callIdentity(r) || !isStr(r.verdict)) return undefined;
  const differs = differsOf(r.differs);
  const shifted = isRec(r.shifted) && typeof r.shifted.byMs === 'number' ? { byMs: r.shifted.byMs } : undefined;
  return {
    kind: 'period',
    turn: r.turn as number,
    toolCallId: r.toolCallId as string,
    toolName: r.toolName as string,
    iteration: r.iteration as number,
    verdict: r.verdict,
    ...(isStr(r.argument) ? { argument: r.argument } : {}),
    ...(differs !== undefined ? { differs } : {}),
    ...(shifted !== undefined ? { shifted } : {}),
    ...(r.beyondRetention === true ? { beyondRetention: true as const } : {}),
    ...(r.partlyBeyondRetention === true ? { partlyBeyondRetention: true as const } : {}),
  };
}

function answerOf(r: Rec): TimeAnswerRow | undefined {
  return isCount(r.mention) &&
    isStr(r.zone) &&
    (r.how === 'confirmed' || r.how === 'edited') &&
    isStr(r.from) &&
    isStr(r.to)
    ? (r as unknown as TimeAnswerRow)
    : undefined;
}

function derivedOf(r: Rec): TimeDerivedRow | undefined {
  return Array.isArray(r.values) && r.values.length > 0 && r.values.every(isStr)
    ? (r as unknown as TimeDerivedRow)
    : undefined;
}

function sourceClockOf(r: Rec): SourceClockRow | undefined {
  return callIdentity(r) && isStr(r.zone) ? (r as unknown as SourceClockRow) : undefined;
}

/** The `period` a `coverageDeclared` row carries, by its `toolCallId`. */
function declaredPeriods(coverage: readonly unknown[] | undefined): Map<string, DeclaredPeriodShape> {
  const out = new Map<string, DeclaredPeriodShape>();
  for (const row of coverage ?? []) {
    if (!isRec(row) || !isStr(row.toolCallId) || !isRec(row.period)) continue;
    const p = row.period;
    if (!isRangeShape(p.queried) || !(p.held === 'unknown' || isRangeShape(p.held))) continue;
    out.set(row.toolCallId, p as unknown as DeclaredPeriodShape);
  }
  return out;
}

// ─── The fold ─────────────────────────────────────────────────────────────

interface TurnDraft {
  turn: number;
  clock?: ClockRow;
  resumes: ClockOnResumeRow[];
  readings: TimeReadingRow[];
  answers: TimeAnswerRow[];
  derived: TimeDerivedRow[];
  calls: Map<string, { -readonly [K in keyof TimeCall]: TimeCall[K] }>;
}

/**
 * The time rows of `ledger`, grouped by turn and, within a turn, by call —
 * or `undefined` when the ledger holds none (law 3). `coverage` is the
 * state's `coverageDeclared` at the same stop, read only for each call's
 * declared `period`.
 */
export function foldTimeRows(
  ledger: readonly unknown[] | undefined,
  coverage?: readonly unknown[],
): TimeFold | undefined {
  if (!Array.isArray(ledger)) return undefined;
  const turns = new Map<number, TurnDraft>();
  const declared = declaredPeriods(coverage);
  let rows = 0;
  const turnOf = (n: number): TurnDraft => {
    let t = turns.get(n);
    if (t === undefined) {
      t = { turn: n, resumes: [], readings: [], answers: [], derived: [], calls: new Map() };
      turns.set(n, t);
    }
    return t;
  };
  const callOf = (t: TurnDraft, r: Rec) => {
    const id = r.toolCallId as string;
    let c = t.calls.get(id);
    if (c === undefined) {
      c = { toolCallId: id, toolName: r.toolName as string, iteration: r.iteration as number };
      const d = declared.get(id);
      if (d !== undefined) c.declared = d;
      t.calls.set(id, c);
    }
    return c;
  };

  for (const row of ledger) {
    if (!isRec(row) || !hasTurn(row)) continue;
    const t = (): TurnDraft => turnOf(row.turn as number);
    switch (row.kind) {
      case 'clock': {
        const clock = clockOf(row);
        if (clock === undefined) continue;
        t().clock = clock;
        break;
      }
      case 'clock-on-resume': {
        const resume = resumeOf(row);
        if (resume === undefined) continue;
        t().resumes.push(resume);
        break;
      }
      case 'time-reading': {
        const reading = readingOf(row);
        if (reading === undefined) continue;
        t().readings.push(reading);
        break;
      }
      case 'call-window': {
        const w = windowOf(row);
        if (w === undefined) continue;
        callOf(t(), row).window = w;
        break;
      }
      case 'call': {
        const d = dispatchOf(row);
        if (d === undefined) continue;
        callOf(t(), row).dispatch = d;
        break;
      }
      case 'period': {
        const p = periodOf(row);
        if (p === undefined) continue;
        callOf(t(), row).period = p;
        break;
      }
      case 'time-answer': {
        const a = answerOf(row);
        if (a === undefined) continue;
        t().answers.push(a);
        break;
      }
      case 'time-derived': {
        const d = derivedOf(row);
        if (d === undefined) continue;
        t().derived.push(d);
        break;
      }
      case 'source-clock': {
        const sc = sourceClockOf(row);
        if (sc === undefined) continue;
        const c = callOf(t(), row);
        c.sourceClocks = [...(c.sourceClocks ?? []), sc];
        break;
      }
      default:
        continue;
    }
    rows += 1;
  }
  if (rows === 0) return undefined;
  return {
    rows,
    turns: [...turns.values()].map((t) => ({
      turn: t.turn,
      ...(t.clock !== undefined ? { clock: t.clock } : {}),
      resumes: t.resumes,
      readings: t.readings,
      calls: [...t.calls.values()],
      answers: t.answers,
      derived: t.derived,
    })),
  };
}

/**
 * The window the person settled for `reading`'s mention in this turn — the
 * LATEST `time-answer` row for that mention (the one the library binds,
 * `windows.ts` · `turnWindowsOf`) — or `undefined` when the person has not
 * answered it. Read only off the answer row; nothing is compared.
 */
export function answerOfReading(
  turn: Pick<TimeTurn, 'answers'>,
  reading: Pick<TimeReadingRow, 'mention'>,
): TimeAnswerRow | undefined {
  if (reading.mention === undefined) return undefined;
  for (let i = turn.answers.length - 1; i >= 0; i--) {
    const a = turn.answers[i]!;
    if (a.mention === reading.mention) return a;
  }
  return undefined;
}

// ─── Spelling ─────────────────────────────────────────────────────────────

/**
 * A signed millisecond count as the shortest exact spelling: `+30m`,
 * `-1h 5m`, `+45s`, `+250ms`. A drift is printed as the record's number,
 * spelled — never rounded into a different number.
 */
export function spellMs(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  let rest = Math.abs(ms);
  const parts: string[] = [];
  for (const [unit, size] of [
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
  ] as const) {
    const n = Math.floor(rest / size);
    if (n > 0) parts.push(`${n}${unit}`);
    rest -= n * size;
  }
  if (rest > 0 || parts.length === 0) parts.push(`${rest}ms`);
  return sign + parts.join(' ');
}
