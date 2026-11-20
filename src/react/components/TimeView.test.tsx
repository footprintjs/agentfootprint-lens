import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TimeView } from './TimeView.js';
import * as asks from '../../core/time/timeAsk.js';
import * as times from '../../core/time/timeRows.js';
import * as standings from '../../core/time/timeStanding.js';
import fixture from '../../../test/time/fixtures/time-rows.json';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('projects each visible section once and only re-reads changed inputs', () => {
  const band = vi.spyOn(times, 'foldTimeRows');
  const ask = vi.spyOn(asks, 'timeAskOf');
  const standing = vi.spyOn(standings, 'timeStandingOf');
  const { ledger: rows, coverage } = fixture.controlWindow;
  const assessment = { standing: 'sure', reasons: [] };
  const { rerender } = render(<TimeView rows={rows} coverage={coverage} ask={fixture.ask.first} assessment={assessment} />);
  expect(screen.getByTestId('time-band')).toBeVisible();
  expect(screen.getByTestId('time-ask')).toBeVisible();
  expect(screen.getByTestId('time-standing')).toBeVisible();
  expect.soft(band).toHaveBeenCalledTimes(1);
  expect.soft(ask).toHaveBeenCalledTimes(1);
  expect.soft(standing).toHaveBeenCalledTimes(1);

  rerender(<TimeView rows={rows} coverage={coverage} ask={fixture.ask.reasked} assessment={assessment} />);
  expect(screen.getByTestId('time-ask-refused')).toBeVisible();
  expect(band).toHaveBeenCalledTimes(1);
  expect(ask).toHaveBeenCalledTimes(2);
  expect(standing).toHaveBeenCalledTimes(1);
});
it.each(['accessor', 'budget'])('keeps %s metadata failure visible without throwing a private exception', kind => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const project = vi.spyOn(asks, 'timeAskOf');
  let reads = 0;
  const field = { id: 'range', type: 'string', format: 'time-range', enum: ['value'], labels: ['choice'] };
  if (kind === 'accessor') Object.defineProperty(field.labels, '0', { enumerable: true,
    get() { reads++; throw Error('private label failure'); } });
  else field.labels = ['x'.repeat(4 * 1024 * 1024 + 1)];
  expect(() => render(<TimeView ask={{ requestId: 'question', fields: [field] }} />)).not.toThrow();
  expect(screen.getByTestId('time-ask-unavailable').textContent).toBe('Time question unavailable');
  expect(project).toHaveBeenCalledTimes(1);
  expect(reads).toBe(0); expect(document.body.textContent).not.toContain('private label failure');
});
