/**
 * <Lens> · Bookmarks tab and tag picker, on REAL recordings — the ONE-cursor
 * law under both new surfaces:
 *
 *   · a bookmark jump moves THE lens cursor (the host's `onStepChange` fires
 *     with the step; the strip's readout follows) — the tab holds no position;
 *   · the toggle marks the current stop through the library's own `mark()`;
 *     a remove clears it; a note is kept on the row;
 *   · marks persist: the same store, the same recording, a fresh mount → the
 *     row is back; an orphan (a stop this recording does not hold) is greyed
 *     with "not in this recording"; an unavailable store → a label, no throw;
 *   · the picker rebuilds the axis: picking a tag changes `totalSteps` to the
 *     tag axis's length, the cursor lands on that axis through the funnel,
 *     and the default axis is back when the pick is cleared;
 *   · the picker says "no chart in this recording" when the structure did not
 *     travel, and is absent on the per-step reading.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { Lens, type LensCursorAt } from './index.js';
import { memoryBookmarkStore, noBookmarkStore, toSidecar, bookmarkKey } from '../core/bookmarks/index.js';
import { LABELS as BOOKMARK_LABELS } from './components/BookmarksTab.js';
import { LABELS as TAG_LABELS } from './components/TagPicker.js';
import { load, loadTampered } from '../../test/served/helpers.js';

const openBookmarks = (): void => {
  fireEvent.click(screen.getByTestId('rail-tab-bookmarks'));
};

describe('<Lens> · Bookmarks tab', () => {
  it('ONE cursor: a bookmark jump moves the lens cursor through onStepChange; the tab holds no position', () => {
    const f = load('flat-dynamic-tools');
    const store = memoryBookmarkStore();
    const moves: LensCursorAt[] = [];
    const firstTurn = f.positions.findIndex((p) => p.milestone === 'llm-turn');
    const at = (step: number) => (
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={step}
        onStepChange={(_s, a) => moves.push(a)}
        bookmarkStore={store}
      />
    );
    const { rerender } = render(at(firstTurn));
    openBookmarks();
    expect(screen.getByTestId('bookmarks-tab').dataset.persistence).toBe('saved');
    expect(screen.getByText(BOOKMARK_LABELS.none)).toBeInTheDocument();

    // Mark the current stop — the library named it by its address.
    fireEvent.click(screen.getByTestId('bookmark-toggle'));
    const row = screen.getByTestId('bookmark-row');
    expect(row.dataset.runtimeStageId).toBe(f.positions[firstTurn]!.runtimeStageId);
    expect(row.dataset.current).toBe('true');
    expect(screen.getByTestId('bookmark-toggle')).toHaveAttribute('aria-pressed', 'true');
    // Written to the store, keyed to this run.
    expect(store.get(bookmarkKey(f.snapshot)!)?.bookmarks).toHaveLength(1);

    // The HOST moves the cursor away; the row is no longer current.
    rerender(at(0));
    expect(screen.getByTestId('bookmark-row').dataset.current).toBeUndefined();
    moves.length = 0;
    // Jump: the tab asks the port, the funnel reports, the host lands.
    fireEvent.click(screen.getByLabelText(`${BOOKMARK_LABELS.jump}: ${f.positions[firstTurn]!.label}`));
    expect(moves.map((m) => m.step)).toEqual([firstTurn]);
    // Controlled: nothing moved until the host's `step` does.
    expect(screen.getByTestId('bookmark-row').dataset.current).toBeUndefined();
    rerender(at(firstTurn));
    expect(screen.getByTestId('bookmark-row').dataset.current).toBe('true');

    // A note is the reader's, kept on the row; a remove clears the mark.
    fireEvent.blur(screen.getByLabelText(BOOKMARK_LABELS.note), { target: { value: 'the bad call' } });
    expect(store.get(bookmarkKey(f.snapshot)!)?.bookmarks[0]?.label).toBe('the bad call');
    fireEvent.click(screen.getByLabelText(`${BOOKMARK_LABELS.remove}: ${f.positions[firstTurn]!.label}`));
    expect(screen.queryByTestId('bookmark-row')).toBeNull();
    expect(store.get(bookmarkKey(f.snapshot)!)?.bookmarks).toHaveLength(0);
  });

  it('uncontrolled: the jump moves the strip readout — no second cursor', () => {
    const f = load('flat-dynamic-tools');
    const store = memoryBookmarkStore();
    const last = f.positions.length - 1;
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" bookmarkStore={store} />);
    openBookmarks();
    // At the live edge (Run · end) the toggle is DISABLED: the two root
    // bookends share one synthetic address, and Home / End reach them anyway.
    expect(screen.getByText(new RegExp(`stop ${last + 1} of ${last + 1}$`))).toBeInTheDocument();
    expect(screen.getByTestId('bookmark-toggle')).toBeDisabled();
    // One stop back: mark it, go to the end, jump back — the readout follows.
    fireEvent.click(screen.getByLabelText(/^Previous st(ep|op)$/));
    expect(screen.getByText(new RegExp(`stop ${last} of ${last + 1}$`))).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bookmark-toggle'));
    fireEvent.click(screen.getByLabelText(/^Next st(ep|op)$/));
    expect(screen.getByText(new RegExp(`stop ${last + 1} of ${last + 1}$`))).toBeInTheDocument();
    // The row prints the stop's OWN label (the lens axis's, not the test
    // helper's ordinal), so the jump button is found by its prefix.
    fireEvent.click(within(screen.getByTestId('bookmark-row')).getByRole('button', { name: new RegExp(`^${BOOKMARK_LABELS.jump}: `) }));
    // A mark names an ADDRESS, and the library resolves it to the first stop
    // that holds it (this axis holds `sf-route#43` twice — one stage, two
    // commits — so the jump may land one stop before ◀ did). What is pinned:
    // the cursor left the end and stands on the marked address.
    expect(screen.queryByText(new RegExp(`stop ${last + 1} of ${last + 1}$`))).toBeNull();
    expect(screen.getByTestId('bookmark-row').dataset.current).toBe('true');
    expect(screen.getByTestId('bookmark-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  it('persists: a fresh mount over the same store and recording restores the mark; an orphan is greyed and labelled', () => {
    const f = load('flat-dynamic-tools');
    const store = memoryBookmarkStore();
    const key = bookmarkKey(f.snapshot)!;
    const firstTurn = f.positions.findIndex((p) => p.milestone === 'llm-turn');
    const marked = f.positions[firstTurn]!;
    store.set(
      key,
      toSidecar(key, [
        { runtimeStageId: marked.runtimeStageId, commitIdx: marked.commitIdx, label: 'kept', madeAt: 1 },
        { runtimeStageId: 'ghost#99', commitIdx: 7, label: 'from a longer run', madeAt: 2 },
      ]),
    );
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={0} bookmarkStore={store} />);
    openBookmarks();
    const rows = screen.getAllByTestId('bookmark-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.dataset.runtimeStageId).toBe(marked.runtimeStageId);
    expect(rows[0]!.dataset.orphaned).toBeUndefined();
    expect(screen.getByLabelText(BOOKMARK_LABELS.note)).toHaveValue('kept');
    expect(rows[1]!.dataset.orphaned).toBe('true');
    expect(rows[1]!).toHaveTextContent(BOOKMARK_LABELS.notInRecording);
    // The orphan is never dropped by a write the reader did not ask for.
    fireEvent.click(screen.getByTestId('bookmark-toggle'));
    expect(store.get(key)?.bookmarks.map((b) => b.runtimeStageId)).toContain('ghost#99');
  });

  it('an unavailable store: the label says so, nothing throws, marks still work for the session', () => {
    const f = load('flat-dynamic-tools');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={2} bookmarkStore={noBookmarkStore()} />);
    openBookmarks();
    expect(screen.getByTestId('bookmarks-tab').dataset.persistence).toBe('unavailable');
    expect(screen.getByTestId('bookmark-persistence')).toHaveTextContent(BOOKMARK_LABELS.notSaved);
    fireEvent.click(screen.getByTestId('bookmark-toggle'));
    expect(screen.getByTestId('bookmark-row')).toBeInTheDocument();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('a snapshot with no runId: "no run id", nothing persists', () => {
    const f = loadTampered('flat-dynamic-tools', (r) => {
      delete (r.snapshot as { runId?: unknown }).runId;
    });
    const store = memoryBookmarkStore();
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={2} bookmarkStore={store} />);
    openBookmarks();
    expect(screen.getByTestId('bookmark-persistence')).toHaveTextContent(BOOKMARK_LABELS.noRunId);
    fireEvent.click(screen.getByTestId('bookmark-toggle'));
    expect(store.size).toBe(0);
  });
});

describe('<Lens> · tag legend and picker', () => {
  it('picking a tag rebuilds the axis through the funnel; clearing restores the default axis', () => {
    const f = load('flat-dynamic-tools');
    const moves: LensCursorAt[] = [];
    let step = f.positions.length - 1;
    const at = () => (
      <Lens
        recorder={f.recorder}
        runner={f.runner as never}
        view="engineer"
        granularity="group"
        step={step}
        onStepChange={(s, a) => {
          step = s;
          moves.push(a);
        }}
        bookmarkStore={memoryBookmarkStore()}
      />
    );
    const { rerender } = render(at());
    const picker = screen.getByTestId('tag-picker');
    expect(picker.dataset.source).toBe('structure');
    expect(picker.dataset.available).toBe('true');
    expect(screen.getByTestId('tag-picker-source')).toHaveTextContent(TAG_LABELS.fromChart);
    const turnChip = screen.getByText('LLM turn').closest('button')!;
    expect(turnChip.dataset.tag).toBe('milestone:llm-turn');
    expect(turnChip.dataset.declared).toBe('true');

    fireEvent.click(turnChip);
    rerender(at());
    // The axis is now [start, LLM turn 1, LLM turn 2, end]. THE CURSOR KEEPS
    // ITS COMMIT: from Run · end (the last commit) it is re-seated on the new
    // axis's end through the funnel, and the host hears it as onStepChange.
    expect(step).toBe(3);
    rerender(at());
    expect(screen.getByText(/stop 4 of 4$/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^Previous st(ep|op)$/));
    const turn2 = f.positions.find((p) => p.label === 'LLM turn 2')!;
    expect(moves[moves.length - 1]?.label).toBe('LLM turn 2');
    expect(moves[moves.length - 1]?.commitIdx).toBe(turn2.commitIdx);
    rerender(at());

    fireEvent.click(screen.getByTestId('tag-picker-clear'));
    rerender(at());
    // The default axis is back and the cursor is STILL AT LLM turn 2's commit
    // — step 8 of the default axis, not step 2 (which would be Context 1,
    // thirty commits away, with the host never told).
    const turn2Step = f.positions.indexOf(turn2);
    expect(step).toBe(turn2Step);
    expect(moves[moves.length - 1]?.commitIdx).toBe(turn2.commitIdx);
    rerender(at());
    expect(screen.getByText(new RegExp(`stop ${turn2Step + 1} of ${f.positions.length}$`))).toBeInTheDocument();
    expect(screen.queryByTestId('tag-picker-clear')).toBeNull();

    // And the other direction: from a commit the tag axis has no stop at
    // (Context 1, c4) a pick lands on the nearest PRECEDING stop — the start.
    step = f.positions.findIndex((p) => p.milestone === 'context');
    rerender(at());
    fireEvent.click(screen.getByText('LLM turn').closest('button')!);
    rerender(at());
    expect(step).toBe(0);
    expect(moves[moves.length - 1]?.commitIdx).toBe(f.positions[0]!.commitIdx);
  });

  it('a tag hit only inside mounted subflows: chip disabled, labelled "in subflows", counts root/mount apart', () => {
    const f = load('dynamic-grouped');
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={0} bookmarkStore={memoryBookmarkStore()} />);
    const chip = (name: string) => screen.getByTestId('tag-picker').querySelector(`[data-tag="${name}"]`) as HTMLButtonElement;
    const turn = chip('milestone:llm-turn');
    expect(turn.disabled).toBe(true);
    expect(turn.dataset.rootHits).toBe('0');
    expect(turn.dataset.mountHits).toBe('2');
    expect(turn).toHaveTextContent(TAG_LABELS.inSubflows);
    expect(chip('milestone:slot')).toHaveTextContent(TAG_LABELS.inSubflows);
    // Declared on both levels: pickable, and the count shown is the ROOT one.
    const iteration = chip('milestone:iteration');
    expect(iteration.disabled).toBe(false);
    expect(iteration.dataset.rootHits).toBe('2');
    expect(iteration.dataset.mountHits).toBe('2');
    expect(iteration).toHaveTextContent(/2$/);
  });

  it('no structure in the recording: the legend reads the log and says which', () => {
    const f = loadTampered('flat-dynamic-tools', (r) => {
      delete (r as { structure?: unknown }).structure;
    });
    render(<Lens recorder={f.recorder} view="engineer" granularity="group" step={0} bookmarkStore={memoryBookmarkStore()} />);
    expect(screen.getByTestId('tag-picker').dataset.source).toBe('log');
    expect(screen.getByTestId('tag-picker-no-chart')).toHaveTextContent(TAG_LABELS.noChart);
    expect(screen.getAllByTestId('tag-chip').every((c) => c.dataset.declared === 'false')).toBe(true);
  });

  it('the per-step reading has no picker (its ruler is every commit, byte for byte)', () => {
    const f = load('flat-dynamic-tools');
    render(<Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="step" step={0} bookmarkStore={memoryBookmarkStore()} />);
    expect(screen.queryByTestId('tag-picker')).toBeNull();
  });
});
