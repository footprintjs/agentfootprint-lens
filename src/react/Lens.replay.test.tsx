/**
 * `<Lens>` in front of a RECORDING — what it says when something is missing.
 *
 * Every empty state in Lens was written for the live case, so the person
 * looking at a finished run got told to go start one: "run a sample to see
 * what happened", and — the one a replay consumer actually hits — "No runner
 * attached", which fires precisely when `observeRecording` hands back
 * `runner: undefined` because the recording carried no chart. That reader has
 * no runner to attach; they have a recording that is missing a piece, and the
 * only useful sentence names the piece.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { observeRecording, type Recording } from '../core/observeRecording.js';
import { lensRecorder } from '../core/LensRecorder.js';
import { Lens } from './Lens.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'core', '__fixtures__');

function recording(name: string): Recording {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Recording;
}

/** The same real turn, minus its chart — the shape that used to go silent. */
function withoutChart(): Recording {
  const { blueprint: _dropped, ...rest } = recording('recorded-turn.json') as Recording & {
    blueprint?: unknown;
  };
  return rest;
}

describe('<Lens> over a recording — the chart empty state', () => {
  it('names the missing piece instead of telling you to attach a runner', () => {
    // FAILS ON THE OLD BEHAVIOUR: this rendered "No runner attached — pass the
    // agentfootprint Runner via <Lens runner={runner} />" to someone holding a
    // finished recording, sending them after an object that no longer exists.
    const { recorder, runner, chart } = observeRecording(withoutChart());
    expect(chart).toBe('absent');
    expect(runner).toBeUndefined();

    const { container } = render(<Lens recorder={recorder} view="engineer" />);

    expect(container.textContent).toMatch(/This recording carried no chart/);
    expect(container.textContent).toMatch(/buildTimeStructure/);
    expect(container.textContent).not.toMatch(/No runner attached/);
  });

  it('still says "No runner attached" on the LIVE rail, where that is the fix', () => {
    const { container } = render(<Lens recorder={lensRecorder()} view="engineer" />);

    expect(container.textContent).toMatch(/No runner attached/);
    expect(container.textContent).not.toMatch(/This recording carried no chart/);
  });
});

describe('<Lens> over a recording — the notes strip', () => {
  it('shows what the view cannot honestly draw, without the consumer wiring it', () => {
    // FAILS ON THE OLD BEHAVIOUR: `boundaryRanges === 0` and `eventsSkipped > 0`
    // were return values only — a consumer who forgot to render them (the
    // README's own example made them do it by hand) got a silently degraded
    // view with no indication anything was missing.
    const { recorder, boundaryRanges } = observeRecording(
      recording('recorded-turn-no-boundaries.json'),
    );
    expect(boundaryRanges).toBe(0);

    const { container } = render(<Lens recorder={recorder} view="engineer" />);

    expect(container.textContent).toMatch(/no step boundaries/i);
  });

  it('says nothing at all when there is nothing to say', () => {
    const { recorder, notes } = observeRecording(recording('recorded-turn.json'));
    expect(notes).toEqual([]);

    const { container } = render(<Lens recorder={recorder} view="engineer" />);

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('reaches the analyst view too, not just the engineer one', () => {
    const { recorder } = observeRecording(recording('recorded-turn-no-boundaries.json'));

    const { container } = render(<Lens recorder={recorder} view="analyst" />);

    expect(container.textContent).toMatch(/no step boundaries/i);
  });
});

describe('<Lens> over a recording — the moments rail', () => {
  it('does not tell a finished run to go run a sample', () => {
    // FAILS ON THE OLD BEHAVIOUR: "No moments yet — run a sample to see what
    // happened", in front of a turn that already happened. Since 0.39.0 the
    // per-step reading scrubs the COMMIT axis, so a recording with no
    // boundaries but a full commit log gets a full rail — one moment per
    // executed stage — rather than an apology.
    const { recorder } = observeRecording(recording('recorded-turn-no-boundaries.json'));

    const { container } = render(<Lens recorder={recorder} view="engineer" />);

    expect(container.textContent).toMatch(/drag any dot to scrub/i);
    expect(container.textContent).not.toMatch(/This recording has no moments to walk/);
    expect(container.textContent).not.toMatch(/run a sample to see what happened/);
  });

  it('keeps the live wording on the live rail', () => {
    const { container } = render(<Lens recorder={lensRecorder()} view="engineer" />);

    expect(container.textContent).toMatch(/run a sample to see what happened/);
  });
});
