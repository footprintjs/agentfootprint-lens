import { describe, expect, it, vi } from 'vitest';
import type { AgentfootprintEvent } from 'agentfootprint/events';
import { defaultHumanizer, teachingHumanizer } from './humanizer.js';

const withheld = 'PRIVATE-MARKER';
const onlyName = 'Calling tool "lookup".';
function toolStart(fields: Record<string, unknown> = {}): AgentfootprintEvent {
  return {
    type: 'agentfootprint.stream.tool_start',
    payload: { toolName: 'lookup', toolCallId: 't', args: { key: withheld }, ...fields },
    meta: { wallClockMs: 0, runOffsetMs: 0, runtimeStageId: 'lookup#0', subflowPath: [], compositionPath: [], runId: 'run' },
  };
}

describe('tool proposal narration', () => {
  it('uses the recorded display proposal without touching actual arguments', () => {
    const event = toolStart({ shownArgs: { region: 'west', key: 'REDACTED' }, hiddenArgs: ['key'] });
    const read = vi.fn(() => { throw Error('Actual arguments were read'); });
    Object.defineProperty(event.payload, 'args', { get: read });
    expect(defaultHumanizer(event)).toBe('Calling tool "lookup" with {"region":"west","key":"REDACTED"}.');
    expect(teachingHumanizer(event)).not.toContain(withheld);
    expect(read).not.toHaveBeenCalled();
  });

  it('names only the tool when hidden names are the only available display metadata', () => {
    expect(defaultHumanizer(toolStart({ hiddenArgs: ['key'] }))).toBe(onlyName);
  });

  it.each([
    { shownArgs: undefined }, { shownArgs: null }, { shownArgs: ['invalid'] },
    { shownArgs: { toJSON: () => withheld } }, { shownArgs: { key: withheld }, hiddenArgs: 'invalid' },
  ])('withholds arguments for unreadable display metadata', fields => {
    expect(defaultHumanizer(toolStart(fields))).toBe(onlyName);
  });

  it('never invokes getters on a malformed display proposal', () => {
    const read = vi.fn(() => withheld);
    const event = toolStart({ hiddenArgs: ['key'] });
    Object.defineProperty(event.payload, 'shownArgs', { enumerable: true, get: read });
    expect(defaultHumanizer(event)).toBe(onlyName);
    expect(defaultHumanizer(toolStart({ shownArgs: { get key() { return read(); } } }))).toBe(onlyName);
    expect(read).not.toHaveBeenCalled();
  });

  it('preserves historical formatting when neither protection field was recorded', () => {
    expect(defaultHumanizer(toolStart({ args: { city: 'Tokyo' } }))).toBe('Calling tool "lookup" with {"city":"Tokyo"}.');
  });
});
