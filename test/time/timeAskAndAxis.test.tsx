/** @vitest-environment jsdom */
/**
 * <TimeAskRows> over a REAL time ask and its re-ask, <TimeAxisLine> over a
 * REAL minted dataset ticket (both from test/time/fixtures/time-rows.json,
 * generated from agentfootprint 9.129.0), and both where the lens mounts
 * them: `<AwaitingPane>` and the `dataset/rows` renderer.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { describeTimeAxis, normaliseInstants } from 'agentfootprint';

import { datasetTimeAxisOf } from '../../src/core/time/timeAxis.js';
import { timeAskOf } from '../../src/core/time/timeAsk.js';
import { LABELS } from '../../src/core/time/labels.js';
import { TimeAskRows } from '../../src/react/components/TimeAsk.js';
import { TimeAxisLine } from '../../src/react/components/TimeAxisLine.js';
import { AwaitingPane } from '../../src/react/hitl/AwaitingPane.js';
import { ArtifactRowsTable } from '../../src/react/artifacts/ArtifactRowsTable.js';
import type { ArtifactMetaView } from '../../src/core/artifacts/types.js';
import fixtures from './fixtures/time-rows.json';

afterEach(cleanup);

type Awaiting = {
  requestId: string;
  question: string;
  refused?: { answer: Record<string, string>; reason: string };
  repeat?: { count: number };
};
const ASK = fixtures.ask as unknown as { first: Awaiting; reasked: Awaiting };
const AXIS = fixtures.axis as unknown as { meta: ArtifactMetaView; rows: Record<string, unknown>[] };

describe('the time ask', () => {
  it('the first ask: the time field, its format, still missing — and no refusal', () => {
    render(<TimeAskRows ask={ASK.first} />);
    const field = screen.getByTestId('time-ask-field');
    expect(field).toHaveAttribute('data-format', 'time-range');
    expect(within(field).getByTestId('time-ask-missing')).toHaveTextContent(LABELS.missing);
    expect(screen.queryByTestId('time-ask-refused')).toBeNull();
    expect(screen.queryByTestId('time-ask-repeat')).toBeNull();
  });

  it('the re-ask: the refused value, the library’s reason verbatim, the repeat count', () => {
    const { refused, repeat } = ASK.reasked;
    expect(refused).toBeDefined();
    render(<TimeAskRows ask={ASK.reasked} />);
    expect(screen.getByTestId('time-ask-reason').textContent).toBe(refused!.reason);
    expect(screen.getByTestId('time-ask-refused')).toHaveTextContent(refused!.answer.window!);
    expect(screen.getByTestId('time-ask-repeat')).toHaveTextContent(String(repeat!.count));
  });

  it('reads the pause in each home it travels: the ask, `{ awaitingInput }`, `{ pauseData }`', () => {
    const direct = timeAskOf(ASK.reasked);
    expect(timeAskOf({ awaitingInput: ASK.reasked })).toEqual(direct);
    expect(timeAskOf({ pauseData: { awaitingInput: ASK.reasked } })).toEqual(direct);
    expect(direct?.repeat).toBe(ASK.reasked.repeat!.count);
  });

  it('an ask with no time field draws nothing (omit, never deny)', () => {
    const plain = { ...ASK.first, fields: [{ id: 'host', type: 'string' }] };
    expect(timeAskOf(plain)).toBeUndefined();
    const { container } = render(<TimeAskRows ask={plain} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('<AwaitingPane> shows the time half under the question', () => {
    render(
      <AwaitingPane
        awaiting={{ question: ASK.reasked.question, pauseData: { awaitingInput: ASK.reasked } }}
        onDecision={() => {}}
      />,
    );
    expect(screen.getByTestId('hitl-question')).toHaveTextContent(ASK.reasked.question);
    expect(screen.getByTestId('time-ask-reason').textContent).toBe(ASK.reasked.refused!.reason);
  });
});

describe('the dataset time axis', () => {
  it('a declared axis: its fields, the library’s summary, and the library’s count of values', () => {
    const view = datasetTimeAxisOf(AXIS.meta, AXIS.rows);
    expect(view.status).toBe('declared');
    render(<TimeAxisLine meta={AXIS.meta} rows={AXIS.rows} />);
    const el = screen.getByTestId('time-axis');
    expect(el).toHaveAttribute('data-status', 'declared');
    expect(el).toHaveTextContent('hour');
    expect(el).toHaveTextContent('1h');
    const axis = (AXIS.meta as { timeAxis: Parameters<typeof describeTimeAxis>[0] }).timeAxis;
    expect(screen.getByTestId('time-axis-summary').textContent).toBe(describeTimeAxis(axis));
    const oracle = normaliseInstants(AXIS.rows, axis);
    expect(oracle.status).toBe('naive-values');
    expect(screen.getByTestId('time-axis-values')).toHaveAttribute('data-status', oracle.status);
    expect(screen.getByTestId('time-axis-clock-unknown')).toHaveTextContent(LABELS.clockUnknown);
    expect(el).toHaveTextContent(`${LABELS.placed} ${oracle.status === 'refused' ? 0 : oracle.points.length}`);
  });

  it('without the rows, the declaration alone — no value counts', () => {
    render(<TimeAxisLine meta={AXIS.meta} />);
    expect(screen.getByTestId('time-axis')).toHaveAttribute('data-status', 'declared');
    expect(screen.queryByTestId('time-axis-values')).toBeNull();
  });

  it('a ticket with no axis draws nothing; a malformed one prints the library’s issues', () => {
    const { timeAxis: _drop, ...bare } = AXIS.meta as ArtifactMetaView & { timeAxis?: unknown };
    void _drop;
    const { container } = render(<TimeAxisLine meta={bare} />);
    expect(container).toBeEmptyDOMElement();
    cleanup();
    // A ticket minted outside the library's put (a foreign writer): an abbreviation for a zone.
    const foreign = { ...AXIS.meta, timeAxis: { column: 'hour', unit: 'iso', zone: 'PST' } };
    const view = datasetTimeAxisOf(foreign);
    expect(view.status).toBe('malformed');
    render(<TimeAxisLine meta={foreign} />);
    expect(screen.getByTestId('time-axis-malformed')).toHaveTextContent(LABELS.malformed);
    const issues = screen.getAllByTestId('time-axis-issue').map((li) => li.textContent);
    expect(issues).toEqual(view.status === 'malformed' ? [...view.issues] : []);
  });

  it('the dataset renderer mounts the line above the table', () => {
    render(<ArtifactRowsTable meta={AXIS.meta} data={AXIS.rows} />);
    const table = screen.getByTestId('artifact-rows-table');
    expect(within(table).getByTestId('time-axis')).toHaveAttribute('data-status', 'declared');
  });
});
