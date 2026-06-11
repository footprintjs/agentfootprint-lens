/**
 * selectToolChoiceCall — pure cursor→call resolution (RFC-002 C7).
 *
 * The ONE-cursor law under test: every panel position is DERIVED from a
 * `runtimeStageId` cursor — exact → within-subflow → nearest-previous —
 * with the root/synthetic bookends mapping to "nothing yet" / "the
 * whole run".
 */

import { describe, it, expect } from 'vitest';
import type { ToolChoiceCall } from 'agentfootprint/observe';
import { selectToolChoiceCall } from './selectToolChoiceCall.js';

function call(runtimeStageId: string, iteration = 1): ToolChoiceCall {
  return {
    runtimeStageId,
    iteration,
    offered: [{ name: 'a' }, { name: 'b' }],
    chosen: ['a'],
    toolCallIds: ['c1'],
    contextText: 'user: q',
  };
}

describe('selectToolChoiceCall', () => {
  it('returns undefined when there are no calls', () => {
    expect(selectToolChoiceCall([], 'call-llm#3')).toBeUndefined();
    expect(selectToolChoiceCall([], '')).toBeUndefined();
  });

  it('empty cursor (live edge, no positions yet) → latest call', () => {
    const calls = [call('call-llm#3'), call('call-llm#9', 2)];
    expect(selectToolChoiceCall(calls, '')).toBe(calls[1]);
  });

  it('exact cursor match → that call', () => {
    const calls = [call('call-llm#3'), call('call-llm#9', 2)];
    expect(selectToolChoiceCall(calls, 'call-llm#3')).toBe(calls[0]);
    expect(selectToolChoiceCall(calls, 'call-llm#9')).toBe(calls[1]);
  });

  it('within: subflow-root cursor resolves to THIS execution’s call', () => {
    // Loop body: subflow roots #5 and #12, each containing one call.
    const calls = [
      call('sf-llm-call/call-llm#7', 1),
      call('sf-llm-call/call-llm#14', 2),
    ];
    expect(selectToolChoiceCall(calls, 'sf-llm-call#5')).toBe(calls[0]);
    expect(selectToolChoiceCall(calls, 'sf-llm-call#12')).toBe(calls[1]);
  });

  it('nearest-previous: cursor after a call resolves backwards', () => {
    const calls = [call('call-llm#3'), call('call-llm#9', 2)];
    // Cursor on a later stage between the two calls → first call.
    expect(selectToolChoiceCall(calls, 'execute-tools#5')).toBe(calls[0]);
    // Cursor after the last call → last call.
    expect(selectToolChoiceCall(calls, 'sf-memory-write#20')).toBe(calls[1]);
  });

  it('cursor BEFORE the first call → undefined', () => {
    const calls = [call('call-llm#3')];
    expect(selectToolChoiceCall(calls, 'seed#0')).toBeUndefined();
  });

  it('root group-start → undefined; root group-end → last call', () => {
    const calls = [call('call-llm#3'), call('call-llm#9', 2)];
    expect(selectToolChoiceCall(calls, '__root__#0', 'group-start')).toBeUndefined();
    expect(selectToolChoiceCall(calls, '__root__#0', 'group-end')).toBe(calls[1]);
  });

  it('synthetic user-in → undefined; user-out → last call', () => {
    const calls = [call('call-llm#3')];
    expect(
      selectToolChoiceCall(calls, '__lens_user_in__#0', 'user-in'),
    ).toBeUndefined();
    expect(selectToolChoiceCall(calls, '__lens_user_out__#0', 'user-out')).toBe(
      calls[0],
    );
  });

  it('unparsable cursor (no #N) → undefined, never throws', () => {
    const calls = [call('call-llm#3')];
    expect(selectToolChoiceCall(calls, 'weird-id')).toBeUndefined();
  });

  it('within beats nearest-previous when both candidates exist', () => {
    const calls = [
      call('sf-llm-call/call-llm#2', 1), // previous iteration
      call('sf-llm-call/call-llm#7', 2), // inside the cursor's execution
    ];
    expect(selectToolChoiceCall(calls, 'sf-llm-call#5')).toBe(calls[1]);
  });
});
