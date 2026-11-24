/** @vitest-environment node */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { projectHonestyTurn } from './projectHonestyTurn.js';

function switchRecording() {
  const fixture = new URL('./__fixtures__/switch-coverage.json.gz', import.meta.url);
  return JSON.parse(gunzipSync(readFileSync(fixture)).toString('utf8')).recording;
}

it('puts each recorded reason on its own exact assessment row', () => {
  const record = switchRecording();
  const selected = { startEventIndex: 1 };
  expect(projectHonestyTurn(record, selected).reasons).toMatchObject([
    { text: 'A tool recorded a gap in what it checked.', evidence: { address: { eventIndex: 37 }, reasonIndex: 0 } },
    { text: 'A tool recorded a missing match within its search.', evidence: { address: { eventIndex: 37 }, reasonIndex: 1 } },
  ]);
  expect(projectHonestyTurn(record, { ...selected, throughEventIndex: 34 }).reasons).toEqual([]);
});

it('retains an output-limit reason with no tool label when its witness is unavailable', () => {
  const record = switchRecording();
  record.events[37].payload.answerAssessment.reasons = ['answer-output-limit'];
  delete record.events[37].meta.sourcePosition;
  expect(projectHonestyTurn(record, { startEventIndex: 1 }).reasons).toEqual([
    { text: 'The response reached the model’s output limit.', evidence: { address: { eventIndex: 37, runtimeStageId: 'final/prepare-final#46' }, reasonIndex: 0 } },
  ]);
});

it('keeps denied response reasons out of the panel', () => {
  const record = switchRecording();
  record.events[37].payload.refused = { by: 'evidence-rails' };
  expect(projectHonestyTurn(record, { startEventIndex: 1 }).reasons).toEqual([]);
});

it('reads an actual AgentFootprint 17 recording without printing the thrown error', () => {
  const fixture = new URL('./__fixtures__/inventory-17.json.gz', import.meta.url);
  const record = JSON.parse(gunzipSync(readFileSync(fixture)).toString('utf8')).recording;
  const start = record.events.findIndex((event: { type: string }) =>
    event.type === 'agentfootprint.agent.turn_start');
  const result = projectHonestyTurn(record, { startEventIndex: start });
  expect(result.trust.state).toBe('not-sure');
  expect(result.reasons.map(row => row.text)).toEqual([
    'The assessment records a call that did not complete.',
    'A tool recorded a gap in what it checked.',
    'The response reached the model’s output limit.',
  ]);
  expect(JSON.stringify(result.reasons)).not.toContain('Fixture failure text');
  const version = (createRequire(import.meta.url)('agentfootprint/package.json') as { version: string }).version;
  if (Number(version.split('.')[0]) >= 17) {
    const [failure, coverage, output] = result.reasons;
    expect(failure).toMatchObject({ tools: ['Archive lookup'], details: ['The tool reported a network failure.'] });
    expect(coverage).toMatchObject({
      tools: ['Inventory lookup'],
      details: ['Archived stock · The inventory retains only current entries.'],
      evidence: { witnesses: [expect.objectContaining({ key: 'coverageDeclared' })] },
    });
    expect(output).toMatchObject({
      evidence: { witnesses: [expect.objectContaining({ key: 'llmLatestStopReason' })] },
    });
  }
});

it('joins library counts only to the selected turn’s witnessed rows', () => {
  const record = switchRecording();
  const terminal = record.events[37];
  const commit = record.snapshot.subflowResults['final#44'].treeContext.history[0];
  const committed = commit.overwrite;
  commit.trace.push({ path: 'libraryResultLimits', verb: 'set' });
  terminal.payload.answerAssessment.reasons = ['result-cut', 'placed-unread', 'times-without-zone'];
  terminal.payload.standingLineNames = { list_down_ports: 'Inventory lookup' };
  const call = {
    toolName: 'list_down_ports',
    toolCallId: record.events[14].payload.toolCallId,
    callOccurrenceKey: record.events[14].payload.callOccurrenceKey,
    turn: committed.turnNumber,
  };
  const ref = 'art_1234567890123456789012';
  committed.libraryResultLimits = [
    { ...call, kind: 'result-cut', keptChars: 20, totalChars: 120, maxChars: 40 },
    { ...call, kind: 'placed-unread', ref },
    { ...call, kind: 'times-without-zone', naiveCount: 3, ref },
    { ...call, turn: call.turn + 1, kind: 'result-cut', keptChars: 9, totalChars: 99, maxChars: 20 },
  ];
  const result = projectHonestyTurn(record, { startEventIndex: 1 });
  expect(result.reasons.map(row => row.text)).toEqual([
    'The library cut a tool result.',
    'A tool result was stored by reference and left unread.',
    'The record includes times without a timezone.',
  ]);
  const version = (createRequire(import.meta.url)('agentfootprint/package.json') as { version: string }).version;
  if (Number(version.split('.')[0]) >= 17) {
    expect(result.reasons.map(row => row.details)).toEqual([
      ['20 of 120 characters kept.'],
      undefined,
      ['3 without a timezone.'],
    ]);
  }
  expect(JSON.stringify(result.reasons)).not.toContain(ref);
  expect(JSON.stringify(result.reasons)).not.toContain('9 of 99');
});

it('uses the code-runner failure witness without relaying either output stream', () => {
  const fixture = new URL('./__fixtures__/code-runner-17.json.gz', import.meta.url);
  const record = JSON.parse(gunzipSync(readFileSync(fixture)).toString('utf8')).recording;
  const start = record.events.findIndex((event: { type: string }) =>
    event.type === 'agentfootprint.agent.turn_start');
  const result = projectHonestyTurn(record, { startEventIndex: start });
  expect(result.reasons).toHaveLength(1);
  expect(result.reasons[0]?.text).toBe('The assessment records a call that did not complete.');
  expect(JSON.stringify(result.reasons)).not.toMatch(/Fixture std(?:out|err)|never executed/);
  const version = (createRequire(import.meta.url)('agentfootprint/package.json') as { version: string }).version;
  if (Number(version.split('.')[0]) >= 17) {
    expect(result.reasons[0]?.evidence.witnesses).not.toHaveLength(0);
    expect(result.reasons[0]?.details?.join(' ')).toMatch(/characters kept/);
  }
});
