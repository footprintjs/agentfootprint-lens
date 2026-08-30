/** @vitest-environment jsdom */
/**
 * <SkillGraphDebugger> — SNAP STOPS forwarded to the shipped transport.
 *
 * THE NEED, from a real consumer: this view shares the host's axis, which is
 * the RUN's. A four-tool turn puts dozens of stops on it while the routing
 * picture changes at a handful, so ◀ ▶ walk framework stages that change
 * nothing here — dead air. `snapSteps` narrows where the step buttons land
 * without giving this view an axis, numbers or a cursor of its own.
 *
 * What is proved here is the WIRING and its one rule (host axis only) — the
 * movement arithmetic is pinned in `core/group/snapSteps.test.ts` and the
 * transport's behaviour in `react/TimeTravel.snap.test.tsx`.
 *
 * Over the real fixture, like the rest of this folder.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { observeRecording, type Recording } from '../../core/observeRecording.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import { SkillGraphDebugger } from './SkillGraphDebugger.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', '__fixtures__');
const AT_ENTRY = 'sf-injection-engine/evaluate#3';

function recorderFor(file = 'skill-route-refusal.json'): LensRecorder {
  const recording = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Recording;
  return observeRecording(recording).recorder;
}

/** A host axis far coarser than the routing picture — the consumer's case. */
const TOTAL_STEPS = 40;
const SNAPS = [0, 11, 23, 37];

afterEach(cleanup);

describe('<SkillGraphDebugger> — snapSteps on the host axis', () => {
  it('◀ ▶ walk the SNAP STOPS and report them on the HOST\'s axis', () => {
    // NEUTRALIZE PIN: with the forward removed (or the transport stepping raw
    // steps again) this reports 12, not 23.
    const onStepChange = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        step={11}
        totalSteps={TOTAL_STEPS}
        onStepChange={onStepChange}
        snapSteps={SNAPS}
        height={600}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next stop'));
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange).toHaveBeenCalledWith(23);

    fireEvent.click(screen.getByLabelText('Previous stop'));
    expect(onStepChange).toHaveBeenLastCalledWith(0);
  });

  it('a host step BETWEEN two stops is disclosed, not rounded down', () => {
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        step={15}
        totalSteps={TOTAL_STEPS}
        onStepChange={() => {}}
        snapSteps={SNAPS}
        height={600}
      />,
    );
    expect(screen.getByText('between stops 2 and 3 of 4 · 16 / 40')).toBeTruthy();
  });

  it('the axis stays the host\'s — the readout still counts the run\'s steps', () => {
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        step={23}
        totalSteps={TOTAL_STEPS}
        onStepChange={() => {}}
        snapSteps={SNAPS}
        height={600}
      />,
    );
    // "stop 3 of 4" is the stride; "24 / 40" is the host's own number, still
    // the thing that leaves through onStepChange. Both, always.
    expect(screen.getByText('stop 3 of 4 · 24 / 40')).toBeTruthy();
    expect((screen.getByRole('slider') as HTMLInputElement).max).toBe('39');
  });

  it('IGNORED without a host axis: this view\'s own routing stops all matter', () => {
    // Standing alone, the transport already scrubs the beats — every one of
    // which changes the picture. Narrowing that would hide routing stops.
    const onJumpTo = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        onJumpTo={onJumpTo}
        snapSteps={SNAPS}
        height={600}
      />,
    );
    // The buttons kept their step-walking identity — no snapping was wired.
    expect(screen.getByLabelText('Next step')).toBeTruthy();
    expect(screen.queryByLabelText('Next stop')).toBeNull();
  });

  it('ABSENT prop: the host axis behaves exactly as it did before', () => {
    const onStepChange = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        step={11}
        totalSteps={TOTAL_STEPS}
        onStepChange={onStepChange}
        height={600}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next step'));
    expect(onStepChange).toHaveBeenCalledWith(12);
    expect(screen.getByText('12 / 40')).toBeTruthy();
  });

  it('moves the ONE cursor and nothing else — a press changes no local position', () => {
    const onStepChange = vi.fn();
    render(
      <SkillGraphDebugger
        recorder={recorderFor()}
        cursorRuntimeStageId={AT_ENTRY}
        step={11}
        totalSteps={TOTAL_STEPS}
        onStepChange={onStepChange}
        snapSteps={SNAPS}
        height={600}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next stop'));
    // The host has not moved the cursor yet, so the readout must not have
    // moved either. A view that jumped here would be holding a second cursor.
    expect(screen.getByText('stop 2 of 4 · 12 / 40')).toBeTruthy();
  });
});
