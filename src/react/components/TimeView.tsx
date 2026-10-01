/**
 * <TimeView> — one tab-ready Time view over what an app already holds
 * (agentfootprint 9.132.0): the answer's time standing, the paused time ask,
 * and the Time band — so an app mounts one component instead of composing
 * `<TimeBand>`, `<TimeAskRows>` and its own standing list.
 *
 * WHY. Every app that shows time had to hand-build the same tab: pick the
 * ledger and the declared coverage off the state, find the pause's time
 * fields, and decide what the answer's standing says about time. The last
 * one is where apps went wrong — a reason re-derived from the rows is a
 * second judge. This view lists only the reasons the library filed
 * (`timeStandingOf`), each with a `LABELS` line, beside the rows they rest on.
 *
 * THE LAWS THIS FILE KEEPS:
 *
 *   1. PROPS ONLY. `rows` (the findings ledger), `coverage`
 *      (`coverageDeclared`), `ask` (the pause value) and `assessment` (the
 *      library's `AnswerAssessment` or its data projection) — handed in,
 *      never fetched, never re-folded into a verdict.
 *   2. OMIT, NEVER DENY. Each section renders only when the record holds it;
 *      with no time row, no time ask and no time reason the view renders
 *      nothing.
 *   3. NEVER COMPUTE A REASON. The standing section lists only reasons the
 *      assessment names (`timeStandingOf` law 1).
 *   4. NO SENTENCE OF ITS OWN. Every string is a value off the record or a
 *      `LABELS` entry; `test/served/no-own-claims.test.ts` walks this file.
 */
import React, { useMemo } from 'react';

import { LABELS } from '../../core/time/labels.js';
import { timeAskOf } from '../../core/time/timeAsk.js';
import { foldTimeRows } from '../../core/time/timeRows.js';
import { timeStandingOf, type TimeStanding as TimeStandingValue } from '../../core/time/timeStanding.js';
import { TimeAskRows } from './TimeAsk.js';
import { band, dim, Field, list, mono, TimeBand, Word } from './TimeBand.js';

export interface TimeViewProps {
  /** The findings ledger (`findingsLedger`, `agent.findings()`) — the time rows and the period rows. */
  readonly rows?: readonly unknown[];
  /** The state's `coverageDeclared` — each call's declared `period`. */
  readonly coverage?: readonly unknown[];
  /** A pause: an `AwaitingInput`, a pause outcome / `pauseData`, or a `PendingAskView`. */
  readonly ask?: unknown;
  /**
   * The answer's standing as the library folded it: `await agent.assessment()`,
   * `assessAnswer(recording)`, or `turn_end.answerAssessment`.
   */
  readonly assessment?: unknown;
}

export function TimeView(props: TimeViewProps): React.ReactElement | null {
  const { rows, coverage, ask, assessment } = props;
  const ledger = useMemo(() => rows ?? [], [rows]);
  const hasBand = useMemo(() => foldTimeRows(ledger, coverage) !== undefined, [ledger, coverage]);
  const hasAsk = useMemo(() => ask !== undefined && timeAskOf(ask) !== undefined, [ask]);
  const standing = useMemo(() => timeStandingOf(assessment, ledger), [assessment, ledger]);
  if (!hasBand && !hasAsk && standing === undefined) return null;
  return (
    <div style={view} data-testid="time-view">
      {standing !== undefined && <TimeStandingRows standing={standing} />}
      {hasAsk && <TimeAskRows ask={ask} />}
      {hasBand && <TimeBand rows={ledger} {...(coverage !== undefined ? { coverage } : {})} />}
    </div>
  );
}

/** The time reasons the library filed on the answer, each with its plain line and the calls it names. */
export function TimeStandingRows({ standing }: { readonly standing: TimeStandingValue }): React.ReactElement {
  return (
    <div style={band} data-testid="time-standing" data-standing={standing.standing ?? ''}>
      <span style={dim}>{LABELS.timeReasons}</span>
      {standing.standing !== undefined && (
        <Field label={LABELS.standing}>
          <Word>{standing.standing}</Word>
        </Field>
      )}
      <ul style={list}>
        {standing.reasons.map((r, i) => (
          <li key={i} style={mono} data-testid="time-reason" data-reason={r.reason}>
            {LABELS[r.reason]} · <code>{r.reason}</code>
            {r.calls.map((c) => (
              <React.Fragment key={c.toolCallId}>
                {' · '}
                <code>{c.toolName}</code> <code>{c.toolCallId}</code>
              </React.Fragment>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

const view: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
