/**
 * <AnimatedEdge> — Layer 3 / Tier B tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Position } from '@xyflow/react';
import { AnimatedEdge } from './AnimatedEdge.js';

function defaultProps(overrides: Partial<Parameters<typeof AnimatedEdge>[0]> = {}): Parameters<typeof AnimatedEdge>[0] {
  return {
    id: 'e1',
    source: 'a',
    target: 'b',
    sourceX: 0, sourceY: 0,
    targetX: 100, targetY: 0,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: false,
    animated: false,
    data: undefined,
    style: undefined,
    markerEnd: undefined,
    ...overrides,
  } as unknown as Parameters<typeof AnimatedEdge>[0];
}

describe('<AnimatedEdge>', () => {
  function renderSvg(node: React.ReactElement): HTMLElement {
    // BaseEdge renders an SVG <path> — must be wrapped in <svg>.
    const { container } = render(<svg>{node}</svg>);
    return container;
  }

  it('renders a path element', () => {
    const container = renderSvg(<AnimatedEdge {...defaultProps()} />);
    expect(container.querySelector('path')).toBeTruthy();
  });

  it('class does NOT include inflight modifier when data.isInflight=false', () => {
    const container = renderSvg(
      <AnimatedEdge {...defaultProps({ data: { isInflight: false } })} />,
    );
    const path = container.querySelector('path')!;
    expect(path.className.baseVal ?? path.getAttribute('class')).not.toMatch(/inflight/);
  });

  it('class includes inflight modifier when data.isInflight=true', () => {
    const container = renderSvg(
      <AnimatedEdge {...defaultProps({ data: { isInflight: true } })} />,
    );
    const path = container.querySelector('path')!;
    const cls = path.className.baseVal ?? path.getAttribute('class') ?? '';
    expect(cls).toMatch(/inflight/);
  });

  it('absent data → treated as not in-flight', () => {
    const container = renderSvg(<AnimatedEdge {...defaultProps({ data: undefined })} />);
    const path = container.querySelector('path')!;
    expect(path.className.baseVal ?? path.getAttribute('class')).not.toMatch(/inflight/);
  });
});
