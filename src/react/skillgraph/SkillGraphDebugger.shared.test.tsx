/**
 * <SkillGraphDebugger shared> — the debugger on the host's ONE cursor (0.57.0).
 *
 * Test types: Contract (reads the shared address over the run's commit axis;
 * its transport moves the address) · Derivation (snap stops from its own
 * beats over that axis when the host hands none) · Precedence (`cursor` and
 * the scalars still win).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { scrubAxisFor } from '../../core/group/scrubAxisFor.js';
import { stepForRuntimeStageId } from '../../core/group/stepForRuntimeStageId.js';
import { observeRecording, type Recording } from '../../core/observeRecording.js';
import type { LensRecorder } from '../../core/LensRecorder.js';
import { selectSkillBeats } from '../../core/selectors/selectSkillBeats.js';
import { selectSkillRoute } from '../../core/selectors/selectSkillRoute.js';
import { lensCursorFrom } from '../../core/cursor/lensCursor.js';
import { useSharedCursor } from '../useSharedCursor.js';
import { SkillGraphDebugger } from './SkillGraphDebugger.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'core', '__fixtures__');

function recorderFor(file = 'skill-run-pre-950.json'): LensRecorder {
  const recording = JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as Recording;
  return observeRecording(recording).recorder;
}

afterEach(cleanup);

/** A host that owns the cursor and prints its address, like a debug drawer. */
function Host({ recorder }: { readonly recorder: LensRecorder }) {
  const shared = useSharedCursor(recorder);
  return (
    <>
      <span data-testid="address">
        {shared.address === undefined ? '' : `${shared.address.runtimeStageId}@${shared.address.commitIdx}`}
      </span>
      <SkillGraphDebugger recorder={recorder} shared={shared} height={400} />
    </>
  );
}

describe('<SkillGraphDebugger shared>', () => {
  it('opens at the run’s end on the commit axis — nothing later to go to — and its ◀ moves the shared address', () => {
    const recorder = recorderFor();
    const axis = scrubAxisFor(recorder, 'step');
    const beats = selectSkillBeats({ route: selectSkillRoute({ log: recorder.selectEventLog() }) });
    const stops = [...new Set(beats.flatMap((b) => (b.runtimeStageId === undefined ? [] : [stepForRuntimeStageId(axis, b.runtimeStageId)])))]
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    render(<Host recorder={recorder} />);
    expect(screen.getByTestId('address').textContent).toBe('');
    // FACT: with snap stops the transport offers stop buttons only (no fine
    // step buttons), and at the end the forward ones are disabled.
    expect((screen.getByLabelText('Next stop') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Jump to latest') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Previous stop'));
    const earlier = stops.filter((i) => i < axis.length - 1);
    const before = earlier[earlier.length - 1]!;
    const at = axis[before]!;
    expect(screen.getByTestId('address').textContent).toBe(`${at.runtimeStageId}@${at.commitIdx}`);
  });

  it('derives its snap stops from its own beats over that axis when the host hands none', () => {
    const recorder = recorderFor();
    const axis = scrubAxisFor(recorder, 'step');
    const beats = selectSkillBeats({ route: selectSkillRoute({ log: recorder.selectEventLog() }) });
    const expected = new Set<number>();
    for (const b of beats) {
      if (b.runtimeStageId === undefined) continue;
      const at = stepForRuntimeStageId(axis, b.runtimeStageId);
      if (at >= 0) expected.add(at);
    }
    expect(expected.size).toBeGreaterThan(0);
    render(<Host recorder={recorder} />);
    // The stop buttons exist only when the transport was handed snap stops —
    // here derived by the view itself. A ◀ stop lands on one of them.
    fireEvent.click(screen.getByLabelText('Previous stop'));
    const landedAt = [...expected].map((i) => `${axis[i]!.runtimeStageId}@${axis[i]!.commitIdx}`);
    expect(landedAt).toContain(screen.getByTestId('address').textContent);
  });

  it('a recording with no commit log has no axis to read the address on: the beats axis stays, nothing is claimed', () => {
    const recorder = recorderFor('skill-route-refusal.json');
    expect(scrubAxisFor(recorder, 'step')).toHaveLength(0);
    render(<Host recorder={recorder} />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(Number(slider.max)).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByTestId('address').textContent).toBe('');
  });

  it('a `cursor` handed alongside `shared` wins — the transport moves that cursor, the address stays', () => {
    const recorder = recorderFor();
    const axis = scrubAxisFor(recorder, 'step');
    const moved: number[] = [];
    function Both() {
      const shared = useSharedCursor(recorder);
      const own = lensCursorFrom(axis, 5, (n) => moved.push(n));
      return (
        <>
          <span data-testid="address">{shared.address === undefined ? '' : shared.address.runtimeStageId}</span>
          <SkillGraphDebugger recorder={recorder} shared={shared} cursor={own} height={400} />
        </>
      );
    }
    render(<Both />);
    fireEvent.click(screen.getByLabelText('Previous stop'));
    expect(moved.length).toBe(1);
    expect(screen.getByTestId('address').textContent).toBe('');
  });

  it('a skill node click jumps THE cursor: the shared address lands on that skill’s stage', () => {
    const recorder = recorderFor();
    const axis = scrubAxisFor(recorder, 'step');
    render(<Host recorder={recorder} />);
    const nodes = screen.getAllByTestId(/^skill-node-/);
    expect(nodes.length).toBeGreaterThan(0);
    const before = screen.getByTestId('address').textContent;
    for (const node of nodes) {
      fireEvent.click(node);
      if (screen.getByTestId('address').textContent !== before) break;
    }
    const after = screen.getByTestId('address').textContent ?? '';
    expect(after).not.toBe(before);
    const stage = after.split('@')[0];
    expect(axis.some((p) => p.runtimeStageId === stage)).toBe(true);
  });

  it('the scalars still win over `shared` when a host supplies them', () => {
    const recorder = recorderFor();
    function Scalars() {
      const shared = useSharedCursor(recorder);
      return <SkillGraphDebugger recorder={recorder} shared={shared} step={3} totalSteps={40} onStepChange={() => {}} />;
    }
    render(<Scalars />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.max).toBe('39');
    expect(slider.value).toBe('3');
  });
});
