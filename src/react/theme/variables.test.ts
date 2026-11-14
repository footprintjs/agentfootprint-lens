import { expect, it } from 'vitest';
import { lensThemeVars } from './variables.js';
import { MODE_PALETTES } from './tokens.js';

it('leaves consumer theme sheets alone without an explicit theme', () => {
  expect(lensThemeVars()).toEqual({});
});
it.each(['light', 'dark'] as const)('stamps only the shared tier for %s and preserves node overlays', mode => {
  const vars = lensThemeVars({ mode, visited: '#123456', current: '#abcdef' }) as Record<string, unknown>;
  expect(vars['--fp-bg-elevated']).toBe(MODE_PALETTES[mode]['--fp-bg-elevated']);
  expect(vars['--fp-node-visited']).toBe('#123456'); expect(vars['--fp-node-cursor']).toBe('#abcdef');
  expect(Object.keys(vars).every(key => key.startsWith('--fp-'))).toBe(true);
});
