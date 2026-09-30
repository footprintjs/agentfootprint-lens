/**
 * <TimeAxisLine> — a dataset's declared time axis, as the library judges it
 * (agentfootprint ≥ 9.128.0 `ArtifactMeta.timeAxis`, time design § 8):
 * column, unit, zone, interval, aggregate, the library's own summary words,
 * and — when the rows are in hand — how many values the library's view
 * placed as instants and how many have a clock nobody declared.
 *
 * THE LAWS THIS FILE KEEPS: props only (`meta` the claim ticket, `rows` the
 * payload when the caller holds it); omit, never deny (no `timeAxis` on the
 * ticket → nothing renders; a zero count is not printed); a malformed
 * declaration prints the library's own issues, never "no axis"; a value
 * whose clock is unknown is labelled `clock unknown`, never shown as UTC;
 * under a peer too old to judge, the declaration is printed as held and
 * labelled `not checked`. No sentence of its own
 * (`test/served/no-own-claims.test.ts` walks this file).
 */
import React, { useMemo } from 'react';

import { LABELS } from '../../core/time/labels.js';
import { datasetTimeAxisOf } from '../../core/time/timeAxis.js';
import { dim, Field, Flag, mono, Word } from './TimeBand.js';

export interface TimeAxisLineProps {
  /** The claim ticket (`ArtifactMetaView`, or anything carrying `timeAxis`). */
  readonly meta: unknown;
  /** The dataset's rows, when the caller holds them. */
  readonly rows?: readonly unknown[];
}

export function TimeAxisLine({ meta, rows }: TimeAxisLineProps): React.ReactElement | null {
  const view = useMemo(() => datasetTimeAxisOf(meta, rows), [meta, rows]);
  if (view.status === 'absent') return null;
  if (view.status === 'malformed') {
    return (
      <div style={mono} data-testid="time-axis" data-status="malformed">
        <Field label={LABELS.axis}>
          <Flag testId="time-axis-malformed">{LABELS.malformed}</Flag>
        </Field>
        <ul style={issues}>
          {view.issues.map((issue, i) => (
            <li key={i} data-testid="time-axis-issue">
              {issue}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (view.status === 'unjudged') {
    return (
      <div style={mono} data-testid="time-axis" data-status="unjudged">
        <Field label={LABELS.axis}>
          <code>{JSON.stringify(view.raw)}</code> <Flag testId="time-axis-unjudged">{LABELS.unjudged}</Flag>
        </Field>
      </div>
    );
  }
  const { axis, summary, values } = view;
  const aggregate =
    axis.aggregate === undefined
      ? undefined
      : typeof axis.aggregate === 'string'
        ? axis.aggregate
        : JSON.stringify(axis.aggregate);
  return (
    <div style={mono} data-testid="time-axis" data-status="declared">
      <Field label={LABELS.axis}>
        {LABELS.column} <code>{axis.column}</code> · {LABELS.unit} <Word>{axis.unit}</Word>
        {axis.zone !== undefined && (
          <>
            {' · '}
            {LABELS.zone} <code>{axis.zone}</code>
          </>
        )}
        {axis.interval !== undefined && (
          <>
            {' · '}
            {LABELS.interval} <code>{axis.interval}</code>
          </>
        )}
        {aggregate !== undefined && (
          <>
            {' · '}
            {LABELS.aggregate} <code>{aggregate}</code>
          </>
        )}
      </Field>
      {summary !== undefined && (
        <Field label={LABELS.summary}>
          <span data-testid="time-axis-summary">{summary}</span>
        </Field>
      )}
      {values !== undefined && (
        <Field label={LABELS.values}>
          <span data-testid="time-axis-values" data-status={values.status}>
            <Word>{values.status}</Word>
            {' · '}
            {LABELS.placed} {values.placed}
            {values.clockUnknown > 0 && (
              <>
                {' · '}
                <Flag testId="time-axis-clock-unknown">{LABELS.clockUnknown}</Flag> {values.clockUnknown}
              </>
            )}
            <Count label={LABELS.dstGap} n={values.counts.dstGap} />
            <Count label={LABELS.unreadable} n={values.counts.unreadable} />
            <Count label={LABELS.missing} n={values.counts.missing} />
          </span>
        </Field>
      )}
    </div>
  );
}

/** A count the library's view reported — printed only when non-zero. */
function Count({ label, n }: { readonly label: string; readonly n: number }): React.ReactElement | null {
  if (n === 0) return null;
  return (
    <>
      {' · '}
      <span style={dim}>{label}</span> {n}
    </>
  );
}

const issues: React.CSSProperties = { margin: '2px 0 0', paddingLeft: 18 };
