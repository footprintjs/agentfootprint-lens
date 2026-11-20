/**
 * <ServedTab> derives once per (log, cursor) — not once per render.
 *
 * A LIVE runner hands back a NEW snapshot object on every `getLastSnapshot()`
 * (footprintjs's `getSnapshot` builds one per call), and the Lens re-renders on
 * every recorder event. Keying the derivation on that object would re-run
 * servedRowAt + verify + sincePrevious + the full stateAt fold on every render.
 * The tab keys it on the log instead (run id + commit count), so a render the
 * cursor did not cause re-derives nothing.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

vi.mock('../../src/core/served/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/served/index.js')>();
  return { ...actual, servedGraphAt: vi.fn(actual.servedGraphAt), foldFactsAt: vi.fn(actual.foldFactsAt), servedRowAt: vi.fn(actual.servedRowAt) };
});

vi.mock('../../src/core/served/collapsedTicket.js', { spy: true });
import { collapsedTicketOf } from '../../src/core/served/collapsedTicket.js';
import { foldFactsAt, servedRowAt, servedGraphAt } from '../../src/core/served/index.js';
import { projectContext } from '../../src/core/context/contextAt.js';
import { ContextServedTab, ServedTab } from '../../src/react/components/ServedTab.js';
import { load, stopsOf } from './helpers.js';

const folds = () => vi.mocked(foldFactsAt).mock.calls.length;
const rows = () => vi.mocked(servedRowAt).mock.calls.length;

describe('<ServedTab> — derivation per log and cursor, never per render', () => {
  it('a live-shaped runner (fresh snapshot object per call): identical re-renders derive nothing', () => {
    const f = load('flat-dynamic-tools');
    const base = f.snapshot as Record<string, unknown>;
    let handed = 0;
    // The live shape: a NEW object every call, over the same log.
    const runner = { getLastSnapshot: () => ({ ...base, handed: ++handed }) };
    const stop = stopsOf(f, 'llm-turn')[0]!;
    const at = () => <ServedTab runner={runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />;
    vi.mocked(foldFactsAt).mockClear();
    vi.mocked(servedRowAt).mockClear();
    const { rerender } = render(at());
    expect(folds()).toBe(1);
    rerender(at());
    rerender(at());
    rerender(at());
    expect(handed).toBeGreaterThanOrEqual(4);
    expect(folds()).toBe(1);
    expect(rows()).toBe(1);
  });

  it('reads wire tickets once per stop and builds the graph on its first visit', () => {
    const recording = load('findings-ledger');
    const calls = stopsOf(recording, 'llm-turn');
    const stop = calls[2]!;
    const view = (at = stop) => <ServedTab runner={recording.runner} cursorRuntimeStageId={at.runtimeStageId} commitIdx={at.commitIdx} />;
    vi.mocked(collapsedTicketOf).mockClear();
    vi.mocked(servedGraphAt).mockClear();
    const tab = render(view());
    const ticketReads = vi.mocked(collapsedTicketOf).mock.calls.length;
    expect(ticketReads).toBeGreaterThan(0);
    expect(servedGraphAt).not.toHaveBeenCalled();
    tab.rerender(view());
    fireEvent.click(tab.getByTestId('served-view-graph'));
    fireEvent.click(tab.getByTestId('served-view-list'));
    fireEvent.click(tab.getByTestId('served-view-graph'));
    expect(servedGraphAt).toHaveBeenCalledTimes(1);
    expect(collapsedTicketOf).toHaveBeenCalledTimes(ticketReads);

    tab.rerender(view(recording.positions[0]!));
    expect(tab.getByTestId('served-no-call')).toBeInTheDocument();
    expect(servedGraphAt).toHaveBeenCalledTimes(1);
    tab.rerender(view(calls[0]!));
    expect(tab.getByTestId('served-tab')).toHaveAttribute('data-epoch', '1');
    expect(tab.getByTestId('served-tab')).toHaveAttribute('data-view', 'graph');
    expect(servedGraphAt).toHaveBeenCalledTimes(2);
  });

  it('uses the reading Context already prepared when its graph opens', () => {
    const recording = load('flat-dynamic-tools');
    const at = stopsOf(recording, 'llm-turn')[0]!;
    const reading = projectContext(recording.snapshot, at).served!;
    vi.mocked(servedGraphAt).mockClear();
    vi.mocked(servedRowAt).mockClear();
    vi.mocked(foldFactsAt).mockClear();
    const tab = render(<ContextServedTab snapshot={recording.snapshot} at={at} reading={reading} onJumpTo={() => {}} />);
    expect(servedGraphAt).not.toHaveBeenCalled();
    fireEvent.click(tab.getByTestId('served-view-graph'));
    expect(servedGraphAt).toHaveBeenCalledExactlyOnceWith(reading);
    expect(rows()).toBe(0);
    expect(folds()).toBe(0);
  });

  it('a commit landing on the log (the key moves) derives once more; the cursor moving derives once more', () => {
    const f = load('flat-dynamic-tools');
    const base = f.snapshot as { commitLog: readonly unknown[] } & Record<string, unknown>;
    let log = base.commitLog;
    const runner = { getLastSnapshot: () => ({ ...base, commitLog: log }) };
    const [first, second] = stopsOf(f, 'llm-turn');
    const at = (stop: { runtimeStageId: string; commitIdx: number }) => (
      <ServedTab runner={runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />
    );
    vi.mocked(foldFactsAt).mockClear();
    const { rerender } = render(at(first!));
    expect(folds()).toBe(1);
    log = [...log, log[log.length - 1]!];
    rerender(at(first!));
    expect(folds()).toBe(2);
    rerender(at(first!));
    expect(folds()).toBe(2);
    rerender(at(second!));
    expect(folds()).toBe(3);
  });

  it('a replayed recording (stable snapshot) derives once until the cursor moves', () => {
    const f = load('flat-dynamic-tools');
    const stop = stopsOf(f, 'llm-turn')[1]!;
    const at = () => <ServedTab runner={f.runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />;
    vi.mocked(foldFactsAt).mockClear();
    const { rerender } = render(at());
    rerender(at());
    rerender(at());
    expect(folds()).toBe(1);
  });
});
