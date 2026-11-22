/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { readTurnEvents } from './readTurnEvents.js';

const turnStart = 'agentfootprint.agent.turn_start';
const turnEnd = 'agentfootprint.agent.turn_end';
const assessed = 'agentfootprint.answer.assessed';

function event(type: string, runId: string, payload: object) {
  return { type, payload, meta: { runId, runtimeStageId: 'reused#3', wallClockMs: 42 } };
}

it('keeps event ordinals when call identifiers, times, and stage addresses repeat', () => {
  const file = new URL('./__fixtures__/switch-coverage.json.gz', import.meta.url);
  const { recording } = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
  const result = readTurnEvents(recording, 1, 14, 100);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') return;
  expect(result.events.slice(-2).map(row => row.address.eventIndex)).toEqual([13, 14]);
  expect(result.events.some(row => row.type === assessed)).toBe(false);
  const final = readTurnEvents(recording, 1, undefined, 100);
  expect(final.status === 'ready' && final.events[final.events.length - 1]?.type).toBe(turnEnd);
});

it('isolates a selected invocation from a child and a later recorded turn', () => {
  const events = [
    event(turnStart, 'owner', { turnIndex: 0 }),
    event(turnStart, 'child', { turnIndex: 0 }),
    event(assessed, 'child', { standing: 'not-sure' }),
    event(turnEnd, 'child', { turnIndex: 0 }),
    event(assessed, 'owner', { standing: 'consistent' }),
    event(turnEnd, 'owner', { turnIndex: 0 }),
    event(turnStart, 'owner', { turnIndex: 1 }),
    event(assessed, 'owner', { standing: 'known' }),
  ];
  const selected = readTurnEvents({ events }, 0, undefined, 20);
  expect(selected.status).toBe('ready');
  if (selected.status !== 'ready') return;
  expect(selected.events.map(row => row.address.eventIndex)).toEqual([0, 4, 5]);
  expect(readTurnEvents({ events }, 6, 5, 20)).toEqual({ status: 'before-turn' });
  expect(readTurnEvents({ events }, 0, 8, 20)).toEqual({ status: 'unreadable' });
});

it('refuses oversized or unreadable inputs without running property getters', () => {
  let getterCalls = 0;
  const events = [event(turnStart, 'owner', { turnIndex: 0 }), event(assessed, 'owner', {})];
  Object.defineProperty(events, '1', {
    get() {
      getterCalls++;
      return undefined;
    },
  });
  expect(readTurnEvents({ events }, 0, 1, 1)).toEqual({ status: 'too-long' });
  expect(readTurnEvents({ events }, 0, 1, 2)).toEqual({ status: 'unreadable' });
  expect(readTurnEvents({ events: null }, 0, undefined, 2)).toEqual({ status: 'not-collected' });
  expect(getterCalls).toBe(0);
});
