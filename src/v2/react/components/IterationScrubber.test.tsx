/**
 * <IterationScrubber> — Layer 3 / Tier B tests.
 */

/** @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IterationScrubber } from './IterationScrubber.js';

describe('<IterationScrubber>', () => {
  it('renders nothing for current=0 and undefined max', () => {
    const { container } = render(<IterationScrubber current={0} max={undefined} stageId="x" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders current segments when max is undefined', () => {
    render(<IterationScrubber current={3} max={undefined} stageId="x" />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('renders max segments when max is defined and > current', () => {
    render(<IterationScrubber current={2} max={5} stageId="x" />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('current segment has aria-selected=true', () => {
    render(<IterationScrubber current={2} max={3} stageId="x" />);
    const selected = screen.getAllByRole('tab').filter((b) => b.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.getAttribute('data-iteration')).toBe('2');
  });

  it('future segments are disabled', () => {
    render(<IterationScrubber current={1} max={3} stageId="x" />);
    const tabs = screen.getAllByRole('tab') as HTMLButtonElement[];
    expect(tabs[0]!.disabled).toBe(false);
    expect(tabs[1]!.disabled).toBe(true);
    expect(tabs[2]!.disabled).toBe(true);
  });

  it('clicking past iteration fires onJump with correct runtimeStageId', () => {
    const onJump = vi.fn();
    render(<IterationScrubber current={3} max={3} stageId="agent" onJump={onJump} />);
    fireEvent.click(screen.getAllByRole('tab')[0]!);
    expect(onJump).toHaveBeenCalledWith(1, 'agent#0');
  });

  it('clicking current iteration also fires onJump', () => {
    const onJump = vi.fn();
    render(<IterationScrubber current={2} max={3} stageId="agent" onJump={onJump} />);
    fireEvent.click(screen.getAllByRole('tab')[1]!);
    expect(onJump).toHaveBeenCalledWith(2, 'agent#1');
  });

  it('clicking future iteration does NOT fire onJump (disabled)', () => {
    const onJump = vi.fn();
    render(<IterationScrubber current={1} max={3} stageId="x" onJump={onJump} />);
    fireEvent.click(screen.getAllByRole('tab')[2]!);
    expect(onJump).not.toHaveBeenCalled();
  });

  it('stage-id attribute is set on the container', () => {
    render(<IterationScrubber current={1} max={1} stageId="my-stage" />);
    expect(screen.getByRole('tablist').getAttribute('data-stage-id')).toBe('my-stage');
  });
});
