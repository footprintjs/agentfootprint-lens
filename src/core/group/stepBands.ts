/**
 * stepBands — the grouped ruler's BANDS, as a pure projection of the step axis.
 *
 * ── The one-cursor law, restated for this file ──────────────────────────────
 * The only cursor in the system is the step on the lens's scrub axis (whose
 * address is a runtimeStageId — see `cursorPositionsAtDrill`). A band is NOT a
 * second axis and NOT a stored position: it is a contiguous RANGE of steps,
 * derived from the positions array alone. Which band is "active" is derived
 * from which range contains the cursor; clicking a band moves the ONE cursor
 * to the band's first step. Nothing here holds state, and nothing downstream
 * may store a band index — a stored band index would be a beat counter, the
 * exact thing the locked v0.1 architecture bans.
 *
 * ── What a band IS ──────────────────────────────────────────────────────────
 * The grouped reading of an agent run is its LOOP PASSES. The step axis
 * already knows where they begin: the domain's milestone classifier marks the
 * per-iteration boundary stop as `'iteration'` (`CursorPosition.milestone`),
 * and everything after it — context, LLM turn, routing, tool call — belongs to
 * that pass until the next one begins. So:
 *
 *   • a depth-0 `group-start` / `group-end` stop (Run · start / Run · end) is
 *     a band of its own — the bookends;
 *   • an `'iteration'` milestone OPENS a band, labelled with that stop's own
 *     label ("Iteration 2" — the spelling the step strip already used);
 *   • every other stop extends the band it follows.
 *
 * ── Honesty fallback ────────────────────────────────────────────────────────
 * An axis with NO iteration milestones (a plain Sequence chart, a drilled
 * subflow's internals) has no grouped structure to read — so every step is its
 * own band, and the grouped ruler degenerates to the per-step one. That is a
 * true statement about the chart, not a rendering choice: inventing bands for
 * a run that has none would be fabricating structure.
 *
 * Invariant (pinned in tests): the bands tile the axis exactly — every step is
 * in exactly one band, in order, with no gaps.
 */

import type { CursorPosition } from './cursorPositionsAtDrill.js';
import type { CommitWithStage, ChartGroupHighlight } from './activeChartGroup.js';
import { chartNodeIdOf } from './activeChartGroup.js';

export interface StepBand {
  /** The band's name, as the strip shows it — the opening stop's own label. */
  readonly label: string;
  /** First step (inclusive) of the range this band covers. */
  readonly firstStep: number;
  /** Last step (inclusive). `firstStep === lastStep` for a one-stop band. */
  readonly lastStep: number;
  /** What opened the band — the root bookends against a real group of steps. */
  readonly kind: 'run-start' | 'run-end' | 'group';
}

/** Is this stop a depth-0 run bookend? */
function isRootBookend(p: CursorPosition): boolean {
  return p.depth === 0 && (p.kind === 'group-start' || p.kind === 'group-end');
}

export function stepBands(positions: readonly CursorPosition[]): readonly StepBand[] {
  if (positions.length === 0) return [];

  // Honesty fallback: no iteration milestones → no grouped structure → one
  // band per step (the grouped ruler degenerates to the per-step one).
  const hasIterations = positions.some((p) => p.milestone === 'iteration');
  if (!hasIterations) {
    return positions.map((p, i) => ({
      label: p.label,
      firstStep: i,
      lastStep: i,
      kind: bookendKind(p) ?? 'group',
    }));
  }

  const bands: StepBand[] = [];
  let open: { label: string; firstStep: number; kind: StepBand['kind'] } | undefined;

  const close = (lastStep: number): void => {
    if (open === undefined) return;
    bands.push({ label: open.label, firstStep: open.firstStep, lastStep, kind: open.kind });
    open = undefined;
  };

  positions.forEach((p, i) => {
    const bookend = bookendKind(p);
    if (bookend !== undefined) {
      close(i - 1);
      bands.push({ label: p.label, firstStep: i, lastStep: i, kind: bookend });
      return;
    }
    if (p.milestone === 'iteration' || open === undefined) {
      close(i - 1);
      open = { label: p.label, firstStep: i, kind: 'group' };
      return;
    }
    // extends the open band
  });
  close(positions.length - 1);

  return bands;
}

function bookendKind(p: CursorPosition): 'run-start' | 'run-end' | undefined {
  if (!isRootBookend(p)) return undefined;
  return p.kind === 'group-start' ? 'run-start' : 'run-end';
}

/** The band containing `step` — derived, never stored. `-1` when out of range. */
export function bandIndexOf(bands: readonly StepBand[], step: number): number {
  return bands.findIndex((b) => step >= b.firstStep && step <= b.lastStep);
}

/**
 * The band the cursor stands in, resolved to CHART NODE IDS — the grouped
 * ruler's chart highlight, shaped exactly like `activeChartGroup`'s answer so
 * the same boundary renderer draws it.
 *
 * Membership is the band's COMMIT SPAN: from the band's first stop's commit to
 * just before the NEXT band's first commit (the last band runs to the end of
 * the log). That span is what the group of steps actually did — including the
 * commits between the strip's stops — so the whole pass lights as one place.
 *
 * The bookend bands return `undefined`: a boundary drawn around the whole
 * chart states nothing (the same judgement `useChartGroup`'s `includeRoot`
 * default makes).
 */
export function bandChartGroup(args: {
  readonly bands: readonly StepBand[];
  readonly bandIndex: number;
  readonly positions: readonly CursorPosition[];
  /** The run's commit log, in commit order (index === commitIdx). */
  readonly commits: readonly CommitWithStage[];
}): ChartGroupHighlight | undefined {
  const { bands, bandIndex, positions, commits } = args;
  const band = bands[bandIndex];
  if (band === undefined || band.kind !== 'group') return undefined;

  const first = positions[band.firstStep];
  if (first === undefined) return undefined;
  const from = Math.max(0, first.commitIdx);

  // Up to (not including) the next band's first commit; the last band runs out
  // the log. A next band that is a bookend anchors the end the same way.
  const next = bands[bandIndex + 1];
  const nextFirst = next !== undefined ? positions[next.firstStep] : undefined;
  const to = Math.min(
    commits.length - 1,
    nextFirst !== undefined ? nextFirst.commitIdx - 1 : commits.length - 1,
  );

  const memberNodeIds = new Set<string>();
  for (let i = from; i <= to; i++) {
    const rid = commits[i]?.runtimeStageId;
    if (rid === undefined || rid === '') continue;
    memberNodeIds.add(chartNodeIdOf(rid));
  }
  if (memberNodeIds.size === 0) return undefined;

  return {
    runtimeGroupId: first.runtimeGroupId,
    name: band.label,
    memberNodeIds,
    opensAtCommitIdx: from,
    closesAtCommitIdx: to,
    depth: 1,
  };
}
