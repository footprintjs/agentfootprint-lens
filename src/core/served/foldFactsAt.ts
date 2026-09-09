/**
 * foldFactsAt — the agent's own state keys at the cursor, read from the FOLD.
 *
 * The receipt never names what a caller's ROLE was not allowed to see — that
 * is the library's first law, and it holds because committed state is readable
 * by debugging tools. This tab's audience IS a debugging tool's audience (an
 * operator), so it MAY show which skills were hidden from the model — but it
 * reads them from the fold at the stop, through footprintjs's own `stateAt`,
 * never from the receipt and never by re-deriving them.
 *
 * Nothing is computed here beyond "which keys are present and what they hold".
 * Shapes the lens does not own (`stepPointer`, `mapEngagement`, an active
 * injection) pass through as data for a renderer to print as data.
 *
 * NOT READ: a memory identity. The agent commits `runIdentity`
 * (`{ conversationId }`) and no `identity` key, and nothing it commits names
 * an active ROLE — so no identity fact is on this list until the library
 * commits one a reader could use.
 *
 * A FOLD THAT CANNOT READ ITS LOG IS DATA, NOT A CRASH. A recording came off
 * disk; a row of it may not be a commit bundle. footprintjs 9.18 skips such a
 * row and reports its index in `FoldedState.skipped`; 9.17 throws inside
 * `stateAt`. Both are surfaced here as facts — `skipped` (the indices) and
 * `foldError` (the message) — so the tab prints them beside the Damaged badge
 * and the receipt, the view and the one cursor stay on screen.
 */

import { stateAt, type FoldBasis, type FoldSource } from 'footprintjs/trace';

import type { ServedCursor } from './types.js';

/** The keys this query reads, in render order. Nothing else is looked at. */
export const FOLD_FACT_KEYS = Object.freeze([
  'iteration',
  'currentSkillId',
  'stepPointer',
  'mapEngagement',
  'activeInjections',
  'hiddenSkillIds',
] as const);

export type FoldFactKey = (typeof FOLD_FACT_KEYS)[number];

export interface FoldFacts {
  /** `'initial+log'` when the recording carried its base; `'log-only'` when it
   *  did not (values then read as the log alone set them). ABSENT when the
   *  fold threw (`foldError`) — the basis is then unknown, not one or the
   *  other. */
  readonly basis?: FoldBasis;
  /** `true` when the fold passed a redacted write — placeholders, not values. */
  readonly redacted: boolean;
  /** Which of {@link FOLD_FACT_KEYS} the fold holds a value for. */
  readonly present: readonly FoldFactKey[];
  /** Commit-log indices the fold could not read as bundles and skipped
   *  (footprintjs 9.18's `FoldedState.skipped`). Absent when none. */
  readonly skipped?: readonly number[];
  /** The message the fold threw with, when it could not run at all. Every
   *  fact above is then absent; the receipt and the view are unaffected. */
  readonly foldError?: string;
  readonly iteration?: number;
  readonly currentSkillId?: string;
  readonly stepPointer?: unknown;
  readonly mapEngagement?: unknown;
  readonly activeInjections?: readonly unknown[];
  /** The skill ids the caller's role could not see at this stop. From the
   *  fold — never from a receipt. */
  readonly hiddenSkillIds?: readonly string[];
}

/** `FoldedState.skipped` as 9.18 reports it — read duck-typed so the lens's
 *  9.17 floor still compiles and a 9.18 resolution surfaces the indices. */
function skippedIndicesOf(folded: unknown): readonly number[] | undefined {
  const rows = (folded as { skipped?: unknown }).skipped;
  if (!Array.isArray(rows)) return undefined;
  const indices = rows
    .map((r) => (r as { index?: unknown } | null)?.index)
    .filter((i): i is number => typeof i === 'number');
  return indices.length > 0 ? Object.freeze(indices) : undefined;
}

/**
 * The fold at the cursor's commit anchor. A cursor with `commitIdx < 0` folds
 * nothing and returns the base — footprintjs's own rule.
 *
 * @param recording a run snapshot: `commitLog` + `initialState`, as recorded.
 */
export function foldFactsAt(recording: unknown, cursor: ServedCursor): FoldFacts {
  // The lens types a stored recording's log as `readonly unknown[]` because it
  // came off disk as JSON; footprintjs's fold takes `CommitBundle[]`. This is
  // the one documented narrowing at the seam (README · "Time travel through
  // one port").
  let folded: ReturnType<typeof stateAt>;
  try {
    folded = stateAt(recording as FoldSource | undefined, cursor.commitIdx);
  } catch (e) {
    return Object.freeze({
      redacted: false,
      present: Object.freeze([]),
      foldError: e instanceof Error ? e.message : String(e),
    });
  }
  const state = folded.state;
  const present: FoldFactKey[] = [];
  const out: Record<string, unknown> = {};
  for (const key of FOLD_FACT_KEYS) {
    const value = state[key];
    if (value === undefined) continue;
    present.push(key);
    out[key] = value;
  }
  const hidden = out.hiddenSkillIds;
  const injections = out.activeInjections;
  const skipped = skippedIndicesOf(folded);
  return Object.freeze({
    basis: folded.basis,
    redacted: folded.redacted,
    present: Object.freeze(present),
    ...(skipped !== undefined ? { skipped } : {}),
    ...(typeof out.iteration === 'number' ? { iteration: out.iteration } : {}),
    ...(typeof out.currentSkillId === 'string' ? { currentSkillId: out.currentSkillId } : {}),
    ...(out.stepPointer !== undefined ? { stepPointer: out.stepPointer } : {}),
    ...(out.mapEngagement !== undefined ? { mapEngagement: out.mapEngagement } : {}),
    ...(Array.isArray(injections) ? { activeInjections: Object.freeze([...injections]) } : {}),
    ...(Array.isArray(hidden) && hidden.every((h) => typeof h === 'string')
      ? { hiddenSkillIds: Object.freeze([...(hidden as string[])]) }
      : {}),
  });
}
