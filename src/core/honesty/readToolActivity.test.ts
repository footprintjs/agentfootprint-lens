/** @vitest-environment node */
import { expect, it } from 'vitest';
import { readToolActivity } from './readToolActivity.js';
import type { RecordedTurnEvent } from './readTurnEvents.js';

const start = 'agentfootprint.stream.tool_start';
const end = 'agentfootprint.stream.tool_end';
const decision = 'agentfootprint.middleware.decision';

function event(type: string, index: number, payload: object): RecordedTurnEvent {
  return { type, payload, address: { eventIndex: index, runtimeStageId: 'same#7' } };
}

it('does not infer execution from a request or an unentered error', () => {
  const rows = readToolActivity([
    event(start, 1, { toolName: 'lookup', toolCallId: 'a' }),
    event(start, 2, { toolName: 'write', toolCallId: 'b' }),
    event(end, 3, { toolCallId: 'b', entered: false, error: true }),
    event(start, 4, { toolName: 'send', toolCallId: 'c' }),
    event(end, 5, { toolCallId: 'c', notExecuted: true }),
  ]);
  expect(rows.map(row => row.execution)).toEqual(['not-recorded', 'not-recorded', 'not-run']);
  expect(rows[0]?.sentence).toBe('The tool was requested. The recording does not say whether it ran.');
  expect(rows[1]?.outcome).toBe('failed');
  expect(rows[2]?.outcome).toBe('refused');
});

it('uses occurrence keys when calls reuse the same provider ID and stage', () => {
  const rows = readToolActivity([
    event(start, 1, { toolName: 'first', toolCallId: 'a', callOccurrenceKey: [1, 2, 3, 4, 0] }),
    event(start, 2, { toolName: 'second', toolCallId: 'a', callOccurrenceKey: [1, 2, 3, 4, 1] }),
    event(end, 3, { toolCallId: 'a', callOccurrenceKey: [1, 2, 3, 4, 1], entered: true, error: true }),
    event(end, 4, { toolCallId: 'a', callOccurrenceKey: [1, 2, 3, 4, 0], entered: true }),
  ]);
  expect(rows.map(row => [row.name, row.end?.eventIndex, row.outcome])).toEqual([
    ['first', 4, 'returned'],
    ['second', 3, 'failed'],
  ]);
});

it('keeps a damaged occurrence key from matching a reused provider ID', () => {
  const rows = readToolActivity([
    event(start, 1, { toolName: 'lookup', toolCallId: 'a', callOccurrenceKey: [1, 2, 3, 4, 0] }),
    event(end, 2, { toolCallId: 'a', callOccurrenceKey: [1, 2], entered: true }),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows[0]?.execution).toBe('not-recorded');
  expect(rows[0]?.end).toBeUndefined();
  expect(rows[1]?.request).toBeUndefined();
});

it('projects identical bytes for different denied results and denial text', () => {
  function project(value: string) {
    const ignored = { toolCallId: 'a', entered: true };
    Object.defineProperty(ignored, 'result', { get() { throw new Error(value); } });
    return readToolActivity([
      event(start, 1, { toolName: 'lookup', toolCallId: 'a', args: { value } }),
      event(decision, 2, { at: 'tool', phase: 'output', outcome: 'deny', toolCallId: 'a', why: value }),
      event(end, 3, ignored),
    ]);
  }
  const known = project('first hidden text');
  expect(JSON.stringify(known)).toBe(JSON.stringify(project('different hidden text')));
  expect(known).toHaveLength(1);
  expect(known[0]).toMatchObject({
    outcome: 'kept-out',
    sentence: 'A result was kept out by a rule.',
    end: { eventIndex: 2 },
  });
  expect(known[0]?.name).toBeUndefined();
});
