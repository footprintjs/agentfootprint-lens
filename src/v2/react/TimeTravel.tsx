/**
 * TimeTravel — scrub slider for Lens v2. Ported from Lens v1's pattern.
 *
 * Pattern: frosted-pill control with ◀ ▶ ⟳Live buttons + range slider.
 *          State shape: one `focusSeq` number. At `max` → live (new
 *          events auto-advance). Below `max` → user pinned, auto-
 *          advance off. Arrow keys scrub. Space toggles live.
 * Role:    Replay past states of a run without post-walking the tree.
 *          Lens filters the RunTree + EventStream to entries with
 *          `seq <= focusSeq`; RunTreeFlow hides nodes whose
 *          `startOffsetMs > focusRunOffsetMs`. The recorder keeps all
 *          events — the view just slices.
 *
 * Why a separate component (not inlined in Lens):
 *   - Reused across views (Engineer, Analyst)
 *   - Keyboard bindings live here so the scope is explicit
 *   - Theme/styling lives in one place
 */

import React, { useEffect } from 'react';
import { T } from './theme/index.js';

export interface TimeTravelProps {
  /** Total number of events in the log (= max seq + 1 for zero-indexed seq). */
  readonly total: number;
  /** Current focus position. Clamped to [0, total - 1]. */
  readonly focusSeq: number;
  /** Called on every scrub / step / live click. */
  readonly onFocusChange: (seq: number) => void;
  /** True when `focusSeq === total - 1`. Drives ⟳Live button visual. */
  readonly isLive: boolean;
  /**
   * Optional label for the current step — shown in the middle of the
   * slider track. Helps consumers see *what* they're scrubbed to (e.g.,
   * "User → LLM" or "Tool: weather"). When omitted, no label renders.
   */
  readonly currentStepLabel?: string;
}

export const TimeTravel: React.FC<TimeTravelProps> = ({
  total,
  focusSeq,
  onFocusChange,
  isLive,
  currentStepLabel,
}) => {
  const max = Math.max(0, total - 1);

  const step = (delta: number): void => {
    onFocusChange(Math.min(max, Math.max(0, focusSeq + delta)));
  };

  // Arrow-key scrubbing. Bound at the window so it works regardless of
  // where focus is — but skip when the user is typing in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        onFocusChange(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onFocusChange(max);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq, max]);

  const disabled = total <= 1;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        margin: '4px 0',
        background: `color-mix(in srgb, ${T.bgElevated} 70%, transparent)`,
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: `1px solid ${T.border}`,
        borderRadius: 999,
        fontFamily: T.fontSans,
        fontSize: 12,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      }}
    >
      <button
        onClick={() => step(-1)}
        disabled={focusSeq <= 0 || disabled}
        style={btnStyle(false)}
        title="Previous event (←)"
        aria-label="Previous event"
      >
        ◀
      </button>
      <button
        onClick={() => step(+1)}
        disabled={focusSeq >= max || disabled}
        style={btnStyle(false)}
        title="Next event (→)"
        aria-label="Next event"
      >
        ▶
      </button>
      <button
        onClick={() => onFocusChange(max)}
        disabled={isLive || disabled}
        style={btnStyle(!isLive && total > 0)}
        title="Jump to latest event (End)"
        aria-label="Jump to latest"
      >
        {isLive ? '● Live' : '⟳ Live'}
      </button>
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={0}
          max={max}
          value={Math.min(focusSeq, max)}
          onChange={(e) => onFocusChange(Number(e.target.value))}
          disabled={disabled}
          style={{
            flex: 1,
            accentColor: T.primary,
            minWidth: 120,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
          }}
          title={disabled ? 'Single-step run — nothing to scrub' : undefined}
        />
        {currentStepLabel && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -160%)',
              fontSize: 10,
              fontWeight: 500,
              color: T.textSecondary,
              background: `color-mix(in srgb, ${T.bgElevated} 88%, transparent)`,
              padding: '1px 8px',
              borderRadius: 999,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              maxWidth: '70%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={currentStepLabel}
          >
            {currentStepLabel}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: T.textMuted,
          fontFamily: T.fontMono,
          whiteSpace: 'nowrap',
          minWidth: 60,
          textAlign: 'right',
        }}
      >
        {total === 0 ? '—' : total === 1 ? '1 step' : `${focusSeq + 1} / ${total}`}
      </div>
    </div>
  );
};

function btnStyle(accent: boolean): React.CSSProperties {
  return {
    background: accent ? T.primary : 'transparent',
    color: accent ? '#fff' : T.textSecondary,
    border: `1px solid ${accent ? T.primary : T.border}`,
    borderRadius: 999,
    padding: '2px 10px',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    lineHeight: 1.4,
  };
}
