/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { readStanding } from './readStanding.js';
import { readTurnEvents } from './readTurnEvents.js';

function standingAt(fixture: string, through: number) {
  const url = new URL(`./__fixtures__/${fixture}.json.gz`, import.meta.url);
  const { recording } = JSON.parse(gunzipSync(readFileSync(url)).toString('utf8'));
  const selected = readTurnEvents(recording, 1, through, 100);
  if (selected.status !== 'ready') throw new Error(selected.status);
  return readStanding(selected.events);
}

it('reads only the standing and checks recorded by the selected moment', () => {
  expect(standingAt('switch-coverage', 34)).toEqual({ status: 'not-yet-recorded' });
  expect(standingAt('switch-coverage', 35)).toMatchObject({
    status: 'recorded',
    standing: 'not-sure',
    sentence: 'A tool recorded a gap in what it checked.',
    address: { eventIndex: 35 },
    checks: [
      { label: 'Tool coverage', ran: 1, of: 1 },
      { label: 'Result shape', ran: 1, of: 1 },
    ],
  });
  expect(standingAt('schema-retry', 37)).toMatchObject({
    status: 'recorded',
    standing: 'not-assessed',
    checks: [],
  });
});

it('keeps an older completed turn distinct from a turn before its assessment', () => {
  expect(readStanding([])).toEqual({ status: 'not-yet-recorded' });
  expect(readStanding([{
    type: 'agentfootprint.agent.turn_end',
    payload: { finalContent: 'A recorded response' },
    address: { eventIndex: 10 },
  }])).toEqual({ status: 'not-collected' });
});

it('reports unreadable assessment data without running its getter', () => {
  let calls = 0;
  const checks = [{ check: 'tool-coverage', ran: 1, of: 1 }];
  Object.defineProperty(checks[0]!, 'ran', { get() { calls++; return 1; } });
  expect(readStanding([{
    type: 'agentfootprint.answer.assessed',
    payload: { standing: 'known', reasons: [], checked: checks },
    address: { eventIndex: 7 },
  }])).toEqual({ status: 'unreadable' });
  expect(calls).toBe(0);
});
