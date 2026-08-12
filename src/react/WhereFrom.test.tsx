/** @vitest-environment jsdom */
/**
 * <WhereFrom> — the "Where did this come from?" section.
 *
 * What is being pinned:
 * 1. Chips render the cursor stage's written keys; frames render the slice
 *    with `← via key` labels; frame click fires onJumpTo (one-cursor rule —
 *    navigation is the HOST's move).
 * 2. onSliceChange reports the active slice as a cone (stage part → depth),
 *    clears when there is nothing to paint, and clears on unmount — the
 *    chart can never keep a stale cone.
 * 3. Honesty rendering: a reads-less snapshot shows the ⚠ line.
 * 4. THE WALK (Same-Rail Rewind): "Walk the causes" freezes the slice as
 *    reverse-time stops and jumps the ONE cursor to the anchor; position
 *    derives from the cursor prop (never a second cursor); a cursor that
 *    leaves the walk gets resume/end, not silence; [Copy story] emits the
 *    frozen footprintjs formatSlice string; End keeps the cursor put.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';

import { WhereFrom } from './WhereFrom.js';

afterEach(cleanup);

/** Stub runner: minimal snapshot with commitLog + executionTree reads. */
function stubRunner() {
  const commitLog = [
    { runtimeStageId: 'seed#0', stageId: 'seed', stage: 'Seed', trace: [{ path: 'input', verb: 'set' }] },
    { runtimeStageId: 'work#1', stageId: 'work', stage: 'Work', trace: [{ path: 'result', verb: 'set' }, { path: 'log', verb: 'set' }] },
  ];
  const executionTree = {
    id: 'seed',
    runtimeStageId: 'seed#0',
    logs: {}, errors: {}, metrics: {}, evals: {},
    next: {
      id: 'work',
      runtimeStageId: 'work#1',
      stageReads: { input: 1 },
      logs: {}, errors: {}, metrics: {}, evals: {},
    },
  };
  return { getLastSnapshot: () => ({ commitLog, executionTree }) };
}

describe('<WhereFrom>', () => {
  it('renders written-key chips and the slice frames with via-labels', () => {
    const { getByText } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'work#1' }),
    );
    getByText('result'); // chip (first key auto-selected)
    getByText('log'); // chip
    getByText('Work'); // anchor frame
    getByText('Seed'); // parent frame (work read input ← seed)
    getByText(/via input/);
  });

  it('frame click fires onJumpTo with the frame runtimeStageId', () => {
    const onJumpTo = vi.fn();
    const { getByText } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'work#1', onJumpTo }),
    );
    fireEvent.click(getByText('Seed'));
    expect(onJumpTo).toHaveBeenCalledWith('seed#0');
  });

  it('onSliceChange reports the cone (stage part → depth) and clears on unmount', () => {
    const onSliceChange = vi.fn();
    const { unmount } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'work#1', onSliceChange }),
    );
    const last = onSliceChange.mock.calls[onSliceChange.mock.calls.length - 1]![0] as Map<string, number>;
    expect(last).toBeInstanceOf(Map);
    expect(last.get('work')).toBe(0);
    expect(last.get('seed')).toBe(1);
    onSliceChange.mockClear();
    unmount();
    expect(onSliceChange).toHaveBeenCalledWith(undefined); // never a stale cone
  });

  it('a lone-anchor slice paints NO cone (an anchor alone is not a cone)', () => {
    const onSliceChange = vi.fn();
    // seed wrote input but read nothing → slicing seed's key gives 1 frame.
    render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'seed#0', onSliceChange }),
    );
    expect(onSliceChange.mock.calls[onSliceChange.mock.calls.length - 1]![0]).toBeUndefined();
  });

  it('renders nothing for cursors without commits', () => {
    const { container } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'ghost#9' }),
    );
    expect(container.innerHTML).toBe('');
  });

  it('WALK: "Walk the causes" freezes stops (reverse time) and jumps the cursor to the anchor', () => {
    const onJumpTo = vi.fn();
    const { getByText } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'work#1', onJumpTo }),
    );
    fireEvent.click(getByText('◀ Walk the causes'));
    expect(onJumpTo).toHaveBeenCalledWith('work#1'); // the anchor is stop 1 (newest first)
    getByText(/stop 1 of 2/);
  });

  it('WALK: "earlier cause" moves the ONE cursor to the previous-in-time stop; ends disable', () => {
    const onJumpTo = vi.fn();
    const { getByText, rerender } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'work#1', onJumpTo }),
    );
    fireEvent.click(getByText('◀ Walk the causes'));
    fireEvent.click(getByText('◀ earlier cause'));
    expect(onJumpTo).toHaveBeenLastCalledWith('seed#0');
    // The HOST moves the cursor; simulate it — the position derives from the prop.
    rerender(createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'seed#0', onJumpTo }));
    getByText(/stop 2 of 2/);
    expect((getByText('◀ earlier cause') as HTMLButtonElement).disabled).toBe(true); // the origin — no invented past
    fireEvent.click(getByText('toward result ▶'));
    expect(onJumpTo).toHaveBeenLastCalledWith('work#1');
  });

  it('WALK: a cursor that leaves the walk gets "resume", never a second position', () => {
    const onJumpTo = vi.fn();
    const commit = (rsid: string, stage: string, path: string) =>
      ({ runtimeStageId: rsid, stageId: stage.toLowerCase(), stage, trace: [{ path, verb: 'set' }] });
    // three stages; `unrelated#2` is OFF the walk of `result`
    const runner = {
      getLastSnapshot: () => ({
        commitLog: [commit('seed#0', 'Seed', 'input'), commit('work#1', 'Work', 'result'), commit('unrelated#2', 'Unrelated', 'noise')],
        executionTree: {
          id: 'seed', runtimeStageId: 'seed#0', logs: {}, errors: {}, metrics: {}, evals: {},
          next: { id: 'work', runtimeStageId: 'work#1', stageReads: { input: 1 }, logs: {}, errors: {}, metrics: {}, evals: {},
            next: { id: 'unrelated', runtimeStageId: 'unrelated#2', logs: {}, errors: {}, metrics: {}, evals: {} } },
        },
      }),
    };
    const { getByText, rerender } = render(
      createElement(WhereFrom, { runner, cursorRuntimeStageId: 'work#1', onJumpTo }),
    );
    fireEvent.click(getByText('◀ Walk the causes'));
    rerender(createElement(WhereFrom, { runner, cursorRuntimeStageId: 'unrelated#2', onJumpTo }));
    getByText(/the cursor left the walk/);
    fireEvent.click(getByText('Resume at stop 1'));
    expect(onJumpTo).toHaveBeenLastCalledWith('work#1');
  });

  it('WALK: [Copy story] writes the frozen formatSlice string; End keeps the cursor', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onJumpTo = vi.fn();
    const { getByText, queryByText } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'work#1', onJumpTo }),
    );
    fireEvent.click(getByText('◀ Walk the causes'));
    fireEvent.click(getByText('Copy story'));
    expect(writeText).toHaveBeenCalledOnce();
    const story = writeText.mock.calls[0][0] as string;
    expect(story).toContain('result'); // the fp formatSlice narrative names the traced key
    const jumps = onJumpTo.mock.calls.length;
    fireEvent.click(getByText('End ✕'));
    expect(queryByText(/Walking/)).toBeNull();
    expect(onJumpTo.mock.calls.length).toBe(jumps); // End never moves the cursor
  });

  it('WALK: the cone stays the FROZEN walk cone while walking', () => {
    const onSliceChange = vi.fn();
    const onJumpTo = vi.fn();
    const { getByText, rerender } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'work#1', onJumpTo, onSliceChange }),
    );
    fireEvent.click(getByText('◀ Walk the causes'));
    rerender(createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'seed#0', onJumpTo, onSliceChange }));
    const last = onSliceChange.mock.calls[onSliceChange.mock.calls.length - 1]![0] as Map<string, number> | undefined;
    expect(last).toBeInstanceOf(Map); // still painting — seed#0 alone would have cleared it
    expect([...last!.keys()].sort()).toEqual(['seed', 'work']);
  });
});