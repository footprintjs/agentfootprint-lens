/**
 * The time views' own words — names for rows and fields, never a claim.
 *
 * Every other string the time views print is a value off the record (an
 * instant, a zone, a tool name, the record's own word for `how`, `choice.by`,
 * `outcome`, `verdict`, a refusal code) or a library sentence handed through
 * (an ask's `refused.reason`). `test/served/no-own-claims.test.ts` walks
 * `src/core/time/` and the three time components against this set.
 *
 * Two labels carry a MEANING the reader must not miss, and are chosen from
 * the design page's own words (agentfootprint docs/design/time § 8, § 10.2):
 * `widened` ("wider than asked") on a fill that reads more than was asked,
 * and `clockUnknown` ("clock unknown") on a value, a tz database or a held
 * range whose clock the record does not know.
 *
 * The time-reason lines (keyed by the reason's own name, e.g.
 * `period-differs-from-asked`) are LABELS for a reason the library filed —
 * the view prints one only beside the library's reason, never in its place
 * and never for a reason the library did not file.
 */
export const LABELS = Object.freeze({
  band: 'time',
  rows: 'rows',
  turn: 'turn',
  clock: 'clock',
  now: 'now',
  zone: 'zone',
  source: 'source',
  window: 'window',
  clockOnResume: 'clock on resume',
  passed: 'passed',
  kept: 'kept',
  readings: 'readings',
  reader: 'reader',
  tzdata: 'tz database',
  noMentions: 'no mentions',
  quote: 'quote',
  candidates: 'candidates',
  choice: 'choice',
  remaining: 'remaining',
  open: 'open',
  policy: 'policy',
  refused: 'refused',
  problem: 'problem',
  said: 'said',
  implied: 'implied',
  notes: 'notes',
  grain: 'grain',
  calls: 'calls',
  how: 'how',
  form: 'form',
  asked: 'asked',
  person: 'person',
  mention: 'mention',
  by: 'by',
  rounded: 'rounded',
  why: 'why',
  sent: 'sent',
  widened: 'wider than asked',
  extra: 'extra',
  trimmedByTool: 'trimmed by tool',
  partlyBeyondRetention: 'partly beyond retention',
  argument: 'argument',
  dispatchedAt: 'dispatched at',
  drift: 'drift at dispatch',
  period: 'period',
  verdict: 'verdict',
  queried: 'queried',
  held: 'held',
  readAt: 'read at',
  clockUnknown: 'clock unknown',
  ask: 'time ask',
  request: 'request',
  repeat: 'asked again',
  answer: 'answer',
  reason: 'reason',
  field: 'field',
  format: 'format',
  choices: 'choices',
  strict: 'strict',
  missing: 'missing',
  axis: 'time axis',
  column: 'column',
  unit: 'unit',
  interval: 'interval',
  aggregate: 'aggregate',
  summary: 'summary',
  malformed: 'malformed',
  unjudged: 'not checked',
  values: 'values',
  placed: 'placed',
  dstGap: 'dst gap',
  unreadable: 'unreadable',
  // 0.70.0 — agentfootprint 9.132.0's rows and the period row's result checks.
  answered: 'settled by the person',
  derived: 'derived from reading',
  sourceClock: 'source clock',
  differs: 'differs from asked',
  against: 'against',
  read: 'read',
  step: 'step',
  shifted: 'shifted',
  beyondRetention: 'beyond retention',
  // 0.70.0 — the answer's time standing (`<TimeView>`): the record's own
  // standing word beside these, and one plain line per time reason the
  // library filed, keyed by the reason's own name.
  standing: 'answer standing',
  timeReasons: 'time reasons',
  'period-differs-from-asked': 'read differs from the window asked',
  'period-beyond-retention': 'window older than the source keeps',
  'period-not-held': 'source holds none of the period',
  'period-partly-held': 'source holds part of the period',
  'period-unknown': 'held period unknown to the source',
  'period-undeclared': 'result declared no period',
  'derived-from-reading': "time value spelled from the person's words",
  'argument-assumed': 'period filled from an assumed default',
  // 0.71.0 — each call's window asked → sent → read: the sent range when the
  // row's `asked` IS it (an exact fill, a bound or model window), and a fill
  // whose bounds moved outward, whose sent range the record does not keep.
  sentAsAsked: 'as asked',
  sentRounded: 'asked, rounded outward',
});
