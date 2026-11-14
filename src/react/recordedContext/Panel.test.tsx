import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readDecodedContext } from '../../core/recordedContext.js';
import { RecordedContextScope, useRecordedContext } from '../recordedContext.js';
import { MODE_PALETTES } from '../theme/index.js';

function model() {
  return readDecodedContext({ recording: { events: [] }, calls: [{
    meta: { runId: 'run', subflowPath: ['root'] }, iteration: 1, eventIndex: 7,
    call: 1, added: ['id'], removed: [], unchanged: 0, counts: { rules: 1 },
  }], values: { resolve() { return '  exact text\n'; } } })!.context!;
}

describe('recorded context disclosure', () => {
  it.each(['light', 'dark'] as const)('scopes both surfaces under the selected %s palette', mode => {
    const props = { view: model(), theme: { mode } };
    render(<RecordedContextScope {...props}><div style={MODE_PALETTES[mode] as React.CSSProperties}>Lens surface</div></RecordedContextScope>);
    const panel = screen.getByRole('region', { name: 'Recorded context' });
    let root: HTMLElement | null = panel;
    while (root && root.style.getPropertyValue('--fp-bg-elevated') === '') root = root.parentElement;
    expect(root?.style.getPropertyValue('--fp-bg-elevated')).toBe(MODE_PALETTES[mode]['--fp-bg-elevated']);
    expect(root?.contains(screen.getByText('Lens surface'))).toBe(true);
  });
  it('expands the one dictionary value from its call reference without changing its text', () => {
    render(<RecordedContextScope view={model()}><span>Lens</span></RecordedContextScope>);
    const region = screen.getByRole('region', { name: 'Recorded context' });
    const entry = region.querySelector<HTMLDetailsElement>('details[data-context-id="id"]')!;
    expect(entry.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Expand context piece id' }));
    expect(entry.open).toBe(true);
    expect(entry.querySelector('pre')?.textContent).toBe('  exact text\n');
    expect(region.querySelectorAll('details[data-context-id]')).toHaveLength(1);
    expect(within(region).getByText('Source event index: 7')).toBeDefined();
  });

  it('keeps legacy rendering free of an extra context panel', () => {
    render(<RecordedContextScope view={undefined}><span>Legacy Lens</span></RecordedContextScope>);
    expect(screen.queryByRole('region', { name: 'Recorded context' })).toBeNull();
    expect(screen.getByText('Legacy Lens')).toBeDefined();
  });

  it('shares the exact model while respecting the user view’s hidden detail panel', () => {
    const view = model();
    let observed: unknown;
    function Consumer() { observed = useRecordedContext(); return <span>User view</span>; }
    render(<RecordedContextScope view={view} showPanel={false}><Consumer /></RecordedContextScope>);
    expect(observed).toBe(view);
    expect(screen.queryByRole('region', { name: 'Recorded context' })).toBeNull();
  });
  it('names an order-only delta instead of falsely saying context is unchanged', () => {
    const view = model();
    const call = { ...view.calls[0], added: [], removed: [], unchanged: 1, order: [0] };
    render(<RecordedContextScope view={{ ...view, calls: [call] }}>Lens</RecordedContextScope>);
    expect(screen.getByText(/Recorded context order changed/)).toBeDefined();
    expect(screen.queryByText(/Recorded context unchanged/)).toBeNull();
    expect(screen.getByText('Iteration: 1')).toBeDefined();
  });
  it('shows exact ticket text and its evidence status apart from stored-result content', () => {
    const ticket = JSON.stringify({ collapsed: true, standing: 'noise', toolCallId: 'native-tool' });
    render(<RecordedContextScope view={{ ...model(), toolInputs: [{ status: 'available', epoch: 1,
      gaps: ['provider-defaults: retained caveat'], messages: [{ toolCallId: 'native-tool',
        content: ticket, ticket: true, status: 'reconstructed' }] }] }}>
      <section aria-label="Stored tool result">stored-only-row</section>
    </RecordedContextScope>);
    const region = screen.getByLabelText('Tool messages for this exact model call');
    expect(region.textContent).toContain('Rebuilt model input (unverified)');
    expect(region.textContent).toContain('ticket-shaped input');
    expect(region.querySelector('pre')?.textContent).toBe(ticket);
    expect(region.textContent).not.toContain('stored-only-row');
    expect(region.textContent).toContain('provider-defaults: retained caveat');
  });

});
