/** @vitest-environment jsdom */
/**
 * WhatHappenedTimeline — the run-as-a-timeline rail.
 *
 * Verifies: it renders a moment per entry with its title + timestamp, marks the
 * focused moment, expands the focused moment's detail inline, scrubs the single
 * cursor on click, and shows an empty state with no moments.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WhatHappenedTimeline, type TimelineMoment } from './WhatHappenedTimeline.js';

const MOMENTS: readonly TimelineMoment[] = [
  { runtimeStageId: 'seed#0', title: 'Run · start', icon: '▸' },
  { runtimeStageId: 'context#6', title: 'Context assembled', offsetMs: 309, icon: '❖' },
  { runtimeStageId: 'call-llm#7', title: 'LLM reasoned', offsetMs: 690, icon: '◆' },
];

describe('WhatHappenedTimeline', () => {
  it('renders a moment per entry, with the drag-to-scrub affordance', () => {
    render(<WhatHappenedTimeline moments={MOMENTS} focusStep={0} onFocusChange={() => {}} />);
    expect(screen.getByText('Run · start')).toBeDefined();
    expect(screen.getByText('Context assembled')).toBeDefined();
    expect(screen.getByText('LLM reasoned')).toBeDefined();
    expect(screen.getByText(/drag any dot to scrub/i)).toBeDefined();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('formats timestamps (ms under 1s, seconds above)', () => {
    render(<WhatHappenedTimeline moments={MOMENTS} focusStep={0} onFocusChange={() => {}} />);
    expect(screen.getByText('+309ms')).toBeDefined();
  });

  it('marks the focused moment as selected', () => {
    render(<WhatHappenedTimeline moments={MOMENTS} focusStep={1} onFocusChange={() => {}} />);
    const opts = screen.getAllByRole('option');
    expect(opts[1]!.getAttribute('aria-selected')).toBe('true');
    expect(opts[0]!.getAttribute('aria-selected')).toBe('false');
  });

  it('expands the focused moment\'s detail inline (only there)', () => {
    render(
      <WhatHappenedTimeline
        moments={MOMENTS}
        focusStep={2}
        onFocusChange={() => {}}
        detail={<div data-testid="detail">tool args + result</div>}
      />,
    );
    expect(screen.getByTestId('detail')).toBeDefined();
  });

  it('scrubs the single cursor on moment click', () => {
    const onFocusChange = vi.fn();
    render(<WhatHappenedTimeline moments={MOMENTS} focusStep={0} onFocusChange={onFocusChange} />);
    fireEvent.click(screen.getAllByRole('option')[2]!);
    expect(onFocusChange).toHaveBeenCalledWith(2);
  });

  it('shows an empty state with no moments', () => {
    render(<WhatHappenedTimeline moments={[]} focusStep={0} onFocusChange={() => {}} />);
    expect(screen.getByText(/No moments yet/i)).toBeDefined();
  });
});
