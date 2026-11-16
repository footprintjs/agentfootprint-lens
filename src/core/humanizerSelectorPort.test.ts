/** Adapter contract, isolated from the installed selector's event policy. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentfootprintEvent } from 'agentfootprint/events';

const { selectKey } = vi.hoisted(() => ({ selectKey: vi.fn() }));
vi.mock('agentfootprint', async (importOriginal) => ({
  ...await importOriginal<typeof import('agentfootprint')>(),
  selectCommentaryKey: selectKey,
}));

import { defaultHumanizer, humanizeWith, makeTeachingHumanizer } from './humanizer.js';

function event(type: string, payload: Record<string, unknown>): AgentfootprintEvent {
  return { type, payload, meta: { wallClockMs: 1000, runOffsetMs: 0, runtimeStageId: 'test#0',
    subflowPath: [], compositionPath: [], runId: 'test' } } as unknown as AgentfootprintEvent;
}

const cost = () => event('agentfootprint.cost.tick', { estimatedUsd: 0.001, cumulative: { estimatedUsd: 0.005 } });
const turn = () => event('agentfootprint.agent.turn_start', { userPrompt: 'go', turnIndex: 1 });

describe('teaching-humanizer selector port', () => {
  beforeEach(() => selectKey.mockReset());

  it('null skips an event even when the raw humanizer has a line', () => {
    const input = cost();
    selectKey.mockReturnValue(null);
    expect(defaultHumanizer(input)).toContain('Cost +$');
    expect(makeTeachingHumanizer()(input)).toBeNull();
    expect(selectKey).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('undefined falls back to the raw humanizer without assuming which events select it', () => {
    const input = cost();
    selectKey.mockReturnValue(undefined);
    expect(makeTeachingHumanizer()(input)).toBe('Cost +$0.001000 — cumulative $0.005000.');
    expect(selectKey).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('a selected string renders the real template/vars with consumer name and template overrides', () => {
    const input = turn();
    selectKey.mockReturnValue('agent.turn_start');
    const humanize = makeTeachingHumanizer({ appName: 'Workspace',
      commentaryTemplates: { 'agent.turn_start': '{{appName}} heard "{{userPrompt}}".' } });
    expect(humanize(input)).toBe('Workspace heard "go".');
    expect(selectKey).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('an explicitly absent selected template falls back to the raw humanizer', () => {
    const input = turn();
    selectKey.mockReturnValue('agent.turn_start');
    const humanize = makeTeachingHumanizer({ commentaryTemplates: { 'agent.turn_start': undefined } });
    expect(humanize(input)).toBe(defaultHumanizer(input));
  });

  it('consumer humanizeWith overrides retain string, null and undefined meanings', () => {
    const input = cost();
    expect(humanizeWith({ 'agentfootprint.cost.tick': () => 'Consumer detail' })(input)).toBe('Consumer detail');
    expect(humanizeWith({ 'agentfootprint.cost.tick': () => null })(input)).toBeNull();
    expect(humanizeWith({ 'agentfootprint.cost.tick': () => undefined })(input)).toBe(defaultHumanizer(input));
    expect(selectKey).not.toHaveBeenCalled();
  });
});
