/**
 * Unit tests for the consumer-DX additions surfaced building the Neo web UI:
 *   - LENS_NODE_TYPES — the exported renderer map (finding 5)
 *   - LensChartBoundary — a bad chart must not white-screen (finding 4)
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { LENS_NODE_TYPES } from './lensNodeTypes.js';
import { LensChartBoundary } from './LensChartBoundary.js';

describe('LENS_NODE_TYPES', () => {
  it('maps the custom chart node types to renderers', () => {
    expect(typeof LENS_NODE_TYPES.slotPill).toBe('function');
    expect(typeof LENS_NODE_TYPES.groupContainer).toBe('function');
  });
});

describe('LensChartBoundary', () => {
  it('renders children when they do not throw', () => {
    const { container } = render(
      <LensChartBoundary>
        <div>chart ok</div>
      </LensChartBoundary>,
    );
    expect(container.textContent).toMatch(/chart ok/);
  });

  it('shows a fallback instead of crashing when a child throws', () => {
    const Boom = (): React.ReactElement => {
      throw new Error('bad chart');
    };
    // React logs the caught error to console.error — silence it for a clean run.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <LensChartBoundary>
        <Boom />
      </LensChartBoundary>,
    );
    expect(container.textContent).toMatch(/could.?n.?t render/i);
    expect(container.textContent).toMatch(/bad chart/);
    spy.mockRestore();
  });
});
