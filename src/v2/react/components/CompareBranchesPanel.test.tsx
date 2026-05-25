/**
 * <CompareBranchesPanel> — Layer 3 / Tier B tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BranchColumn } from '../hooks/useCompareBranches.js';
import { CompareBranchesPanel } from './CompareBranchesPanel.js';

function col(name: string, overrides: Partial<BranchColumn> = {}): BranchColumn {
  return {
    branchId: `sf-${name}`,
    branchName: name,
    systemPrompt: 'sys',
    messages: [{ role: 'user', content: 'hi' }],
    tools: [{ name: 'search', description: 'web' }],
    response: 'ok',
    tokenCount: { input: 10, output: 5 },
    status: 'ok',
    ...overrides,
  };
}

describe('<CompareBranchesPanel>', () => {
  it('returns null for empty columns', () => {
    const { container } = render(<CompareBranchesPanel columns={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one article per column', () => {
    render(<CompareBranchesPanel columns={[col('A'), col('B'), col('C')]} />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('column status flows into data-status', () => {
    render(<CompareBranchesPanel columns={[col('A', { status: 'failed' })]} />);
    expect(screen.getByRole('article').getAttribute('data-status')).toBe('failed');
  });

  it('renders system / messages / tools / response sections', () => {
    render(<CompareBranchesPanel columns={[col('A')]} />);
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Messages')).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('Response')).toBeTruthy();
  });

  it('toggle diff button fires onToggleDiff', () => {
    const onToggle = vi.fn();
    render(<CompareBranchesPanel columns={[col('A')]} onToggleDiff={onToggle} />);
    fireEvent.click(screen.getByTestId('toggle-diff'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('diff toggle shows correct label based on diffEnabled', () => {
    const { rerender } = render(
      <CompareBranchesPanel columns={[col('A')]} diffEnabled={false} />,
    );
    expect(screen.getByTestId('toggle-diff').textContent).toBe('Show diff');
    rerender(<CompareBranchesPanel columns={[col('A')]} diffEnabled={true} />);
    expect(screen.getByTestId('toggle-diff').textContent).toBe('Hide diff');
  });

  it('pin button toggles pinnedColumnId via onPin', () => {
    const onPin = vi.fn();
    render(<CompareBranchesPanel columns={[col('A')]} onPin={onPin} />);
    fireEvent.click(screen.getByTestId('pin-sf-A'));
    expect(onPin).toHaveBeenCalledWith('sf-A');
  });

  it('clicking pin on already-pinned column unpins', () => {
    const onPin = vi.fn();
    render(<CompareBranchesPanel columns={[col('A')]} pinnedColumnId="sf-A" onPin={onPin} />);
    fireEvent.click(screen.getByTestId('pin-sf-A'));
    expect(onPin).toHaveBeenCalledWith(undefined);
  });

  it('errorMessage renders as alert when present', () => {
    render(<CompareBranchesPanel columns={[col('A', { errorMessage: 'oops', status: 'failed' })]} />);
    expect(screen.getByRole('alert').textContent).toBe('oops');
  });

  it('token counts visible in footer', () => {
    render(<CompareBranchesPanel columns={[col('A')]} />);
    expect(screen.getByText('in: 10')).toBeTruthy();
    expect(screen.getByText('out: 5')).toBeTruthy();
  });
});
