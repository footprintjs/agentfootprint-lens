/** Published dev-peer integration. Never substitutes a Lens interpretation for native resume. */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent, defineTool, englishTimeReader, isInputPause } from 'agentfootprint';
import { mock } from 'agentfootprint/providers';
import { timeReplyPairs } from 'agentfootprint/time';
import type { TimeReplyReader } from '../../../core/timeReply.js';
import { AwaitingPane } from '../AwaitingPane.js';

afterEach(cleanup);
// Compile-time public-door compatibility. Production only imports Lens's structural port.
const reader: TimeReplyReader = timeReplyPairs;
function desk(handed: unknown[]) {
  let calls = 0;
  return Agent.create({ provider: mock({ respond: () => calls++ === 0
    ? { content: '', toolCalls: [{ id: 'window-1', name: 'window_read', args: {} }] }
    : { content: 'done' } }), model: 'mock' })
    .tool(defineTool({ name: 'window_read', description: 'Synthetic window reader',
      inputSchema: { type: 'object', properties: { from_ms: { type: 'integer' }, to_ms: { type: 'integer' } } },
      askOrAssume: { from_ms: { ask: 'From when?' }, to_ms: { ask: 'Until when?' } },
      period: { forms: [{ kind: 'bounds', from: { argument: 'from_ms', as: 'epoch-ms' },
        to: { argument: 'to_ms', as: 'epoch-ms', edge: 'exclusive' } }] },
      execute: args => { handed.push(args); return '{"result":1}'; } }))
    .time({ zone: 'America/Los_Angeles', reader: englishTimeReader() }).build();
}
async function pause(agent: ReturnType<typeof desk>) {
  const result = await agent.run({ message: 'any activity yesterday?', time: { now: '2026-10-09T15:40:00Z' } });
  if (!isInputPause(result)) throw Error('Expected native time confirmation');
  return result;
}
function wireOf(paused: Awaited<ReturnType<typeof pause>>) {
  return JSON.parse(JSON.stringify(paused.awaitingInput)) as typeof paused.awaitingInput;
}

describe('published native time correction through the host controls', () => {
  it('confirms an offered range verbatim and executes once through native resume', async () => {
    const handed: unknown[] = []; const agent = desk(handed);
    try {
      const paused = await pause(agent); const wire = wireOf(paused);
      const pair = timeReplyPairs(wire)[0]!; const offered = wire.fields.find(field => field.id === pair.range)!.enum![0]!;
      let done: unknown;
      const onDecision = vi.fn(async decision => { done = await agent.resume(paused.checkpoint, decision); });
      render(<AwaitingPane awaiting={{ question: wire.question, pauseData: { awaitingInput: wire } }}
        timeReplyReader={reader} onDecision={onDecision} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: offered } });
      fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
      await screen.findByTestId('hitl-decision-record');
      expect(onDecision).toHaveBeenCalledExactlyOnceWith({ requestId: wire.requestId, values: { [pair.range]: offered } });
      expect(isInputPause(done)).toBe(false); expect(handed).toHaveLength(1);
    } finally { await agent.shutdown(); }
  });
  it('keeps no as a native same-ID re-ask, then accepts a correction without local time parsing', async () => {
    const handed: unknown[] = []; const agent = desk(handed);
    try {
      let current = await pause(agent); const wire = wireOf(current); const pair = timeReplyPairs(wire)[0]!;
      let next: Awaited<ReturnType<typeof agent.resume>>;
      const onDecision = vi.fn(async decision => { next = await agent.resume(current.checkpoint, decision); });
      const props = (request: typeof wire) => ({ awaiting: { question: request.question, pauseData: { awaitingInput: request } },
        timeReplyReader: reader, onDecision });
      const view = render(<AwaitingPane {...props(wire)} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'no' } });
      fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
      await screen.findByTestId('hitl-decision-record');
      expect(onDecision.mock.calls[0]![0]).toEqual({ requestId: wire.requestId, values: { [pair.correction]: 'no' } });
      expect(handed).toEqual([]);
      if (!isInputPause(next!)) throw Error('Expected native correction hold');
      current = next!; expect(current.awaitingInput.requestId).toBe(wire.requestId);
      expect(current.awaitingInput.refused?.reason).toBeTruthy();
      const again = wireOf(current); view.rerender(<AwaitingPane {...props(again)} />);
      expect(screen.queryByTestId('hitl-decision-record')).toBeNull();
      expect(screen.getByTestId('time-ask-reason').textContent).toBe(again.refused!.reason);
      const correction = '2026-10-01T00:00:00Z/2026-10-02T00:00:00Z';
      fireEvent.change(screen.getByRole('textbox'), { target: { value: correction } });
      fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
      await screen.findByTestId('hitl-decision-record');
      expect(onDecision.mock.calls[1]![0]).toEqual({ requestId: wire.requestId, values: { [pair.correction]: correction } });
      expect(isInputPause(next!)).toBe(false);
      expect(handed).toEqual([{ from_ms: Date.parse('2026-10-01T00:00:00Z'), to_ms: Date.parse('2026-10-02T00:00:00Z') }]);
    } finally { await agent.shutdown(); }
  });
});
