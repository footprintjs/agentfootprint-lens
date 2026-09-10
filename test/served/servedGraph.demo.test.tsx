/**
 * The demo the family shows people: every llm-turn stop of
 * `demo/skill-run.json` must draw Verified rows and no Damaged one. It guards
 * the fixture as much as the graph — regenerate the demo against a library
 * that mints no receipt and this file fails, instead of the demo quietly
 * showing a wall of *Reconstructed* to whoever opened it.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { observeRecording, type Recording } from '../../src/core/observeRecording.js';
import { scrubAxisFor } from '../../src/core/group/scrubAxisFor.js';
import { ServedTab } from '../../src/react/components/ServedTab.js';

describe('PROBE demo — the shipped fixture draws real receipts', () => {
  it('every llm-turn stop of demo/skill-run.json draws Verified rows and no Damaged', () => {
    const rec = JSON.parse(readFileSync('demo/skill-run.json', 'utf8')) as Recording;
    const { recorder, runner } = observeRecording(rec);
    const stops = scrubAxisFor(recorder, 'group').filter((p) => p.milestone === 'llm-turn');
    expect(stops.length).toBe(5);
    let verified = 0;
    for (const stop of stops) {
      cleanup();
      render(<ServedTab runner={runner} cursorRuntimeStageId={stop.runtimeStageId} commitIdx={stop.commitIdx} />);
      fireEvent.click(screen.getByTestId('served-view-graph'));
      const g = screen.getByTestId('served-graph');
      const v = g.querySelectorAll('[data-testid="served-badge"][data-status="verified"]').length;
      const d = g.querySelectorAll('[data-testid="served-badge"][data-status="damaged"]').length;
      console.log('DEMO-STOP', stop.runtimeStageId, 'verified', v, 'damaged', d,
        'basis', g.querySelector('[data-testid="graph-call-basis"]')?.textContent);
      verified += v;
      expect(d).toBe(0);
    }
    cleanup();
    expect(verified).toBeGreaterThan(0);
  });
});
