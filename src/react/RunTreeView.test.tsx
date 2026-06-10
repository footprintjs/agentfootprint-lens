/** @vitest-environment jsdom */
/**
 * RunTreeView — flatten-then-window tree tests (backlog U3).
 *
 * Verifies: behavior parity with the old recursive renderer (labels,
 * default depth<3 expansion, click-to-collapse/expand, selection
 * callback + highlight) and the new windowed mode for large trees
 * (only the visible window mounts, inside a bounded scroll container).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { RunTreeView } from './RunTreeView.js';
import type { RunTreeNode } from '../core/types.js';

function node(
  id: string,
  label: string,
  children: RunTreeNode[] = [],
  kind: RunTreeNode['kind'] = children.length > 0 ? 'iteration' : 'tool-call',
): RunTreeNode {
  return {
    id,
    kind,
    label,
    status: 'ok',
    startOffsetMs: 0,
    children,
    events: [],
  };
}

/** root → iter → llm → tool-leaf (depth 3 collapsed by default). */
function smallTree(): RunTreeNode {
  return node(
    'root',
    'Run',
    [
      node('iter-1', 'Iteration 1', [
        node('llm-1', 'LLM: m', [node('deep-1', 'Deep leaf', [node('deeper-1', 'Deeper')])]),
        node('tool-1', 'Tool: search'),
      ]),
    ],
    'run',
  );
}

describe('RunTreeView — behavior parity', () => {
  it('renders rows expanded down to depth 3 by default; deeper stays collapsed', () => {
    const { container } = render(<RunTreeView node={smallTree()} />);
    expect(container.textContent).toContain('Run');
    expect(container.textContent).toContain('Iteration 1');
    expect(container.textContent).toContain('LLM: m');
    expect(container.textContent).toContain('Tool: search');
    // depth-3 node renders…
    expect(container.textContent).toContain('Deep leaf');
    // …but its CHILD does not (depth-3 nodes default collapsed).
    expect(container.textContent).not.toContain('Deeper');
  });

  it('click toggles collapse/expand and fires onSelect with the node', () => {
    const onSelect = vi.fn();
    const { container, getByText } = render(
      <RunTreeView node={smallTree()} onSelect={onSelect} />,
    );
    // Collapse Iteration 1 → its subtree disappears.
    fireEvent.click(getByText('Iteration 1'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'iter-1' }));
    expect(container.textContent).not.toContain('LLM: m');
    // Expand again → subtree returns.
    fireEvent.click(getByText('Iteration 1'));
    expect(container.textContent).toContain('LLM: m');
    // Expanding the collapsed depth-3 node reveals its child.
    fireEvent.click(getByText('Deep leaf'));
    expect(container.textContent).toContain('Deeper');
  });

  it('highlights the selected node', () => {
    const { getByText } = render(<RunTreeView node={smallTree()} selectedId="tool-1" />);
    const row = getByText('Tool: search').parentElement as HTMLElement;
    expect(row.style.borderLeft).toContain('3px solid');
    expect(row.style.background).not.toBe('transparent');
  });

  it('keeps same-id nodes under DIFFERENT parents independent (path-keyed state)', () => {
    // LensRecorder ids are only sibling-unique — e.g. `agent-iter:0`
    // repeats across turns. Collapsing turn 1's iteration must not
    // collapse turn 2's.
    const tree = node(
      'root',
      'Run',
      [
        node('turn-1', 'Turn 1', [node('agent-iter:0', 'Iteration 0', [node('llm-a', 'LLM: a')])]),
        node('turn-2', 'Turn 2', [node('agent-iter:0', 'Iteration 0', [node('llm-b', 'LLM: b')])]),
      ],
      'run',
    );
    const { container, getAllByText } = render(<RunTreeView node={tree} />);
    expect(container.textContent).toContain('LLM: a');
    expect(container.textContent).toContain('LLM: b');
    // Collapse the FIRST `Iteration 0` only.
    fireEvent.click(getAllByText('Iteration 0')[0]!);
    expect(container.textContent).not.toContain('LLM: a');
    expect(container.textContent).toContain('LLM: b');
  });
});

describe('RunTreeView — windowed rendering for large trees (U3)', () => {
  function bigTree(n: number): RunTreeNode {
    return node(
      'root',
      'Run',
      Array.from({ length: n }, (_, i) => node(`leaf-${i}`, `Leaf ${i}`)),
      'run',
    );
  }

  it('mounts only the visible window past the threshold, inside a scroll container', () => {
    const { container } = render(<RunTreeView node={bigTree(2000)} />);
    // Scroll container engaged (bounded height).
    const scroller = container.querySelector('div[style*="overflow-y: auto"]');
    expect(scroller).not.toBeNull();
    // Far fewer rows than the 2001 visible tree rows.
    expect(container.textContent).toContain('Leaf 0');
    expect(container.textContent).not.toContain('Leaf 1999');
    const rendered = container.querySelectorAll('div[style*="baseline"]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(100);
  });

  it('renders all rows (no scroll container) below the threshold', () => {
    const { container } = render(<RunTreeView node={bigTree(50)} />);
    expect(container.querySelector('div[style*="overflow-y: auto"]')).toBeNull();
    expect(container.textContent).toContain('Leaf 49');
  });
});
