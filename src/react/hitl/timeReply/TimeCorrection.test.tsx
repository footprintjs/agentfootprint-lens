import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwaitingPane } from '../AwaitingPane.js';

afterEach(cleanup);
const RANGE = '2026-11-01T00:00:00Z/2026-11-02T00:00:00Z';
function question() {
  return { requestId: 'same-time-request', question: 'Which time did you mean?', missing: [], fields: [
    { id: 'window', type: 'string', format: 'time-range', required: false,
      enum: [RANGE], labels: ['Offered time'] },
    { id: 'window-correction', type: 'string', required: false, description: 'Correct this reading' },
  ], context: { agentfootprint: { ask: 'arguments', fields: [
    { id: 'window', timeReply: { version: 1, correction: 'window-correction' } },
  ] } } };
}

describe('declared time correction host adoption', () => {
  it('uses the full native request reader and submits exact correction text by its declared field id', async () => {
    const request = question(); const onDecision = vi.fn();
    const timeReplyReader = vi.fn(() => [{ range: 'window', correction: 'window-correction' }]);
    const props = { awaiting: { question: request.question, pauseData: { awaitingInput: request } },
      onDecision, timeReplyReader };
    render(<AwaitingPane {...props} />);
    const input = screen.getByRole('textbox', { name: 'Correct this reading' });
    expect(timeReplyReader).toHaveBeenCalledWith(request);
    fireEvent.change(input, { target: { value: '  yesterday in EST  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledWith({ requestId: request.requestId,
      values: { 'window-correction': '  yesterday in EST  ' } }));
  });
});

describe('time correction lifecycle and ownership', () => {
  const reader = () => [{ range: 'window', correction: 'window-correction' }];
  function propsFor(request: ReturnType<typeof question>, onDecision = vi.fn()) {
    return { awaiting: { question: request.question, pauseData: { awaitingInput: request } },
      onDecision, timeReplyReader: reader };
  }
  it('requires explicit confirmation and preserves opaque enum values when switching channels', async () => {
    const props = propsFor(question()); render(<AwaitingPane {...props} />);
    const answer = screen.getByRole('button', { name: 'Answer' });
    expect((answer as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('option', { name: 'Offered time' })).toBeDefined();
    fireEvent.change(screen.getByRole('combobox', { name: 'window' }), { target: { value: RANGE } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Correct this reading' }), { target: { value: 'no' } });
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: RANGE } });
    expect((screen.getByRole('textbox', { name: 'Correct this reading' }) as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(answer);
    await vi.waitFor(() => expect(props.onDecision).toHaveBeenCalledWith({ requestId: 'same-time-request', values: { window: RANGE } }));
  });
  it('reopens a refused correction under the same native request id and keeps the reason verbatim', async () => {
    const onDecision = vi.fn(); const request = question();
    const view = render(<AwaitingPane {...propsFor(request, onDecision)} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Correct this reading' }), { target: { value: 'no' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    await screen.findByTestId('hitl-decision-record');
    const refused = { ...question(), refused: { answer: { 'window-correction': 'no' }, reason: 'Tell us what time to change.' }, repeat: { count: 1 } };
    view.rerender(<AwaitingPane {...propsFor(refused, onDecision)} />);
    expect(screen.queryByTestId('hitl-decision-record')).toBeNull();
    expect(screen.getByTestId('time-ask-reason').textContent).toBe(refused.refused.reason);
    expect((screen.getByRole('textbox', { name: 'Correct this reading' }) as HTMLTextAreaElement).value).toBe('');
    fireEvent.change(screen.getByRole('textbox', { name: 'Correct this reading' }), { target: { value: 'last 2 hours' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledTimes(2));
    expect(onDecision.mock.calls[1]![0]).toEqual({ requestId: request.requestId, values: { 'window-correction': 'last 2 hours' } });
  });
  it('preserves input when only the outer pause wrapper changes', () => {
    const request = question(); const props = propsFor(request);
    const view = render(<AwaitingPane {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Correct this reading' }), { target: { value: 'kept text' } });
    view.rerender(<AwaitingPane {...propsFor(request, props.onDecision)} />);
    expect((screen.getByRole('textbox', { name: 'Correct this reading' }) as HTMLTextAreaElement).value).toBe('kept text');
  });
  it('does not treat missing reader, no pairs and unreadable binding as the same state', () => {
    const request = question(); const props = propsFor(request);
    const view = render(<AwaitingPane awaiting={props.awaiting} onDecision={props.onDecision} />);
    expect(screen.getByTestId('hitl-answer-box')).toBeDefined();
    view.rerender(<AwaitingPane {...props} timeReplyReader={() => []} />);
    expect(screen.getByTestId('hitl-answer-box')).toBeDefined();
    view.rerender(<AwaitingPane {...props} timeReplyReader={() => { throw Error('private native exception'); }} />);
    expect(screen.getByTestId('time-reply-unavailable')).toBeDefined();
    expect(screen.queryByTestId('hitl-answer-box')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Answer' })).toBeNull();
    expect(document.body.textContent).not.toContain('private native exception');
  });
  it('never claims an asynchronous failed host answer was recorded', async () => {
    const props = propsFor(question(), vi.fn().mockRejectedValue(Error('private host response')));
    render(<AwaitingPane {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Correct this reading' }), { target: { value: 'EST' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));
    await screen.findByText('The host did not confirm this answer. Check its status before retrying.');
    expect(screen.queryByTestId('hitl-decision-record')).toBeNull();
    expect(document.body.textContent).not.toContain('private host response');
    expect((screen.getByRole('button', { name: 'Answer' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('unsafe time metadata stays a named refusal', () => {
  it('does not let the legacy time header bypass a refused enum getter', () => {
    let reads = 0; const request = question(); const choices: string[] = [];
    Object.defineProperty(choices, '0', { enumerable: true, get() { reads++; throw Error('private enum getter'); } });
    request.fields[0]!.enum = choices;
    const props = { awaiting: { question: request.question, pauseData: { awaitingInput: request } },
      onDecision: vi.fn(), timeReplyReader: () => [{ range: 'window', correction: 'window-correction' }] };
    expect(() => render(<AwaitingPane {...props} />)).not.toThrow();
    expect(reads).toBe(0); expect(screen.getByTestId('time-ask-unavailable')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Answer' })).toBeNull();
  });
});

describe('in-place native re-ask revision', () => {
  it('opens a new generation when repeat/refusal changes even if the request object is retained', async () => {
    const request: ReturnType<typeof question> & { repeat?: { count: number }; refused?: { reason: string; answer: Record<string, string> } } = question();
    const onDecision = vi.fn(); const reader = () => [{ range: 'window', correction: 'window-correction' }];
    const props = () => ({ awaiting: { question: request.question, pauseData: { awaitingInput: request } }, onDecision, timeReplyReader: reader });
    const view = render(<AwaitingPane {...props()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Correct this reading' }), { target: { value: 'no' } });
    fireEvent.click(screen.getByRole('button', { name: 'Answer' })); await screen.findByTestId('hitl-decision-record');
    request.refused = { reason: 'Which part should change?', answer: { 'window-correction': 'no' } }; request.repeat = { count: 1 };
    view.rerender(<AwaitingPane {...props()} />);
    expect(screen.queryByTestId('hitl-decision-record')).toBeNull();
    expect(screen.getByTestId('time-ask-reason').textContent).toBe(request.refused.reason);
    expect((screen.getByRole('textbox', { name: 'Correct this reading' }) as HTMLTextAreaElement).value).toBe('');
  });
});
