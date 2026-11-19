import producer from 'agentfootprint/package.json';
import type { AgentfootprintEvent } from 'agentfootprint/events';
import { describe, expect, it, vi } from 'vitest';
import { defaultHumanizer, makeTeachingHumanizer, teachingHumanizer } from './humanizer.js';
import { selectFocusDetail } from './selectors/selectFocusDetail.js';

const meta = { wallClockMs: 0, runOffsetMs: 0, runtimeStageId: 'tools#1', subflowPath: [], compositionPath: [], runId: 'run' };
function event(type: 'tool_start' | 'tool_end', payload: Record<string, unknown>): AgentfootprintEvent {
  return { type: `agentfootprint.stream.${type}`, payload, meta } as unknown as AgentfootprintEvent;
}

describe('analyst fallback for a tool end', () => {
  const end = (fields: Record<string, unknown>) => defaultHumanizer(event('tool_end',
    { toolCallId: 'lookup-1', durationMs: 7, result: 'the recorded response', ...fields }));

  it.each([{}, { error: true }, { entered: 'yes' }, { entered: 1 }, { entered: null }])(
    'leaves a missing or malformed entry unknown for %j', fields => {
      expect(end(fields)).toBe('The record does not say whether the tool ran.');
    },
  );
  it('reports a recorded settlement of an earlier paused call', () => {
    const notDispatched = { pausedCall: { toolCallId: 'paused-call', toolName: 'paused-tool' } };
    expect(end({ notDispatched })).toBe('The call was not executed.');
  });

  it('uses the ordinary start and its description when the saved settlement is malformed', () => {
    const humanize = makeTeachingHumanizer({ getToolDescription: () => 'public lookup' });
    const fields = { toolCallId: 'c1', toolName: 'lookup', args: {}, notDispatched: { pausedCall: null } };
    expect(defaultHumanizer(event('tool_start', fields))).toMatch(/Calling tool/);
    expect(humanize(event('tool_start', fields))).toContain('public lookup');
  });

  // The historical CI control installs 14.7.2 independently of the supported peer.
  // Its selector has one end template. The old-recording assertions above run with both producers.
  if (producer.version === '14.7.2') {
    it('uses the published historical end template and skips a settled end in the teaching voice', () => {
      const humanize = makeTeachingHumanizer({ commentaryTemplates: { 'stream.tool_end': 'The bracket closed.' } });
      const notDispatched = { pausedCall: { toolCallId: 'paused-call', toolName: 'paused-tool' } };
      expect(humanize(event('tool_end', { toolCallId: 'historical', durationMs: 7, result: 'saved response' }))).toBe('The bracket closed.');
      expect(humanize(event('tool_end', { toolCallId: 'settled', durationMs: 0, result: 'batch paused', notDispatched }))).toBeNull();
    });
    return;
  }

  it('reports execution when entry is recorded, including a failure inside the function', () => {
    expect(end({ entered: true })).toMatch(/returned|ran/i);
    expect(end({ entered: true, error: true })).toMatch(/ran.*(?:error|failed)/i);
  });
  it.each([
    { entered: false }, { entered: false, error: true }, { notExecuted: true },
  ])('does not report an execution for %j', fields => {
    expect(end(fields)).toBe('The call was not executed.');
  });
  it('leaves entry unknown when the settlement is unreadable', () => {
    expect(end({ entered: true, notDispatched: {} })).toBe('The record does not say whether the tool ran.');
  });
  it.each([{ entered: 'yes' }, { error: 0 }, { notExecuted: null }])(
    'a paused-batch marker cannot establish execution when its end has a malformed boolean leaf %j', fields => {
      const notDispatched = { pausedCall: { toolCallId: 'paused-call', toolName: 'paused-tool' } };
      expect(end({ ...fields, notDispatched })).toBe('The record does not say whether the tool ran.');
      expect(end({ ...fields, notDispatched: { pausedCall: { toolCallId: 'paused-call' } } }))
        .toBe('The record does not say whether the tool ran.');
    },
  );
  it('keeps the other call named by a settlement independent, and honors teaching template selection', () => {
    const humanize = makeTeachingHumanizer({ appName: 'Workspace', commentaryTemplates: {
      'stream.tool_start.notDispatched': '{{appName}} skipped {{toolName}} after {{pausedToolName}} paused.',
      'stream.tool_end.notExecuted': 'Recorded refusal.',
      'stream.tool_end.executionUnknown': 'No entry evidence.',
    } });
    const notDispatched = { pausedCall: { toolCallId: 'paused-call', toolName: 'paused-tool' } };
    expect(humanize(event('tool_start', { toolCallId: 'settled-call', toolName: 'settled-tool', notDispatched })))
      .toBe('Workspace skipped settled-tool after paused-tool paused.');
    expect(humanize(event('tool_end', { toolCallId: 'settled-call', notDispatched }))).toBeNull();
    expect(humanize(event('tool_end', { toolCallId: 'paused-call', notExecuted: true }))).toBe('Recorded refusal.');
    expect(humanize(event('tool_end', { toolCallId: 'paused-call' }))).toBe('No entry evidence.');
    expect(end({ toolCallId: 'paused-call', entered: true })).toContain('returned');
  });
  it('uses the recorded refusal before a conflicting entry stamp, and stays neutral for an unreadable marker', () => {
    expect(end({ entered: true, notExecuted: true })).toBe('The call was not executed.');
    expect(teachingHumanizer(event('tool_end', { entered: true, notExecuted: true }))).toMatch(/not executed/);
    expect(teachingHumanizer(event('tool_end', { entered: true, notDispatched: {} })))
      .toBe('The record does not say whether the tool ran.');
  });
});

describe('display arguments in analyst commentary and step detail', () => {
  const secret = 'VALUE-NEVER-DISPLAYED';
  function inspect(fields: Record<string, unknown>) {
    const start = event('tool_start', { toolName: 'lookup', toolCallId: 'c1', ...fields });
    const log = [{ seq: 0, runOffsetMs: 0, wallClockMs: 0, event: start }];
    const step = { id: 'step', kind: 'llm->tool' as const, label: 'lookup', startOffsetMs: 0, subflowPath: [] };
    return { fallback: defaultHumanizer(start), teaching: teachingHumanizer(start), detail: selectFocusDetail(step, log) };
  }
  it('shows the projection and names hidden keys, even if they are absent from the projection', () => {
    const outputs = inspect({ args: { credential: secret }, shownArgs: { region: 'west' }, hiddenArgs: ['credential'] });
    for (const line of [outputs.fallback, outputs.teaching]) {
      expect(line).toContain('west');
      expect(line).toMatch(/hidden.*credential/i);
    }
    expect(outputs.detail).toMatchObject({ toolArgs: { region: 'west' }, hiddenArgs: ['credential'] });
    expect(JSON.stringify(outputs)).not.toContain(secret);
  });
  it('shows only the recorded projection or only the hidden names when supplied individually', () => {
    const shownOnly = inspect({ args: { token: secret }, shownArgs: { mode: 'safe' } });
    expect(shownOnly.detail?.toolArgs).toEqual({ mode: 'safe' });
    expect(shownOnly.fallback).toContain('safe');
    const namesOnly = inspect({ args: { token: secret }, hiddenArgs: ['token'] });
    expect(namesOnly.fallback).toMatch(/hidden.*token/i);
    expect(namesOnly.detail).toMatchObject({ hiddenArgs: ['token'] });
    expect(namesOnly.detail?.toolArgs).toBeUndefined();
    expect(JSON.stringify([shownOnly, namesOnly])).not.toContain(secret);
  });
  it('never reads raw arguments or invokes a display accessor on the protected path', () => {
    const read = vi.fn(() => { throw Error('private value was read'); });
    const start = event('tool_start', { toolName: 'lookup', toolCallId: 'c1', hiddenArgs: ['token'] });
    Object.defineProperty(start.payload, 'args', { get: read });
    Object.defineProperty(start.payload, 'shownArgs', { enumerable: true, get: read });
    const detail = selectFocusDetail({ id: 's', kind: 'llm->tool', label: '', startOffsetMs: 0, subflowPath: [] },
      [{ seq: 0, runOffsetMs: 0, wallClockMs: 0, event: start }]);
    expect(detail?.toolArgs).toBeUndefined();
    for (const humanize of [defaultHumanizer, teachingHumanizer]) expect(() => humanize(start)).not.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it('keeps raw args out of a host teaching template and its variable extraction', () => {
    const read = vi.fn(() => secret);
    const start = event('tool_start', { toolName: 'lookup', toolCallId: 'c1',
      shownArgs: { region: 'west' }, hiddenArgs: ['token'] });
    Object.defineProperty(start.payload, 'args', { enumerable: true, get: read });
    const humanize = makeTeachingHumanizer({ appName: 'Workspace',
      commentaryTemplates: { 'stream.tool_start': '{{appName}} requests {{toolName}} [{{args}}].' } });
    expect(humanize(start)).toBe('Workspace requests lookup []. Shown arguments: {"region":"west"}. Hidden arguments: token.');
    expect(read).not.toHaveBeenCalled();
  });
  it.each([{ shownArgs: undefined }, { shownArgs: null }, { hiddenArgs: 'bad' },
    { shownArgs: { toJSON: () => secret } }, { shownArgs: { token: secret }, hiddenArgs: [1] }])(
    'never falls back to private values for malformed protection metadata %j', fields => {
      const outputs = inspect({ args: { token: secret }, ...fields });
      expect(outputs.detail?.toolArgs).toBeUndefined();
      expect(JSON.stringify(outputs)).not.toContain(secret);
    },
  );
  it('retains historical unprotected args in the fallback and detail', () => {
    const outputs = inspect({ args: { city: 'Tokyo' } });
    expect(outputs.fallback).toBe('Calling tool "lookup" with {"city":"Tokyo"}.');
    expect(outputs.detail?.toolArgs).toEqual({ city: 'Tokyo' });
  });
});
