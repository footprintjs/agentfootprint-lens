/**
 * <IterationScrubber> — mini-timeline of 1..N iterations for a loop.
 *
 * Layer 3 / Tier B / Lens v0.1.
 *
 * Renders one segment per iteration (1..current OR 1..max). The
 * "current" iteration is highlighted; earlier iterations are clickable
 * and call `onJump(iteration, runtimeStageId)` so the consumer can
 * snap the slider to that iteration's commit range.
 *
 * RuntimeStageId convention
 * ─────────────────────────
 *   For a loop stage `stageId`, the i-th iteration's runtimeStageId is
 *   `${stageId}#${i-1}` per footprintjs's executionIndex semantics.
 *   The scrubber synthesizes that key locally — it doesn't need a
 *   recorder lookup.
 *
 * Bounded
 * ───────
 *   `max` may be undefined (unbounded loop). When set, we render
 *   `max` segments and grey out future iterations (greater than
 *   `current`).
 */

import React from 'react';

export interface IterationScrubberProps {
  readonly current: number;
  readonly max: number | undefined;
  readonly stageId: string;
  readonly onJump?: (iteration: number, runtimeStageId: string) => void;
}

export const IterationScrubber: React.FC<IterationScrubberProps> = ({
  current,
  max,
  stageId,
  onJump,
}) => {
  if (current <= 0 && (max === undefined || max <= 0)) return null;

  const total = max ?? current;
  const items: number[] = [];
  for (let i = 1; i <= total; i++) items.push(i);

  return (
    <div
      role="tablist"
      aria-label={`Iteration scrubber for ${stageId}`}
      className="lens-iteration-scrubber"
      data-stage-id={stageId}
    >
      {items.map((i) => {
        const isCurrent = i === current;
        const isPast = i < current;
        const isFuture = i > current;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            disabled={isFuture}
            data-iteration={i}
            data-state={isCurrent ? 'current' : isPast ? 'past' : 'future'}
            className={
              'lens-iteration-segment'
              + (isCurrent ? ' lens-iteration-segment--current' : '')
              + (isPast ? ' lens-iteration-segment--past' : '')
              + (isFuture ? ' lens-iteration-segment--future' : '')
            }
            onClick={() => {
              if (!onJump || isFuture) return;
              onJump(i, `${stageId}#${i - 1}`);
            }}
          >
            {i}
          </button>
        );
      })}
    </div>
  );
};
