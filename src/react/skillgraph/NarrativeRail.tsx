/**
 * <NarrativeRail> — the product lens: the run's story, revealed with time.
 *
 * Every sentence here is the LIBRARY'S — `humanizeCursorMove`,
 * `humanizeSkillRejected`, `humanizeRouteConflict`, `humanizeTurnRouted`, the
 * same builders `defaultHumanizer` composes for the Commentary panel — carried
 * onto the beats by `selectSkillBeats`. This component chooses which of them
 * are visible and which one is emphasized; it writes none of them. That rule
 * is what keeps the product lens honest: a reader who switches to the
 * developer lens sees the same facts, not a different story.
 *
 * ACCUMULATION is the whole design. Beats up to the cursor stay on screen, in
 * order, dimmed; the beat at the cursor is emphasized; beats after it are
 * hidden, because a story that shows its ending has stopped being a replay.
 * Scrub back and the later paragraphs disappear again — the rail is a pure
 * function of the ONE cursor, and holds no position of its own.
 */

import React, { useEffect, useRef } from 'react';

import type { SkillBeat } from '../../core/selectors/selectSkillBeats.js';
import { T } from '../theme/index.js';

export interface NarrativeRailProps {
  readonly beats: readonly SkillBeat[];
  /** Index of the beat the cursor resolves to; `undefined` = before the first. */
  readonly activeIndex?: number;
  /** Move THE cursor — clicking a paragraph returns to that moment. */
  readonly onJumpTo?: (runtimeStageId: string) => void;
}

export function NarrativeRail({
  beats,
  activeIndex,
  onJumpTo,
}: NarrativeRailProps): React.ReactElement {
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // Feature-detected, not assumed: jsdom (and any non-browser renderer)
    // ships elements without it, and a rail that throws while scrolling has
    // taken the whole view down over a nicety.
    const el = activeRef.current;
    if (el !== null && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const shown = activeIndex === undefined ? [] : beats.slice(0, activeIndex + 1);

  return (
    <div
      data-testid="narrative-rail"
      style={{
        height: '100%',
        overflow: 'auto',
        padding: 14,
        boxSizing: 'border-box',
        background: T.bgPrimary,
        color: T.textPrimary,
        fontFamily: T.fontSans,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 650 }}>What the assistant did, so far</div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
        {shown.length === 0
          ? 'The story starts at the first stop — move the cursor forward.'
          : `${shown.length} of ${beats.length} step${beats.length === 1 ? '' : 's'} so far`}
      </div>

      <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
        {shown.map((b, i) => {
          const isNewest = i === shown.length - 1;
          return (
            <li
              key={`${b.turnIndex}:${b.iteration}`}
              ref={isNewest ? activeRef : undefined}
              data-testid={`narrative-beat-${i}`}
              data-newest={isNewest ? 'true' : 'false'}
              style={{
                position: 'relative',
                paddingLeft: 16,
                paddingBottom: 12,
                opacity: isNewest ? 1 : 0.62,
                transition: 'opacity 160ms',
              }}
            >
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 5,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isNewest ? T.primary : T.textMuted,
                }}
              />
              {i < shown.length - 1 && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 3.5,
                    top: 15,
                    bottom: 0,
                    width: 1,
                    background: T.border,
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  if (b.runtimeStageId !== undefined) onJumpTo?.(b.runtimeStageId);
                }}
                disabled={b.runtimeStageId === undefined}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: 'inherit',
                  cursor: b.runtimeStageId !== undefined ? 'pointer' : 'default',
                  font: 'inherit',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: T.textMuted,
                  }}
                >
                  {b.label}
                  {b.cursorSkillId !== undefined ? ` · ${b.cursorSkillId}` : ''}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: isNewest ? 13.5 : 12.5,
                    lineHeight: 1.5,
                    fontWeight: isNewest ? 600 : 400,
                    color: isNewest ? T.textPrimary : T.textSecondary,
                  }}
                >
                  {b.headline}
                </div>
                {b.notes.map((n, ni) => (
                  <div
                    key={ni}
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: b.refusedIds.length > 0 && ni === 0 ? T.error : T.textSecondary,
                    }}
                  >
                    {n}
                  </div>
                ))}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
