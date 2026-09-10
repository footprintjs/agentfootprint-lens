/**
 * <TagPicker> — the tag legend, and the picker that rebuilds the scrub axis.
 *
 * Two lists, one strip: the tags the chart CAN produce (from the recording's
 * structure — the Map advertises the vocabulary) and the tags the run DID hit
 * (from `bundle.tags`), merged into one chip per tag with its hit count. A
 * chip that the chart declares but the run never hit is shown and disabled:
 * there is no stop to scrub to, and saying so beats hiding it. When the
 * recording carried no structure the strip says which list it is showing.
 *
 * Picking chips does NOT move the cursor. It hands the picked names up; the
 * Lens rebuilds its positions through footprintjs's `tagStops(names)` and the
 * ONE cursor is re-seated on the new axis by the funnel it already has. The
 * default axis — the Lens's own grouping — is what an empty pick means.
 *
 * NO CLAIM SENTENCES: every string here is a value of `LABELS`
 * (`test/served/no-own-claims.test.ts` walks this file) or computed data.
 */

import React from 'react';

import type { TagLegend } from '../../core/tags/index.js';
import { T } from '../theme/index.js';

/** Every string this strip owns. Labels, never sentences about the run. */
export const LABELS = Object.freeze({
  tags: 'Tags',
  fromChart: 'from the chart',
  fromLog: 'tags this run hit',
  noChart: 'no chart in this recording',
  clear: 'Clear',
  hits: 'hits',
  notHit: 'not hit',
  inSubflows: 'in subflows',
  tagAxisUnavailable: 'tag axis unavailable',
  noTags: 'no tags',
} as const);

export interface TagPickerProps {
  readonly legend: TagLegend;
  /** The picked tag names — `tagStops`'s any-of keep rule. Empty = default axis. */
  readonly picked: readonly string[];
  readonly onPick: (next: readonly string[]) => void;
  /** `false` when the installed footprintjs has no `tagStops` (a 9.17 peer):
   *  the legend still shows; picking is disabled and labelled. */
  readonly available: boolean;
}

export function TagPicker({ legend, picked, onPick, available }: TagPickerProps): React.ReactElement | null {
  if (legend.entries.length === 0) return null;
  const toggle = (name: string): void => {
    onPick(picked.includes(name) ? picked.filter((t) => t !== name) : [...picked, name]);
  };
  return (
    <div data-testid="tag-picker" data-source={legend.source} data-available={available ? 'true' : 'false'} style={rootStyle}>
      <span style={titleStyle}>{LABELS.tags}</span>
      <span data-testid="tag-picker-source" style={mutedStyle}>
        {legend.source === 'structure' ? LABELS.fromChart : LABELS.fromLog}
      </span>
      {legend.source === 'log' && (
        <span data-testid="tag-picker-no-chart" style={mutedStyle}>
          {LABELS.noChart}
        </span>
      )}
      {!available && (
        <span data-testid="tag-picker-unavailable" style={mutedStyle}>
          {LABELS.tagAxisUnavailable}
        </span>
      )}
      {legend.entries.map((e) => {
        const on = picked.includes(e.name);
        // A pick scrubs the ROOT log (`tagStops` reads no other), so only a
        // root hit makes a chip pickable. A tag hit only inside mounted
        // subflows is real and is said — "in subflows" — but yields no stop
        // on this axis, so its chip is disabled rather than a pick that lands
        // on the two bookends.
        const mountOnly = e.rootHits === 0 && e.mountHits > 0;
        const pickable = available && e.rootHits > 0;
        return (
          <button
            key={e.name}
            type="button"
            data-testid="tag-chip"
            data-tag={e.name}
            data-declared={e.declared ? 'true' : 'false'}
            data-hits={e.hits}
            data-root-hits={e.rootHits}
            data-mount-hits={e.mountHits}
            aria-pressed={on}
            disabled={!pickable}
            onClick={() => toggle(e.name)}
            style={chipStyle(on, pickable)}
          >
            {e.label}
            <span style={countStyle}>
              {e.rootHits > 0 ? `${e.rootHits}` : mountOnly ? LABELS.inSubflows : LABELS.notHit}
            </span>
          </button>
        );
      })}
      {picked.length > 0 && (
        <button type="button" data-testid="tag-picker-clear" onClick={() => onPick([])} style={chipStyle(false, true)}>
          {LABELS.clear}
        </button>
      )}
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
  padding: '3px 12px',
  fontFamily: T.fontSans,
  fontSize: 11,
  color: T.textSecondary,
};
const titleStyle: React.CSSProperties = { fontWeight: 600, color: T.textSecondary };
const mutedStyle: React.CSSProperties = { color: T.textMuted };
const countStyle: React.CSSProperties = { marginLeft: 5, opacity: 0.7, fontSize: 10 };
const chipStyle = (on: boolean, pickable: boolean): React.CSSProperties => ({
  background: on ? T.primary : 'transparent',
  color: on ? '#fff' : pickable ? T.textSecondary : T.textMuted,
  border: `1px solid ${on ? T.primary : T.border}`,
  borderRadius: 999,
  padding: '1px 8px',
  fontSize: 10.5,
  lineHeight: 1.4,
  cursor: pickable ? 'pointer' : 'default',
  opacity: pickable ? 1 : 0.6,
  whiteSpace: 'nowrap',
});
