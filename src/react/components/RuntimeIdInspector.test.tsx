/**
 * <RuntimeIdInspector> — Layer 3 / Tier B tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RuntimeIdInspector } from './RuntimeIdInspector.js';

describe('<RuntimeIdInspector>', () => {
  it('renders runtime id and commit idx', () => {
    render(<RuntimeIdInspector runtimeStageId="agent#5" commitIdx={12} />);
    expect(screen.getByTestId('runtime-id-value').textContent).toBe('agent#5');
    expect(screen.getByTestId('commit-idx-value').textContent).toBe('12');
  });

  it('shows em dash for undefined commitIdx and hides its copy button', () => {
    render(<RuntimeIdInspector runtimeStageId="x#0" commitIdx={undefined} />);
    expect(screen.getByTestId('commit-idx-value').textContent).toBe('—');
    expect(screen.queryByTestId('copy-commit-idx')).toBeNull();
  });

  it('copy button calls clipboard.writeText with runtime id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<RuntimeIdInspector runtimeStageId="agent#7" commitIdx={3} />);
    fireEvent.click(screen.getByTestId('copy-runtime-id'));
    // microtask flush
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('agent#7');
  });

  it('copy button is a no-op (no throw) when clipboard is unavailable', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: undefined });
    render(<RuntimeIdInspector runtimeStageId="x#0" commitIdx={1} />);
    expect(() => fireEvent.click(screen.getByTestId('copy-runtime-id'))).not.toThrow();
  });

  it('caveat text is visible to screen readers', () => {
    render(<RuntimeIdInspector runtimeStageId="x#0" commitIdx={1} />);
    expect(screen.getByText(/Ids are stable per chart/)).toBeTruthy();
  });
});
