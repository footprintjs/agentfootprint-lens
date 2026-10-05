/** Recorded NAV browser failure: a held root address has no stop on a sparse child axis. */
import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { observeRecording, type Recording } from '../core/observeRecording.js';
import { addressOf } from '../core/cursor/sharedCursor.js';
import { scrubAxisFor } from '../core/group/scrubAxisFor.js';
import { Lens, type LensDetailSlotProps, type LensView } from './Lens.js';
import { useSharedCursor } from './useSharedCursor.js';
import type { LensFlowProps } from './LensFlow.js';

// Canvas measurement is not this contract. Keep its actual drill callback and
// all recording replay, group/axis builders, cursor ownership and panels real.
vi.mock('./LensFlow.js', () => ({
  LensFlow: ({ onNodeClick, selectedRuntimeStageId }: LensFlowProps) => <div>
    <span data-testid="chart-address">{selectedRuntimeStageId}</span>
    <button onClick={() => onNodeClick?.('final')}>Drill into final</button>
  </div>,
}));

const recording = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../test/cursor/fixtures/nav-sparse-child.json'), 'utf8')) as Recording;
const detail = vi.fn(({ cursor }: LensDetailSlotProps) => <span data-testid="detail-address">{cursor?.at.runtimeStageId}</span>);
afterEach(() => vi.restoreAllMocks());

function Host({ observed, granularity = 'step', view = 'engineer', onStepChange = () => {} }: {
  observed: ReturnType<typeof observeRecording>;
  granularity?: 'step' | 'group';
  view?: LensView;
  onStepChange?: () => void;
}) {
  const shared = useSharedCursor(observed.recorder);
  const root = scrubAxisFor(observed.recorder, 'step');
  return <>
    <span data-testid="held">{JSON.stringify(shared.address)}</span>
    <span data-testid="target">{JSON.stringify(shared.target)}</span>
    <button onClick={() => shared.moveTo(addressOf(root[18]!))}>Hold root step 19</button>
    <Lens recorder={observed.recorder} runner={observed.runner} shared={shared} granularity={granularity} view={view}
      onStepChange={onStepChange} slots={{ detail, detailOnly: true }} />
  </>;
}

describe('sparse child replay with a shared address', () => {
  it('a drill shows no position, reports no move, and returns to the held root stop', () => {
    const observed = observeRecording(recording);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const changed = vi.fn();
    render(<Host observed={observed} onStepChange={changed} />);
    fireEvent.click(screen.getByLabelText('Previous step'));
    fireEvent.click(screen.getByLabelText('Previous step'));
    expect(screen.getByLabelText('Jump to latest')).toHaveTextContent('Latest');
    const held = screen.getByTestId('held').textContent;
    expect(held).toBe(JSON.stringify({ runtimeStageId: 'sf-thinking#41', commitIdx: 35 }));
    changed.mockClear();
    detail.mockClear();
    fireEvent.click(screen.getByText('Drill into final'));
    expect(screen.getByTestId('held').textContent).toBe(held);
    expect(screen.getByRole('status')).toHaveTextContent('The held address has no position on this axis.');
    expect(screen.queryByTestId('detail-address')).toBeNull();
    expect(screen.queryByTestId('chart-address')).toBeNull();
    expect(detail).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Top-level view'));
    expect(screen.getByTestId('held').textContent).toBe(held);
    expect(screen.getByTestId('detail-address')).toHaveTextContent('sf-thinking#41');
    expect(screen.getByLabelText('Go to step 19')).toHaveAttribute('aria-current', 'step');
  });

  it('an external address selection survives the former live-follow effect', () => {
    const observed = observeRecording(recording);
    const changed = vi.fn();
    render(<Host observed={observed} onStepChange={changed} />);
    fireEvent.click(screen.getByText('Hold root step 19'));
    expect(screen.getByTestId('detail-address')).toHaveTextContent('sf-thinking#41');
    expect(changed).not.toHaveBeenCalled();
  });

  it('an explicit stop selection enters the child and carries its drill path', () => {
    const observed = observeRecording(recording);
    const changed = vi.fn();
    render(<Host observed={observed} onStepChange={changed} />);
    fireEvent.click(screen.getByText('Hold root step 19'));
    fireEvent.click(screen.getByText('Drill into final'));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Move to a recorded stop'), { target: { value: '0' } });
    expect(screen.getByTestId('held').textContent).toBe(JSON.stringify({ runtimeStageId: 'final#44', commitIdx: 38, drillPath: ['final#44'] }));
    expect(screen.getByTestId('detail-address')).toHaveTextContent('final#44');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('granularity and audience visits preserve the unplaced address without showing execution evidence', () => {
    const observed = observeRecording(recording);
    const { rerender } = render(<Host observed={observed} />);
    fireEvent.click(screen.getByText('Hold root step 19'));
    const held = screen.getByTestId('held').textContent;
    fireEvent.click(screen.getByText('Drill into final'));
    for (const view of ['engineer', 'analyst', 'user'] as const) {
      rerender(<Host observed={observed} granularity="group" view={view} />);
      expect(screen.getByTestId('held').textContent).toBe(held);
      expect(screen.getByRole('region', { name: 'Cursor not on this axis' })).toBeVisible();
      expect(screen.queryByTestId('detail-address')).toBeNull();
      expect(screen.queryByLabelText('Jump to latest')).toBeNull();
    }
    rerender(<Host observed={observed} granularity="step" />);
    fireEvent.click(screen.getByTitle('Top-level view'));
    expect(screen.getByTestId('held').textContent).toBe(held);
    expect(screen.getByLabelText('Go to step 19')).toHaveAttribute('aria-current', 'step');
  });

  it('the recorded source prefix stays in its dedicated shell at local prefix 18', () => {
    const observed = observeRecording(recording);
    const { rerender } = render(<Host observed={observed} />);
    fireEvent.click(screen.getByText('Hold root step 19'));
    fireEvent.click(screen.getByText('Drill into final'));
    fireEvent.click(screen.getByText('Inspect source prefix'));
    const target = screen.getByTestId('target').textContent;
    expect(JSON.parse(target!)).toMatchObject({ kind: 'source-prefix', position: { committedThroughIdx: 18, drillPath: [] } });
    expect(screen.getByRole('region', { name: 'Source prefix' })).toBeVisible();
    expect(screen.queryByTestId('detail-address')).toBeNull();
    rerender(<Host observed={observed} granularity="group" view="user" />);
    expect(screen.getByTestId('target').textContent).toBe(target);
    expect(screen.getByRole('region', { name: 'Source prefix' })).toBeVisible();
  });
});
