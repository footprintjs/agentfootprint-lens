/**
 * WhatHappenedTimeline — the run as a vertical timeline of MOMENTS.
 *
 * This is the "WHAT HAPPENED" rail: it folds the scrubber + commentary +
 * details into ONE thing. Each moment is a dot on a line with its timestamp +
 * a humanized title; the CURRENT moment (the single cursor) is highlighted and
 * expands inline to its detail card. Clicking a dot scrubs — it moves the same
 * one cursor, so the chart + conversation follow.
 *
 * It is a pure presentation component: the parent (EngineerView) computes the
 * `moments` from `cursorPositions` (the scrub stops) + the humanizer + the
 * runtime overlay's timestamps, and supplies the focused moment's `detail`
 * (the existing NodeDetailPanel content). One cursor, three views — unchanged.
 */

import React, { useEffect, useRef } from 'react';
import { T } from './theme/index.js';

export interface TimelineMoment {
  /** The cursor value this dot scrubs to (a runtimeStageId). */
  readonly runtimeStageId: string;
  /** Short headline ("Called process_refund", "Context 3"). */
  readonly title: string;
  /** Fuller sentence shown at the top of the expanded card (the prose that used
   *  to bloat the title). */
  readonly description?: string;
  /** ms since run start, when known (rendered as "+0.3s"). */
  readonly offsetMs?: number;
  /** A small glyph for the moment kind. */
  readonly icon: string;
}

export interface WhatHappenedTimelineProps {
  readonly moments: readonly TimelineMoment[];
  /** Index of the current moment (the one cursor). */
  readonly focusStep: number;
  /** Scrub: set the cursor to moment `i`. */
  readonly onFocusChange: (i: number) => void;
  /** Rich detail for the focused moment (NodeDetailPanel content), rendered
   *  inline under it. */
  readonly detail?: React.ReactNode;
  /**
   * Is this a finished recording rather than a live run? Only the empty state
   * changes: "run a sample" is advice for someone watching an idle agent and
   * nonsense for someone looking at a run that is already over — that reader
   * needs to know what the RECORDING is missing, not to go start something.
   */
  readonly isReplay?: boolean;
}

function fmtOffset(ms?: number): string {
  if (ms === undefined) return '';
  return ms < 1000 ? `+${Math.round(ms)}ms` : `+${(ms / 1000).toFixed(1)}s`;
}

export const WhatHappenedTimeline: React.FC<WhatHappenedTimelineProps> = ({
  moments,
  focusStep,
  onFocusChange,
  detail,
  isReplay = false,
}) => {
  const focusedRef = useRef<HTMLDivElement | null>(null);

  // Keep the focused moment in view as the user scrubs (slider or arrows).
  // Guard the call: jsdom (tests) doesn't implement scrollIntoView.
  useEffect(() => {
    const el = focusedRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusStep]);

  if (moments.length === 0) {
    return (
      <div style={emptyStyle}>
        {isReplay
          ? 'This recording has no moments to walk. The strip is built from the run’s recorded step boundaries — this one carried none.'
          : 'No moments yet — run a sample to see what happened.'}
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span style={headerTitleStyle}>What happened</span>
        <span style={headerCountStyle}>
          moment {Math.min(focusStep + 1, moments.length)} / {moments.length} · drag any dot to
          scrub
        </span>
      </div>
      <div style={listStyle} role="listbox" aria-label="Run timeline">
        {moments.map((m, i) => {
          const focused = i === focusStep;
          const done = i < focusStep;
          return (
            <div key={`${m.runtimeStageId}-${i}`} ref={focused ? focusedRef : undefined}>
              <button
                type="button"
                role="option"
                aria-selected={focused}
                onClick={() => onFocusChange(i)}
                style={{ ...rowStyle, ...(focused ? rowFocusedStyle : null) }}
              >
                {/* time gutter */}
                <span style={timeStyle}>{fmtOffset(m.offsetMs)}</span>
                {/* dot + connecting spine */}
                <span style={railStyle}>
                  {i > 0 && (
                    <span
                      style={{
                        ...spineStyle,
                        background: done || focused ? T.success : T.border,
                      }}
                    />
                  )}
                  <span
                    style={{
                      ...dotStyle,
                      background: focused ? T.warning : done ? T.success : T.bgElevated,
                      borderColor: focused ? T.warning : done ? T.success : T.border,
                      ...(focused ? { boxShadow: `0 0 0 4px color-mix(in srgb, ${T.warning} 25%, transparent)` } : {}),
                    }}
                  />
                </span>
                {/* icon + title */}
                <span style={iconStyle}>{m.icon}</span>
                <span
                  style={{
                    ...titleStyle,
                    color: focused ? T.textPrimary : done ? T.textSecondary : T.textMuted,
                    fontWeight: focused ? 600 : 400,
                  }}
                >
                  {m.title}
                </span>
              </button>
              {/* Description is a TIGHT line under the moment — no framed box (a
                  one-liner in a bordered card looked heavy / didn't adapt to
                  content). The structured detail card only renders when there IS
                  rich detail (the parent passes `detail` only then). */}
              {focused && m.description && <div style={descLineStyle}>{m.description}</div>}
              {focused && detail && <div style={detailCardStyle}>{detail}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── styles ──────────────────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: T.bgElevated,
  fontFamily: T.fontSans,
};
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '10px 12px 8px',
  borderBottom: `1px solid ${T.border}`,
  flex: 'none',
};
const headerTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: T.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
};
const headerCountStyle: React.CSSProperties = {
  fontSize: 10,
  color: T.textSecondary,
  fontFamily: T.fontMono,
};
const listStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '4px 0 12px',
};
const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '46px 18px 18px 1fr',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderLeft: '3px solid transparent',
  padding: '7px 10px',
  cursor: 'pointer',
  font: 'inherit',
  transition: 'background 0.15s ease',
};
const rowFocusedStyle: React.CSSProperties = {
  background: `color-mix(in srgb, ${T.warning} 12%, transparent)`,
  borderLeft: `3px solid ${T.warning}`,
};
const timeStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: T.fontMono,
  color: T.textSecondary,
  textAlign: 'right',
};
const railStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  alignSelf: 'stretch',
};
const spineStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: '50%',
  width: 2,
  left: 'calc(50% - 1px)',
};
const dotStyle: React.CSSProperties = {
  width: 11,
  height: 11,
  borderRadius: '50%',
  border: '2px solid',
  zIndex: 1,
};
const iconStyle: React.CSSProperties = {
  fontSize: 13,
  textAlign: 'center',
};
const titleStyle: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.4,
};
// A tight description line under the focused moment (aligned past the time
// gutter + dot + icon). No border/background — it adapts to the content.
const descLineStyle: React.CSSProperties = {
  margin: '0 12px 8px 64px',
  fontSize: 12.5,
  lineHeight: 1.5,
  color: T.textSecondary,
};
// The structured detail card — framed, scrollable. Only rendered when there's
// rich detail to show (tokens / tool args / payloads).
const detailCardStyle: React.CSSProperties = {
  margin: '0 10px 10px 64px',
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  overflow: 'hidden',
  maxHeight: 360,
  display: 'flex',
  flexDirection: 'column',
};
const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: T.textSecondary,
  fontStyle: 'italic',
  fontFamily: T.fontSans,
};
