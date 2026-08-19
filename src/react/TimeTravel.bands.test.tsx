/** @vitest-environment jsdom */
/**
 * TimeTravel — the GROUPED ruler (`bands`), one-cursor law pinned.
 *
 * The law, in this component's terms: the position is `focusSeq` (a STEP,
 * owned by the parent), the active band is DERIVED from which range contains
 * it, and every mover reports a step through `onFocusChange`. This component
 * stores nothing — proved here by driving it ONLY through props and watching
 * the active band follow, and by clicking bands and watching the ONE cursor
 * move (never a band index of its own).
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TimeTravel } from './TimeTravel.js';
import type { StepBand } from '../core/group/stepBands.js';

const BANDS: readonly StepBand[] = [
  { label: 'Run · start', firstStep: 0, lastStep: 0, kind: 'run-start' },
  { label: 'Iteration 1', firstStep: 1, lastStep: 5, kind: 'group' },
  { label: 'Iteration 2', firstStep: 6, lastStep: 10, kind: 'group' },
  { label: 'Run · end', firstStep: 11, lastStep: 11, kind: 'run-end' },
];
const TOTAL = 12;

function bandButtons(): HTMLElement[] {
  return screen.getAllByLabelText(/^Go to /);
}
function activeBandLabel(): string | undefined {
  return bandButtons()
    .find((b) => b.getAttribute('aria-current') === 'step')
    ?.textContent?.trim();
}

afterEach(cleanup);

describe('TimeTravel — grouped ruler', () => {
  it('renders ONE segment per band, labelled — not one tick per step', () => {
    render(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={0} onFocusChange={() => {}} isLive={false} />,
    );
    const labels = bandButtons().map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Run · start', 'Iteration 1', 'Iteration 2', 'Run · end']);
  });

  it('CURSOR IN → BAND DERIVED: the active band follows the focusSeq prop, including mid-band', () => {
    const { rerender } = render(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={0} onFocusChange={() => {}} isLive={false} />,
    );
    expect(activeBandLabel()).toBe('Run · start');
    rerender(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={3} onFocusChange={() => {}} isLive={false} />,
    );
    expect(activeBandLabel()).toBe('Iteration 1');
    rerender(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={6} onFocusChange={() => {}} isLive={false} />,
    );
    expect(activeBandLabel()).toBe('Iteration 2');
  });

  it('BAND CLICK OUT → CURSOR MOVED: clicking a band reports the band’s FIRST STEP', () => {
    const onFocusChange = vi.fn();
    render(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={0} onFocusChange={onFocusChange} isLive={false} />,
    );
    fireEvent.click(screen.getByLabelText('Go to Iteration 2'));
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(onFocusChange).toHaveBeenCalledWith(6);
  });

  it('holds NO band state: a click alone does not move the band — only the prop coming back does', () => {
    const onFocusChange = vi.fn();
    const { rerender } = render(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={0} onFocusChange={onFocusChange} isLive={false} />,
    );
    fireEvent.click(screen.getByLabelText('Go to Iteration 2'));
    // The parent has not moved the cursor yet → the strip must still show the
    // OLD position. A component that jumped here would be holding a second
    // cursor.
    expect(activeBandLabel()).toBe('Run · start');
    rerender(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={6} onFocusChange={onFocusChange} isLive={false} />,
    );
    expect(activeBandLabel()).toBe('Iteration 2');
  });

  it('◀ ▶ move STOP BY STOP even when banded — bands are the grouping, never the unit of movement', () => {
    // FAILS ON THE OLD BEHAVIOUR: ◀ ▶ used to jump whole bands, which made
    // every mid-band stop unreachable by the transport alone.
    const onFocusChange = vi.fn();
    render(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={3} onFocusChange={onFocusChange} isLive={false} />,
    );
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(onFocusChange).toHaveBeenLastCalledWith(4);
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(onFocusChange).toHaveBeenLastCalledWith(2);
  });

  it('▶ alone reaches EVERY stop on a banded axis — the walk-all pin', () => {
    // Drive the component the way a user does: press ▶, feed the reported
    // step back in as the prop (the parent owns the cursor), repeat. Every
    // stop on the axis must be visited exactly once, in order.
    const visited: number[] = [0];
    let focus = 0;
    const onFocusChange = vi.fn((next: number) => {
      visited.push(next);
      focus = next;
    });
    const { rerender } = render(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={focus} onFocusChange={onFocusChange} isLive={false} />,
    );
    for (let presses = 0; presses < TOTAL - 1; presses += 1) {
      fireEvent.click(screen.getByLabelText('Next step'));
      rerender(
        <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={focus} onFocusChange={onFocusChange} isLive={false} />,
      );
    }
    expect(visited).toEqual(Array.from({ length: TOTAL }, (_, i) => i));
    // At the last stop ▶ is disabled — no wrap, no skip.
    expect((screen.getByLabelText('Next step') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the banded readout names the group AND the stop — both truths, one line', () => {
    render(
      <TimeTravel compact bands={BANDS} total={TOTAL} focusSeq={6} onFocusChange={() => {}} isLive={false} />,
    );
    expect(screen.getByText('Iteration 2 · stop 7 of 12')).toBeTruthy();
  });

  it('without bands, the per-step strip is untouched', () => {
    render(<TimeTravel compact total={4} focusSeq={1} onFocusChange={() => {}} isLive={false} />);
    expect(screen.getAllByLabelText(/^Go to step /)).toHaveLength(4);
    expect(screen.getByText('2 / 4')).toBeTruthy();
  });
});
