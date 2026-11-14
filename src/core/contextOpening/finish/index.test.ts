import { expect, it } from 'vitest';
import type { TypedScope } from 'footprintjs';
import { acceptContext, refuseContext } from './index.js';
import type { OpeningState } from '../types.js';
it('records the selected disposition without retaining record data', () => {
  const scope = {} as TypedScope<OpeningState>;
  acceptContext(scope); expect(scope.disposition).toBe('accepted');
  refuseContext(scope); expect(scope.disposition).toBe('refused');
});
