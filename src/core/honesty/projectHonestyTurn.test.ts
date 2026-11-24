/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { projectHonestyTurn } from './projectHonestyTurn.js';

function recording(name: string) {
  const path = new URL(`./__fixtures__/${name}.json.gz`, import.meta.url);
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')).recording;
}

it('projects the recorded switch turn without claiming sentence links or delivery', () => {
  const record = recording('switch-coverage');
  const result = projectHonestyTurn(record, { startEventIndex: 1 });
  expect(result.trust.state).toBe('not-sure');
  expect(result.steps.map(step => step.id)).toEqual(['D', 'N', 'A', 'T', 'S']);
  expect(result.steps[0]?.rows[0]?.text).toBe('The response was recorded. Delivery was not confirmed.');
  expect(result.sentences.length).toBeGreaterThan(0);
  expect(result.sentences.every(item =>
    item.mark === 'unlinked' && item.evidenceNote === 'The answer was checked. No evidence link was recorded for this sentence.',
  )).toBe(true);
  expect(result.sentences.map(item => item.text).join('')).toBe(record.events[37].payload.finalContent);
  expect(result.steps[3]?.rows[0]?.address?.eventIndex).toBe(14);
  expect(projectHonestyTurn(record, { startEventIndex: 1, throughEventIndex: 34 }).trust.state).toBe('not-yet-recorded');
});

it('displays the recorded schema retry once with the later response', () => {
  const record = recording('schema-retry');
  const result = projectHonestyTurn(record, { startEventIndex: 1 });
  expect(result.trust.state).toBe('not-assessed');
  expect(result.steps[3]?.rows).toHaveLength(1);
  expect(result.steps[3]?.rows[0]).toMatchObject({
    text: 'The recording shows 1 schema retry. The recorded response followed attempt 2.',
    address: { eventIndex: 18 },
  });
});

it('joins committed tool facts only at the visible log position', () => {
  const record = recording('switch-coverage');
  delete record.events[14].payload.entered;
  const toolAt = (throughEventIndex: number) =>
    projectHonestyTurn(record, { startEventIndex: 1, throughEventIndex }).steps[3]?.rows[0]?.tool;

  expect(toolAt(14)).toMatchObject({ execution: 'not-recorded', end: { eventIndex: 14 } });
  expect(toolAt(34)).toMatchObject({ execution: 'ran', outcome: 'returned', proof: { eventIndex: 34 } });
  expect(toolAt(37)).toMatchObject({
    execution: 'ran',
    outcome: 'returned',
    proof: { eventIndex: 37, sourcePosition: { drillPath: ['final#44'], committedThroughIdx: 1 } },
  });
  record.events[37].meta.sourcePosition.committedThroughIdx = 10_000;
  expect(toolAt(37)).toMatchObject({ execution: 'not-recorded' });
});

it('keeps a committed withheld result out without reading its values', () => {
  const project = (secret: string) => {
    const record = recording('switch-coverage');
    record.events[14].payload.result = secret;
    const committed = record.snapshot.subflowResults['final#44'].treeContext.history[0].overwrite;
    committed.settledToolCalls = [{
      callOccurrenceKey: record.events[14].payload.callOccurrenceKey,
      execution: 'returned',
      delivery: 'withheld',
    }];
    return projectHonestyTurn(record, { startEventIndex: 1 });
  };
  const one = project('first hidden result');
  const two = project('other hidden result');
  expect(one.steps[3]?.rows[0]).toMatchObject({
    text: 'A result was kept out by a rule.',
    address: { eventIndex: 37 },
    tool: { execution: 'ran', outcome: 'kept-out' },
  });
  expect(JSON.stringify(one)).toBe(JSON.stringify(two));
});

it('leaves the refused draft text out and discloses the reader limit', () => {
  const record = recording('schema-retry');
  record.events[39].payload.refused = { by: 'evidence-rails' };
  record.events[39].payload.finalContent = 'Disallowed draft value.';
  const result = projectHonestyTurn(record, { startEventIndex: 1 });
  expect(result.trust.state).toBe('withheld');
  expect(result.sentences).toEqual([]);
  expect(JSON.stringify(result)).not.toContain('Disallowed draft value.');
  expect(projectHonestyTurn({ events: new Array(50_001) }, { startEventIndex: 0 }).trust).toMatchObject({
    state: 'too-long',
    sentence: 'This run is too long to read here.',
  });
});
