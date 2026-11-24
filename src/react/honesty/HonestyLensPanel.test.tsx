import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { HonestyTurn } from '../../core/honesty/projectHonestyTurn.js';
import { HonestyLensPanel } from './HonestyLensPanel.js';

const evidence = { address: { eventIndex: 17 }, reasonIndex: 1 };

const turn: HonestyTurn = {
  trust: { state: 'not-sure', title: 'Not sure', sentence: 'The assessment names a limit.' },
  sentences: [{ text: 'The item is likely available.', mark: 'unlinked', evidenceNote: 'No evidence link recorded.' }],
  reasons: [{ text: 'The library cut a tool result.', tools: ['Inventory lookup'],
    details: ['20 of 120 characters kept.'], evidence }],
  steps: [
    { id: 'N', headline: 'How far to trust it', rows: [], remaining: 0 },
    { id: 'A', headline: 'What was checked', rows: [{ text: 'Tool coverage: 1 of 1 recorded.' }], remaining: 0 },
  ],
};

it('shows one linked reason with recorded tool name and counts', () => {
  const onInspect = vi.fn();
  render(<HonestyLensPanel turn={turn} onInspect={onInspect} />);
  const row = screen.getByText('The library cut a tool result.');
  expect(within(row).getByText('Inventory lookup')).toBeVisible();
  expect(within(row).getByText('20 of 120 characters kept.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect this step: The library cut a tool result.' }));
  expect(onInspect).toHaveBeenCalledExactlyOnceWith(evidence);
});

it('opens a known answer on request and keeps navigation local until inspect', () => {
  const onInspect = vi.fn();
  render(<HonestyLensPanel turn={{ ...turn,
    trust: { state: 'known', title: 'Known', sentence: 'The record supports the answer.' } }} onInspect={onInspect} />);
  const expand = screen.getByRole('button', { name: 'Check this answer' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(expand);
  const sentence = screen.getByRole('button', { name: /The item is likely available/ });
  fireEvent.click(sentence);
  expect(screen.getByRole('heading', { name: 'What was checked' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('button', { name: 'What was checked' }), { key: 'ArrowLeft' });
  expect(screen.getByRole('heading', { name: 'How far to trust it' })).toBeVisible();
  fireEvent.keyDown(screen.getByRole('button', { name: 'How far to trust it' }), { key: 'Escape' });
  expect(expand).toHaveFocus();
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  expect(onInspect).not.toHaveBeenCalled();
});

it('wraps unbroken recorded reason details', () => {
  const detail = 'inventoryReference'.repeat(24);
  render(<HonestyLensPanel turn={{ ...turn, reasons: [{ ...turn.reasons[0], details: [detail] }] }} />);
  const panel = screen.getByRole('region', { name: 'Honesty Lens' });
  expect(within(panel).getByText(detail)).toBeVisible();
  expect(panel).toHaveStyle({ overflowWrap: 'anywhere' });
});
