import { expect, it } from 'vitest';
import { OPENING_RULES } from './index.js';
it('admits only the explicit query verdict, independently of whether context exists', () => {
  expect(OPENING_RULES[0]!.when({ admitted: true, hasContext: false, disposition: '' })).toBe(true);
  expect(OPENING_RULES[0]!.when({ admitted: false, hasContext: true, disposition: '' })).toBe(false);
});
