/**
 * <Lens shared> — the lens on the host's ONE cursor (0.56.0).
 *
 * Test types: Contract (opens where the shared address stands; its own
 * movers move the address) · Law (an axis change re-derives the step and
 * rewrites nothing; a clamped correction never moves the address) ·
 * Integration (navigatorRef lands in the address; a sibling view on the
 * same owner agrees).
 */
import React, { createRef } from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { addressOf } from '../core/cursor/sharedCursor.js';
import { scrubAxisFor } from '../core/group/scrubAxisFor.js';
import { load } from '../../test/served/helpers.js';
import { Lens } from './Lens.js';
import type { LensNavigator } from './useLensNavigator.js';
import { useSharedCursor } from './useSharedCursor.js';

afterEach(cleanup);

/** A host that owns the cursor and prints its address, like a debug drawer. */
function Host({
  granularity,
  fixture,
  navRef,
}: {
  readonly granularity: 'step' | 'group';
  readonly fixture: ReturnType<typeof load>;
  readonly navRef?: React.Ref<LensNavigator>;
}) {
  const shared = useSharedCursor(fixture.recorder);
  return (
    <>
      <span data-testid="address">
        {shared.address === undefined ? '' : `${shared.address.runtimeStageId}@${shared.address.commitIdx}`}
      </span>
      <span data-testid="on-step">{String(shared.forAxis('step').at.step)}</span>
      <span data-testid="on-group">{String(shared.forAxis('group').at.step)}</span>
      <Lens recorder={fixture.recorder} runner={fixture.runner as never} shared={shared} granularity={granularity} navigatorRef={navRef ?? null} />
    </>
  );
}

describe('<Lens shared>', () => {
  it('opens at the run’s end on its own axis and its ◀ moves the shared address', () => {
    const fixture = load('flat-dynamic-tools');
    const step = scrubAxisFor(fixture.recorder, 'step');
    render(<Host granularity="step" fixture={fixture} />);
    expect(screen.getByTestId('address').textContent).toBe('');
    expect(screen.getByTestId('on-step').textContent).toBe(String(step.length - 1));
    fireEvent.click(screen.getByLabelText('Previous step'));
    const before = step[step.length - 2]!;
    expect(screen.getByTestId('address').textContent).toBe(`${before.runtimeStageId}@${before.commitIdx}`);
    expect(screen.getByTestId('on-step').textContent).toBe(String(step.length - 2));
  });

  it('an axis change re-derives the step from the address and rewrites nothing', () => {
    const fixture = load('flat-dynamic-tools');
    const step = scrubAxisFor(fixture.recorder, 'step');
    const group = scrubAxisFor(fixture.recorder, 'group');
    const groupCommits = new Set(group.map((p) => p.commitIdx));
    const k = step.findIndex((p) => !groupCommits.has(p.commitIdx) && p.commitIdx > group[0]!.commitIdx);
    const { rerender } = render(<Host granularity="step" fixture={fixture} />);
    // Walk the commit axis back to a commit the milestone axis does not stop on.
    for (let i = step.length - 1; i > k; i--) fireEvent.click(screen.getByLabelText('Previous step'));
    const at = step[k]!;
    expect(screen.getByTestId('address').textContent).toBe(`${at.runtimeStageId}@${at.commitIdx}`);
    // The lens now draws the milestone axis: the containing stop, address untouched.
    rerender(<Host granularity="group" fixture={fixture} />);
    expect(screen.getByTestId('address').textContent).toBe(`${at.runtimeStageId}@${at.commitIdx}`);
    const onGroup = Number(screen.getByTestId('on-group').textContent);
    expect(group[onGroup]!.commitIdx).toBeLessThan(at.commitIdx);
    // And back: the same commit.
    rerender(<Host granularity="step" fixture={fixture} />);
    expect(screen.getByTestId('on-step').textContent).toBe(String(k));
    expect(screen.getByTestId('address').textContent).toBe(`${at.runtimeStageId}@${at.commitIdx}`);
  });

  it('navigatorRef lands in the shared address, so a sibling on the same owner agrees', () => {
    const fixture = load('flat-dynamic-tools');
    const step = scrubAxisFor(fixture.recorder, 'step');
    const navRef = createRef<LensNavigator>();
    render(<Host granularity="step" fixture={fixture} navRef={navRef} />);
    const target = step[2]!;
    let ok = false;
    act(() => {
      ok = navRef.current!.navigateTo(target.runtimeStageId).ok;
    });
    expect(ok).toBe(true);
    expect(screen.getByTestId('address').textContent).toBe(`${target.runtimeStageId}@${target.commitIdx}`);
    expect(screen.getByTestId('on-step').textContent).toBe('2');
    expect(addressOf(target).commitIdx).toBe(target.commitIdx);
  });
});
