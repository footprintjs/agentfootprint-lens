/**
 * selectToolChoiceCall — resolve the ONE cursor to a tool-choice call.
 *
 * Layer 1 / pure selector (RFC-002 block C7).
 *
 * The Lens has exactly ONE time cursor — a `runtimeStageId` (see
 * `memory/lens_v0_1_one_cursor_architecture.md`). The Tool-choice panel
 * derives its visible call FROM that cursor; it never owns a second
 * cursor or a parallel "call index". Resolution rule (spec order):
 *
 *   1. cursor AT a recorded LLM call (exact runtimeStageId) → that call;
 *   2. cursor WITHIN an LLM call's enclosing subflow (the cursor is the
 *      subflow-root position, e.g. `sf-llm-call#5`, and a recorded call
 *      ran inside it, e.g. `sf-llm-call/call-llm#7`) → that call. The
 *      call belonging to THIS execution of the subflow is the one with
 *      the SMALLEST executionIndex greater than the cursor's — the next
 *      loop iteration's subflow root already has a higher index than
 *      this iteration's call;
 *   3. otherwise → the nearest-PREVIOUS call (largest executionIndex
 *      ≤ the cursor's). Before the first call → `undefined`.
 *
 * Root / synthetic positions: `__root__` at `group-start` (and the
 * lens-synthetic `user-in` bookend) mean "nothing happened yet" →
 * `undefined`; `__root__` at `group-end` / `user-out` mean "the whole
 * run" → the LAST call (the run-summary view). An empty cursor (no
 * positions yet — live edge before the first commit) also resolves to
 * the last call so live monitoring shows the most recent choice.
 *
 * Documented edge: when a loop iteration's LLM call offered NO tools
 * (the recorder skips menu-less calls), a cursor on that iteration's
 * subflow root resolves to the NEXT recorded call under the same
 * subflow (rule 2 cannot tell the iterations apart without group
 * ranges). Monotone with the cursor, never throws.
 */

import type { ToolChoiceCall } from 'agentfootprint/observe';
import type { CursorPosition } from '../group/cursorPositionsAtDrill.js';

/** Parse the `#N` executionIndex suffix off a runtimeStageId. */
function execIndex(runtimeStageId: string): number | undefined {
  const hash = runtimeStageId.lastIndexOf('#');
  if (hash < 0) return undefined;
  const n = Number(runtimeStageId.slice(hash + 1));
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export function selectToolChoiceCall(
  calls: readonly ToolChoiceCall[],
  cursorRuntimeStageId: string,
  cursorKind?: CursorPosition['kind'],
): ToolChoiceCall | undefined {
  if (calls.length === 0) return undefined;
  // getCalls() preserves recording order — last entry = latest call.
  const last = calls[calls.length - 1];

  if (cursorKind === 'user-in') return undefined;
  if (cursorKind === 'user-out') return last;
  if (!cursorRuntimeStageId) return last; // live edge, no positions yet

  const base = cursorRuntimeStageId.split('#')[0]!;
  if (base === '__root__') {
    // Run · start = nothing yet; Run · end = the whole run → last call.
    return cursorKind === 'group-start' ? undefined : last;
  }

  // 1. Exact — the cursor IS the recorded LLM-call stage.
  const exact = calls.find((c) => c.runtimeStageId === cursorRuntimeStageId);
  if (exact) return exact;

  const cursorIdx = execIndex(cursorRuntimeStageId);
  if (cursorIdx === undefined) return undefined; // unparsable synthetic id

  // 2. Within — a recorded call ran INSIDE the cursor's subflow scope.
  const prefix = `${base}/`;
  let within: ToolChoiceCall | undefined;
  let withinIdx = Infinity;
  // 3. Nearest-previous fallback, computed in the same pass.
  let prev: ToolChoiceCall | undefined;
  let prevIdx = -1;
  for (const c of calls) {
    const idx = execIndex(c.runtimeStageId);
    if (idx === undefined) continue;
    if (c.runtimeStageId.startsWith(prefix) && idx > cursorIdx && idx < withinIdx) {
      within = c;
      withinIdx = idx;
    }
    if (idx <= cursorIdx && idx > prevIdx) {
      prev = c;
      prevIdx = idx;
    }
  }
  return within ?? prev;
}
