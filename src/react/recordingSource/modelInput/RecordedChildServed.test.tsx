import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CursorAddress } from '../../../core/cursor/sharedCursor.js';
import type { ServedGraphInput } from '../../../core/served/index.js';
import { RecordedChildServed } from './RecordedChildServed.js';

vi.mock('../../components/ServedTab.js', () => ({
  ContextServedTab: ({ reading }: { reading: ServedGraphInput }) => <div>{reading.row.view.system.text}</div>,
}));

const first = ['first#1'];
const second = ['second#2'];
function stop(runtimeStageId: string) {
  return { runtimeStageId, label: 'Call', kind: 'commit' as const, depth: 1, commitIdx: 15 };
}

describe('recorded child Served', () => {
  it('aborts the old read and keeps its late result out of another invocation', async () => {
    const reads: { signal: AbortSignal | undefined; resolve: (value: ServedGraphInput) => void }[] = [];
    const read = vi.fn((_address: CursorAddress, options?: { readonly signal?: AbortSignal }) => new Promise<ServedGraphInput>(resolve => {
      reads.push({ signal: options?.signal, resolve });
    }));
    const view = render(<RecordedChildServed read={read} invocationPath={first} stop={stop('first-call#3')} />);
    expect(screen.getByRole('status').textContent).toContain('Reading model input');
    view.rerender(<RecordedChildServed read={read} invocationPath={second} stop={stop('second-call#4')} />);
    expect(reads[0]?.signal?.aborted).toBe(true);
    const row = (text: string): ServedGraphInput => ({ row: { view: { system: { text } } } } as ServedGraphInput);
    await act(async () => { reads[0]!.resolve(row('First input')); });
    expect(screen.queryByText('First input')).toBeNull();
    await act(async () => { reads[1]!.resolve(row('Second input')); });
    expect(screen.queryByText('Second input')).not.toBeNull();
  });

  it('keeps the unavailable view when the source has no native reader', () => {
    render(<RecordedChildServed invocationPath={first} stop={stop('first-call#3')} />);
    expect(screen.getByRole('status').textContent).toContain('Model-input inspection is unavailable');
  });
});
