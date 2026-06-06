/**
 * <TokenCostBadge> — Layer 3 / Tier B tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenCostBadge } from './TokenCostBadge.js';

describe('<TokenCostBadge>', () => {
  it('returns null when zero tokens total', () => {
    const { container } = render(<TokenCostBadge inputTokens={0} outputTokens={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders tokens with arrow glyphs', () => {
    render(<TokenCostBadge inputTokens={120} outputTokens={50} />);
    expect(screen.getByText(/120↑/)).toBeTruthy();
    expect(screen.getByText(/50↓/)).toBeTruthy();
  });

  it('compacts to K at ≥10000', () => {
    render(<TokenCostBadge inputTokens={14_200} outputTokens={20_000} />);
    expect(screen.getByText(/14.2K↑/)).toBeTruthy();
    expect(screen.getByText(/20.0K↓/)).toBeTruthy();
  });

  it('compacts to M at ≥1M', () => {
    render(<TokenCostBadge inputTokens={1_500_000} outputTokens={2_300_000} />);
    expect(screen.getByText(/1.5M↑/)).toBeTruthy();
    expect(screen.getByText(/2.3M↓/)).toBeTruthy();
  });

  it('shows cost when provided', () => {
    render(<TokenCostBadge inputTokens={100} outputTokens={50} costUsd={0.0023} />);
    expect(screen.getByText(/\$0\.0023/)).toBeTruthy();
  });

  it('cost format scales by magnitude', () => {
    const { rerender } = render(<TokenCostBadge inputTokens={1} outputTokens={1} costUsd={0.0023} />);
    expect(screen.getByText('$0.0023')).toBeTruthy();
    rerender(<TokenCostBadge inputTokens={1} outputTokens={1} costUsd={0.012} />);
    expect(screen.getByText('$0.012')).toBeTruthy();
    rerender(<TokenCostBadge inputTokens={1} outputTokens={1} costUsd={0.12} />);
    expect(screen.getByText('$0.12')).toBeTruthy();
  });

  it('aria-label aggregates token count + cost', () => {
    render(<TokenCostBadge inputTokens={10} outputTokens={5} costUsd={0.01} />);
    const badge = screen.getByLabelText(/15 tokens/);
    expect(badge).toBeTruthy();
  });

  it('hides cost when undefined', () => {
    render(<TokenCostBadge inputTokens={10} outputTokens={5} />);
    expect(screen.queryByText(/\$/)).toBeNull();
  });
});
