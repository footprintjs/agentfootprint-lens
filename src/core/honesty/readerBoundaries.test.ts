/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { projectHonestyTurn } from './projectHonestyTurn.js';
import { readToolActivity } from './readToolActivity.js';
import type { RecordedTurnEvent } from './readTurnEvents.js';

const turnStart = 'agentfootprint.agent.turn_start';
const turnEnd = 'agentfootprint.agent.turn_end';
const callStart = 'agentfootprint.stream.tool_start';
const callEnd = 'agentfootprint.stream.tool_end';
const decision = 'agentfootprint.middleware.decision';

function toolEvent(type: string, eventIndex: number, payload: object): RecordedTurnEvent {
  return { type, payload, address: { eventIndex, runtimeStageId: 'call#7' } };
}

function event(type: string, payload: unknown, path: string[] = [], flags: object = {}) {
  return { type, payload, meta: { runId: 'same', subflowPath: path, ...flags } };
}

function savedSwitch() {
  const url = new URL('./__fixtures__/switch-coverage.json.gz', import.meta.url);
  return JSON.parse(gunzipSync(readFileSync(url)).toString('utf8')).recording;
}

it('keeps a mounted child and its owner separate inside one native run', () => {
  const recording = { events: [
    event(turnStart, { turnIndex: 0 }),
    event(turnStart, { turnIndex: 0 }, ['member#1'], { mountedTurn: true }),
    event(turnEnd, { turnIndex: 0, finalContent: 'Child answer.' }, ['member#1', 'final#2'], { mountedTurn: true }),
    event(turnEnd, { turnIndex: 0, finalContent: 'Root answer.' }, ['final#3'], { rootTurn: true }),
  ] };
  const read = (startEventIndex: number, throughEventIndex?: number) =>
    projectHonestyTurn(recording, { startEventIndex, throughEventIndex }).sentences.map(x => x.text);
  expect(read(0, 2)).toEqual([]);
  expect(read(0)).toEqual(['Root answer.']);
  expect(read(1)).toEqual(['Child answer.']);
});

it('never completes a keyed start using a keyless end with the same provider ID', () => {
  const rows = readToolActivity([
    toolEvent(callStart, 0, { toolCallId: 'shared', toolName: 'first', callOccurrenceKey: [1, 2, 3, 4, 0] }),
    toolEvent(callEnd, 1, { toolCallId: 'shared', toolName: 'other', entered: true, error: true }),
  ]);
  expect(rows.find(row => row.request?.eventIndex === 0)).toMatchObject({ execution: 'not-recorded' });
  expect(rows.find(row => row.request?.eventIndex === 0)?.end).toBeUndefined();
});

it('leaves a duplicate legacy end unjoined after a repeated start in the same stage', () => {
  const rows = readToolActivity([
    toolEvent(callStart, 0, { toolCallId: 'shared', toolName: 'first' }),
    toolEvent(callEnd, 1, { toolCallId: 'shared', entered: true }),
    toolEvent(callStart, 2, { toolCallId: 'shared', toolName: 'second' }),
    toolEvent(callEnd, 3, { toolCallId: 'shared', entered: true, error: true }),
  ]);
  expect(rows.find(row => row.request?.eventIndex === 2)).toMatchObject({ execution: 'not-recorded' });
  expect(rows.find(row => row.request?.eventIndex === 2)?.end).toBeUndefined();
});

it.each(['initialState', 'commitValue'] as const)('does not execute an unrelated getter in %s', location => {
  const recording = savedSwitch();
  const frame = recording.snapshot.subflowResults['final#44'].treeContext;
  let reads = 0;
  const target = location === 'initialState' ? frame.initialState : frame.history[0].overwrite;
  Object.defineProperty(target, 'unrelatedValue', {
    enumerable: true, get() { reads++; return 'ignored'; },
  });
  const turn = projectHonestyTurn(recording, { startEventIndex: 1 });
  expect(reads).toBe(0);
  expect(turn.sentences.length).toBeGreaterThan(0);
});

it('keeps one withheld occurrence and adds only positive evidence that it ran', () => {
  const key = { toolCallId: 'call', callOccurrenceKey: [1, 2, 3, 4, 0] };
  const denied = toolEvent(decision, 1, { ...key, at: 'tool', phase: 'output', outcome: 'deny' });
  const end = toolEvent(callEnd, 2, { ...key, entered: true, result: 'hidden' });
  expect(readToolActivity([denied])[0]).toMatchObject({ execution: 'not-recorded', outcome: 'kept-out' });
  const rows = readToolActivity([denied, end]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ execution: 'ran', outcome: 'kept-out' });
  expect(JSON.stringify(rows)).not.toContain('hidden');
});

it('requires a string for a recorded response, including an empty string', () => {
  const turn = (payload: object) => projectHonestyTurn({
    events: [event(turnStart, { turnIndex: 0 }), event(turnEnd, { turnIndex: 0, ...payload })],
  }, { startEventIndex: 0 });
  expect(turn({}).steps[0]?.rows[0]?.text).toBe('The response text is unavailable in this record.');
  expect(turn({ finalContent: null }).steps[0]?.rows[0]?.text).toBe('The response text is unavailable in this record.');
  expect(turn({ finalContent: '' }).steps[0]?.rows[0]?.text).toBe('The response was recorded. Delivery was not confirmed.');
});

it('retains a visible response after an ordinary withheld payload and stops at a withheld terminal', () => {
  const start = event(turnStart, { turnIndex: 0 });
  const visible = event(turnEnd, { turnIndex: 0, finalContent: 'Kept answer.' }, ['final#1'], { rootTurn: true });
  const hidden = event('agentfootprint.stream.llm_start', '[REDACTED]');
  const terminal = event(turnEnd, '[REDACTED]', ['final#1'], { rootTurn: true });
  expect(projectHonestyTurn({ events: [start, hidden, visible] }, { startEventIndex: 0 }).sentences)
    .toMatchObject([{ text: 'Kept answer.' }]);
  const withheld = projectHonestyTurn({ events: [start, terminal, visible] }, { startEventIndex: 0 });
  expect(withheld.sentences).toHaveLength(0);
  expect(withheld.steps[0]?.rows[0]?.address?.eventIndex).toBe(1);
});

it('shows both actual mounted and root answers during rewind', () => {
  const url = new URL('./__fixtures__/mounted-17.json.gz', import.meta.url);
  const { recording } = JSON.parse(gunzipSync(readFileSync(url)).toString('utf8'));
  expect(recording.events[1].meta.runId).toBe(recording.events[2].meta.runId);
  const read = (startEventIndex: number, throughEventIndex?: number) =>
    projectHonestyTurn(recording, { startEventIndex, throughEventIndex }).sentences.map(x => x.text);
  expect(read(1, 16)).toEqual([]);
  expect(read(2, 15)).toEqual([]);
  expect(read(2, 16)).toEqual(['Child answer.']);
  expect(read(1)).toEqual(['Root answer.']);
});

it.each(['[REDACTED]', 'REDACTED'])('interprets %s only with matching-run recorder evidence', marker => {
  const events = [
    event(turnStart, { turnIndex: 0 }),
    event(turnEnd, { turnIndex: 0, finalContent: marker }),
  ];
  const selected = { startEventIndex: 0 };
  expect(projectHonestyTurn({ events, snapshot: { runId: 'same', recorders: [] } }, selected)
    .sentences[0]?.text).toBe(marker);
  const served = projectHonestyTurn({
    events, snapshot: { runId: 'same', recorders: [{ id: 'agentfootprint.redaction' }] },
  }, selected);
  expect(served.sentences).toEqual([]);
  expect(served.steps[0]?.rows[0]?.text).toBe('The response text is unavailable in this record.');
  const missing = projectHonestyTurn({ events }, selected);
  expect(missing.sentences).toEqual([]);
  expect(missing.steps[0]?.rows[0]?.text).toBe('The record cannot distinguish this response from a redaction marker.');
});

it.each([false, true])('does not use the latest run redaction policy for an earlier answer (served last: %s)', servedLast => {
  const plainURL = new URL('./__fixtures__/mounted-17.json.gz', import.meta.url);
  const servedURL = new URL('./__fixtures__/mounted-served-17.json.gz', import.meta.url);
  const plain = JSON.parse(gunzipSync(readFileSync(plainURL)).toString('utf8')).recording;
  const served = JSON.parse(gunzipSync(readFileSync(servedURL)).toString('utf8')).recording;
  const first = servedLast ? plain : served;
  const second = servedLast ? served : plain;
  expect(first.snapshot.runId).not.toBe(second.snapshot.runId);

  // Retain native run metadata and give the first root terminal the same
  // wire text for the two cases: a literal answer or a masked finalContent.
  const firstEvents = first.events.map((entry: { type: string; payload: unknown; meta: object }, ordinal: number) =>
    ordinal === 30 ? { ...entry, payload: { turnIndex: 0, finalContent: '[REDACTED]' } } : entry);
  const projection = projectHonestyTurn({
    events: [...firstEvents, ...second.events], snapshot: second.snapshot,
  }, { startEventIndex: 1 });
  expect(projection.sentences).toEqual([]);
  expect(projection.steps[0]?.rows[0]).toMatchObject({
    text: 'The record cannot distinguish this response from a redaction marker.',
    address: { eventIndex: 30 },
  });
});

it('retains distinct terminal locations in an actual served recording', () => {
  const url = new URL('./__fixtures__/mounted-served-17.json.gz', import.meta.url);
  const { recording } = JSON.parse(gunzipSync(readFileSync(url)).toString('utf8'));
  expect(recording.events[9].payload).toBe('[REDACTED]');
  for (const [startEventIndex, terminal] of [[1, 30], [2, 16]]) {
    const projected = projectHonestyTurn(recording, { startEventIndex: startEventIndex! });
    expect(projected.steps[0]?.rows[0]).toMatchObject({
      text: 'The response text is unavailable in this record.',
      address: { eventIndex: terminal },
    });
    expect(projected.sentences).toEqual([]);
  }
});
