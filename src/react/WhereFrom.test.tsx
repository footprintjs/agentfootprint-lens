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
    const last = onSliceChange.mock.calls.at(-1)![0] as Map<string, number>;
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
    expect(onSliceChange.mock.calls.at(-1)![0]).toBeUndefined();
  });

  it('renders nothing for cursors without commits', () => {
    const { container } = render(
      createElement(WhereFrom, { runner: stubRunner(), cursorRuntimeStageId: 'ghost#9' }),
    );
    expect(container.innerHTML).toBe('');
  });
});
