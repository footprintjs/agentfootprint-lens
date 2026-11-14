import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WhyLens } from './WhyLens.js';
import { MODE_PALETTES } from '../react/theme/index.js';

afterEach(cleanup);
function recording() {
  return JSON.parse(readFileSync(new URL('../core/__fixtures__/recorded-turn.json', import.meta.url), 'utf8'));
}
function decoded() {
  return { recording: recording(), calls: [{ meta: { runId: 'run', subflowPath: ['root'] },
    iteration: 1, eventIndex: 7, call: 1, added: ['id'], removed: [], unchanged: 0, counts: { rules: 1 } }],
    values: { resolve() { return 'Exact dictionary text'; } } };
}
function paletteAncestor(element: HTMLElement): HTMLElement | undefined {
  for (let node: HTMLElement | null = element; node; node = node.parentElement)
    if (node.style.getPropertyValue('--fp-bg-elevated') !== '') return node;
}
it('keeps the ordinary-recording light palette as a positive control', () => {
  render(<WhyLens recording={recording()} theme={{ mode: 'light' }} />);
  expect(paletteAncestor(screen.getByLabelText('Next step'))?.style.getPropertyValue('--fp-bg-elevated'))
    .toBe(MODE_PALETTES.light['--fp-bg-elevated']);
  expect(screen.queryByRole('region', { name: 'Recorded context' })).toBeNull();
});
it.each(['light', 'dark'] as const)('puts the decoded dictionary and Lens under the %s palette', async mode => {
  render(<WhyLens recording={decoded()} theme={{ mode }} />);
  const panel = await screen.findByRole('region', { name: 'Recorded context' });
  const root = paletteAncestor(panel);
  expect(root?.style.getPropertyValue('--fp-bg-elevated')).toBe(MODE_PALETTES[mode]['--fp-bg-elevated']);
  expect(root?.contains(screen.getByLabelText('Next step'))).toBe(true);
});
it('preserves ancestor consumer overrides and stamps no palette without an explicit theme', async () => {
  const view = render(<div style={{ '--lens-bg-elevated': '#abc123' } as React.CSSProperties}>
    <WhyLens recording={decoded()} theme={{ mode: 'light' }} />
  </div>);
  const panel = await screen.findByRole('region', { name: 'Recorded context' });
  const consumer = view.container.firstElementChild as HTMLElement;
  expect(consumer.contains(panel)).toBe(true);
  for (const node of consumer.querySelectorAll<HTMLElement>('[style]'))
    expect(node.style.getPropertyValue('--lens-bg-elevated')).toBe('');
  view.rerender(<WhyLens recording={decoded()} />);
  expect(paletteAncestor(await screen.findByRole('region', { name: 'Recorded context' }))).toBeUndefined();
});
