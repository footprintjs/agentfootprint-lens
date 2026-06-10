/** @vitest-environment jsdom */
/**
 * tailWindow — bounded commentary feed tests (backlog U3).
 *
 * The commentary surfaces are tail-anchored (the focused line is the
 * cutoff — always the last visible row), so bounding them to the
 * newest `MAX_COMMENTARY_LINES` preserves the interaction model.
 * Verifies the pure helper, then the Lens analyst view end-to-end:
 * an over-limit log renders the newest rows plus an EXPLICIT
 * "earlier moments hidden" leader — bounded, never silent.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { tailWindow, MAX_COMMENTARY_LINES } from './tailWindow.js';
import { Lens } from './Lens.js';
import { LensRecorder } from '../core/LensRecorder.js';
import type { AgentfootprintEvent } from 'agentfootprint';

describe('tailWindow — pure helper', () => {
  it('passes short lists through untouched', () => {
    const items = [1, 2, 3];
    expect(tailWindow(items, 5)).toEqual({ hidden: 0, shown: items });
    expect(tailWindow(items, 3)).toEqual({ hidden: 0, shown: items }); // exact fit
  });

  it('keeps the NEWEST max items and reports the cut', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(tailWindow(items, 4)).toEqual({ hidden: 6, shown: [6, 7, 8, 9] });
  });

  it('handles the empty list', () => {
    expect(tailWindow([], 4)).toEqual({ hidden: 0, shown: [] });
  });
});

// ─── Lens analyst view integration ──────────────────────────────

function recorderWithEvents(n: number): LensRecorder {
  // Cap above n — this test is about the RENDER bound, not eviction.
  const rec = new LensRecorder('Run', { maxEvents: Number.POSITIVE_INFINITY });
  for (let i = 0; i < n; i++) {
    const envelope = {
      type: 'agentfootprint.cost.tick',
      payload: { cumulative: { estimatedUsd: 0 } },
      meta: {
        wallClockMs: 1000 + i,
        runOffsetMs: i,
        runtimeStageId: `s#${i}`,
        subflowPath: [],
        compositionPath: [],
        runId: 'test',
      },
    } as unknown as AgentfootprintEvent;
    (rec as unknown as { handleEvent: (e: AgentfootprintEvent) => void }).handleEvent(envelope);
  }
  return rec;
}

describe('Lens analyst commentary — tail-bounded feed (U3)', () => {
  it('renders only the newest MAX_COMMENTARY_LINES with an explicit hidden-count leader', () => {
    const over = 20;
    const total = MAX_COMMENTARY_LINES + over;
    const rec = recorderWithEvents(total);
    const { container } = render(
      <Lens
        recorder={rec}
        view="analyst"
        // Bracket-delimited id so substring checks can't collide
        // (`[s#19]` never matches `[s#190]`).
        humanizer={(e) =>
          `line [${(e as { meta?: { runtimeStageId?: string } }).meta?.runtimeStageId}]`
        }
      />,
    );
    // Honest leader line with the exact cut count.
    expect(container.textContent).toContain(`${over} earlier moments hidden`);
    // Newest entry rendered; the cut-off head is not.
    expect(container.textContent).toContain(`line [s#${total - 1}]`);
    expect(container.textContent).not.toContain(`line [s#${over - 1}]`);
    // First retained row is exactly the window boundary.
    expect(container.textContent).toContain(`line [s#${over}]`);
  });

  it('renders the whole feed with no leader when under the bound', () => {
    const rec = recorderWithEvents(10);
    const { container } = render(
      <Lens recorder={rec} view="analyst" humanizer={() => 'a line'} />,
    );
    expect(container.textContent).not.toContain('earlier moments hidden');
  });
});
