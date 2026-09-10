/**
 * The DEGRADED PEER path, pinned: footprintjs without `tagStops` (< 9.21) and
 * agentfootprint without `milestoneFromTags` (< 9.90). Both symbols are read
 * off their module namespaces at call time, so on such a peer the legend
 * prints raw names, no tag axis is built, the picker is present but says
 * "tag axis unavailable" with every chip disabled — and nothing throws.
 *
 * The symbols are set to `undefined` (not deleted): that is what an older
 * peer's namespace looks like under a bundler's interop.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('footprintjs/trace', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, tagStops: undefined };
});
vi.mock('agentfootprint', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, milestoneFromTags: undefined };
});

import { Lens } from './index.js';
import { memoryBookmarkStore } from '../core/bookmarks/index.js';
import { tagAxisPositions, tagLegend, tagStopsFor } from '../core/tags/index.js';
import { LABELS as TAG_LABELS } from './components/TagPicker.js';
import { load } from '../../test/served/helpers.js';

describe('a footprintjs < 9.21 / agentfootprint < 9.90 peer', () => {
  it('legend: raw names, no milestone kinds; axis: undefined; picker: present, unavailable, chips disabled', () => {
    const f = load('flat-dynamic-tools');
    const structure = (f.runner as { getSpec: () => { buildTimeStructure: unknown } }).getSpec().buildTimeStructure;
    const legend = tagLegend(structure, f.snapshot);
    expect(legend.entries.length).toBeGreaterThan(0);
    expect(legend.entries.every((e) => e.label === e.name && e.milestone === undefined)).toBe(true);
    expect(tagStopsFor(f.snapshot, ['milestone:llm-turn'])).toBeUndefined();
    expect(tagAxisPositions(f.snapshot, ['milestone:llm-turn'], f.positions)).toBeUndefined();

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Lens recorder={f.recorder} runner={f.runner as never} view="engineer" granularity="group" step={0} bookmarkStore={memoryBookmarkStore()} />,
    );
    const picker = screen.getByTestId('tag-picker');
    expect(picker.dataset.available).toBe('false');
    expect(screen.getByTestId('tag-picker-unavailable')).toHaveTextContent(TAG_LABELS.tagAxisUnavailable);
    const chips = screen.getAllByTestId('tag-chip') as HTMLButtonElement[];
    expect(chips.every((c) => c.disabled)).toBe(true);
    expect(chips.map((c) => c.dataset.tag)).toContain('milestone:llm-turn');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
