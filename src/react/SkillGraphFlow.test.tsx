/**
 * <SkillGraphFlow> — render + interaction (functional) tests.
 *
 * xyflow needs a sized container + ResizeObserver to lay edges out; jsdom has the
 * polyfill (vitest.setup.ts) but no real layout, so these assert the React-owned
 * surface (node labels, the detail panel, selection wiring) rather than pixel
 * geometry — geometry is covered purely in skillGraphFlowLayout.test.ts. Native
 * vitest matchers only (the repo convention — jest-dom matchers aren't typed here).
 */

/** @vitest-environment jsdom */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SkillGraphFlow, type SkillGraphView } from './SkillGraphFlow.js';

const graph: SkillGraphView = {
  nodes: [
    { id: 'd0', kind: 'predicate', label: 'io intent?' },
    { id: 'io-profile', kind: 'skill', label: 'io-profile' },
    { id: 'triage', kind: 'skill', label: 'triage' },
  ],
  edges: [
    { from: null, to: 'd0', kind: 'predicate' },
    { from: 'd0', to: 'io-profile', kind: 'predicate', label: 'yes' },
    { from: 'd0', to: 'triage', kind: 'predicate', label: 'no' },
  ],
};

describe('<SkillGraphFlow>', () => {
  it('renders predicate + skill node labels', () => {
    render(<SkillGraphFlow graph={graph} height={400} />);
    // getByText throws if absent → reaching the assertion already proves presence.
    expect(screen.getByText('io intent?')).toBeTruthy();
    expect(screen.getByText('io-profile')).toBeTruthy();
    expect(screen.getByText('triage')).toBeTruthy();
  });

  it('shows the empty-state hint in the detail panel before any selection', () => {
    render(<SkillGraphFlow graph={graph} height={400} />);
    const panel = screen.getByTestId('skill-graph-detail');
    expect(within(panel).getByText(/click a node/i)).toBeTruthy();
  });

  it('clicking a skill node selects it and shows its detail (description + tools + body)', () => {
    const detailFor = (node: { id: string }) =>
      node.id === 'io-profile'
        ? {
            description: 'Profile the IO pattern.',
            tools: ['get_io'],
            body: 'STEP 1: pull counters',
          }
        : undefined;
    render(<SkillGraphFlow graph={graph} detailFor={detailFor} height={400} />);

    fireEvent.click(screen.getByText('io-profile'));

    const panel = screen.getByTestId('skill-graph-detail');
    expect(within(panel).getByText('Profile the IO pattern.')).toBeTruthy();
    expect(within(panel).getByText('get_io')).toBeTruthy();
    expect(within(panel).getByText(/UNLOCKS 1 TOOL\b/)).toBeTruthy();
    expect(within(panel).getByText(/STEP 1: pull counters/)).toBeTruthy();
  });

  it('a predicate node without detail explains it routes yes/no', () => {
    render(<SkillGraphFlow graph={graph} height={400} />);
    fireEvent.click(screen.getByText('io intent?'));
    const panel = screen.getByTestId('skill-graph-detail');
    expect(within(panel).getByText('◇ Decision')).toBeTruthy();
    expect(within(panel).getByText(/Routes to its/i)).toBeTruthy();
  });

  it('fires onSelectNode with the clicked id (controlled mode)', () => {
    const onSelectNode = vi.fn();
    render(
      <SkillGraphFlow graph={graph} selectedId={null} onSelectNode={onSelectNode} height={400} />,
    );
    fireEvent.click(screen.getByText('triage'));
    expect(onSelectNode).toHaveBeenCalledWith('triage');
  });

  it('hideDetailPanel hides the side panel AND its resizer', () => {
    render(<SkillGraphFlow graph={graph} hideDetailPanel height={400} />);
    expect(screen.queryByTestId('skill-graph-detail')).toBeNull();
    expect(screen.queryByTestId('skill-graph-resizer')).toBeNull();
  });

  it('renders a drag-to-resize divider; defaultPanelWidth sets the panel width', () => {
    render(<SkillGraphFlow graph={graph} defaultPanelWidth={420} height={400} />);
    const resizer = screen.getByTestId('skill-graph-resizer');
    expect(resizer.getAttribute('role')).toBe('separator');
    const panel = screen.getByTestId('skill-graph-detail') as HTMLElement;
    expect(panel.style.width).toBe('420px');
  });

  it('dragging the divider left widens the panel', () => {
    // jsdom getBoundingClientRect is all-zeros, so a leftward drag (clientX < right)
    // yields a positive width that clamps to the 220px minimum — enough to prove the
    // mousedown→mousemove wiring updates the panel width.
    render(<SkillGraphFlow graph={graph} defaultPanelWidth={320} height={400} />);
    const resizer = screen.getByTestId('skill-graph-resizer');
    fireEvent.mouseDown(resizer);
    fireEvent.mouseMove(window, { clientX: -500 }); // far left → wide
    fireEvent.mouseUp(window);
    const panel = screen.getByTestId('skill-graph-detail') as HTMLElement;
    expect(parseInt(panel.style.width, 10)).toBeGreaterThanOrEqual(220);
  });

  it('defaultSelectedId pre-selects a node on mount', () => {
    const detailFor = () => ({ description: 'preselected detail' });
    render(
      <SkillGraphFlow
        graph={graph}
        defaultSelectedId="triage"
        detailFor={detailFor}
        height={400}
      />,
    );
    const panel = screen.getByTestId('skill-graph-detail');
    expect(within(panel).getByText('preselected detail')).toBeTruthy();
  });

  it('shows the decision path ("REACHED WHEN") for a selected tree leaf', () => {
    render(<SkillGraphFlow graph={graph} defaultSelectedId="triage" height={400} />);
    const panel = screen.getByTestId('skill-graph-detail');
    expect(within(panel).getByText('REACHED WHEN')).toBeTruthy();
    // triage is the all-'no' default leaf: "io intent? no".
    expect(within(panel).getByText('io intent?')).toBeTruthy();
    expect(within(panel).getAllByText('no').length).toBeGreaterThan(0);
  });
});
