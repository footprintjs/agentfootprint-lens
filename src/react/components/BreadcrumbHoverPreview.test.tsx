/**
 * <BreadcrumbHoverPreview> — Layer 3 / Tier C tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BreadcrumbHoverPreview } from './BreadcrumbHoverPreview.js';

describe('<BreadcrumbHoverPreview>', () => {
  it('renders label + plural node count', () => {
    render(<BreadcrumbHoverPreview entry={{ label: 'Apparel Agent', subflowId: 'sf-a' }} nodeCount={5} />);
    expect(screen.getByText('Apparel Agent')).toBeTruthy();
    expect(screen.getByText('5 nodes')).toBeTruthy();
  });

  it('renders singular for nodeCount=1', () => {
    render(<BreadcrumbHoverPreview entry={{ label: 'Solo', subflowId: 'sf-x' }} nodeCount={1} />);
    expect(screen.getByText('1 node')).toBeTruthy();
  });

  it('renders zero count without error', () => {
    render(<BreadcrumbHoverPreview entry={{ label: 'Empty', subflowId: 'sf-e' }} nodeCount={0} />);
    expect(screen.getByText('0 nodes')).toBeTruthy();
  });

  it('has role=tooltip for assistive tech', () => {
    render(<BreadcrumbHoverPreview entry={{ label: 'X', subflowId: 'sf-x' }} nodeCount={1} />);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('subflowId flows into data attribute', () => {
    render(<BreadcrumbHoverPreview entry={{ label: 'X', subflowId: 'sf-y' }} nodeCount={1} />);
    expect(screen.getByRole('tooltip').getAttribute('data-subflow-id')).toBe('sf-y');
  });
});
