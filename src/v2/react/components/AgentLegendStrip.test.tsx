/**
 * <AgentLegendStrip> — Layer 3 / Tier B tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AgentLegendEntry } from '../../core/utils/extractAgentLegend.js';
import { AgentLegendStrip } from './AgentLegendStrip.js';

function entry(name: string, colorIdx = 0, role = ''): AgentLegendEntry {
  return { subflowId: `sf-${name}`, name, role, colorIdx };
}

describe('<AgentLegendStrip>', () => {
  it('renders one row per entry', () => {
    render(<AgentLegendStrip entries={[entry('A'), entry('B', 1), entry('C', 2)]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('returns null for empty entries (no DOM)', () => {
    const { container } = render(<AgentLegendStrip entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('color swatch carries data-color-idx', () => {
    render(<AgentLegendStrip entries={[entry('A', 5)]} />);
    expect(screen.getByRole('listitem').getAttribute('data-color-idx')).toBe('5');
  });

  it('click fires onHighlight with the row\'s subflowId', () => {
    const onH = vi.fn();
    render(<AgentLegendStrip entries={[entry('A')]} onHighlight={onH} />);
    fireEvent.click(screen.getByRole('listitem'));
    expect(onH).toHaveBeenCalledWith('sf-A');
  });

  it('clicking the highlighted row toggles OFF (onHighlight called with undefined)', () => {
    const onH = vi.fn();
    render(<AgentLegendStrip entries={[entry('A')]} highlightedAgentId="sf-A" onHighlight={onH} />);
    fireEvent.click(screen.getByRole('listitem'));
    expect(onH).toHaveBeenCalledWith(undefined);
  });

  it('aria-pressed reflects highlight state', () => {
    render(<AgentLegendStrip entries={[entry('A')]} highlightedAgentId="sf-A" />);
    expect(screen.getByRole('listitem').getAttribute('aria-pressed')).toBe('true');
  });

  it('renders role and model when present', () => {
    render(
      <AgentLegendStrip
        entries={[{ subflowId: 'sf', name: 'A', role: 'judge', model: 'gpt-4', colorIdx: 0 }]}
      />,
    );
    expect(screen.getByText('judge')).toBeTruthy();
    expect(screen.getByText('gpt-4')).toBeTruthy();
  });

  it('100-row render in under 200ms', () => {
    const entries: AgentLegendEntry[] = [];
    for (let i = 0; i < 100; i++) entries.push(entry(`A${i}`, i % 8));
    const start = performance.now();
    render(<AgentLegendStrip entries={entries} />);
    const ms = performance.now() - start;
    expect(ms).toBeLessThan(500);
  });
});
