/**
 * timeStandingOf — the answer's time-related standing, as the library filed
 * it (agentfootprint 9.132.0, `agent.assessment()` /
 * `assessAnswer(recording)` / `turn_end.answerAssessment`).
 *
 * WHY. The library folds the answer's standing (known · consistent · not sure
 * · ask) from the record and names every reason that holds. Several of those
 * reasons are about TIME — the read was not the window asked, the window was
 * older than the source keeps, a value was spelled from a reading of the
 * person's words — and a Time view without them shows every row and hides
 * what the rows did to the answer.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. NEVER COMPUTE A REASON. A reason is listed only when the assessment
 *      the app passes names it. The ledger is read only to RESOLVE the
 *      library's own witness pointers (`{ kind: 'state', key:
 *      'findingsLedger', path: '/<index>/…' }`) to the calls they name; no
 *      row ever makes a reason on its own.
 *   2. TIME REASONS ONLY. `TIME_REASONS` below, in the order the library
 *      filed them. `argument-assumed` is listed only when one of ITS
 *      witnesses resolves to an `argument` row with `period: true` (the
 *      period argument was filled from an assumed default) — the data
 *      projection (`reasons` as bare names) carries no witness, so there it
 *      is passed over: the lens cannot tell which argument it names.
 *   3. SAY THE STANDING, NEVER DENY. `undefined` only when the value is not
 *      an assessment the lens can narrow. An assessment with no time reason
 *      is NOT silence: the answer still has a standing, and the Time view
 *      says the time half of it — no time-related reason, the standing as
 *      filed, and whether OTHER reasons were filed (`otherReasons`, a count
 *      off the assessment; the reasons themselves are In plain words' to
 *      show). Silence there read as "nothing to see" beside an answer the
 *      person was told is not sure (take-2 video, lens 0.71.0).
 *   4. A REASON THE LENS CANNOT PLACE IS NOT DENIED. `argument-assumed`
 *      whose witnesses resolve to no ledger row (the data projection's bare
 *      name, or a ledger not handed in) may or may not name the period
 *      argument: it is listed as `undetermined`, and "no time-related
 *      reason" is never said beside it.
 *
 * Pure: no React, no clock, no I/O.
 */

/** The reasons the time view lists unconditionally when the library filed them. */
export const TIME_REASONS = Object.freeze([
  'period-differs-from-asked',
  'period-beyond-retention',
  'period-not-held',
  'period-partly-held',
  'period-unknown',
  'period-undeclared',
  'derived-from-reading',
] as const);

/** A reason the time view can list (`argument-assumed` only on a period argument). */
export type TimeReason = (typeof TIME_REASONS)[number] | 'argument-assumed';

/** One call a reason's witnesses name, off the ledger row the pointer resolves to. */
export interface TimeReasonCall {
  readonly toolCallId: string;
  readonly toolName: string;
}

export interface TimeReasonItem {
  readonly reason: TimeReason;
  /** The calls its witnesses name — empty under the data projection, or for an answer-level reason. */
  readonly calls: readonly TimeReasonCall[];
}

export interface TimeStanding {
  /** The library's word for the whole answer (`not-sure`, `ask`, …), as filed. */
  readonly standing?: string;
  /** The time reasons the assessment names — empty when it names none. */
  readonly reasons: readonly TimeReasonItem[];
  /**
   * How many reasons the assessment filed that are NOT about time — counted,
   * never listed (In plain words shows them). With `reasons` empty and
   * nothing `undetermined`, the answer's standing is set by these alone.
   */
  readonly otherReasons: number;
  /**
   * Reasons that may be about time but cannot be placed from what was handed
   * in (`argument-assumed` with no witness row to read). Absent when none.
   */
  readonly undetermined?: readonly TimeReason[];
}

type Rec = Readonly<Record<string, unknown>>;
const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);

const isTimeReason = (r: string): r is (typeof TIME_REASONS)[number] =>
  (TIME_REASONS as readonly string[]).includes(r);

/** The assessment wherever it travels: the value itself, or `turn_end`'s `{ answerAssessment }`. */
function assessmentOf(value: unknown): Rec | undefined {
  if (!isRec(value)) return undefined;
  if (Array.isArray(value.reasons)) return value;
  if (isRec(value.answerAssessment)) return assessmentOf(value.answerAssessment);
  return undefined;
}

/** The ledger row a `findingsLedger` witness pointer names, when it is one. */
function rowOf(pointer: unknown, ledger: readonly unknown[]): Rec | undefined {
  if (!isRec(pointer) || pointer.kind !== 'state' || pointer.key !== 'findingsLedger') return undefined;
  if (typeof pointer.path !== 'string') return undefined;
  const m = /^\/(\d+)(?:\/|$)/.exec(pointer.path);
  if (m === null) return undefined;
  const row = ledger[Number(m[1])];
  return isRec(row) ? row : undefined;
}

const callOfRow = (row: Rec): TimeReasonCall | undefined =>
  typeof row.toolCallId === 'string' && typeof row.toolName === 'string'
    ? { toolCallId: row.toolCallId, toolName: row.toolName }
    : undefined;

/** The distinct calls the rows name, in witness order. */
function callsOf(rows: readonly Rec[]): TimeReasonCall[] {
  const seen = new Set<string>();
  const out: TimeReasonCall[] = [];
  for (const row of rows) {
    const c = callOfRow(row);
    if (c === undefined || seen.has(c.toolCallId)) continue;
    seen.add(c.toolCallId);
    out.push(c);
  }
  return out;
}

const isPeriodArgument = (row: Rec): boolean => row.kind === 'argument' && row.period === true;

/**
 * The time reasons `assessment` names, each with the calls its witnesses
 * resolve to on `ledger`, beside the standing as filed and the count of the
 * reasons that are not about time — `undefined` only when `assessment` is not
 * an assessment (law 3).
 * `assessment` is `AnswerAssessment` (`agent.assessment()`,
 * `assessAnswer(recording)`), its data projection
 * (`turn_end.answerAssessment`), or the `turn_end` payload itself.
 */
export function timeStandingOf(
  assessment: unknown,
  ledger: readonly unknown[] = [],
): TimeStanding | undefined {
  const a = assessmentOf(assessment);
  if (a === undefined) return undefined;
  const reasons: TimeReasonItem[] = [];
  const undetermined: TimeReason[] = [];
  let otherReasons = 0;
  for (const entry of a.reasons as readonly unknown[]) {
    // The data projection: a bare reason name, no witness.
    if (typeof entry === 'string') {
      if (isTimeReason(entry)) reasons.push({ reason: entry, calls: [] });
      else if (entry === 'argument-assumed') undetermined.push('argument-assumed');
      else otherReasons += 1;
      continue;
    }
    if (!isRec(entry) || typeof entry.reason !== 'string') continue;
    const witness = Array.isArray(entry.witness) ? entry.witness : [];
    const rows = witness
      .map((p) => rowOf(p, ledger))
      .filter((r): r is Rec => r !== undefined);
    if (isTimeReason(entry.reason)) {
      reasons.push({ reason: entry.reason, calls: callsOf(rows) });
    } else if (entry.reason === 'argument-assumed') {
      const periodRows = rows.filter(isPeriodArgument);
      if (periodRows.length > 0) reasons.push({ reason: 'argument-assumed', calls: callsOf(periodRows) });
      // Witness rows read, none a period argument: an assumed value of another argument.
      else if (rows.length > 0) otherReasons += 1;
      // No witness row to read: it may name the period argument — never denied (law 4).
      else undetermined.push('argument-assumed');
    } else {
      otherReasons += 1;
    }
  }
  return {
    ...(typeof a.standing === 'string' ? { standing: a.standing } : {}),
    reasons,
    otherReasons,
    ...(undetermined.length > 0 ? { undetermined } : {}),
  };
}
