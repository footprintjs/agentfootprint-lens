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

import React, { useEffect, useMemo } from 'react';
import { T } from './theme/index.js';
import { bandIndexOf, type StepBand } from '../core/group/stepBands.js';
import { nextSnapStep, prevSnapStep, snapPositionOf } from '../core/group/snapSteps.js';

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
   * The GROUPED ruler: bands over the step axis (from `stepBands`). When
   * present (compact mode), the strip renders ONE segment per band — sized by
   * how many steps it covers, labelled with the band's name — and clicking a
   * band jumps to ITS first step. The bands are the GROUPING, not the unit of
   * movement: ◀ ▶ and the arrow keys still move stop by stop, so every
   * position on the axis is reachable by the transport alone (the readout
   * names both: "Iteration 2 · stop 9 of 17"). `snapSteps` is the one prop
   * that narrows where the step buttons land, and it says there what stays
   * reachable when it does.
   *
   * No second cursor: the position is still `focusSeq` (a step), the active
   * band is DERIVED from which range contains it, and every move still goes
   * out through `onFocusChange(step)` — this component stores nothing.
   */
  readonly bands?: readonly StepBand[];
  /**
   * SNAP STOPS — the positions ◀ ▶ and ← → are allowed to land on, as an
   * ASCENDING list of steps on the axis this transport already receives.
   *
   * Why: a hosted view shares the host's axis, which is the run's and not the
   * view's. A four-tool turn can put 73 stops on it while the view changes at
   * eight of them, so 65 presses show the reader the same picture twice. The
   * cure is NOT a second slider with its own numbers (two transports over one
   * run is the drift this package refuses) — the axis, the numbers and the one
   * cursor all stay the host's, and only the STEP BUTTONS' landing set narrows.
   *
   * What stays true when it is set:
   *   • the drag track and the step strip keep the FULL axis — every position
   *     is still reachable, just not by ◀ ▶;
   *   • Home / End still go to the axis endpoints, because they are jumps, not
   *     steps (band clicks and strip clicks are jumps too, and also unaffected);
   *   • a position BETWEEN two stops resolves to the one at-or-before, and the
   *     readout SAYS it is between rather than rounding down silently;
   *   • nothing is stored — the position is still `focusSeq`, and every move
   *     still leaves through `onFocusChange(step)`.
   *
   * Entries the axis cannot hold (negative, past `total - 1`, non-integer) are
   * ignored: a stop the axis does not have is not a stop. An empty list, or a
   * list whose entries are all off-axis, is the same as passing nothing.
   *
   * Orthogonal to `bands`: bands GROUP the axis, snaps MOVE along it. Set both
   * and the readout names the band, the stop and the raw step.
   *
   * @example
   * ```tsx
   * // ◀ ▶ walk only the steps where the skill graph's picture changes.
   * <TimeTravel total={73} focusSeq={step} onFocusChange={go} isLive={false}
   *             snapSteps={[0, 9, 17, 31, 44, 58, 72]} />
   * ```
   */
  readonly snapSteps?: readonly number[];
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
  snapSteps,
  keyboard = true,
}) => {
  const max = Math.max(0, total - 1);

  // The GROUPED ruler is a pure projection: which band the cursor is in is
  // DERIVED from focusSeq on every render — never stored, so it can never
  // drift from the one cursor.
  const banded = bands !== undefined && bands.length > 0;
  const bandIdx = banded ? bandIndexOf(bands, focusSeq) : -1;

  // SNAP STOPS, kept honest at the door: an entry the axis cannot hold is not
  // a stop, so it is dropped here rather than clamped onto a neighbour (a
  // clamped stop would let ▶ report the same position forever). All entries
  // dropped ⇒ `undefined` ⇒ byte-identical to passing nothing.
  const snaps = useMemo(() => {
    if (snapSteps === undefined) return undefined;
    const onAxis = snapSteps.filter((s) => Number.isInteger(s) && s >= 0 && s <= max);
    return onAxis.length > 0 ? onAxis : undefined;
  }, [snapSteps, max]);

  const prevStop = snaps !== undefined ? prevSnapStep(snaps, focusSeq) : undefined;
  const nextStop = snaps !== undefined ? nextSnapStep(snaps, focusSeq) : undefined;
  const canBack = snaps !== undefined ? prevStop !== undefined : focusSeq > 0;
  const canFwd = snaps !== undefined ? nextStop !== undefined : focusSeq < max;

  // Stop by stop, banded or not: the bands are the ruler's GROUPING, never
  // its unit of movement — a ◀ ▶ that jumped whole bands would make the
  // stops inside a band unreachable by the transport alone. (Band CLICKS
  // still jump to a band's first step; that is a jump, not the step key.)
  //
  // With `snapSteps` the unit of movement narrows — and ONLY that. The step
  // buttons walk the permitted stops (strictly ahead / strictly behind, so a
  // cursor parked between two of them walks back onto the one it is standing
  // past); the drag track, the step strip, band clicks and Home/End all still
  // reach every position on the axis. No wrap at either end: `undefined` from
  // the query disables the button instead.
  const step = (delta: number): void => {
    if (snaps !== undefined) {
      const to = delta < 0 ? prevSnapStep(snaps, focusSeq) : nextSnapStep(snaps, focusSeq);
      if (to !== undefined) onFocusChange(to);
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
  }, [focusSeq, max, keyboard, bands, snaps]);

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
        disabled={!canBack || disabled}
        style={btnStyle(false)}
        title={snaps !== undefined ? 'Previous stop (←)' : 'Previous step (←)'}
        aria-label={snaps !== undefined ? 'Previous stop' : 'Previous step'}
      >
        ◀
      </button>
      <button
        onClick={() => step(+1)}
        disabled={!canFwd || disabled}
        style={btnStyle(false)}
        title={snaps !== undefined ? 'Next stop (→)' : 'Next step (→)'}
        aria-label={snaps !== undefined ? 'Next stop' : 'Next step'}
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
        {/* Both readouts count STOPS on the one axis. The banded one also
            names the group the cursor stands in — "Iteration 2 · stop 9 of
            17" — so the grouping and the position are both visible, honestly:
            the group is where you are, the stop is how far along.

            SNAPPING adds the third truth. ◀ ▶ no longer reach every position,
            so the readout must say where the cursor stands among the STOPS —
            and, when it stands between two of them, that it does. It keeps the
            raw step beside it, because that number is still the one the host
            owns and the slider still moves. */}
        {snaps !== undefined
          ? `${banded && bands[bandIdx] !== undefined ? `${bands[bandIdx]!.label} · ` : ''}${snapReadout(snaps, Math.min(focusSeq, max), total)}`
          : banded
            ? `${bands[bandIdx] !== undefined ? `${bands[bandIdx]!.label} · ` : ''}stop ${Math.min(focusSeq, max) + 1} of ${total}`
            : total === 0
              ? '—'
              : total === 1
                ? '1 step'
                : `${focusSeq + 1} / ${total}`}
      </div>
    </div>
  );
};

/**
 * The snapping readout — where the cursor stands among the permitted stops,
 * and the raw step it is on.
 *
 * The four arms are four different truths, and collapsing any of them into
 * "stop N" would be the lie this feature exists to avoid: with ◀ ▶ narrowed to
 * the stops, a cursor the slider parked between two of them is a position the
 * step buttons cannot reproduce, and the reader has to be told.
 */
function snapReadout(snaps: readonly number[], focus: number, total: number): string {
  const { index, exact } = snapPositionOf(snaps, focus);
  const raw = `${focus + 1} / ${total}`;
  if (index < 0) return `before stop 1 · ${raw}`;
  if (exact) return `stop ${index + 1} of ${snaps.length} · ${raw}`;
  if (index === snaps.length - 1) return `past stop ${index + 1} of ${snaps.length} · ${raw}`;
  return `between stops ${index + 1} and ${index + 2} of ${snaps.length} · ${raw}`;
}

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
