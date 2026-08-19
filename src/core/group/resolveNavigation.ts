/**
 * `resolveNavigation` — "take me to this stage", answered honestly.
 *
 * A host that wants to POINT at evidence (a chat answer citing the step it
 * means, a dashboard row, a deep link) knows one thing: a `runtimeStageId`.
 * The lens's cursor, though, is owned in STEPS on whichever axis the active
 * surface scrubs — and that axis may stop somewhere coarser than the address
 * (a whole iteration rather than the stage inside it), or may not reach it at
 * all. This is the one rule that turns the address into an answer.
 *
 * THE LADDER (the same rungs `stepForRuntimeStageId` has always climbed —
 * this function IS that ladder, with each rung NAMED instead of flattened
 * into a number):
 *
 *   1. **exact** — a stop whose `runtimeStageId` is the one asked for. Several
 *      stops can share an id (a group's start and end); the FIRST is returned,
 *      because a mover means "take me there", not "take me to the end of
 *      there". → `{ ok: true, match: 'exact' }`
 *   2. **enclosing** — the stop whose subflow CONTAINS the address. An address
 *      inside a subflow (`sf-x/inner#7`) is held by that subflow's own stop
 *      (`sf-x#5`). Landing there is a true landing: the cursor really is
 *      standing on the evidence, at the granularity this axis has. The stop's
 *      own id comes back in `runtimeStageId`, so the caller always knows where
 *      it actually went. → `{ ok: true, match: 'enclosing' }`
 *   3. **nearest-previous — OFFERED, NEVER TAKEN.** When no stop holds the
 *      address, the stop with the largest executionIndex ≤ the address's is
 *      handed back as DATA on a MISS (`{ ok: false, nearest }`). Standing just
 *      before something is a true answer, but it is not the answer that was
 *      asked for — so the caller decides whether to take it. A jump that
 *      silently lands somewhere else is the failure this shape exists to
 *      prevent.
 *   4. **nothing** — no stop is at or before the address (it pre-dates the
 *      first stop, the axis is empty, or the string is not an address at all).
 *      → `{ ok: false }` with no `nearest`. Do not move.
 *
 * Pure, never throws, and never guesses FORWARD: a cursor that lands past its
 * target has answered a question nobody asked.
 *
 * @example Headless — a server-rendered link that needs a step, no React.
 * ```ts
 * import { scrubAxisFor, resolveNavigation } from 'agentfootprint-lens/core';
 *
 * const positions = scrubAxisFor(recorder, 'step');
 * const to = resolveNavigation(positions, 'llm#7');
 * const href = to.ok ? `/run/${runId}?step=${to.step}` : undefined;
 * ```
 *
 * @example The miss, offered rather than taken.
 * ```ts
 * const to = resolveNavigation(positions, 'sf-tools/search#42');
 * if (!to.ok && to.nearest) {
 *   // Render it as a choice, not a jump:
 *   // "That step isn't on this ruler. Go to the one before it (Iteration 3)?"
 * }
 * ```
 */

import type { CursorPosition } from './cursorPositionsAtDrill.js';

/** How the address was matched to the stop the cursor lands on. */
export type NavigationMatch =
  /** The stop IS the address. */
  | 'exact'
  /** The stop's subflow CONTAINS the address — a true landing on a coarser
   *  axis. Read `runtimeStageId` for where the cursor actually stands. */
  | 'enclosing';

/** Why an address could not be moved to. Branch on this, not on `message`. */
export type NavigationMiss =
  /** No address was given (empty string). */
  | 'no-id'
  /** The axis has no stops yet — nothing to move to. */
  | 'empty-axis'
  /** The address is real but no stop holds it. `nearest` may offer the stop
   *  standing just before it. */
  | 'not-on-axis'
  /** Every stop on the axis comes AFTER the address. There is nothing at or
   *  before it, so there is no honest place to stand. */
  | 'before-first-stop';

/** The cursor moved (or, headlessly, can move) — this is where it lands. */
export interface NavigationHit {
  readonly ok: true;
  /** The step on the axis that was passed in. */
  readonly step: number;
  /** The address of the stop landed on — the one asked for when `match` is
   *  `'exact'`, the ENCLOSING stop's own address when it is `'enclosing'`. */
  readonly runtimeStageId: string;
  /** Which rung of the ladder answered. */
  readonly match: NavigationMatch;
  /** The stop's human label, as the step strip and timeline spell it. */
  readonly label: string;
}

/** The cursor did NOT move, and here is what is true instead. */
export interface NavigationRefusal {
  readonly ok: false;
  /** The machine-checkable reason. */
  readonly reason: NavigationMiss;
  /** The same reason as one plain sentence, safe to show a person. */
  readonly message: string;
  /**
   * The nearest stop BEFORE the address, when there is one — an OFFER, not a
   * move. Take it by navigating to `nearest.runtimeStageId` (an exact hit, by
   * construction), or ignore it.
   */
  readonly nearest?: {
    readonly runtimeStageId: string;
    readonly step: number;
    readonly label: string;
  };
}

export type NavigationResult = NavigationHit | NavigationRefusal;

/** Parse the `#N` executionIndex suffix off a runtimeStageId. */
function execIndex(runtimeStageId: string): number | undefined {
  const hash = runtimeStageId.lastIndexOf('#');
  if (hash < 0) return undefined;
  const n = Number(runtimeStageId.slice(hash + 1));
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Resolve an address to a step on the given axis.
 *
 * @param positions the scrub axis to resolve against — the ACTIVE one. From
 *                  `scrubAxisFor(recorder, granularity)` outside React, or
 *                  `useCursorPositions(recorder, drillPath)` inside it.
 * @param runtimeStageId the address to move to.
 */
export function resolveNavigation(
  positions: readonly CursorPosition[],
  runtimeStageId: string,
): NavigationResult {
  if (typeof runtimeStageId !== 'string' || runtimeStageId === '') {
    return {
      ok: false,
      reason: 'no-id',
      message:
        'No address was given. navigateTo needs a runtimeStageId — footprintjs\'s ' +
        'own address for a stage, like "llm#3" or "sf-tools/search#7".',
    };
  }
  if (positions.length === 0) {
    return {
      ok: false,
      reason: 'empty-axis',
      message:
        'This ruler has no stops yet, so there is nowhere to move. A run that has ' +
        'not committed a stage has no positions to scrub.',
    };
  }

  // Rung 1 — exact.
  const exact = positions.findIndex((p) => p.runtimeStageId === runtimeStageId);
  if (exact >= 0) {
    return {
      ok: true,
      step: exact,
      runtimeStageId,
      match: 'exact',
      label: positions[exact]?.label ?? '',
    };
  }

  const target = execIndex(runtimeStageId);
  if (target === undefined) {
    return {
      ok: false,
      reason: 'not-on-axis',
      message:
        `"${runtimeStageId}" is not a stop on this ruler, and it carries no ` +
        '#executionIndex, so no nearby stop can be worked out from it either. ' +
        'A runtimeStageId looks like "llm#3".',
    };
  }

  // Rung 2 — enclosing. The address's scopes, innermost first: `a/b/c#7` is
  // held by `a/b`, then by `a`.
  const scopes: string[] = [];
  const base = runtimeStageId.split('#')[0] ?? '';
  for (let cut = base.lastIndexOf('/'); cut > 0; cut = base.lastIndexOf('/', cut - 1)) {
    scopes.push(base.slice(0, cut));
  }
  for (const scope of scopes) {
    let best = -1;
    let bestIdx = -1;
    for (let i = 0; i < positions.length; i += 1) {
      const id = positions[i]?.runtimeStageId ?? '';
      if ((id.split('#')[0] ?? '') !== scope) continue;
      const idx = execIndex(id);
      if (idx === undefined || idx > target || idx <= bestIdx) continue;
      best = i;
      bestIdx = idx;
    }
    if (best >= 0) {
      return {
        ok: true,
        step: best,
        runtimeStageId: positions[best]?.runtimeStageId ?? '',
        match: 'enclosing',
        label: positions[best]?.label ?? '',
      };
    }
  }

  // Rung 3 — nearest-previous. Computed, then OFFERED on a miss.
  let prev = -1;
  let prevIdx = -1;
  for (let i = 0; i < positions.length; i += 1) {
    const idx = execIndex(positions[i]?.runtimeStageId ?? '');
    // `<=` not `<`: two stops can share an executionIndex (a group's start and
    // its end), and the FIRST of them is the one a mover means.
    if (idx === undefined || idx > target || idx <= prevIdx) continue;
    prev = i;
    prevIdx = idx;
  }
  if (prev >= 0) {
    const at = positions[prev]!;
    return {
      ok: false,
      reason: 'not-on-axis',
      message:
        `"${runtimeStageId}" is not a stop on this ruler. The nearest stop before ` +
        `it is "${at.runtimeStageId}" (step ${prev}${at.label ? `, ${at.label}` : ''}) — ` +
        'offered, not taken: moving there is your call.',
      nearest: { runtimeStageId: at.runtimeStageId, step: prev, label: at.label },
    };
  }

  // Rung 4 — nothing at or before it.
  return {
    ok: false,
    reason: 'before-first-stop',
    message:
      `"${runtimeStageId}" comes before this ruler's first stop, so there is nothing ` +
      'at or before it to stand on. The cursor did not move.',
  };
}
