import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { stateAt } from 'foottrace';
import { projectContext } from '../../src/context/index.js';
import { contextAt } from '../../src/core/context/contextAt.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { foldCursorOf } from '../../src/core/cursor/foldAt.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import { load, stopsOf } from '../served/helpers.js';

vi.mock('foottrace', async importOriginal => {
  const api = await importOriginal<typeof import('foottrace')>();
  return { ...api, stateAt: vi.fn(api.stateAt) };
});

describe('Context projection', () => {
  it('uses the fold anchor for the opening bookend and preserves an absent receipt and ledger', () => {
    const snapshot = { initialState: { seeded: 1 }, commitLog: [] };
    const at = { runtimeStageId: '__root__#0', commitIdx: 0, foldCommitIdx: -1 };
    const model = projectContext(snapshot, at);
    expect(model).toEqual(contextAt(snapshot, foldCursorOf(at)));
    expect(model.keys[0]).toMatchObject({ path: 'seeded', value: 1 });
    expect(model.served).toBeUndefined();
    expect(model.ledger).toBeUndefined();
  });

  it('folds once for both the keys and the mounted Served pane, including its graph view', () => {
    const fixture = load('flat-dynamic-tools');
    const stop = stopsOf(fixture, 'llm-turn')[0]!;
    const cursor = lensCursorFrom(fixture.positions, fixture.positions.indexOf(stop), () => {});
    vi.mocked(stateAt).mockClear();
    render(<ContextView runner={fixture.snapshot} cursor={cursor} previous={foldCursorOf(cursor.at)} />);
    expect(screen.getByTestId('context-served')).toBeTruthy();
    expect(vi.mocked(stateAt)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('served-view-graph'));
    expect(screen.getByTestId('served-graph')).toBeTruthy();
    fireEvent.click(screen.getByTestId('context-mode-json'));
    expect(vi.mocked(stateAt)).toHaveBeenCalledTimes(1);
  });

  it('reuses fresh runner wrappers and refreshes a growing log on the next host render', () => {
    const fixture = load('flat-dynamic-tools');
    const snapshot = fixture.recording.snapshot!;
    const fullLog = snapshot.commitLog!;
    const log = [...fullLog.slice(0, 1)];
    const runner = { getLastSnapshot: () => ({ ...snapshot, commitLog: log }) };
    const cursor = lensCursorFrom(fixture.positions, 0, () => {});
    vi.mocked(stateAt).mockClear();
    const view = render(<ContextView runner={runner} cursor={cursor} />);
    const reads = vi.mocked(stateAt).mock.calls.length;
    fireEvent.click(screen.getByTestId('context-mode-json'));
    expect(vi.mocked(stateAt)).toHaveBeenCalledTimes(reads);
    log.push(fullLog[1]!);
    view.rerender(<ContextView runner={runner} cursor={cursor} />);
    expect(vi.mocked(stateAt)).toHaveBeenCalledTimes(reads + 1);
  });

  it('preserves ledger enrichment supplied by the recording at the fold anchor', () => {
    const initialState = {
      findingsLedger: [{ id: 'check' }],
      toolResults: [{ kind: 'finding' }],
      coverageDeclared: [{ axis: 'time' }],
    };
    const cursor = { runtimeStageId: '__root__#0', commitIdx: -1 };
    const model = projectContext({ initialState, commitLog: [] }, cursor, { previous: cursor });
    expect(model.ledger).toEqual({
      rows: initialState.findingsLedger, since: 'unchanged',
      toolResults: initialState.toolResults, coverage: initialState.coverageDeclared,
    });
  });

  it('batches recorder reads, scrubs immediately, and cancels pending work on unmount', () => {
    const fixture = load('flat-dynamic-tools');
    const entries = vi.spyOn(fixture.recorder, 'getEntries');
    const frames = new Map<number, FrameRequestCallback>();
    let frame = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.set(++frame, cb);
      return frame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const pane = (step: number) => (
      <React.StrictMode>
        <ContextView runner={fixture.runner} recorder={fixture.recorder}
          cursor={lensCursorFrom(fixture.positions, step, () => {})} />
      </React.StrictMode>
    );
    try {
      const view = render(pane(0));
      const initialReads = entries.mock.calls.length;
      act(() => {
        fixture.recorder.clear();
        fixture.recorder.clear();
        fixture.recorder.clear();
      });
      expect(frames.size).toBe(1);
      expect(entries).toHaveBeenCalledTimes(initialReads);
      view.rerender(pane(1));
      expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe('1');
      expect(entries).toHaveBeenCalledTimes(initialReads);
      const pending = frames.get(frame)!;
      frames.delete(frame);
      act(() => pending(0));
      expect(entries).toHaveBeenCalledTimes(initialReads + 1);
      act(() => fixture.recorder.clear());
      const stale = frames.get(frame)!;
      view.unmount();
      expect(frames.size).toBe(0);
      act(() => stale(0));
      expect(entries).toHaveBeenCalledTimes(initialReads + 1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('updates the comparison when only the host’s previous stop changes', () => {
    const fixture = load('flat-dynamic-tools');
    const stop = stopsOf(fixture, 'llm-turn')[0]!;
    const cursor = lensCursorFrom(fixture.positions, fixture.positions.indexOf(stop), () => {});
    const view = render(<ContextView runner={fixture.snapshot} cursor={cursor} />);
    const since = () => screen.getAllByTestId('context-key').map(row => row.getAttribute('data-since'));
    expect(since().every(value => value === '')).toBe(true);
    view.rerender(<ContextView runner={fixture.snapshot} cursor={cursor} previous={foldCursorOf(cursor.at)} />);
    expect(since().every(value => value === 'unchanged')).toBe(true);
  });

  it('refreshes a same-length live snapshot and event evidence, and honors explicitly supplied events', async () => {
    const fixture = load('flat-dynamic-tools');
    const stop = stopsOf(fixture, 'llm-turn')[0]!;
    const cursor = lensCursorFrom(fixture.positions, fixture.positions.indexOf(stop), () => {});
    const base = fixture.snapshot as { initialState?: Record<string, unknown> };
    let value = 'before-revision';
    const runner = { getLastSnapshot: () => ({ ...base, initialState: { ...base.initialState, liveOnly: value } }) };
    const { rerender } = render(<ContextView runner={runner} recorder={fixture.recorder} cursor={cursor} />);
    expect(screen.getByText('liveOnly')).toBeTruthy();
    expect(screen.getByText('"before-revision"')).toBeTruthy();
    expect(screen.getByTestId('context-why')).toBeTruthy();
    rerender(<ContextView runner={runner} recorder={fixture.recorder} cursor={cursor} events={[]} />);
    expect(screen.queryByTestId('context-why')).toBeNull();
    value = 'after-revision';
    act(() => fixture.recorder.clear());
    await waitFor(() => expect(screen.getByText('"after-revision"')).toBeTruthy());
  });
});
