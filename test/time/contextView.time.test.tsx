/** @vitest-environment jsdom */
/**
 * <ContextView> mounts the Time band off the fold at the cursor: over a REAL
 * recording of an armed run (test/time/fixtures/time-recording.json), the
 * band is absent at the first stop — no time row has landed yet (omit, never
 * deny) — at the first Inputs stop it holds the call's window and no dispatch
 * yet, and at the last stop it draws exactly the rows the fold holds there,
 * read off the same `contextAt` the key table lists.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { contextAt } from '../../src/core/context/contextAt.js';
import { observeRecording } from '../../src/core/observeRecording.js';
import { tagAxisPositions } from '../../src/core/tags/tagAxis.js';
import { foldTimeRows } from '../../src/core/time/timeRows.js';
import { ContextView, MILESTONE_AXIS } from '../../src/react/components/ContextView.js';

afterEach(cleanup);

const here = dirname(fileURLToPath(import.meta.url));

function load() {
  const recording = JSON.parse(readFileSync(join(here, 'fixtures', 'time-recording.json'), 'utf8'));
  const { runner } = observeRecording(recording);
  const snapshot = (runner as { getLastSnapshot?: () => unknown }).getLastSnapshot?.() ?? recording.snapshot;
  return { runner, snapshot };
}

describe('<ContextView> — the Time band under the Findings band', () => {
  it('absent before the first time row, drawn from the fold at the last stop', () => {
    const { runner, snapshot } = load();
    const positions = tagAxisPositions(snapshot, MILESTONE_AXIS, [])!;
    expect(positions.length).toBeGreaterThan(1);
    render(<ContextView runner={runner} />);
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe('0');
    const ledgerAt = (step: number) =>
      contextAt(snapshot, positions[step]!, {}).keys.find((k) => k.path === 'findingsLedger')?.value;
    expect(ledgerAt(0)).toBeUndefined();
    expect(screen.queryByTestId('time-band')).toBeNull();

    // The first Inputs stop: the call's window is decided, the call has not run.
    const inputs = positions.findIndex((p) => p.label.startsWith('Inputs'));
    expect(inputs).toBeGreaterThan(0);
    for (let i = 0; i < inputs; i++) fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getAllByTestId('time-call')).toHaveLength(1);
    expect(screen.getByTestId('time-call')).toHaveAttribute('data-how', 'filled');
    expect(screen.queryByTestId('time-dispatched-at')).toBeNull();
    expect(screen.queryByTestId('time-period')).toBeNull();

    const last = positions.length - 1;
    for (let i = inputs; i < last; i++) fireEvent.click(screen.getByLabelText('Next step'));
    expect(screen.getByTestId('context-view').getAttribute('data-step')).toBe(String(last));
    const fold = foldTimeRows(ledgerAt(last) as unknown[]);
    expect(fold).toBeDefined();
    const band = screen.getByTestId('time-band');
    expect(band.getAttribute('data-rows')).toBe(String(fold!.rows));
    expect(screen.getAllByTestId('time-call')).toHaveLength(fold!.turns.flatMap((t) => t.calls).length);
    expect(screen.getByTestId('time-clock')).toBeInTheDocument();
    // The period the result declared, joined from `coverageDeclared` at the same stop.
    expect(screen.getAllByTestId('time-period').map((el) => el.getAttribute('data-verdict'))).toEqual([
      'covered',
      'unknown',
    ]);
  });
});
