import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { openContextRecording, type ContextOpening } from '../core/contextOpening.js';
import { ContextRecordingGate } from './ContextRecordingGate.js';
vi.mock('../core/contextOpening.js', () => ({ openContextRecording: vi.fn() }));
const result = (received: string): ContextOpening => ({ verdict: { ok: false, received, goTo: 'record-the-run' },
  trace: { state: {}, executionTree: null, commitLog: [] } });
const child = (verdict: ContextOpening['verdict']) => <p>{verdict.ok ? 'accepted' : verdict.received}</p>;
describe('context opening lifecycle', () => {
  it('shows pending, ignores stale input results, and renders the current verdict', async () => {
    let first!: (value: ContextOpening) => void; let second!: (value: ContextOpening) => void;
    vi.mocked(openContextRecording).mockReturnValueOnce(new Promise(resolve => { first = resolve; }))
      .mockReturnValueOnce(new Promise(resolve => { second = resolve; }));
    const one = {}; const two = {};
    const view = render(<ContextRecordingGate recording={one}>{child}</ContextRecordingGate>);
    expect(screen.getByRole('status').textContent).toContain('Opening');
    view.rerender(<ContextRecordingGate recording={two}>{child}</ContextRecordingGate>);
    await act(async () => { first(result('stale private words')); });
    expect(screen.queryByText('stale private words')).toBeNull(); expect(screen.getByRole('status')).toBeDefined();
    await act(async () => { second(result('current refusal')); });
    expect(screen.getByText('current refusal')).toBeDefined();
  });
  it('keeps undefined input pending instead of mistaking missing state for its result', () => {
    vi.mocked(openContextRecording).mockReturnValueOnce(new Promise(() => {}));
    render(<ContextRecordingGate recording={undefined}>{child}</ContextRecordingGate>);
    expect(screen.getByRole('status').textContent).toContain('Opening');
  });
  it('uses a fixed refusal for an unexpected chart failure', async () => {
    vi.mocked(openContextRecording).mockRejectedValueOnce(new Error('private words'));
    render(<ContextRecordingGate recording={{}}>{child}</ContextRecordingGate>);
    await screen.findByText('a context recording this read could not open safely');
    expect(document.body.textContent).not.toContain('private words');
  });
});
