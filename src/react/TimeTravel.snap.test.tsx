/** @vitest-environment jsdom */
/**
 * TimeTravel — SNAP STOPS (`snapSteps`), one-cursor law pinned.
 *
 * The feature in one line: ◀ ▶ and ← → land only on the stops the host
 * permitted, while the axis, the numbers and the cursor all stay the host's.
 *
 * What these tests hold down, in the order they matter:
 *   1. the STRIDE narrows — and only the stride (the track keeps the full axis);
 *   2. a cursor BETWEEN two stops resolves to the one at-or-before AND the
 *      readout discloses that it is between;
 *   3. ABSENT PROP ⇒ byte-identical DOM to today — proved by comparing the
 *      rendered markup with and without the prop, not by eyeballing arms;
 *   4. the keys walk the same stops as the buttons;
 *   5. empty / one-stop / off-axis lists degrade to today's behaviour.
 *
 * As everywhere in this component: it stores nothing. Every test drives it by
 * props alone and watches what leaves through `onFocusChange`.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TimeTravel } from './TimeTravel.js';

/** A 12-step host axis whose hosted view changes at four of the stops. */
const TOTAL = 12;
const SNAPS = [0, 4, 9, 11] as const;

function mount(props: Partial<React.ComponentProps<typeof TimeTravel>> = {}) {
  return render(
    <TimeTravel
      total={TOTAL}
      focusSeq={0}
      onFocusChange={() => {}}
      isLive={false}
      snapSteps={[...SNAPS]}
      {...props}
    />,
  );
}

const back = (): HTMLButtonElement => screen.getByLabelText('Previous stop') as HTMLButtonElement;
const fwd = (): HTMLButtonElement => screen.getByLabelText('Next stop') as HTMLButtonElement;

afterEach(cleanup);

describe('TimeTravel — snap stops narrow the STRIDE', () => {
  it('▶ jumps to the next permitted stop, not the next step', () => {
    // NEUTRALIZE PIN: make `step()` walk raw steps again and this reds —
    // it reports 1 instead of 4.
    const onFocusChange = vi.fn();
    mount({ focusSeq: 0, onFocusChange });
    fireEvent.click(fwd());
    expect(onFocusChange).toHaveBeenCalledTimes(1);
    expect(onFocusChange).toHaveBeenCalledWith(4);
  });

  it('◀ jumps to the previous permitted stop, not the previous step', () => {
    // NEUTRALIZE PIN: raw stepping reports 8 instead of 4.
    const onFocusChange = vi.fn();
    mount({ focusSeq: 9, onFocusChange });
    fireEvent.click(back());
    expect(onFocusChange).toHaveBeenCalledWith(4);
  });

  it('▶ alone reaches EVERY permitted stop, in order, and stops at the last', () => {
    // Driven the way a user drives it: press, feed the reported step back in
    // as the prop (the parent owns the cursor), repeat.
    const visited: number[] = [0];
    let focus = 0;
    const onFocusChange = vi.fn((next: number) => {
      visited.push(next);
      focus = next;
    });
    const { rerender } = mount({ focusSeq: focus, onFocusChange });
    for (let presses = 0; presses < SNAPS.length - 1; presses += 1) {
      fireEvent.click(fwd());
      rerender(
        <TimeTravel
          total={TOTAL}
          focusSeq={focus}
          onFocusChange={onFocusChange}
          isLive={false}
          snapSteps={[...SNAPS]}
        />,
      );
    }
    expect(visited).toEqual([...SNAPS]);
    expect(fwd().disabled).toBe(true);
  });

  it('holds NO position: a press alone moves nothing — only the prop coming back does', () => {
    const onFocusChange = vi.fn();
    const { rerender } = mount({ focusSeq: 0, onFocusChange });
    fireEvent.click(fwd());
    expect(screen.getByText('stop 1 of 4 · 1 / 12')).toBeTruthy();
    rerender(
      <TimeTravel
        total={TOTAL}
        focusSeq={4}
        onFocusChange={onFocusChange}
        isLive={false}
        snapSteps={[...SNAPS]}
      />,
    );
    expect(screen.getByText('stop 2 of 4 · 5 / 12')).toBeTruthy();
  });

  it('does not wrap at either end — the buttons disable instead', () => {
    const { rerender } = mount({ focusSeq: 0 });
    expect(back().disabled).toBe(true);
    expect(fwd().disabled).toBe(false);
    rerender(
      <TimeTravel
        total={TOTAL}
        focusSeq={11}
        onFocusChange={() => {}}
        isLive={false}
        snapSteps={[...SNAPS]}
      />,
    );
    expect(fwd().disabled).toBe(true);
    expect(back().disabled).toBe(false);
  });

  it('the drag track still carries the FULL axis — snapping narrows the stride, not the reach', () => {
    const onFocusChange = vi.fn();
    mount({ focusSeq: 0, onFocusChange });
    const track = screen.getByRole('slider') as HTMLInputElement;
    expect(track.max).toBe(String(TOTAL - 1));
    // A position no stop covers is still reachable by dragging.
    fireEvent.change(track, { target: { value: '7' } });
    expect(onFocusChange).toHaveBeenCalledWith(7);
  });
});

describe('TimeTravel — a cursor BETWEEN stops', () => {
  it('resolves to the stop AT-OR-BEFORE and DISCLOSES that it is between', () => {
    // NEUTRALIZE PIN: a readout that rounded down silently would print
    // "stop 2 of 4" here and this reds.
    mount({ focusSeq: 7 });
    expect(screen.getByText('between stops 2 and 3 of 4 · 8 / 12')).toBeTruthy();
  });

  it('◀ from between walks back onto the stop it is standing past', () => {
    const onFocusChange = vi.fn();
    mount({ focusSeq: 7, onFocusChange });
    fireEvent.click(back());
    expect(onFocusChange).toHaveBeenCalledWith(4);
  });

  it('▶ from between walks on to the next stop, never back', () => {
    const onFocusChange = vi.fn();
    mount({ focusSeq: 7, onFocusChange });
    fireEvent.click(fwd());
    expect(onFocusChange).toHaveBeenCalledWith(9);
  });

  it('BEFORE the first stop is its own reading, not "stop 1"', () => {
    mount({ focusSeq: 2, snapSteps: [4, 9] });
    expect(screen.getByText('before stop 1 · 3 / 12')).toBeTruthy();
    expect(back().disabled).toBe(true);
  });

  it('PAST the last stop is its own reading too', () => {
    mount({ focusSeq: 10, snapSteps: [0, 4, 9] });
    expect(screen.getByText('past stop 3 of 3 · 11 / 12')).toBeTruthy();
    expect(fwd().disabled).toBe(true);
  });

  it('ON a stop says so plainly, with the host step beside it', () => {
    mount({ focusSeq: 9 });
    expect(screen.getByText('stop 3 of 4 · 10 / 12')).toBeTruthy();
  });
});

describe('TimeTravel — the keys walk the same stops as the buttons', () => {
  it('← → move stop to stop', () => {
    const onFocusChange = vi.fn();
    mount({ focusSeq: 4, onFocusChange, keyboard: true });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onFocusChange).toHaveBeenLastCalledWith(9);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onFocusChange).toHaveBeenLastCalledWith(0);
  });

  it('Home / End stay AXIS endpoints — they are jumps, not steps', () => {
    // Deliberate: a jump is how every position off the stop list stays
    // reachable from the keyboard, exactly as a band click or a drag is.
    const onFocusChange = vi.fn();
    mount({ focusSeq: 4, onFocusChange, snapSteps: [4, 9], keyboard: true });
    fireEvent.keyDown(window, { key: 'Home' });
    expect(onFocusChange).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(window, { key: 'End' });
    expect(onFocusChange).toHaveBeenLastCalledWith(TOTAL - 1);
  });

  it('keyboard={false} still means this transport owns no keys', () => {
    const onFocusChange = vi.fn();
    mount({ focusSeq: 4, onFocusChange, keyboard: false });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onFocusChange).not.toHaveBeenCalled();
  });
});

describe('TimeTravel — absent / empty / off-axis: today, byte for byte', () => {
  /** The rendered markup, for a direct comparison of two prop sets. */
  function markup(props: Partial<React.ComponentProps<typeof TimeTravel>>): string {
    const { container, unmount } = render(
      <TimeTravel total={TOTAL} focusSeq={5} onFocusChange={() => {}} isLive={false} {...props} />,
    );
    const html = container.innerHTML;
    unmount();
    return html;
  }

  it('NO snapSteps renders exactly what it rendered before the feature existed', () => {
    // The byte-identity proof, stated as an equality rather than as a list of
    // arms someone has to keep in sync: the same component with the prop
    // omitted and with it explicitly `undefined` must produce identical DOM.
    expect(markup({})).toBe(markup({ snapSteps: undefined }));
    // …and that DOM is today's: raw stepping, today's labels, today's readout.
    const onFocusChange = vi.fn();
    render(
      <TimeTravel total={TOTAL} focusSeq={5} onFocusChange={onFocusChange} isLive={false} />,
    );
    expect(screen.getByText('6 / 12')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(onFocusChange).toHaveBeenCalledWith(6);
  });

  it('an EMPTY list is the same as passing nothing — never a dead transport', () => {
    expect(markup({ snapSteps: [] })).toBe(markup({}));
    const onFocusChange = vi.fn();
    render(
      <TimeTravel
        total={TOTAL}
        focusSeq={5}
        onFocusChange={onFocusChange}
        isLive={false}
        snapSteps={[]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(onFocusChange).toHaveBeenCalledWith(6);
  });

  it('a list the axis cannot hold is the same as passing nothing', () => {
    // A stop off the axis is not a stop. Dropping them (rather than clamping)
    // is what keeps ▶ from reporting the same position forever.
    expect(markup({ snapSteps: [-3, 99, 1.5] })).toBe(markup({}));
  });

  it('an off-axis entry beside real ones is dropped, and the rest still walk', () => {
    const onFocusChange = vi.fn();
    render(
      <TimeTravel
        total={TOTAL}
        focusSeq={0}
        onFocusChange={onFocusChange}
        isLive={false}
        snapSteps={[0, 4, 99]}
      />,
    );
    expect(screen.getByText('stop 1 of 2 · 1 / 12')).toBeTruthy();
    fireEvent.click(fwd());
    expect(onFocusChange).toHaveBeenCalledWith(4);
  });

  it('a ONE-STOP list can be arrived at and never stepped along', () => {
    const { rerender } = render(
      <TimeTravel
        total={TOTAL}
        focusSeq={0}
        onFocusChange={() => {}}
        isLive={false}
        snapSteps={[4]}
      />,
    );
    expect(fwd().disabled).toBe(false);
    expect(back().disabled).toBe(true);
    rerender(
      <TimeTravel
        total={TOTAL}
        focusSeq={4}
        onFocusChange={() => {}}
        isLive={false}
        snapSteps={[4]}
      />,
    );
    expect(screen.getByText('stop 1 of 1 · 5 / 12')).toBeTruthy();
    expect(fwd().disabled).toBe(true);
    expect(back().disabled).toBe(true);
  });
});

describe('TimeTravel — snaps and bands are orthogonal', () => {
  const BANDS = [
    { label: 'Iteration 1', firstStep: 0, lastStep: 5, kind: 'group' },
    { label: 'Iteration 2', firstStep: 6, lastStep: 11, kind: 'group' },
  ] as const;

  it('bands GROUP, snaps MOVE — the readout carries the band, the stop and the raw step', () => {
    render(
      <TimeTravel
        compact
        bands={[...BANDS]}
        snapSteps={[...SNAPS]}
        total={TOTAL}
        focusSeq={9}
        onFocusChange={() => {}}
        isLive={false}
      />,
    );
    expect(screen.getByText('Iteration 2 · stop 3 of 4 · 10 / 12')).toBeTruthy();
  });

  it('bands WITHOUT snaps still move stop by stop — the older law is untouched', () => {
    const onFocusChange = vi.fn();
    render(
      <TimeTravel
        compact
        bands={[...BANDS]}
        total={TOTAL}
        focusSeq={3}
        onFocusChange={onFocusChange}
        isLive={false}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(onFocusChange).toHaveBeenLastCalledWith(4);
  });
});
