/** @vitest-environment node */
import { expect, it, vi } from 'vitest';
import { foldFindings } from '../index.js';

vi.mock('react', () => {
  throw new Error('The Findings fold must load without React');
});

it('reads the current standing and undeclared results without loading the view', () => {
  const fold = foldFindings([
    { kind: 'standing', toolCallId: 'lookup', standing: 'open' },
    { kind: 'standing', toolCallId: 'lookup', standing: 'ruled-out' },
  ], [{ toolCallId: 'lookup' }, { toolCallId: 'retry' }]);

  expect(fold.ruledOut.map(row => row.toolCallId)).toEqual(['lookup']);
  expect(fold.open).toEqual([]);
  expect(fold.undeclared).toEqual(['retry']);
});
