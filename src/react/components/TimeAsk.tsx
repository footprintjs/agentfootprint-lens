/**
 * <TimeAskRows> — the time half of a paused `requestInput` ask
 * (agentfootprint 9.129.0, time design § 6): each `format` field with its
 * choices and their library-rendered labels, and — when the person already
 * answered and the library refused it — the refused values, the catalog's
 * reason verbatim, and how many times the ask was answered.
 *
 * THE LAWS THIS FILE KEEPS: props only (`ask` is the pause as the wire or
 * the run served it — `timeAskOf` narrows it); omit, never deny (no `format`
 * field → nothing renders); no sentence of its own (the one sentence is the
 * library's `refused.reason`, printed as data in a `<q>`; everything else is
 * a value or a `LABELS` entry — `test/served/no-own-claims.test.ts` walks
 * this file).
 */
import React, { useMemo } from 'react';

import { LABELS } from '../../core/time/labels.js';
import { timeAskOf } from '../../core/time/timeAsk.js';
import { band, dim, Field, Flag, list, mono, Word } from './TimeBand.js';

export interface TimeAskRowsProps {
  /** The pause: an `AwaitingInput`, a pause outcome / `pauseData` (`{ awaitingInput }`), or a `PendingAskView`. */
  readonly ask: unknown;
}

const valueText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v));

export function TimeAskRows({ ask }: TimeAskRowsProps): React.ReactElement | null {
  const view = useMemo(() => timeAskOf(ask), [ask]);
  if (view === undefined) return null;
  return (
    <div style={band} data-testid="time-ask" data-request-id={view.requestId ?? ''}>
      <span style={dim}>{LABELS.ask}</span>
      {view.repeat !== undefined && (
        <Field label={LABELS.repeat}>
          <span data-testid="time-ask-repeat">{view.repeat}</span>
        </Field>
      )}
      {view.refused !== undefined && (
        <Field label={LABELS.refused}>
          <span data-testid="time-ask-refused">
            {view.refused.answer !== undefined &&
              Object.entries(view.refused.answer).map(([id, value]) => (
                <React.Fragment key={id}>
                  <code>{id}</code> = <code>{valueText(value)}</code>{' · '}
                </React.Fragment>
              ))}
            {LABELS.reason} <q data-testid="time-ask-reason">{view.refused.reason}</q>
          </span>
        </Field>
      )}
      <ul style={list}>
        {view.fields.map((f) => (
          <li key={f.id} style={mono} data-testid="time-ask-field" data-format={f.format}>
            <Field label={LABELS.field}>
              <code>{f.id}</code> · {LABELS.format} <Word>{f.format}</Word>
              {f.missing && (
                <>
                  {' '}
                  <Flag testId="time-ask-missing">{LABELS.missing}</Flag>
                </>
              )}
              {f.strict && (
                <>
                  {' · '}
                  <Word>{LABELS.strict}</Word>
                </>
              )}
            </Field>
            {f.choices.length > 0 && (
              <Field label={LABELS.choices}>
                <ol style={list} start={0}>
                  {f.choices.map((c, i) => (
                    <li key={i} data-testid="time-ask-choice">
                      {c.label !== undefined && (
                        <>
                          {c.label}
                          {' · '}
                        </>
                      )}
                      <code>{valueText(c.value)}</code>
                    </li>
                  ))}
                </ol>
              </Field>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
