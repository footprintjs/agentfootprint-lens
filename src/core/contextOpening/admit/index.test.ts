import { expect, it } from 'vitest';
import type { TypedScope } from 'footprintjs';
import { admitContext } from './index.js';
import type { OpeningCell, OpeningState } from '../types.js';
it('writes flags while the admitted recording stays in its per-run result cell', () => {
  const state = {} as OpeningState; const result: OpeningCell = {};
  admitContext({ recording: { events: [] }, calls: [] }, result)(state as TypedScope<OpeningState>);
  expect(state).toEqual({ admitted: true, hasContext: false }); expect(result.verdict?.ok).toBe(true);
});
