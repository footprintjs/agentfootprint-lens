/** @vitest-environment jsdom */
/**
 * The answer's time standing when the answer is NOT SURE FOR OTHER REASONS.
 *
 * The field case (take-2 video, lens 0.71.0 on agentfootprint 9.134.3): the
 * answer's standing was "not sure" because a value in it survived the
 * evidence check — not for a time reason — and In plain words said "Not
 * sure"; the Time tab drew the band and NO standing section, because
 * `timeStandingOf` returned `undefined` whenever no time reason held and the
 * view omitted the section. Silence beside an answer the person was told is
 * not sure reads as "nothing about time to see here" — and says nothing about
 * where the standing came from.
 *
 * Now the standing is always said when an assessment is handed in: its time
 * reasons when it names some; else "no time-related reason", the standing as
 * filed, and whether other reasons set it (counted, never listed — In plain
 * words shows them).
 *
 * The assessment here is REAL: a `.time()` agent on a scripted provider (no
 * model called) answers with a value no tool returned, and the library folds
 * the standing (`agent.assessment()`), as the app hands it to the view.
 *
 * Test types:
 *   functional  — a real "not sure for other reasons" assessment: no time reason, the standing
 *                 as filed, the other reasons counted; the view draws the line, not silence;
 *   unit        — a standing with NO reason filed says so; an `argument-assumed` the lens
 *                 cannot place (the data projection's bare name) is listed undetermined and
 *                 "no time-related reason" is never said beside it;
 *   negative    — no assessment: `undefined`, nothing drawn for it.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Agent, defineTool } from 'agentfootprint';

import { LABELS } from '../../src/core/time/labels.js';
import { timeStandingOf } from '../../src/core/time/timeStanding.js';
import { TimeView } from '../../src/react/components/TimeView.js';

afterEach(cleanup);

const NOW = '2026-10-01T14:08:49Z';

/** A real run: armed `.time()`, the evidence check on, an answer naming a host no tool returned. */
async function notSureForOtherReasons() {
  let i = 0;
  const replies = [
    { content: '', toolCalls: [{ id: 'c1', name: 'host_list', args: {} }] },
    { content: 'The slow host is esx-node-9931.' },
  ];
  const agent = Agent.create({
    provider: {
      name: 'other-reasons-mock',
      complete: async () => {
        const r = replies[Math.min(i, replies.length - 1)]!;
        i += 1;
        return { content: r.content, toolCalls: r.toolCalls ?? [], usage: { input: 0, output: 0 } };
      },
    } as never,
    model: 'mock',
    maxIterations: 6,
  })
    .tool(
      defineTool({
        name: 'host_list',
        description: 'Hosts in the cluster.',
        inputSchema: { type: 'object', properties: {} },
        execute: () => '[{"host":"esx-node-0101"}]',
      }),
    )
    .namesAndNumbersFromEvidence({ posture: 'assist' })
    .time({ zone: 'America/Los_Angeles' })
    .build();
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    await agent.run({ message: 'which host is slow?', time: { now: NOW } } as never);
  } finally {
    console.warn = warn;
  }
  return {
    assessment: JSON.parse(JSON.stringify(await agent.assessment())) as {
      standing: string;
      reasons: { reason: string }[];
    },
    rows: (agent.findings() ?? []) as readonly unknown[],
  };
}

describe('the answer is not sure for other reasons — the Time view says so', () => {
  it('the fold: no time reason, the standing as filed, the other reasons counted', async () => {
    const run = await notSureForOtherReasons();
    // The record: not sure, and every reason is about something other than time.
    expect(run.assessment.standing).toBe('not-sure');
    expect(run.assessment.reasons.length).toBeGreaterThan(0);
    const t = timeStandingOf(run.assessment, run.rows);
    expect(t).toEqual({
      standing: 'not-sure',
      reasons: [],
      otherReasons: run.assessment.reasons.length,
    });
  });

  it('the view draws the standing and "no time-related reason · other reasons", never silence', async () => {
    const run = await notSureForOtherReasons();
    render(<TimeView rows={run.rows} assessment={run.assessment} />);
    const standing = screen.getByTestId('time-standing');
    expect(standing).toHaveAttribute('data-standing', 'not-sure');
    expect(standing).toHaveTextContent(LABELS.standing);
    expect(standing).toHaveTextContent('not-sure');
    const line = within(standing).getByTestId('time-no-reason');
    expect(line).toHaveTextContent(LABELS.noTimeReason);
    expect(line).toHaveTextContent(LABELS.otherReasons);
    expect(within(standing).queryAllByTestId('time-reason')).toEqual([]);
    // The band the record holds is still drawn beside it.
    expect(screen.getByTestId('time-band')).toBeInTheDocument();
  });
});

describe('the standing with nothing to list', () => {
  it('a standing with NO reason filed says so — not "other reasons"', () => {
    expect(timeStandingOf({ standing: 'consistent', reasons: [] })).toEqual({
      standing: 'consistent',
      reasons: [],
      otherReasons: 0,
    });
    render(<TimeView assessment={{ standing: 'consistent', reasons: [] }} />);
    const line = screen.getByTestId('time-no-reason');
    expect(line).toHaveTextContent(`${LABELS.noTimeReason} · ${LABELS.noReasonFiled}`);
    expect(line).not.toHaveTextContent(LABELS.otherReasons);
  });

  it('an argument-assumed the lens cannot place is undetermined — "no time-related reason" is never said beside it', () => {
    const data = { standing: 'not-sure', reasons: ['argument-assumed', 'value-unsupported'] };
    const t = timeStandingOf({ answerAssessment: data })!;
    expect(t).toEqual({
      standing: 'not-sure',
      reasons: [],
      otherReasons: 1,
      undetermined: ['argument-assumed'],
    });
    render(<TimeView assessment={{ answerAssessment: data }} />);
    expect(screen.queryByTestId('time-no-reason')).toBeNull();
    const item = screen.getByTestId('time-reason-undetermined');
    expect(item).toHaveAttribute('data-reason', 'argument-assumed');
    expect(item).toHaveTextContent(LABELS.undetermined);
    // Its period label would claim what the lens cannot tell.
    expect(item).not.toHaveTextContent(LABELS['argument-assumed']);
  });

  it('NEGATIVE: no assessment — nothing to say, nothing drawn for it', () => {
    expect(timeStandingOf(undefined)).toBeUndefined();
    expect(timeStandingOf({ standing: 'not-sure' })).toBeUndefined();
    expect(render(<TimeView />).container).toBeEmptyDOMElement();
  });
});
