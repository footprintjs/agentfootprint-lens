/**
 * <TimeBand> — the time layer's rows at the cursor (agentfootprint 9.129.0,
 * time design § 10.6): per turn, the run clock and any clock-on-resume, each
 * reading of the person's words, and per call its window, its dispatch
 * moment and its period verdict.
 *
 * WHY. An armed agent (`.time()`) records every time decision it makes — the
 * clock it froze, what it read from the person's words, which window each
 * call carries and how (filled, bound, the model's own, refused), whether a
 * fill reads MORE than was asked, how far the wall clock had moved at
 * dispatch — as rows on the honesty ledger. Nothing else in the lens reads
 * them; without this band a widened read and a period the result did not
 * hold are invisible.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. OMIT, NEVER DENY. No time or period row at the stop → no band; a row
 *      prints no field it does not carry. An unarmed run has no band, never
 *      an empty one.
 *   2. NEVER INFER. `wider than asked` renders only on a row carrying
 *      `sent` + `differs`; a drift only on a `call` row carrying `drift`;
 *      `clock unknown` only where the record says `unknown` (a tz database,
 *      a held range). Nothing here compares two instants.
 *   3. NO SENTENCE OF ITS OWN. Every printed string is a value off the record
 *      (an instant, a zone, a tool name, the record's word for `how`, `by`,
 *      `outcome`, `verdict`, a refusal code) or a `LABELS` entry;
 *      `test/served/no-own-claims.test.ts` walks this file.
 *   4. A SHAPE THE LENS DOES NOT OWN. `foldTimeRows` narrows every row and
 *      passes over one that does not fit.
 *   5. PROPS ONLY. `rows` (the ledger at the stop) and `coverage` (the
 *      state's `coverageDeclared` at the same stop, for each call's declared
 *      period) — handed in by `<ContextView>`, never fetched, never folded a
 *      second time.
 */
import React, { useMemo } from 'react';

import { LABELS } from '../../core/time/labels.js';
import type {
  CallWindowRowShape as CallWindowRow,
  TimeRangeShape as TimeRange,
  TimeReadingRowShape as TimeReadingRow,
} from '../../core/time/shapes.js';
import {
  foldTimeRows,
  spellMs,
  type TimeCall,
  type TimeTurn,
} from '../../core/time/timeRows.js';

export { LABELS };

export interface TimeBandProps {
  /** The ledger as the fold holds it at the stop (`findingsLedger`). */
  readonly rows: readonly unknown[];
  /** The state's `coverageDeclared` at the same stop — each call's declared `period`. */
  readonly coverage?: readonly unknown[];
}

export function TimeBand(props: TimeBandProps): React.ReactElement | null {
  const { rows, coverage } = props;
  const fold = useMemo(() => foldTimeRows(rows, coverage), [rows, coverage]);
  if (fold === undefined) return null;
  return (
    <div style={band} data-testid="time-band" data-rows={fold.rows}>
      <span style={dim}>
        {LABELS.band} · {fold.rows} {LABELS.rows}
      </span>
      {fold.turns.map((t) => (
        <Turn key={t.turn} turn={t} />
      ))}
    </div>
  );
}

function Turn({ turn }: { readonly turn: TimeTurn }): React.ReactElement {
  return (
    <div data-testid="time-turn" data-turn={turn.turn}>
      <span style={dim}>
        {LABELS.turn} {turn.turn}
      </span>
      <ul style={list}>
        {turn.clock !== undefined && (
          <li style={mono} data-testid="time-clock">
            <Field label={LABELS.clock} />
            <Field label={LABELS.now}>
              <code>{turn.clock.now}</code> <Word>{turn.clock.nowSource}</Word>
            </Field>
            <Field label={LABELS.zone}>
              <code>{turn.clock.zone}</code> <Word>{turn.clock.zoneSource}</Word>
            </Field>
            {turn.clock.window !== undefined && (
              <Field label={LABELS.window}>
                <Range range={turn.clock.window} /> <Word>{turn.clock.window.source}</Word>
              </Field>
            )}
          </li>
        )}
        {turn.resumes.map((r, i) => (
          <li key={`r${i}`} style={mono} data-testid="time-clock-on-resume">
            <Field label={LABELS.clockOnResume} />
            <Field label={LABELS.passed}>
              <ClockValues values={r.passed} />
            </Field>
            <Field label={LABELS.kept}>
              <ClockValues values={r.kept} />
            </Field>
          </li>
        ))}
        {turn.readings.map((r, i) => (
          <Reading key={`m${i}`} reading={r} />
        ))}
        {turn.calls.map((c) => (
          <Call key={c.toolCallId} call={c} />
        ))}
      </ul>
    </div>
  );
}

/** A passed or kept clock: only the keys it carries. */
function ClockValues({
  values,
}: {
  readonly values: { readonly now?: unknown; readonly zone?: unknown; readonly window?: unknown };
}): React.ReactElement {
  const window = values.window as TimeRange | undefined;
  return (
    <>
      {typeof values.now === 'string' && (
        <>
          {LABELS.now} <code>{values.now}</code>{' '}
        </>
      )}
      {typeof values.zone === 'string' && (
        <>
          {LABELS.zone} <code>{values.zone}</code>{' '}
        </>
      )}
      {window !== undefined && (
        <>
          {LABELS.window} <Range range={window} />
        </>
      )}
    </>
  );
}

function Reading({ reading }: { readonly reading: TimeReadingRow }): React.ReactElement {
  const { reader } = reading;
  const choice = reading.choice;
  return (
    <li
      style={mono}
      data-testid="time-reading"
      data-mention={reading.mention ?? ''}
      data-choice={choice?.by ?? ''}
    >
      <Field label={LABELS.readings}>
        {reading.mentions === 0 ? (
          <span data-testid="time-reading-none">{LABELS.noMentions}</span>
        ) : (
          <>
            {LABELS.mention} {reading.mention} / {reading.mentions}
          </>
        )}
      </Field>
      <Field label={LABELS.reader}>
        <code>
          {reader.id}@{reader.version}
        </code>{' '}
        <Word>{reader.kind}</Word> <Word>{reader.locale}</Word>
      </Field>
      <Field label={LABELS.tzdata}>
        <code>{reading.tzdata}</code>
        {reading.tzdata === 'unknown' && (
          <>
            {' '}
            <Flag testId="time-tzdata-unknown">{LABELS.clockUnknown}</Flag>
          </>
        )}
      </Field>
      {reading.quote !== undefined && (
        <Field label={LABELS.quote}>
          <q data-testid="time-reading-quote">{reading.quote}</q>
        </Field>
      )}
      {reading.refused !== undefined && (
        <Field label={LABELS.refused}>
          <Word>{reading.refused}</Word>
        </Field>
      )}
      {reading.problem !== undefined && (
        <Field label={LABELS.problem}>
          <Word>{reading.problem}</Word>
        </Field>
      )}
      {reading.candidates !== undefined && reading.candidates.length > 0 && (
        <Field label={LABELS.candidates}>
          <ol style={list} start={0}>
            {reading.candidates.map((c, i) => (
              <li key={i} data-testid="time-candidate">
                <Range range={c.range} /> <code>{c.zone}</code> · {LABELS.grain} <Word>{c.grain}</Word>
                {c.said.length > 0 && (
                  <>
                    {' · '}
                    {LABELS.said} <Words words={c.said} />
                  </>
                )}
                {c.implied.length > 0 && (
                  <>
                    {' · '}
                    {LABELS.implied} <Words words={c.implied} />
                  </>
                )}
                {c.notes.length > 0 && (
                  <>
                    {' · '}
                    {LABELS.notes} <Words words={c.notes.map((n) => n.kind)} />
                  </>
                )}
              </li>
            ))}
          </ol>
        </Field>
      )}
      {choice !== undefined && (
        <Field label={LABELS.choice}>
          <Word>{choice.by}</Word>
          {'candidate' in choice && <> #{choice.candidate}</>}
          {choice.by === 'open' && (
            <>
              {' · '}
              {LABELS.remaining} {choice.remaining.map((n) => `#${n}`).join(' ')}
              {' · '}
              {LABELS.open} <Words words={choice.open} />
            </>
          )}
          {choice.by === 'none' && (
            <>
              {' · '}
              <Word>{choice.why}</Word>
            </>
          )}
          {'policy' in choice && choice.policy !== undefined && (
            <>
              {' · '}
              {LABELS.policy} <code>{JSON.stringify(choice.policy)}</code>
            </>
          )}
        </Field>
      )}
    </li>
  );
}

function Call({ call }: { readonly call: TimeCall }): React.ReactElement {
  const w = call.window;
  return (
    <li
      style={mono}
      data-testid="time-call"
      data-tool-call-id={call.toolCallId}
      data-how={w?.how ?? ''}
    >
      <div>
        <code>{call.toolName}</code> · <code>{call.toolCallId}</code>
      </div>
      {w !== undefined && <WindowLines w={w} />}
      {call.dispatch !== undefined && (
        <Field label={LABELS.dispatchedAt}>
          <code data-testid="time-dispatched-at">{call.dispatch.dispatchedAt}</code>
        </Field>
      )}
      {call.dispatch?.drift !== undefined && (
        <Field label={LABELS.drift}>
          <span
            data-testid="time-drift"
            data-outcome={call.dispatch.drift.outcome}
            data-by-ms={call.dispatch.drift.byMs}
          >
            <code>{spellMs(call.dispatch.drift.byMs)}</code> <Word>{call.dispatch.drift.outcome}</Word>
            {call.dispatch.drift.outcome === 'redrawn' && (
              <>
                {' · '}
                {LABELS.form} {call.dispatch.drift.form}
              </>
            )}
          </span>
        </Field>
      )}
      {call.period !== undefined && (
        <Field label={LABELS.period}>
          <span data-testid="time-period" data-verdict={call.period.verdict}>
            {LABELS.verdict} <Word>{call.period.verdict}</Word>
            {call.period.argument !== undefined && (
              <>
                {' · '}
                {LABELS.argument} <code>{call.period.argument}</code>
              </>
            )}
          </span>
        </Field>
      )}
      {call.declared !== undefined && (
        <Field label={LABELS.queried}>
          <Range range={call.declared.queried} />
          {' · '}
          {LABELS.held}{' '}
          {call.declared.held === 'unknown' ? (
            <>
              <Word>unknown</Word> <Flag testId="time-held-unknown">{LABELS.clockUnknown}</Flag>
            </>
          ) : (
            <Range range={call.declared.held} />
          )}
          {call.declared.readAt !== undefined && (
            <>
              {' · '}
              {LABELS.readAt} <code>{call.declared.readAt}</code>
            </>
          )}
        </Field>
      )}
    </li>
  );
}

/** The `call-window` row: how the call's window was decided, and each field it carries. */
function WindowLines({ w }: { readonly w: CallWindowRow }): React.ReactElement {
  return (
    <>
      <Field label={LABELS.how}>
        <Word>{w.how}</Word>
        {w.form !== undefined && (
          <>
            {' · '}
            {LABELS.form} {w.form}
          </>
        )}
        {w.by !== undefined && (
          <>
            {' · '}
            {LABELS.by} <Word>{w.by}</Word>
          </>
        )}
        {w.rounded === true && (
          <>
            {' · '}
            <Word>{LABELS.rounded}</Word>
          </>
        )}
        {w.why !== undefined && (
          <>
            {' · '}
            {LABELS.why} <Word>{w.why}</Word>
          </>
        )}
      </Field>
      {w.asked !== undefined && (
        <Field label={LABELS.asked}>
          <Range range={w.asked} />
        </Field>
      )}
      {w.person !== undefined && (
        <Field label={LABELS.person}>
          <Range range={w.person} /> <Word>{w.person.source}</Word>
          {w.person.mention !== undefined && (
            <>
              {' · '}
              {LABELS.mention} {w.person.mention}
            </>
          )}
        </Field>
      )}
      {w.sent !== undefined && (
        <Field label={LABELS.sent}>
          <Range range={w.sent} />
          {w.differs !== undefined && (
            <>
              {' '}
              <Flag testId="time-widened">{LABELS.widened}</Flag>
              {' · '}
              {LABELS.extra}{' '}
              {w.differs.extra.map((r, i) => (
                <React.Fragment key={i}>
                  {i > 0 && ' '}
                  <Range range={r} />
                </React.Fragment>
              ))}
            </>
          )}
          {w.trimmedByTool === true && (
            <>
              {' '}
              <Flag testId="time-trimmed">{LABELS.trimmedByTool}</Flag>
            </>
          )}
        </Field>
      )}
      {w.partlyBeyondRetention === true && (
        <Field label={LABELS.partlyBeyondRetention} />
      )}
      {w.refused !== undefined && (
        <Field label={LABELS.refused}>
          <span data-testid="time-refused" data-code={w.refused}>
            <Word>{w.refused}</Word>
            {w.argument !== undefined && (
              <>
                {' · '}
                {LABELS.argument} <code>{w.argument}</code>
              </>
            )}
          </span>
        </Field>
      )}
    </>
  );
}

// ─── Small parts ──────────────────────────────────────────────────────────

/** A half-open range as the record holds it: `[from, to)`. */
export function Range({ range }: { readonly range: TimeRange }): React.ReactElement {
  return (
    <code data-testid="time-range">
      [{range.from}, {range.to})
    </code>
  );
}

/** A field: its label, then its value (none for a flag-like field). */
export function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <span style={dim}>{label}</span>
      {children !== undefined && (
        <>
          {' · '}
          {children}
        </>
      )}
    </div>
  );
}

/** A word off the record, printed as the record spells it. */
export function Word({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return <code style={word}>{children}</code>;
}

function Words({ words }: { readonly words: readonly string[] }): React.ReactElement {
  return <code style={word}>{words.join(' ')}</code>;
}

/** A label the reader must not miss — a widened read, an unknown clock. */
export function Flag({
  children,
  testId,
}: {
  readonly children: React.ReactNode;
  readonly testId: string;
}): React.ReactElement {
  return (
    <strong style={flag} data-testid={testId}>
      {children}
    </strong>
  );
}

// One-word CSS literals only: the own-claims walker reads every string.
export const band: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  paddingTop: 6,
  borderTop: '1px solid',
  borderTopColor: 'currentColor',
};
export const dim: React.CSSProperties = { opacity: 0.7 };
export const mono: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  wordBreak: 'break-word',
};
export const list: React.CSSProperties = { margin: '2px 0 0', paddingLeft: 18 };
const word: React.CSSProperties = { fontStyle: 'italic' };
const flag: React.CSSProperties = { fontWeight: 600, textDecoration: 'underline' };
