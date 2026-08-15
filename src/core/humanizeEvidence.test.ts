/**
 * Tests — the evidence gate's commentary (`agentfootprint.agent.evidence_checked`,
 * agentfootprint 9.35.0), through `defaultHumanizer` end-to-end.
 *
 * Patterns:
 *   E1 grounded        — every value found; the answer stands
 *   E2 flagged         — shipped anyway, with the values on the record
 *   E3 revision-asked  — the model was asked to answer again
 *   E4 refused         — the answer was withheld
 *   E5 afterRevision   — "the second look" note
 *   E6 truncated       — the verdict judged only part of the evidence
 *   E7 long lists      — three values, then "and N more"
 *   E8 unknown action  — honest raw fallback, nothing invented
 *
 * House law under test: plain words for a non-developer ("appears in no tool
 * result", never "unsupported candidate"), and render ONLY what the event
 * carries.
 */

import { describe, it, expect } from 'vitest';
import { defaultHumanizer } from './humanizer.js';
import type { AgentfootprintEvent } from 'agentfootprint/events';

function evt(payload: Record<string, unknown>): AgentfootprintEvent {
  return {
    type: 'agentfootprint.agent.evidence_checked',
    payload,
    meta: {
      wallClockMs: 1000,
      runOffsetMs: 0,
      runtimeStageId: 'test#0',
      subflowPath: [],
      compositionPath: [],
      runId: 'test',
    },
  } as unknown as AgentfootprintEvent;
}

describe('evidence — E1: grounded', () => {
  it('says every value was found', () => {
    expect(
      defaultHumanizer(
        evt({ iteration: 2, posture: 'guard', candidates: 3, unsupported: [], action: 'grounded', afterRevision: false }),
      ),
    ).toBe('All 3 values in the answer were found in what the tools returned — the answer stands.');
  });

  it('with no candidate count, says so without inventing a number', () => {
    expect(defaultHumanizer(evt({ action: 'grounded', unsupported: [] }))).toBe(
      'Everything the answer asserted was found in what the tools returned — the answer stands.',
    );
  });
});

describe('evidence — E2: flagged', () => {
  it('names what was not found and says the answer shipped anyway', () => {
    expect(
      defaultHumanizer(
        evt({
          iteration: 3,
          posture: 'assist',
          candidates: 4,
          unsupported: [{ value: '$4,200', shape: 'currency' }],
          action: 'flagged',
        }),
      ),
    ).toBe(
      '1 thing in the answer ("$4,200") appears in no tool result — the answer was sent anyway, with that on the record.',
    );
  });
});

describe('evidence — E3: revision-asked', () => {
  it('says the model was asked to answer again', () => {
    expect(
      defaultHumanizer(
        evt({
          action: 'revision-asked',
          candidates: 5,
          unsupported: [
            { value: '$4,200', shape: 'currency' },
            { value: '12 March', shape: 'date' },
          ],
        }),
      ),
    ).toBe(
      '2 things in the answer ("$4,200", "12 March") appear in no tool result — the model was asked to answer again.',
    );
  });
});

describe('evidence — E4: refused', () => {
  it('says the answer was withheld', () => {
    expect(
      defaultHumanizer(evt({ action: 'refused', posture: 'rails', unsupported: [{ value: '99%' }] })),
    ).toBe(
      '1 thing in the answer ("99%") appears in no tool result — the answer was withheld rather than sent.',
    );
  });
});

describe('evidence — E5: afterRevision', () => {
  it('adds the second-look note so a reader can tell a fixed answer from an unfixed one', () => {
    expect(
      defaultHumanizer(evt({ action: 'grounded', candidates: 1, unsupported: [], afterRevision: true })),
    ).toBe(
      'The one value in the answer was found in what the tools returned — the answer stands. ' +
        'This was the second look, after the model had already been asked to fix it.',
    );
  });
});

describe('evidence — E6: a truncated evidence index', () => {
  it('carries the caveat with the verdict rather than reporting it as certain', () => {
    expect(
      defaultHumanizer(
        evt({ action: 'flagged', unsupported: [{ value: 'LUN-42' }], evidenceTruncated: true }),
      ),
    ).toBe(
      '1 thing in the answer ("LUN-42") appears in no tool result — the answer was sent anyway, with that on the record.' +
        ' Not every tool result fitted into the check, so this verdict was made on part of the evidence.',
    );
  });
});

describe('evidence — E7: a long list', () => {
  it('shows three values and counts the rest', () => {
    expect(
      defaultHumanizer(
        evt({
          action: 'flagged',
          unsupported: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }, { value: 'e' }],
        }),
      ),
    ).toBe(
      '5 things in the answer ("a", "b", "c" and 2 more) appear in no tool result — the answer was sent anyway, with that on the record.',
    );
  });
});

describe('evidence — E8: an unknown action (a future era)', () => {
  it('renders honestly and raw', () => {
    expect(defaultHumanizer(evt({ action: 'quarantined' }))).toBe(
      'The answer was checked against the tool results — quarantined.',
    );
  });

  it('with no action at all, still says a check happened', () => {
    expect(defaultHumanizer(evt({ iteration: 1 }))).toBe(
      'The answer was checked against the tool results.',
    );
  });
});

describe('evidence — E9: nothing to check', () => {
  it('says the answer asserted nothing rather than "everything was found"', () => {
    expect(
      defaultHumanizer(evt({ action: 'grounded', candidates: 0, unsupported: [] })),
    ).toBe('The answer asserted nothing that needed checking — it stands.');
  });
});
