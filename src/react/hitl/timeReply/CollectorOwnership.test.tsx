import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwaitingPane } from '../AwaitingPane.js';
import { registerDecisionComponent, type DecisionComponentProps } from '../registry.js';
const unregisters: (() => void)[] = [];
afterEach(() => { cleanup(); while (unregisters.length) unregisters.pop()!(); vi.restoreAllMocks(); });
const RANGE = '2026-11-01T00:00:00Z/2026-11-02T00:00:00Z';
function request() {
  return { requestId: 'same', fields: [
    { id: 'window', type: 'string', format: 'time-range', required: false, enum: [RANGE] },
    { id: 'words', type: 'string', required: false, description: 'Correction' },
    { id: 'region', type: 'string', required: true },
  ] };
}
const reader = () => [{ range: 'window', correction: 'words' }];
describe('registered time collector ownership', () => {
  it('passes native pair metadata without merging or replacing the collector’s complete decision', () => {
    let metadata: DecisionComponentProps['timeReply'];
    const decision = { requestId: 'same', values: { words: 'EST', region: 'west' } };
    unregisters.push(registerDecisionComponent({ componentId: 'whole-form', component: props => {
      metadata = props.timeReply;
      return <button onClick={() => props.respond(decision)}>Answer all fields</button>;
    } }));
    const onDecision = vi.fn();
    render(<AwaitingPane awaiting={{ component: { componentId: 'whole-form' }, pauseData: { awaitingInput: request() } }}
      timeReplyReader={reader} onDecision={onDecision} />);
    expect(metadata?.status === 'ready' && metadata.form.complete).toBe(false);
    expect(screen.queryByRole('button', { name: 'Answer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Answer all fields' }));
    expect(onDecision).toHaveBeenCalledTimes(1); expect(onDecision.mock.calls[0]![0]).toBe(decision);
  });
  it('does not allow a retained response callback from an older ask generation', () => {
    const callbacks: DecisionComponentProps['respond'][] = [];
    unregisters.push(registerDecisionComponent({ componentId: 'async-form', component: props => {
      callbacks.push(props.respond); return <span>Full form</span>;
    } }));
    const onDecision = vi.fn(); const first = request();
    const view = render(<AwaitingPane awaiting={{ component: { componentId: 'async-form' }, pauseData: { awaitingInput: first } }}
      timeReplyReader={reader} onDecision={onDecision} />);
    const old = callbacks[0]!;
    view.rerender(<AwaitingPane awaiting={{ component: { componentId: 'async-form' }, pauseData: { awaitingInput: request() } }}
      timeReplyReader={reader} onDecision={onDecision} />);
    old({ requestId: first.requestId, values: { words: 'stale' } });
    expect(onDecision).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'missing-ref', 'crash'])('never submits a pair-only partial answer through %s fallback', async kind => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (kind !== 'unknown') unregisters.push(registerDecisionComponent({ componentId: 'full', component: () => {
      if (kind === 'crash') throw Error('controlled crash');
      return <button>Registered full collector</button>;
    } }));
    const onDecision = vi.fn();
    const awaiting = { component: { componentId: 'full', ...(kind === 'missing-ref' ? { propsRef: 'missing' } : {}) },
      pauseData: { awaitingInput: request() } };
    render(<AwaitingPane awaiting={awaiting} timeReplyReader={reader} onDecision={onDecision}
      {...(kind === 'missing-ref' ? { resolver: { get: async () => ({ status: 'absent' as const }),
        head: async () => ({ status: 'absent' as const }) } } : {})} />);
    await screen.findByTestId('time-reply-unavailable');
    expect(screen.queryByRole('button', { name: 'Answer' })).toBeNull();
    expect(screen.queryByTestId('hitl-answer-box')).toBeNull(); expect(onDecision).not.toHaveBeenCalled();
  });
});
