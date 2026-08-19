/**
 * TimeTravel — scrub slider.
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
import { bandIndexOf, type StepBand } from '../core/group/stepBands.js';

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
   * Compact mode — render ONLY the ◀ ▶ ⟳Live controls + position count, NOT the
   * drag track. Used in the monitor where the "WHAT HAPPENED" timeline IS the
   * scrubber, so a second draggable track would be redundant. Keyboard scrubbing
   * + Live still work.
   */
  readonly compact?: boolean;
  /**
   * In compact mode, render a clickable STEP STRIP — one tick per event, every
   * step visible in a row, click any to jump (and the focused tick stands out).
   * A lightweight all-steps overview + scrubber when the drag track is omitted.
   * ON by default; pass `false` for just ◀ ▶ ⟳Live + the count.
   */
  readonly stepStrip?: boolean;
  /**
   * The GROUPED ruler: bands over the same step axis (from `stepBands`).
   * When present (compact mode), the strip renders ONE segment per band —
   * sized by how many steps it covers, labelled with the band's name — and
   * every mover here moves GROUP BY GROUP: ◀ ▶ and the arrow keys go to the
   * adjacent band's first step, clicking a band goes to ITS first step.
   *
   * No second cursor: the position is still `focusSeq` (a step), the active
   * band is DERIVED from which range contains it, and every move still goes
   * out through `onFocusChange(step)` — this component stores nothing.
   */
  readonly bands?: readonly StepBand[];
  /**
   * Bind ← → Home End at the window. Default `true` — today's behaviour.
   *
   * Turn it OFF for a SECOND transport on the same page. Two mounted
   * transports both listen at the window and both move the ONE cursor, so a
   * single arrow press moves it twice (and by different units when the two
   * are bound to different projections of the axis). The page's primary
   * transport keeps the keys; the secondary one asks for `keyboard={false}`.
   */
  readonly keyboard?: boolean;
}

export const TimeTravel: React.FC<TimeTravelProps> = ({
  total,
  focusSeq,
  onFocusChange,
  isLive,
  compact,
  stepStrip = true,
  bands,
  keyboard = true,
}) => {
  const max = Math.max(0, total - 1);

  // The GROUPED ruler is a pure projection: which band the cursor is in is
  // DERIVED from focusSeq on every render — never stored, so it can never
  // drift from the one cursor.
  const banded = bands !== undefined && bands.length > 0;
  const bandIdx = banded ? bandIndexOf(bands, focusSeq) : -1;

  const step = (delta: number): void => {
    if (banded) {
      // Group-by-group: the adjacent band's FIRST step. From a mid-band
      // position, ◀ goes to the top of the band the cursor is in only via its
      // predecessor — "previous group", as the ruler promises.
      const next = Math.min(bands.length - 1, Math.max(0, bandIdx + delta));
      const target = bands[next]?.firstStep;
      if (target !== undefined && target !== focusSeq) onFocusChange(target);
      return;
    }
    onFocusChange(Math.min(max, Math.max(0, focusSeq + delta)));
  };

  // Arrow-key scrubbing. Bound at the window so it works regardless of
  // where focus is — but skip when the user is typing in an input.
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent): void => {
      // `matches` is feature-detected: a keydown dispatched AT the window or
      // the document (a host that forwards keys, a test harness) has a target
      // that is not an Element, and calling it blindly throws inside the
      // listener — taking the transport out over a guard clause.
      const target = e.target as HTMLElement | null;
      if (
        target !== null &&
        typeof target.matches === 'function' &&
        target.matches('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }
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
  }, [focusSeq, max, keyboard, bands]);

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
        disabled={(banded ? bandIdx <= 0 : focusSeq <= 0) || disabled}
        style={btnStyle(false)}
        title={banded ? 'Previous group (←)' : 'Previous event (←)'}
        aria-label={banded ? 'Previous group' : 'Previous event'}
      >
        ◀
      </button>
      <button
        onClick={() => step(+1)}
        disabled={(banded ? bandIdx >= bands.length - 1 : focusSeq >= max) || disabled}
        style={btnStyle(false)}
        title={banded ? 'Next group (→)' : 'Next event (→)'}
        aria-label={banded ? 'Next group' : 'Next event'}
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
      {/* Compact mode: a clickable STEP STRIP (every step visible, click to jump
          — including BACKWARD to any earlier step), or just a spacer if disabled.
          With `bands`, the strip is the GROUPED ruler instead: one labelled
          segment per band, sized by the steps it covers. */}
      {compact && banded ? (
        <div
          role="group"
          aria-label="Groups"
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, minWidth: 120, padding: '0 4px' }}
        >
          {bands.map((band, i) => {
            const here = i === bandIdx;
            const done = i < bandIdx;
            const span = band.lastStep - band.firstStep + 1;
            return (
              <button
                key={`${band.firstStep}:${band.label}`}
                onClick={() => onFocusChange(band.firstStep)}
                disabled={disabled}
                title={
                  span === 1
                    ? `${band.label} — step ${band.firstStep + 1} of ${total}`
                    : `${band.label} — steps ${band.firstStep + 1}–${band.lastStep + 1} of ${total}`
                }
                aria-label={`Go to ${band.label}`}
                aria-current={here ? 'step' : undefined}
                style={{
                  flex: span,
                  minWidth: 22,
                  height: here ? 20 : 15,
                  padding: '0 4px',
                  border: 'none',
                  borderRadius: 4,
                  cursor: disabled ? 'default' : 'pointer',
                  background: here ? T.warning : done ? T.success : T.border,
                  color: here ? '#3b2b00' : T.textSecondary,
                  fontSize: 10,
                  fontWeight: here ? 600 : 500,
                  lineHeight: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  transition: 'height 0.12s ease, background 0.12s ease',
                }}
              >
                {band.label}
              </button>
            );
          })}
        </div>
      ) : compact ? (
        stepStrip && total > 1 ? (
          <div
            role="group"
            aria-label="Steps"
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, minWidth: 120, padding: '0 4px' }}
          >
            {Array.from({ length: total }, (_, i) => {
              const done = i < focusSeq;
              const here = i === focusSeq;
              return (
                <button
                  key={i}
                  onClick={() => onFocusChange(i)}
                  disabled={disabled}
                  title={`Step ${i + 1} / ${total}`}
                  aria-label={`Go to step ${i + 1}`}
                  aria-current={here ? 'step' : undefined}
                  style={{
                    flex: 1,
                    minWidth: 3,
                    height: here ? 16 : 9,
                    padding: 0,
                    border: 'none',
                    borderRadius: 3,
                    cursor: disabled ? 'default' : 'pointer',
                    background: here ? T.warning : done ? T.success : T.border,
                    transition: 'height 0.12s ease, background 0.12s ease',
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )
      ) : (
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
      </div>
      )}
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
        {banded
          ? bands.length === 1
            ? '1 group'
            : `group ${bandIdx + 1} / ${bands.length}`
          : total === 0
            ? '—'
            : total === 1
              ? '1 step'
              : `${focusSeq + 1} / ${total}`}
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
