/**
 * groupDisplayName — THE one spelling of a group's name.
 *
 * Pure function. Layer 1 / Tier B / Lens v0.1.
 *
 * A group appears in three places at once: the WHAT HAPPENED boundary rail,
 * the grouped ruler's stop label, and (since 0.36) the chip on the chart's
 * drawn group boundary. Before this function each of those picked its own
 * fallback chain, so the same subflow could be "Committee" on the rail and
 * `sf-committee#0` on the chart — two names for one place, which reads as two
 * places.
 *
 * The chain, outermost preference first:
 *
 *   1. `subflowName`      — what the author called the subflow.
 *   2. `compositionName`  — what the author called the composition
 *                           (Parallel / Sequence / Loop / Conditional).
 *   3. `primitiveKind`    — the kind of thing it is ("Agent", "LLMCall") when
 *                           the author named nothing.
 *   4. `'Run'`            — for the synthetic run root, which has no name to
 *                           inherit and is never a `sf-…` id to a reader.
 *   5. `runtimeStageId`   — the honest last resort: the address itself. Never
 *                           a guess, never an empty chip.
 *
 * Anything that names a group calls THIS. A second `??` chain over the same
 * fields anywhere else in the codebase is the bug this file exists to prevent.
 */

import type { BoundaryRangeLabel } from 'agentfootprint/observe';

/** The label fields a name can come from — structurally typed so a caller can
 *  pass a `BoundaryRangeLabel`, a `Group`, or any row carrying the same fields
 *  without a cast. */
export interface GroupNameSource {
  readonly subflowName?: string | undefined;
  readonly compositionName?: string | undefined;
  readonly primitiveKind?: string | undefined;
  readonly runtimeStageId: string;
  /** `'run.entry'` marks the synthetic root. Optional so a `Group` (which
   *  carries `isRoot` instead) can be passed through `groupDisplayNameOf`. */
  readonly type?: string | undefined;
}

/** The display name for one boundary label. See the chain above. */
export function groupDisplayName(label: GroupNameSource): string {
  const named = label.subflowName ?? label.compositionName ?? label.primitiveKind;
  if (named !== undefined && named !== '') return named;
  if (label.type === 'run.entry') return 'Run';
  return label.runtimeStageId;
}

/** Same chain for a wire `BoundaryRangeLabel` — the shape the boundary rail
 *  and the commentary selectors hand around. Exists so callers holding the
 *  agentfootprint type don't have to widen it themselves. */
export function groupDisplayNameForLabel(label: BoundaryRangeLabel): string {
  return groupDisplayName(label as unknown as GroupNameSource);
}
