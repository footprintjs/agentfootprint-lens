import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TimeView } from './TimeView.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it.each(['accessor', 'budget'])('keeps %s metadata failure visible without throwing a private exception', kind => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let reads = 0;
  const field = { id: 'range', type: 'string', format: 'time-range', enum: ['value'], labels: ['choice'] };
  if (kind === 'accessor') Object.defineProperty(field.labels, '0', { enumerable: true,
    get() { reads++; throw Error('private label failure'); } });
  else field.labels = ['x'.repeat(4 * 1024 * 1024 + 1)];
  expect(() => render(<TimeView ask={{ requestId: 'question', fields: [field] }} />)).not.toThrow();
  expect(screen.getByTestId('time-ask-unavailable').textContent).toBe('Time question unavailable');
  expect(reads).toBe(0); expect(document.body.textContent).not.toContain('private label failure');
});
