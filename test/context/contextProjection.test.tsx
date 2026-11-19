import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { stateAt } from 'foottrace';
import { projectContext } from '../../src/context/index.js';
import { LensRecorder } from '../../src/core/LensRecorder.js';
import { contextAt } from '../../src/core/context/contextAt.js';
import { lensCursorFrom } from '../../src/core/cursor/lensCursor.js';
import { foldCursorOf } from '../../src/core/cursor/foldAt.js';
import { ContextView } from '../../src/react/components/ContextView.js';
import { load, loadTampered, stopsOf } from '../served/helpers.js';

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

  it('does not mix events or grouped positions from another run with the same stage addresses', () => {
    const fixture = load('flat-dynamic-tools');
    const snapshot = { ...fixture.recording.snapshot, runId: 'different-run' };
    const stop = stopsOf(fixture, 'llm-turn')[0]!;
    const cursor = lensCursorFrom(fixture.positions, fixture.positions.indexOf(stop), () => {});
    const explicit = fixture.recorder.getEntries();
    const entries = vi.spyOn(fixture.recorder, 'getEntries');
    const view = render(<ContextView runner={snapshot} cursor={cursor} recorder={fixture.recorder} />);
    expect(screen.queryByTestId('context-why')).toBeNull();
    expect(entries).not.toHaveBeenCalled();
    view.rerender(<ContextView runner={snapshot} cursor={cursor} recorder={fixture.recorder} events={explicit} />);
    expect(screen.getByTestId('context-why')).toBeTruthy();
    view.rerender(<ContextView runner={snapshot} />);
    const ownHeader = screen.getByTestId('context-view').firstElementChild!.textContent;
    view.rerender(<ContextView runner={snapshot} recorder={fixture.recorder} />);
    expect(screen.getByTestId('context-view').firstElementChild!.textContent).toBe(ownHeader);
    view.rerender(<ContextView runner={fixture.snapshot} recorder={fixture.recorder} />);
    expect(screen.getByTestId('context-view').firstElementChild!.textContent).not.toBe(ownHeader);
  });

  it('admits the observed replay snapshot and same-run copies but omits untracked or unidentified evidence', () => {
    const fixture = load('flat-dynamic-tools');
    const stop = stopsOf(fixture, 'llm-turn')[0]!;
    const cursor = lensCursorFrom(fixture.positions, fixture.positions.indexOf(stop), () => {});
    const pane = (snapshot: unknown, recorder: LensRecorder) =>
      <ContextView runner={snapshot} cursor={cursor} recorder={recorder} />;
    const view = render(pane(fixture.snapshot, fixture.recorder));
    expect(screen.getByTestId('context-why')).toBeTruthy();
    view.rerender(pane({ ...fixture.recording.snapshot }, fixture.recorder));
    expect(screen.getByTestId('context-why')).toBeTruthy();
    view.rerender(pane({ ...fixture.recording.snapshot, runId: '' }, fixture.recorder));
    expect(screen.queryByTestId('context-why')).toBeNull();
    const untracked = new LensRecorder();
    const entries = vi.spyOn(untracked, 'getEntries').mockReturnValue(fixture.recorder.getEntries());
    view.rerender(pane(fixture.snapshot, untracked));
    expect(screen.queryByTestId('context-why')).toBeNull();
    expect(entries).not.toHaveBeenCalled();
  });

  it('drops recorder evidence on detach and rebind at a held cursor, including before a queued flush', async () => {
    const a = load('flat-dynamic-tools');
    const b = loadTampered('flat-dynamic-tools', packet => {
      Object.assign(packet.snapshot, { runId: 'another-run' });
    });
    const runnerA = a.recorder.observedRunner()!;
    const cursor = lensCursorFrom(a.positions, a.positions.indexOf(stopsOf(a, 'llm-turn')[0]!), () => {});
    const pane = (runner: unknown) => <ContextView runner={runner} recorder={a.recorder} cursor={cursor} />;
    const view = render(pane(a.snapshot));
    expect(screen.getByTestId('context-why')).toBeTruthy();

    act(() => a.recorder.detach());
    await waitFor(() => expect(screen.queryByTestId('context-why')).toBeNull());
    act(() => { a.recorder.observe(runnerA); });
    await waitFor(() => expect(screen.getByTestId('context-why')).toBeTruthy());

    const runnerB = b.recorder.observedRunner()!;
    act(() => { a.recorder.observe(runnerB); });
    view.rerender(pane(a.snapshot));
    expect(screen.queryByTestId('context-why')).toBeNull();
    view.rerender(pane(b.snapshot));
    expect(screen.queryByTestId('context-why')).toBeNull();
    const priorCount = a.recorder.entryCount;
    const entry = b.recorder.getEntries().find(row => row.runtimeStageId === cursor.at.runtimeStageId)!;
    const replay = b.runner as { emit(event: typeof entry.event): void };
    act(() => replay.emit(entry.event));
    expect(a.recorder.entryCount).toBe(priorCount + 1);
    view.rerender(pane(b.snapshot));
    expect(screen.queryByTestId('context-why')).toBeNull();
    view.rerender(<ContextView runner={b.snapshot} recorder={a.recorder} cursor={cursor} events={[entry]} />);
    expect(screen.getByTestId('context-why')).toBeTruthy();
    view.rerender(pane(b.snapshot));
    expect(screen.queryByTestId('context-why')).toBeNull();

    act(() => {
      a.recorder.clear();
      replay.emit(entry.event);
    });
    await waitFor(() => expect(screen.getByTestId('context-why')).toBeTruthy());
    expect(a.recorder.entryCount).toBe(1);
    view.unmount();
    a.recorder.detach();
  });

  it('reads the observed snapshot once per grouped-axis publication and refreshes without a host render', async () => {
    const fixture = load('flat-dynamic-tools');
    const observed = fixture.recorder.observedRunner()!;
    const getter = vi.spyOn(observed, 'getLastSnapshot');
    render(<ContextView runner={observed} recorder={fixture.recorder} />);
    expect(getter).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('context-transport')).toBeTruthy();
    const base = getter.mock.results[0]!.value!;
    getter.mockReturnValue({ ...base, initialState: { ...base.initialState, publishedKey: 2 } });
    act(() => fixture.recorder.addNote('Snapshot updated'));
    await waitFor(() => expect(screen.getByText('publishedKey')).toBeTruthy());
    expect(getter).toHaveBeenCalledTimes(2);
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
