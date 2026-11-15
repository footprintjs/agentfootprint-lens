import { expect, it, vi } from 'vitest';
import type { TypedScope } from 'footprintjs';
import { prepareTimeReply } from './index.js';
import type { SubmitCell, SubmitState } from '../chartTypes.js';
it('keeps an unreadable declaration out of the submitting branch', () => {
  const state = {} as SubmitState; const cell: SubmitCell = {};
  prepareTimeReply({ awaiting: {}, reader: () => [], values: {}, onAnswer: vi.fn() }, cell)(state as TypedScope<SubmitState>);
  expect(state.ready).toBe(false); expect(cell.answer).toBeUndefined();
});
